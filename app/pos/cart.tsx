import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet,
  SafeAreaView, TextInput, Modal, ScrollView,
  Animated, Platform, Dimensions, ActivityIndicator,
} from 'react-native';
import { useCart } from '../../hooks/useCart';
import { useAuth } from '../../hooks/useAuth';
import { supabase } from '../../lib/supabase';
import { submitOrder, syncOutbox } from '../../lib/syncEngine';
import * as Network from 'expo-network';
import { useRouter } from 'expo-router';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { useKeepAwake } from 'expo-keep-awake'; 
import {
  Trash2, ChevronLeft, Tag, X, Check,
  Banknote, Smartphone, CreditCard, Plus, Minus,
  ShoppingBag, AlertTriangle, CheckCircle, Printer, Share,
  WifiOff, Lock // <-- Added Lock Icon for Auth
} from 'lucide-react-native';

const { width: W, height: H } = Dimensions.get('window');

// ─────────────────────────────────────────────
// DESIGN TOKENS
// ─────────────────────────────────────────────
const C = {
  navy:      '#1E2D45',
  navyMid:   '#2C3E5C',
  gold:      '#B8935A',
  goldLight: '#D4AE78',
  cream:     '#F5EFE4',
  creamDeep: '#EDE4D6',
  bg:        '#0F1923',
  bgCard:    '#162030',
  text:      '#F5EFE4',
  textMuted: '#8A9BB0',
  textDim:   '#4A6080',
  success:   '#2C7A4B',
  successLt: '#5AC88A',
  danger:    '#7A2E35',
  dangerLt:  '#C07070',
};

type PayMethod = 'cash' | 'gcash' | 'maya' | 'card';
type Discount = { id: string; name: string; percentage: number };
type AuthAction = { type: 'apply'; pct: number } | { type: 'add_new' };

// ─────────────────────────────────────────────
// HTML RECEIPT GENERATOR
// ─────────────────────────────────────────────
const generateReceiptHTML = (
  orderNum: string, items: any[], subtotal: number, discountAmount: number, total: number, method: PayMethod, baristaName: string, isOffline: boolean
) => {
  const methodLabels: Record<PayMethod, string> = { cash: 'Cash', gcash: 'GCash', maya: 'Maya', card: 'Card' };
  let itemsHTML = items.map(item => {
    let modsHTML = '';
    if (item.modifiers && item.modifiers.length > 0) {
      modsHTML = `<div class="mods">${item.modifiers.map((m: any) => `+ ${m.name}`).join('<br>')}</div>`;
    }
    return `
      <div class="item-row">
        <div class="item-qty">${item.quantity ?? 1}x</div>
        <div class="item-name">${item.name}${modsHTML}</div>
        <div class="item-price">P${(item.base_price * (item.quantity ?? 1)).toFixed(2)}</div>
      </div>
    `;
  }).join('');

  let discountHTML = '';
  if (discountAmount > 0) {
    discountHTML = `<div class="totals-row discount"><span>Discount</span><span>- P${discountAmount.toFixed(2)}</span></div>`;
  }
  const offlineMarker = isOffline ? `<div class="sub" style="margin-top: 5px;">* OFFLINE SYNC PENDING *</div>` : '';

  return `
    <html>
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, minimum-scale=1.0, user-scalable=no" />
        <style>
          @page { margin: 0; size: 80mm auto; }
          body { font-family: 'Courier New', Courier, monospace; width: 80mm; margin: 0; padding: 10px 15px; background: white; color: black; box-sizing: border-box; }
          .header { text-align: center; margin-bottom: 20px; }
          .logo { font-size: 24px; font-weight: bold; margin-bottom: 5px; }
          .sub { font-size: 12px; margin-bottom: 2px; }
          .divider { border-bottom: 1px dashed black; margin: 15px 0; }
          .info-row { display: flex; justify-content: space-between; font-size: 12px; margin-bottom: 4px; }
          .item-row { display: flex; font-size: 14px; margin-bottom: 8px; align-items: flex-start; }
          .item-qty { width: 25px; font-weight: bold; }
          .item-name { flex: 1; font-weight: bold; padding-right: 10px; }
          .mods { font-size: 11px; font-weight: normal; margin-top: 2px; padding-left: 5px; }
          .item-price { width: 60px; text-align: right; }
          .totals { margin-top: 20px; }
          .totals-row { display: flex; justify-content: space-between; font-size: 14px; margin-bottom: 5px; }
          .discount { color: #555; }
          .grand-total { font-size: 18px; font-weight: bold; margin-top: 10px; border-top: 2px solid black; padding-top: 10px; }
          .footer { text-align: center; margin-top: 30px; font-size: 12px; }
        </style>
      </head>
      <body>
        <div class="header">
          <div class="logo">CREMA</div>
          <div class="sub">Coffee & Ice Cream</div>
          <div class="sub">Zamboanga City, PH</div>
          ${offlineMarker}
        </div>
        <div class="info-row"><span>Order #: ${orderNum}</span><span>${new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span></div>
        <div class="info-row"><span>Barista: ${baristaName}</span><span>${new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}</span></div>
        <div class="divider"></div>
        ${itemsHTML}
        <div class="divider"></div>
        <div class="totals">
          <div class="totals-row"><span>Subtotal</span><span>P${subtotal.toFixed(2)}</span></div>
          ${discountHTML}
          <div class="totals-row grand-total"><span>TOTAL</span><span>P${total.toFixed(2)}</span></div>
          <div class="totals-row" style="margin-top: 10px; font-size: 12px;"><span>Payment Method</span><span>${methodLabels[method]}</span></div>
        </div>
        <div class="footer"><p>Thank you for your visit!</p><p>Please come again.</p></div>
      </body>
    </html>
  `;
};

// ─────────────────────────────────────────────
// SUCCESS OVERLAY
// ─────────────────────────────────────────────
function SuccessOverlay({ total, method, orderNum, cartItems, subtotal, discountAmt, baristaName, isOffline, onDone }: any) {
  const scale = useRef(new Animated.Value(0)).current;
  const fade  = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.spring(scale, { toValue: 1, useNativeDriver: true, speed: 12, bounciness: 8 }),
      Animated.timing(fade,  { toValue: 1, duration: 300, useNativeDriver: true }),
    ]).start();
  }, []);

  const methodLabels: Record<PayMethod, string> = { cash: 'Cash', gcash: 'GCash', maya: 'Maya', card: 'Card' };

  const handlePrint = async () => {
    const html = generateReceiptHTML(orderNum, cartItems, subtotal, discountAmt, total, method, baristaName, isOffline);
    try { await Print.printAsync({ html }); } catch (error) { console.error('Print failed:', error); }
  };

  const handleShare = async () => {
    const html = generateReceiptHTML(orderNum, cartItems, subtotal, discountAmt, total, method, baristaName, isOffline);
    try {
      const { uri } = await Print.printToFileAsync({ html });
      if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(uri, { UTI: '.pdf', mimeType: 'application/pdf' });
    } catch (error) { console.error('Share failed:', error); }
  };

  return (
    <Animated.View style={[so.overlay, { opacity: fade }]}>
      <Animated.View style={[so.card, { transform: [{ scale }] }]}>
        <TouchableOpacity style={{ position: 'absolute', top: 16, right: 16, padding: 8 }} onPress={onDone}><X size={20} color={C.textMuted} /></TouchableOpacity>
        <View style={so.iconWrap}><CheckCircle size={52} color={C.successLt} strokeWidth={1.5} /></View>
        <Text style={so.title}>Payment Complete</Text>
        <Text style={so.orderNum}>Order #{orderNum}</Text>
        <View style={so.amountRow}><Text style={so.amountLabel}>₱</Text><Text style={so.amount}>{total.toFixed(2)}</Text></View>
        <Text style={so.methodText}>Paid via {methodLabels[method as PayMethod]}</Text>
        {isOffline && <Text style={{ fontSize: 11, color: C.dangerLt, marginBottom: 20, textAlign: 'center', marginTop: -15 }}>Saved locally. Will sync when online.</Text>}
        <View style={so.divider} />
        <View style={so.actionRow}>
          <TouchableOpacity style={so.actionBtn} onPress={handlePrint}><Printer size={20} color={C.gold} /><Text style={so.actionBtnText}>Print Receipt</Text></TouchableOpacity>
          <TouchableOpacity style={so.actionBtn} onPress={handleShare}><Share size={20} color={C.gold} /><Text style={so.actionBtnText}>Share e-Receipt</Text></TouchableOpacity>
        </View>
        <TouchableOpacity style={so.doneBtn} onPress={onDone}><Text style={so.doneBtnText}>New Order</Text></TouchableOpacity>
      </Animated.View>
    </Animated.View>
  );
}

const so = StyleSheet.create({
  overlay:    { position: 'absolute', inset: 0, zIndex: 999, backgroundColor: 'rgba(10,16,26,0.92)', alignItems: 'center', justifyContent: 'center' },
  card:       { backgroundColor: C.bgCard, borderRadius: 20, padding: 32, alignItems: 'center', width: W * 0.85, maxWidth: 380, borderWidth: 1, borderColor: 'rgba(184,147,90,0.3)', position: 'relative' },
  iconWrap:   { width: 88, height: 88, borderRadius: 44, backgroundColor: 'rgba(44,122,75,0.15)', alignItems: 'center', justifyContent: 'center', marginBottom: 20, borderWidth: 1.5, borderColor: 'rgba(90,200,138,0.25)' },
  title:      { fontSize: 22, fontWeight: '800', color: C.text, marginBottom: 6 },
  orderNum:   { fontSize: 13, fontWeight: '600', color: C.textMuted, marginBottom: 20 },
  amountRow:  { flexDirection: 'row', alignItems: 'flex-start', gap: 2, marginBottom: 6 },
  amountLabel:{ fontSize: 22, fontWeight: '700', color: C.gold, marginTop: 4 },
  amount:     { fontSize: 44, fontWeight: '800', color: C.gold, lineHeight: 52 },
  methodText: { fontSize: 13, fontWeight: '600', color: C.textMuted, marginBottom: 24 },
  divider:    { width: '100%', height: 1, backgroundColor: 'rgba(44,62,92,0.2)', marginBottom: 20 },
  actionRow:  { flexDirection: 'row', gap: 12, width: '100%', marginBottom: 20 },
  actionBtn:  { flex: 1, backgroundColor: 'rgba(184,147,90,0.1)', borderWidth: 1, borderColor: 'rgba(184,147,90,0.3)', borderRadius: 12, paddingVertical: 12, alignItems: 'center', justifyContent: 'center', gap: 6 },
  actionBtnText: { fontSize: 12, fontWeight: '700', color: C.gold },
  doneBtn:    { backgroundColor: C.navyMid, borderRadius: 12, paddingHorizontal: 32, paddingVertical: 16, width: '100%', alignItems: 'center' },
  doneBtnText:{ fontSize: 16, fontWeight: '700', color: C.cream },
});

// ─────────────────────────────────────────────
// MAIN COMPONENT
// ─────────────────────────────────────────────
export default function CartScreen() {
  useKeepAwake();

  const { cart, subtotal, total, discount, setDiscount, clearCart, removeItem, updateQty } = useCart();
  const { currentUser } = useAuth();
  const router = useRouter();

  const [payMethod,    setPayMethod]    = useState<PayMethod>('cash');
  const [processing,   setProcessing]   = useState(false);
  const [discounts,    setDiscounts]    = useState<Discount[]>([]);
  
  // Add Discount Form State
  const [showAddDisc,  setShowAddDisc]  = useState(false);
  const [newDiscName,  setNewDiscName]  = useState('');
  const [newDiscPct,   setNewDiscPct]   = useState('');
  const [discSaving,   setDiscSaving]   = useState(false);

  // ── MANAGER AUTH STATE ──
  const [authVisible, setAuthVisible]   = useState(false);
  const [authPin,     setAuthPin]       = useState('');
  const [authError,   setAuthError]     = useState('');
  const [authLoading, setAuthLoading]   = useState(false);
  const [authAction,  setAuthAction]    = useState<AuthAction | null>(null);
  
  // ── OFFLINE STATE ──
  const [isOffline, setIsOffline] = useState(false);

  // Checkout Success State
  const [showSuccess,  setShowSuccess]  = useState(false);
  const [orderNum,     setOrderNum]     = useState('');
  const [paidTotal,    setPaidTotal]    = useState(0);
  const [paidMethod,   setPaidMethod]   = useState<PayMethod>('cash');
  const [error,        setError]        = useState('');
  
  // Snapshots
  const [cartSnapshot, setCartSnapshot] = useState<any[]>([]);
  const [subtotalSnapshot, setSubtotalSnapshot] = useState(0);

  // ── Network Monitor ──
  useEffect(() => {
    const checkNetwork = async () => {
      const state = await Network.getNetworkStateAsync();
      setIsOffline(!(state.isConnected && state.isInternetReachable));
    };
    checkNetwork();
    const interval = setInterval(checkNetwork, 5000); 
    return () => clearInterval(interval);
  }, []);

  // Fetch discounts
  useEffect(() => {
    const fetchDiscounts = async () => {
      if (!isOffline) {
        const { data, error } = await supabase.from('discounts').select('*').order('percentage', { ascending: false });
        if (data && !error) setDiscounts(data);
      }
    };
    fetchDiscounts();
  }, [isOffline]);

  // ─────────────────────────────────────────────
  // MANAGER AUTHORIZATION LOGIC
  // ─────────────────────────────────────────────
  const executeAuthAction = (action: AuthAction) => {
    if (action.type === 'apply') {
      setDiscount(action.pct);
    } else if (action.type === 'add_new') {
      setShowAddDisc(true);
    }
  };

  const initiateDiscountAuth = (action: AuthAction) => {
    // If the currently logged-in user IS a manager, bypass the PIN requirement completely
    if (currentUser?.role === 'manager') {
      executeAuthAction(action);
    } else {
      // Otherwise, pop up the PIN authorization modal
      setAuthAction(action);
      setAuthPin('');
      setAuthError('');
      setAuthVisible(true);
    }
  };

  const handlePinKey = async (val: string) => {
    if (authError) setAuthError('');
    
    if (val === '⌫') {
      setAuthPin(p => p.slice(0, -1));
      return;
    }
    
    if (authPin.length >= 4) return;
    
    const nextPin = authPin + val;
    setAuthPin(nextPin);
    
    if (nextPin.length === 4) {
      setAuthLoading(true);
      // Verify PIN against manager role
      const { data, error } = await supabase
        .from('profiles')
        .select('id')
        .eq('pin_code', nextPin)
        .eq('role', 'manager')
        .eq('status', 'active')
        .single();

      if (data) {
        // PIN Correct!
        if (authAction) executeAuthAction(authAction);
        setAuthVisible(false);
      } else {
        // PIN Incorrect
        setAuthError('Invalid Manager PIN');
        setAuthPin(''); // Clear PIN so they can try again
      }
      setAuthLoading(false);
    }
  };

  // ─────────────────────────────────────────────
  // SAVE NEW DISCOUNT (Requires Auth first)
  // ─────────────────────────────────────────────
  const handleSaveDiscount = async () => {
    if (!newDiscName.trim() || !newDiscPct) return;
    setDiscSaving(true);
    const pct = parseFloat(newDiscPct) / 100;
    
    if (!isOffline) {
      const { error: e } = await supabase.from('discounts').insert([{ name: newDiscName.trim(), percentage: pct }]);
      if (!e) {
        const { data } = await supabase.from('discounts').select('*').order('percentage', { ascending: false });
        if (data) setDiscounts(data);
        setShowAddDisc(false); setNewDiscName(''); setNewDiscPct('');
      } else {
        alert("Failed to save discount.");
      }
    } else {
       alert("Cannot save new discounts while offline.");
    }
    setDiscSaving(false);
  };

  const handleCheckout = async () => {
    if (cart.length === 0) return;
    setProcessing(true); setError('');

    try {
      const finalTotal = total;
      const baristaId  = currentUser?.id ?? null;

      const orderData = { 
         total: finalTotal, 
         barista_id: baristaId,
         _saleDetails: { payment_method: payMethod, order_type: 'dine-in', tax_amount: 0 }
      };

      const orderItems = cart.map((item: any) => ({
        menu_item_id:  item.id,
        qty:           item.quantity ?? 1,
        unit_price:    item.base_price,
        modifiers_json: JSON.stringify(item.modifiers ?? []),
        special_note:   item.note ?? null,
      }));

      // 🔥 OFFLINE-FIRST SUBMISSION 🔥
      await submitOrder(orderData, orderItems);
      
      if (!isOffline) syncOutbox();

      const shortId = Date.now().toString().slice(-5).toUpperCase();
      
      setOrderNum(shortId);
      setPaidTotal(finalTotal);
      setPaidMethod(payMethod);
      
      setCartSnapshot([...cart]);
      setSubtotalSnapshot(subtotal);
      
      setShowSuccess(true);

    } catch (err: any) {
      setError(err.message ?? 'Checkout failed. Please try again.');
    } finally {
      setProcessing(false);
    }
  };

  const handleDone = () => {
    setShowSuccess(false);
    clearCart();
    router.replace('/pos');
  };

  const activeDiscount = discounts.find(d => d.percentage === discount);
  const discountAmount = subtotal * discount;
  const isEmpty        = cart.length === 0;

  return (
    <SafeAreaView style={s.root}>
      {isOffline && (
        <View style={s.offlineBanner}>
          <WifiOff size={14} color="#FFF" />
          <Text style={s.offlineText}>No Internet Connection. Orders are saving locally.</Text>
        </View>
      )}

      <View style={s.header}>
        <TouchableOpacity style={s.backBtn} onPress={() => router.back()}>
          <ChevronLeft size={22} color={C.text} strokeWidth={2.5} />
        </TouchableOpacity>
        <View style={{ flex: 1, alignItems: 'center' }}>
          <Text style={s.headerTitle}>Order Summary</Text>
          {!isEmpty && <Text style={s.headerSub}>{cart.length} item{cart.length !== 1 ? 's' : ''}</Text>}
        </View>
        <View style={{ width: 38 }} />
      </View>

      <View style={s.headerAccent} />

      {isEmpty ? (
        <View style={s.emptyWrap}>
          <ShoppingBag size={56} color={C.textDim} strokeWidth={1} />
          <Text style={s.emptyTitle}>No items yet</Text>
          <Text style={s.emptySub}>Go back to the menu to add drinks and food.</Text>
          <TouchableOpacity style={s.emptyBtn} onPress={() => router.back()}>
            <Text style={s.emptyBtnText}>← Back to Menu</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 24 }}>
          <View style={s.section}>
            <Text style={s.sectionTitle}>Items</Text>
            {cart.map((item: any, idx: number) => {
              const lineTotal = item.base_price * (item.quantity ?? 1);
              return (
                <View key={item.cartItemId ?? idx} style={s.cartRow}>
                  <View style={s.cartRowLeft}>
                    <View style={s.qtyWrap}>
                      <TouchableOpacity style={s.qtyBtn}
                        onPress={() => {
                          if ((item.quantity ?? 1) <= 1) removeItem(item.cartItemId);
                          else updateQty?.(item.cartItemId, (item.quantity ?? 1) - 1);
                        }}>
                        <Minus size={12} color={C.textMuted} strokeWidth={3} />
                      </TouchableOpacity>
                      <Text style={s.qtyNum}>{item.quantity ?? 1}</Text>
                      <TouchableOpacity style={s.qtyBtn}
                        onPress={() => updateQty?.(item.cartItemId, (item.quantity ?? 1) + 1)}>
                        <Plus size={12} color={C.textMuted} strokeWidth={3} />
                      </TouchableOpacity>
                    </View>
                  </View>

                  <View style={s.cartRowMid}>
                    <Text style={s.cartItemName} numberOfLines={1}>{item.name}</Text>
                    {item.modifiers && item.modifiers.length > 0 && (
                      <Text style={s.cartItemMods} numberOfLines={2}>
                        {item.modifiers.map((m: any) => m.name).join(' · ')}
                      </Text>
                    )}
                    {item.note ? <Text style={s.cartItemNote}>📝 {item.note}</Text> : null}
                    <Text style={s.cartItemUnit}>₱{item.base_price.toFixed(2)} each</Text>
                  </View>

                  <View style={s.cartRowRight}>
                    <Text style={s.cartItemTotal}>₱{lineTotal.toFixed(0)}</Text>
                    <TouchableOpacity style={s.deleteBtn} onPress={() => removeItem(item.cartItemId)}>
                      <Trash2 size={15} color={C.dangerLt} />
                    </TouchableOpacity>
                  </View>
                </View>
              );
            })}
          </View>

          <View style={s.section}>
            <View style={s.sectionRow}>
              <Text style={s.sectionTitle}>Discount</Text>
              <TouchableOpacity style={s.addDiscBtn} onPress={() => initiateDiscountAuth({ type: 'add_new' })}>
                <Lock size={10} color={C.gold} strokeWidth={3} style={{ marginRight: -2 }} />
                <Plus size={12} color={C.gold} strokeWidth={3} />
                <Text style={s.addDiscText}>Add Custom</Text>
              </TouchableOpacity>
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
              <TouchableOpacity
                style={[s.discChip, discount === 0 && s.discChipActive]}
                onPress={() => setDiscount(0)} // Removing a discount doesn't require PIN
              >
                <X size={12} color={discount === 0 ? C.cream : C.textMuted} />
                <Text style={[s.discChipText, discount === 0 && { color: C.cream }]}>None</Text>
              </TouchableOpacity>
              
              {discounts.map(d => {
                const on = discount === d.percentage;
                return (
                  <TouchableOpacity key={d.id} style={[s.discChip, on && s.discChipActive]}
                    onPress={() => {
                      if (on) {
                        setDiscount(0); // Turn off without PIN
                      } else {
                        initiateDiscountAuth({ type: 'apply', pct: d.percentage }); // Require PIN to turn on
                      }
                    }}>
                    {!on && <Lock size={10} color={C.gold} style={{ marginRight: -2 }} />}
                    <Tag size={11} color={on ? C.cream : C.gold} />
                    <Text style={[s.discChipText, on && { color: C.cream }]}>
                      {d.name} {(d.percentage * 100).toFixed(0)}%
                    </Text>
                    {on && <Check size={11} color={C.cream} strokeWidth={3} />}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>

          <View style={s.section}>
            <Text style={s.sectionTitle}>Payment Method</Text>
            <View style={s.payGrid}>
              {([
                { key: 'cash',  label: 'Cash',  icon: <Banknote  size={20} strokeWidth={1.5} /> },
                { key: 'gcash', label: 'GCash', icon: <Smartphone size={20} strokeWidth={1.5} /> },
                { key: 'maya',  label: 'Maya',  icon: <Smartphone size={20} strokeWidth={1.5} /> },
                { key: 'card',  label: 'Card',  icon: <CreditCard size={20} strokeWidth={1.5} /> },
              ] as { key: PayMethod; label: string; icon: React.ReactNode }[]).map(p => {
                const active = payMethod === p.key;
                return (
                  <TouchableOpacity key={p.key} style={[s.payBtn, active && s.payBtnActive]}
                    onPress={() => setPayMethod(p.key)} activeOpacity={0.8}>
                    <View style={{ color: active ? C.cream : C.textMuted } as any}>
                      {React.cloneElement(p.icon as any, { color: active ? C.cream : C.textMuted })}
                    </View>
                    <Text style={[s.payBtnLabel, active && { color: C.cream }]}>{p.label}</Text>
                    {active && <View style={s.payCheck}><Check size={10} color={C.cream} strokeWidth={3} /></View>}
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

          <View style={s.section}>
            <Text style={s.sectionTitle}>Summary</Text>
            <View style={s.summaryBox}>
              <View style={s.summaryRow}>
                <Text style={s.summaryLabel}>Subtotal</Text>
                <Text style={s.summaryVal}>₱{subtotal.toFixed(2)}</Text>
              </View>
              {discount > 0 && (
                <View style={s.summaryRow}>
                  <Text style={[s.summaryLabel, { color: C.dangerLt }]}>
                    Discount ({activeDiscount?.name ?? 'Custom'} {(discount * 100).toFixed(0)}%)
                  </Text>
                  <Text style={[s.summaryVal, { color: C.dangerLt }]}>− ₱{discountAmount.toFixed(2)}</Text>
                </View>
              )}
              <View style={[s.summaryRow, s.summaryTotalRow]}>
                <Text style={s.summaryTotalLabel}>Total Due</Text>
                <Text style={s.summaryTotalVal}>₱{total.toFixed(2)}</Text>
              </View>
            </View>
          </View>

          {error.length > 0 && (
            <View style={s.errorStrip}>
              <AlertTriangle size={14} color={C.dangerLt} />
              <Text style={s.errorText}>{error}</Text>
            </View>
          )}

          <View style={s.checkoutWrap}>
            <TouchableOpacity
              style={[s.checkoutBtn, (isEmpty || processing) && s.checkoutBtnDisabled]}
              onPress={handleCheckout}
              disabled={isEmpty || processing}
              activeOpacity={0.88}
            >
              {processing
                ? <ActivityIndicator color={C.cream} size="small" />
                : (
                  <View style={s.checkoutInner}>
                    <Text style={s.checkoutLabel}>Process Payment</Text>
                    <View style={s.checkoutPrice}>
                      <Text style={s.checkoutPriceText}>₱{total.toFixed(2)}</Text>
                    </View>
                  </View>
                )
              }
            </TouchableOpacity>
          </View>

        </ScrollView>
      )}

      {/* ── MODAL: MANAGER PIN AUTHORIZATION ── */}
      <Modal visible={authVisible} animationType="fade" transparent>
        <View style={m.overlay}>
          <View style={[m.card, { paddingBottom: 30 }]}>
            <View style={m.cardTopBar} />
            <View style={m.header}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Lock size={18} color={C.gold} />
                <Text style={m.title}>Manager Auth</Text>
              </View>
              <TouchableOpacity style={m.closeBtn} onPress={() => setAuthVisible(false)}>
                <X size={15} color={C.textMuted} />
              </TouchableOpacity>
            </View>
            
            <Text style={{ textAlign: 'center', color: C.navy, fontSize: 13, marginBottom: 20 }}>
              Enter Manager PIN to apply discount
            </Text>

            {/* PIN Dots */}
            <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 16, marginBottom: 12 }}>
              {[0, 1, 2, 3].map(i => (
                <View key={i} style={[
                  m.pinDot, 
                  i < authPin.length && m.pinDotFilled,
                  authError ? { borderColor: C.dangerLt } : {}
                ]} />
              ))}
            </View>

            <View style={{ height: 20, alignItems: 'center', marginBottom: 20 }}>
              {authError ? <Text style={{ color: C.dangerLt, fontSize: 12, fontWeight: '600' }}>{authError}</Text> : null}
            </View>

            {/* Keypad */}
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', width: 260, alignSelf: 'center', justifyContent: 'center', gap: 14 }}>
              {['1','2','3','4','5','6','7','8','9','','0','⌫'].map((k, i) => {
                if (!k) return <View key={i} style={{ width: 64, height: 64 }} />;
                return (
                  <TouchableOpacity key={i} style={m.keyBtn} onPress={() => handlePinKey(k)}>
                    <Text style={m.keyText}>{k}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>

          </View>
        </View>
      </Modal>

      {/* ── MODAL: ADD CUSTOM DISCOUNT ── */}
      <Modal visible={showAddDisc} animationType="fade" transparent>
        <View style={m.overlay}>
          <View style={m.card}>
            <View style={m.cardTopBar} />
            <View style={m.header}>
              <Text style={m.title}>Custom Discount</Text>
              <TouchableOpacity style={m.closeBtn} onPress={() => setShowAddDisc(false)}>
                <X size={15} color={C.textMuted} />
              </TouchableOpacity>
            </View>
            <Text style={m.label}>Name / Reason</Text>
            <TextInput style={m.input} placeholder="e.g. Spilled Coffee, Friend" placeholderTextColor={C.textDim}
              value={newDiscName} onChangeText={setNewDiscName} />
            <Text style={m.label}>Percentage (%)</Text>
            <TextInput style={m.input} placeholder="e.g. 20" keyboardType="numeric"
              placeholderTextColor={C.textDim} value={newDiscPct} onChangeText={setNewDiscPct} />
            <TouchableOpacity
              style={[m.saveBtn, discSaving && { opacity: 0.55 }]}
              onPress={handleSaveDiscount}
              disabled={discSaving}
            >
              {discSaving
                ? <ActivityIndicator color={C.cream} size="small" />
                : <Text style={m.saveBtnText}>Apply & Save Discount</Text>
              }
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {showSuccess && (
        <SuccessOverlay
          total={paidTotal}
          method={paidMethod}
          orderNum={orderNum}
          cartItems={cartSnapshot}
          subtotal={subtotalSnapshot}
          discountAmt={subtotalSnapshot * discount}
          baristaName={currentUser?.full_name ?? 'Barista'}
          isOffline={isOffline}
          onDone={handleDone}
        />
      )}
    </SafeAreaView>
  );
}

// ─────────────────────────────────────────────
// STYLES
// ─────────────────────────────────────────────
const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },

  offlineBanner: {
    backgroundColor: C.danger,
    paddingVertical: 6,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    width: '100%',
    zIndex: 999, 
  },
  offlineText: {
    color: '#FFF',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.5,
  },

  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: Platform.OS === 'android' ? 12 : 8,
    paddingBottom: 12,
  },
  backBtn: {
    width: 38, height: 38, borderRadius: 19,
    backgroundColor: 'rgba(44,62,92,0.3)',
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: 'rgba(44,62,92,0.4)',
  },
  headerTitle: { fontSize: 17, fontWeight: '800', color: C.text },
  headerSub:   { fontSize: 11, fontWeight: '500', color: C.textMuted, marginTop: 2 },
  headerAccent:{ height: 2, backgroundColor: C.gold, marginHorizontal: 16, borderRadius: 1, marginBottom: 4, opacity: 0.5 },

  emptyWrap:    { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 14, padding: 40 },
  emptyTitle:   { fontSize: 20, fontWeight: '800', color: C.text },
  emptySub:     { fontSize: 14, color: C.textMuted, textAlign: 'center', lineHeight: 22 },
  emptyBtn:     { backgroundColor: C.navyMid, borderRadius: 12, paddingHorizontal: 24, paddingVertical: 12, marginTop: 8 },
  emptyBtnText: { fontSize: 14, fontWeight: '700', color: C.cream },

  section:     { marginHorizontal: 16, marginTop: 16 },
  sectionTitle:{ fontSize: 11, fontWeight: '800', letterSpacing: 1.5, textTransform: 'uppercase', color: C.textDim, marginBottom: 10 },
  sectionRow:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },

  cartRow: {
    flexDirection: 'row', alignItems: 'flex-start',
    backgroundColor: C.bgCard,
    borderRadius: 12, padding: 14, marginBottom: 8,
    borderWidth: 1, borderColor: 'rgba(44,62,92,0.2)',
  },
  cartRowLeft:  { marginRight: 12 },
  cartRowMid:   { flex: 1, minWidth: 0 },
  cartRowRight: { alignItems: 'flex-end', gap: 10, marginLeft: 8 },
  cartItemName: { fontSize: 14, fontWeight: '700', color: C.text, marginBottom: 2 },
  cartItemMods: { fontSize: 11, fontWeight: '500', color: C.gold, marginBottom: 2, lineHeight: 16 },
  cartItemNote: { fontSize: 11, color: C.textMuted, marginBottom: 2 },
  cartItemUnit: { fontSize: 11, color: C.textDim, fontWeight: '500' },
  cartItemTotal:{ fontSize: 16, fontWeight: '800', color: C.text },
  deleteBtn:    { width: 28, height: 28, borderRadius: 14, backgroundColor: 'rgba(122,46,53,0.12)', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(122,46,53,0.2)' },

  qtyWrap: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: 'rgba(44,62,92,0.2)', borderRadius: 8, padding: 4 },
  qtyBtn:  { width: 26, height: 26, borderRadius: 13, backgroundColor: 'rgba(44,62,92,0.35)', alignItems: 'center', justifyContent: 'center' },
  qtyNum:  { fontSize: 14, fontWeight: '800', color: C.text, minWidth: 20, textAlign: 'center' },

  addDiscBtn:   { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 100, borderWidth: 1, borderColor: 'rgba(184,147,90,0.35)', backgroundColor: 'rgba(184,147,90,0.08)' },
  addDiscText:  { fontSize: 11, fontWeight: '700', color: C.gold },
  discChip:     { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 9, borderRadius: 100, borderWidth: 1.5, borderColor: 'rgba(44,62,92,0.3)', backgroundColor: 'rgba(44,62,92,0.15)' },
  discChipActive:{ backgroundColor: C.navyMid, borderColor: C.navyMid },
  discChipText: { fontSize: 13, fontWeight: '700', color: C.textMuted },

  payGrid:      { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  payBtn: {
    flex: 1, minWidth: '44%', flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, paddingVertical: 14, borderRadius: 12,
    backgroundColor: C.bgCard, borderWidth: 1.5, borderColor: 'rgba(44,62,92,0.25)',
    position: 'relative',
  },
  payBtnActive: { backgroundColor: C.navyMid, borderColor: C.navyMid },
  payBtnLabel:  { fontSize: 14, fontWeight: '700', color: C.textMuted },
  payCheck: { position: 'absolute', top: 6, right: 6, width: 16, height: 16, borderRadius: 8, backgroundColor: C.gold, alignItems: 'center', justifyContent: 'center' },

  summaryBox: { backgroundColor: C.bgCard, borderRadius: 14, padding: 16, borderWidth: 1, borderColor: 'rgba(44,62,92,0.2)' },
  summaryRow:      { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 10 },
  summaryLabel:    { fontSize: 14, fontWeight: '500', color: C.textMuted },
  summaryVal:      { fontSize: 14, fontWeight: '700', color: C.text },
  summaryTotalRow: { borderTopWidth: 1, borderTopColor: 'rgba(44,62,92,0.2)', paddingTop: 12, marginTop: 4, marginBottom: 0 },
  summaryTotalLabel:{ fontSize: 16, fontWeight: '700', color: C.text },
  summaryTotalVal:  { fontSize: 22, fontWeight: '800', color: C.gold },

  errorStrip: { flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: 16, marginTop: 12, backgroundColor: 'rgba(122,46,53,0.12)', borderRadius: 10, padding: 12, borderWidth: 1, borderColor: 'rgba(122,46,53,0.2)' },
  errorText:  { fontSize: 13, fontWeight: '600', color: C.dangerLt, flex: 1 },

  checkoutWrap: { marginHorizontal: 16, marginTop: 20 },
  checkoutBtn: {
    backgroundColor: C.navyMid, borderRadius: 16, overflow: 'hidden',
    shadowColor: '#000', shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.4, shadowRadius: 12, elevation: 8,
    borderWidth: 1, borderColor: 'rgba(184,147,90,0.25)',
  },
  checkoutBtnDisabled: { opacity: 0.4 },
  checkoutInner:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 18 },
  checkoutLabel:  { fontSize: 16, fontWeight: '800', color: C.cream },
  checkoutPrice:  { backgroundColor: 'rgba(184,147,90,0.2)', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 6 },
  checkoutPriceText: { fontSize: 17, fontWeight: '800', color: C.gold },
});

// Modal styles
const m = StyleSheet.create({
  overlay:    { flex: 1, backgroundColor: 'rgba(10,16,26,0.85)', alignItems: 'center', justifyContent: 'center', padding: 24 },
  card:       { backgroundColor: C.cream, borderRadius: 14, width: '100%', maxWidth: 380, overflow: 'hidden' },
  cardTopBar: { height: 4, backgroundColor: C.gold },
  header:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 20, paddingBottom: 16 },
  title:      { fontSize: 17, fontWeight: '800', color: C.navy },
  closeBtn:   { width: 28, height: 28, borderRadius: 14, backgroundColor: 'rgba(44,62,92,0.1)', alignItems: 'center', justifyContent: 'center' },
  label:      { fontSize: 10, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase', color: C.textDim, marginHorizontal: 20, marginBottom: 6 },
  input:      { backgroundColor: C.creamDeep, borderRadius: 10, padding: 14, fontSize: 14, color: C.navy, marginHorizontal: 20, marginBottom: 14, borderWidth: 1.5, borderColor: 'rgba(44,62,92,0.15)' },
  saveBtn:    { backgroundColor: C.navy, margin: 20, marginTop: 8, borderRadius: 12, paddingVertical: 15, alignItems: 'center' },
  saveBtnText:{ fontSize: 15, fontWeight: '800', color: C.cream },
  
  pinDot: { width: 14, height: 14, borderRadius: 7, borderWidth: 2, borderColor: '#A0AAB5', backgroundColor: 'transparent' },
  pinDotFilled: { backgroundColor: C.gold, borderColor: C.gold },
  keyBtn: { width: 64, height: 64, borderRadius: 32, backgroundColor: C.creamDeep, alignItems: 'center', justifyContent: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 4, elevation: 2 },
  keyText: { fontSize: 24, fontWeight: '600', color: C.navy },
});