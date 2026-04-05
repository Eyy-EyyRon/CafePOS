import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet,
  SafeAreaView, TextInput, Modal, ScrollView,
  Animated, Platform, Dimensions, ActivityIndicator, Vibration,
} from 'react-native';
import { useCart } from '../../hooks/useCart';
import { useAuth } from '../../hooks/useAuth';
import { supabase } from '../../.vscode/lib/supabase';
import { submitOrder, syncOutbox } from '../../.vscode/lib/syncEngine';
import * as Network from 'expo-network';
import { useRouter } from 'expo-router';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { useKeepAwake } from 'expo-keep-awake';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  Trash2, ChevronLeft, Tag, X, Check,
  Banknote, Smartphone, CreditCard, Plus, Minus,
  ShoppingBag, AlertTriangle, CheckCircle, Printer, Share,
  WifiOff, Lock, UtensilsCrossed, AlertCircle,
  Coffee, CupSoda, Droplet, Snowflake, Cloud, Flame,
  Leaf, Sparkles, GlassWater, NotebookPen,
} from 'lucide-react-native';

const { width: W } = Dimensions.get('window');

// ─────────────────────────────────────────────
// DESIGN TOKENS  (aligned with Queue screen)
// ─────────────────────────────────────────────
const C = {
  navy:       '#1A2640',
  navyMid:    '#243350',
  gold:       '#C49A55',
  goldLight:  '#D4AE78',
  cream:      '#F0E8D8',
  creamDeep:  '#E5D9C4',
  bg:         '#0D1520',
  bgCard:     '#131E2E',
  bgCardAlt:  '#16253A',
  text:       '#EEE8DC',
  textMuted:  '#7A90AA',
  textDim:    '#3D566E',
  success:    '#1F6B41',
  successMid: '#256B45',
  successLt:  '#4DBF82',
  danger:     '#7A2935',
  dangerLt:   '#D97070',
  dangerBg:   'rgba(122,41,53,0.12)',
  warn:       '#B07A20',
  warnLt:     '#F0B040',
  orange:     '#C98830',
  border:     'rgba(36,51,80,0.6)',
};

type PayMethod = 'cash' | 'gcash' | 'maya' | 'card';
type Discount = { id: string; name: string; percentage: number };

// ─────────────────────────────────────────────
// MOD ICON HELPER
// ─────────────────────────────────────────────
export function ModIcon({ name, size, color }: { name: string; size: number; color: string }) {
  const n = name ? name.toLowerCase() : '';
  let Icon = Sparkles;
  if (n.includes('milk') || n.includes('oat') || n.includes('soy') || n.includes('almond')) Icon = GlassWater;
  else if (n.includes('sugar') || n.includes('syrup') || n.includes('sweet') || n.includes('caramel') || n.includes('vanilla')) Icon = Droplet;
  else if (n.includes('ice') || n.includes('cold')) Icon = Snowflake;
  else if (n.includes('shot') || n.includes('espresso') || n.includes('coffee') || n.includes('roast')) Icon = Coffee;
  else if (n.includes('cream') || n.includes('whip') || n.includes('foam')) Icon = Cloud;
  else if (n.includes('hot') || n.includes('warm')) Icon = Flame;
  else if (n.includes('decaf')) Icon = Leaf;
  else if (n.includes('size') || n.includes('large') || n.includes('small') || n.includes('medium')) Icon = CupSoda;
  return <Icon size={size} color={color} strokeWidth={1.5} />;
}

// ─────────────────────────────────────────────
// RECEIPT HTML GENERATOR
// ─────────────────────────────────────────────
const generateReceiptHTML = (
  orderNum: string, items: any[], subtotal: number, discountAmount: number,
  total: number, method: PayMethod, baristaName: string, isOffline: boolean,
  discountLabel: string, storeSettings: any,
) => {
  const methodLabels: Record<PayMethod, string> = { cash: 'Cash', gcash: 'GCash', maya: 'Maya', card: 'Card' };
  const storeName    = storeSettings?.store_name    || 'CREMA';
  const storeTagline = storeSettings?.tagline       || 'Coffee & Ice Cream';
  const storeAddress = storeSettings?.address       || 'Zamboanga City, PH';
  const storePhone   = storeSettings?.phone ? `<div class="sub">Tel: ${storeSettings.phone}</div>` : '';
  const storeTin     = storeSettings?.tin   ? `<div class="sub">TIN: ${storeSettings.tin}</div>`   : '';
  const storeFooter  = (storeSettings?.receipt_footer || 'Thank you for your visit!\nPlease come again.').replace(/\n/g, '<br>');
  const offlineMarker = isOffline ? `<div class="sub" style="margin-top:5px">* OFFLINE SYNC PENDING *</div>` : '';

  const itemsHTML = items.map(item => {
    const modsHTML = item.modifiers?.length
      ? `<div class="mods">${item.modifiers.map((m: any) => `+ ${m.name}`).join('<br>')}</div>` : '';
    return `
      <div class="item-row">
        <div class="item-qty">${item.quantity ?? 1}x</div>
        <div class="item-name">${item.name}${modsHTML}</div>
        <div class="item-price">P${(item.base_price * (item.quantity ?? 1)).toFixed(2)}</div>
      </div>`;
  }).join('');

  const discountHTML = discountAmount > 0 ? `
    <div class="totals-row discount">
      <span>Discount (${discountLabel})</span>
      <span>- P${discountAmount.toFixed(2)}</span>
    </div>` : '';

  return `
    <html><head>
      <meta name="viewport" content="width=device-width,initial-scale=1"/>
      <style>
        @page { margin:0; size:80mm auto; }
        body { font-family:'Courier New',monospace; width:80mm; margin:0; padding:10px 15px; background:white; color:black; box-sizing:border-box; }
        .header { text-align:center; margin-bottom:20px; }
        .logo { font-size:24px; font-weight:bold; margin-bottom:5px; }
        .sub { font-size:12px; margin-bottom:2px; }
        .divider { border-bottom:1px dashed black; margin:15px 0; }
        .info-row { display:flex; justify-content:space-between; font-size:12px; margin-bottom:4px; }
        .item-row { display:flex; font-size:14px; margin-bottom:8px; align-items:flex-start; }
        .item-qty { width:25px; font-weight:bold; }
        .item-name { flex:1; font-weight:bold; padding-right:10px; }
        .mods { font-size:11px; font-weight:normal; margin-top:2px; padding-left:5px; }
        .item-price { width:60px; text-align:right; }
        .totals-row { display:flex; justify-content:space-between; font-size:14px; margin-bottom:5px; }
        .discount { color:#555; }
        .grand-total { font-size:18px; font-weight:bold; margin-top:10px; border-top:2px solid black; padding-top:10px; }
        .footer { text-align:center; margin-top:30px; font-size:12px; }
      </style>
    </head><body>
      <div class="header">
        <div class="logo">${storeName}</div>
        ${storeTagline ? `<div class="sub">${storeTagline}</div>` : ''}
        ${storeAddress ? `<div class="sub">${storeAddress}</div>` : ''}
        ${storePhone}${storeTin}${offlineMarker}
      </div>
      <div class="info-row"><span>Order #: ${orderNum}</span><span>${new Date().toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'})}</span></div>
      <div class="info-row"><span>Barista: ${baristaName}</span><span>${new Date().toLocaleTimeString('en-US',{hour:'2-digit',minute:'2-digit'})}</span></div>
      <div class="divider"></div>
      ${itemsHTML}
      <div class="divider"></div>
      <div class="totals">
        <div class="totals-row"><span>Subtotal</span><span>P${subtotal.toFixed(2)}</span></div>
        ${discountHTML}
        <div class="totals-row grand-total"><span>TOTAL</span><span>P${total.toFixed(2)}</span></div>
        <div class="totals-row" style="margin-top:10px;font-size:12px"><span>Payment</span><span>${methodLabels[method]}</span></div>
      </div>
      <div class="footer"><p>${storeFooter}</p></div>
    </body></html>`;
};

// ─────────────────────────────────────────────
// SUCCESS OVERLAY
// ─────────────────────────────────────────────
function SuccessOverlay({ total, method, orderNum, cartItems, subtotal, discountAmt, discountLabel, baristaName, isOffline, storeSettings, onDone }: any) {
  const scale = useRef(new Animated.Value(0)).current;
  const fade  = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.spring(scale, { toValue: 1, useNativeDriver: true, speed: 12, bounciness: 8 }),
      Animated.timing(fade,  { toValue: 1, duration: 280, useNativeDriver: true }),
    ]).start();
  }, []);

  const methodLabels: Record<PayMethod, string> = { cash: 'Cash', gcash: 'GCash', maya: 'Maya', card: 'Card' };

  const handlePrint = async () => {
    const html = generateReceiptHTML(orderNum, cartItems, subtotal, discountAmt, total, method, baristaName, isOffline, discountLabel, storeSettings);
    try { await Print.printAsync({ html }); } catch (e) { console.error(e); }
  };

  const handleShare = async () => {
    const html = generateReceiptHTML(orderNum, cartItems, subtotal, discountAmt, total, method, baristaName, isOffline, discountLabel, storeSettings);
    try {
      const { uri } = await Print.printToFileAsync({ html });
      if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(uri, { UTI: '.pdf', mimeType: 'application/pdf' });
    } catch (e) { console.error(e); }
  };

  return (
    <Animated.View style={[so.overlay, { opacity: fade }]}>
      <Animated.View style={[so.card, { transform: [{ scale }] }]}>
        <TouchableOpacity style={so.closeX} onPress={onDone}>
          <X size={18} color={C.textMuted} />
        </TouchableOpacity>

        {/* Success Icon */}
        <View style={so.iconRing}>
          <View style={so.iconInner}>
            <CheckCircle size={44} color={C.successLt} strokeWidth={1.5} />
          </View>
        </View>

        <Text style={so.title}>Payment Complete</Text>
        <Text style={so.receiptNum}>Receipt {orderNum}</Text>

        <View style={so.amountRow}>
          <Text style={so.amountCurrency}>₱</Text>
          <Text style={so.amountValue}>{total.toFixed(2)}</Text>
        </View>
        <Text style={so.methodText}>via {methodLabels[method as PayMethod]}</Text>

        {isOffline && (
          <View style={so.offlineNote}>
            <WifiOff size={12} color={C.dangerLt} />
            <Text style={so.offlineNoteText}>Saved locally · Will sync when online</Text>
          </View>
        )}

        <View style={so.divider} />

        <View style={so.actionRow}>
          <TouchableOpacity style={so.actionBtn} onPress={handlePrint} activeOpacity={0.8}>
            <Printer size={18} color={C.gold} />
            <Text style={so.actionBtnText}>Print</Text>
          </TouchableOpacity>
          <TouchableOpacity style={so.actionBtn} onPress={handleShare} activeOpacity={0.8}>
            <Share size={18} color={C.gold} />
            <Text style={so.actionBtnText}>Share</Text>
          </TouchableOpacity>
        </View>

        <TouchableOpacity style={so.doneBtn} onPress={onDone} activeOpacity={0.85}>
          <Text style={so.doneBtnText}>New Order</Text>
        </TouchableOpacity>
      </Animated.View>
    </Animated.View>
  );
}

const so = StyleSheet.create({
  overlay:       { position: 'absolute', inset: 0, zIndex: 999, backgroundColor: 'rgba(8,14,24,0.92)', alignItems: 'center', justifyContent: 'center' },
  card:          { backgroundColor: C.bgCard, borderRadius: 24, padding: 28, alignItems: 'center', width: W * 0.88, maxWidth: 380, borderWidth: 1.5, borderColor: 'rgba(196,154,85,0.2)', position: 'relative' },
  closeX:        { position: 'absolute', top: 16, right: 16, width: 32, height: 32, borderRadius: 10, backgroundColor: 'rgba(36,51,80,0.5)', alignItems: 'center', justifyContent: 'center' },
  iconRing:      { width: 96, height: 96, borderRadius: 48, borderWidth: 1.5, borderColor: 'rgba(77,191,130,0.2)', alignItems: 'center', justifyContent: 'center', marginBottom: 20 },
  iconInner:     { width: 76, height: 76, borderRadius: 38, backgroundColor: 'rgba(31,107,65,0.2)', alignItems: 'center', justifyContent: 'center' },
  title:         { fontSize: 22, fontWeight: '800', color: C.text, marginBottom: 4 },
  receiptNum:    { fontSize: 12, fontWeight: '600', color: C.textMuted, marginBottom: 18, letterSpacing: 0.5 },
  amountRow:     { flexDirection: 'row', alignItems: 'flex-start', gap: 3 },
  amountCurrency:{ fontSize: 20, fontWeight: '700', color: C.gold, marginTop: 6 },
  amountValue:   { fontSize: 48, fontWeight: '900', color: C.gold, lineHeight: 56 },
  methodText:    { fontSize: 13, fontWeight: '600', color: C.textMuted, marginTop: 4, marginBottom: 20 },
  offlineNote:   { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: C.dangerBg, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 7, marginBottom: 16, borderWidth: 1, borderColor: 'rgba(122,41,53,0.25)' },
  offlineNoteText: { fontSize: 11, color: C.dangerLt, fontWeight: '600' },
  divider:       { width: '100%', height: 1, backgroundColor: 'rgba(36,51,80,0.5)', marginBottom: 20 },
  actionRow:     { flexDirection: 'row', gap: 12, width: '100%', marginBottom: 16 },
  actionBtn:     { flex: 1, backgroundColor: 'rgba(196,154,85,0.08)', borderWidth: 1.5, borderColor: 'rgba(196,154,85,0.25)', borderRadius: 14, paddingVertical: 14, alignItems: 'center', justifyContent: 'center', gap: 6 },
  actionBtnText: { fontSize: 13, fontWeight: '700', color: C.gold },
  doneBtn:       { backgroundColor: C.navyMid, borderRadius: 14, paddingVertical: 16, width: '100%', alignItems: 'center', borderWidth: 1, borderColor: 'rgba(196,154,85,0.15)' },
  doneBtnText:   { fontSize: 15, fontWeight: '800', color: C.cream },
});

// ─────────────────────────────────────────────
// ORDER TYPE TOGGLE  (replaces emoji version)
// ─────────────────────────────────────────────
function OrderTypeToggle({
  value,
  onChange,
}: {
  value: 'dine-in' | 'takeout';
  onChange: (v: 'dine-in' | 'takeout') => void;
}) {
  const OPTIONS: { key: 'dine-in' | 'takeout'; label: string; Icon: any; desc: string }[] = [
    { key: 'dine-in', label: 'Dine-In',  Icon: UtensilsCrossed, desc: 'Eat here'   },
    { key: 'takeout', label: 'Takeout',  Icon: ShoppingBag,     desc: 'Take away'  },
  ];

  return (
    <View style={ot.row}>
      {OPTIONS.map(({ key, label, Icon, desc }) => {
        const active = value === key;
        return (
          <TouchableOpacity
            key={key}
            style={[ot.btn, active && ot.btnActive]}
            onPress={() => onChange(key)}
            activeOpacity={0.8}
          >
            {/* icon circle */}
            <View style={[ot.iconCircle, active && ot.iconCircleActive]}>
              <Icon size={20} color={active ? C.cream : C.textMuted} strokeWidth={1.8} />
            </View>
            <View style={ot.textCol}>
              <Text style={[ot.label, active && ot.labelActive]}>{label}</Text>
              <Text style={[ot.desc, active && ot.descActive]}>{desc}</Text>
            </View>
            {active && (
              <View style={ot.check}>
                <Check size={10} color="#FFF" strokeWidth={3} />
              </View>
            )}
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const ot = StyleSheet.create({
  row:             { flexDirection: 'row', gap: 10 },
  btn:             { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14, paddingHorizontal: 14, borderRadius: 14, backgroundColor: C.bgCard, borderWidth: 1.5, borderColor: C.border, position: 'relative' },
  btnActive:       { backgroundColor: C.navyMid, borderColor: 'rgba(196,154,85,0.3)' },
  iconCircle:      { width: 40, height: 40, borderRadius: 12, backgroundColor: 'rgba(36,51,80,0.6)', alignItems: 'center', justifyContent: 'center' },
  iconCircleActive:{ backgroundColor: 'rgba(196,154,85,0.15)' },
  textCol:         { flex: 1 },
  label:           { fontSize: 14, fontWeight: '800', color: C.textMuted },
  labelActive:     { color: C.cream },
  desc:            { fontSize: 11, fontWeight: '500', color: C.textDim, marginTop: 2 },
  descActive:      { color: C.textMuted },
  check:           { position: 'absolute', top: 8, right: 8, width: 18, height: 18, borderRadius: 9, backgroundColor: C.gold, alignItems: 'center', justifyContent: 'center' },
});

// ─────────────────────────────────────────────
// PAYMENT METHOD BUTTON
// ─────────────────────────────────────────────
function PayMethodBtn({ payKey, label, IconComp, active, onPress }: {
  payKey: PayMethod; label: string; IconComp: any; active: boolean; onPress: () => void;
}) {
  return (
    <TouchableOpacity style={[pm.btn, active && pm.btnActive]} onPress={onPress} activeOpacity={0.8}>
      <View style={[pm.iconWrap, active && pm.iconWrapActive]}>
        <IconComp size={18} color={active ? C.gold : C.textMuted} strokeWidth={1.8} />
      </View>
      <Text style={[pm.label, active && pm.labelActive]}>{label}</Text>
      {active && <View style={pm.check}><Check size={9} color="#FFF" strokeWidth={3.5} /></View>}
    </TouchableOpacity>
  );
}

const pm = StyleSheet.create({
  btn:          { flex: 1, minWidth: '44%', flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 13, paddingHorizontal: 14, borderRadius: 14, backgroundColor: C.bgCard, borderWidth: 1.5, borderColor: C.border, position: 'relative' },
  btnActive:    { backgroundColor: C.navyMid, borderColor: 'rgba(196,154,85,0.3)' },
  iconWrap:     { width: 34, height: 34, borderRadius: 10, backgroundColor: 'rgba(36,51,80,0.6)', alignItems: 'center', justifyContent: 'center' },
  iconWrapActive: { backgroundColor: 'rgba(196,154,85,0.12)' },
  label:        { fontSize: 13, fontWeight: '700', color: C.textMuted, flex: 1 },
  labelActive:  { color: C.cream },
  check:        { position: 'absolute', top: 7, right: 7, width: 16, height: 16, borderRadius: 8, backgroundColor: C.gold, alignItems: 'center', justifyContent: 'center' },
});

// ─────────────────────────────────────────────
// MAIN COMPONENT
// ─────────────────────────────────────────────
export default function CartScreen() {
  useKeepAwake();

  const { cart, subtotal, total, discount, setDiscount, clearCart, removeItem, updateQty } = useCart();
  const { currentUser } = useAuth();
  const router = useRouter();

  const [payMethod,      setPayMethod]      = useState<PayMethod>('cash');
  const [orderType,      setOrderType]      = useState<'dine-in' | 'takeout'>('dine-in');
  const [processing,     setProcessing]     = useState(false);
  const [discounts,      setDiscounts]      = useState<Discount[]>([]);
  const [storeSettings,  setStoreSettings]  = useState<any>(null);
  const [customDiscountName, setCustomDiscountName] = useState<string | null>(null);
  const [showCustomDisc, setShowCustomDisc] = useState(false);
  const [customDiscName, setCustomDiscName] = useState('');
  const [customDiscPct,  setCustomDiscPct]  = useState('');
  const [authVisible,    setAuthVisible]    = useState(false);
  const [authPin,        setAuthPin]        = useState('');
  const [authError,      setAuthError]      = useState('');
  const [authLoading,    setAuthLoading]    = useState(false);
  const [isOffline,      setIsOffline]      = useState(false);
  const [showSuccess,    setShowSuccess]    = useState(false);
  const [orderNum,       setOrderNum]       = useState('');
  const [paidTotal,      setPaidTotal]      = useState(0);
  const [paidMethod,     setPaidMethod]     = useState<PayMethod>('cash');
  const [error,          setError]          = useState('');
  const [cartSnapshot,   setCartSnapshot]   = useState<any[]>([]);
  const [subtotalSnapshot, setSubtotalSnapshot] = useState(0);

  // PIN shake animation
  const pinShake = useRef(new Animated.Value(0)).current;
  const shake = () => {
    Animated.sequence([
      Animated.timing(pinShake, { toValue: 7,  duration: 55, useNativeDriver: true }),
      Animated.timing(pinShake, { toValue: -7, duration: 55, useNativeDriver: true }),
      Animated.timing(pinShake, { toValue: 4,  duration: 55, useNativeDriver: true }),
      Animated.timing(pinShake, { toValue: 0,  duration: 55, useNativeDriver: true }),
    ]).start();
  };

  // Network monitor
  useEffect(() => {
    const check = async () => {
      const s = await Network.getNetworkStateAsync();
      setIsOffline(!(s.isConnected && s.isInternetReachable));
    };
    check();
    const iv = setInterval(check, 5000);
    return () => clearInterval(iv);
  }, []);

  // Fetch discounts & store settings
  useEffect(() => {
    const fetchData = async () => {
      if (!isOffline) {
        const { data: dData } = await supabase.from('discounts').select('*').order('percentage', { ascending: false });
        if (dData) setDiscounts(dData);
        const { data: sData } = await supabase.from('store_settings').select('*').eq('id', 1).single();
        if (sData) {
          setStoreSettings(sData);
          await AsyncStorage.setItem('@crema_store_settings', JSON.stringify(sData));
        }
      } else {
        const cached = await AsyncStorage.getItem('@crema_store_settings');
        if (cached) setStoreSettings(JSON.parse(cached));
      }
    };
    fetchData();
  }, [isOffline]);

  // ── MANAGER AUTH ──
  const initiateCustomDiscountAuth = () => {
    if (currentUser?.role === 'manager') { setShowCustomDisc(true); return; }
    setAuthPin(''); setAuthError(''); setAuthVisible(true);
  };

  const handlePinKey = async (val: string) => {
    if (authError) setAuthError('');
    if (val === '⌫') { setAuthPin(p => p.slice(0, -1)); return; }
    if (authPin.length >= 4) return;
    const next = authPin + val;
    setAuthPin(next);
    if (next.length === 4) {
      setAuthLoading(true);
      try {
        const { data } = await supabase
          .from('profiles').select('id')
          .eq('pin_code', next).eq('role', 'manager').eq('status', 'active').single();
        if (data) { setAuthVisible(false); setShowCustomDisc(true); }
        else { setAuthError('Invalid Manager PIN'); setAuthPin(''); shake(); Vibration.vibrate(200); }
      } catch { setAuthError('Network error. Cannot verify PIN.'); setAuthPin(''); shake(); }
      setAuthLoading(false);
    }
  };

  const applyCustomDiscount = () => {
    if (!customDiscName.trim() || !customDiscPct) return;
    setCustomDiscountName(customDiscName.trim());
    setDiscount(parseFloat(customDiscPct) / 100);
    setShowCustomDisc(false);
    setCustomDiscName(''); setCustomDiscPct('');
  };

  // ── CHECKOUT ──
  const handleCheckout = async () => {
    if (cart.length === 0) return;
    setProcessing(true); setError('');
    try {
      const shortId = Date.now().toString().slice(-6).toUpperCase();
      const receiptNumber = `REC-${shortId}`;
      const orderData = {
        total, total_amount: total,
        payment_method: payMethod,
        receipt_number: receiptNumber,
        barista_id: currentUser?.id ?? null,
        status: 'pending',
        order_type: orderType,
      };
      const orderItems = cart.map((item: any) => ({
        menu_item_id:   item.id,
        qty:            item.quantity ?? 1,
        unit_price:     item.base_price,
        modifiers_json: JSON.stringify(item.modifiers ?? []),
        special_note:   item.note ?? null,
      }));

      const orderId = await submitOrder(orderData, orderItems);

      if (!isOffline && orderId) {
        try {
          const { data: sale } = await supabase.from('sales').insert({
            barista_id: currentUser?.id ?? null, total_amount: total,
            payment_method: payMethod, order_type: orderType, tax_amount: 0,
          }).select('id').single();
          if (sale) {
            await supabase.from('sale_items').insert(
              cart.map((item: any) => ({
                sale_id: sale.id, product_id: item.id,
                quantity: item.quantity ?? 1, unit_price: item.base_price,
                total_item_cost: item.base_price * (item.quantity ?? 1),
              }))
            );
          }
        } catch { /* non-critical */ }
        syncOutbox();
      }

      setOrderNum(receiptNumber);
      setPaidTotal(total);
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
    setCustomDiscountName(null);
    setDiscount(0);
    setOrderType('dine-in');
    router.replace('/pos');
  };

  const dbDiscountMatch = discounts.find(d => d.percentage === discount);
  const discountLabel   = customDiscountName || dbDiscountMatch?.name || 'Discount';
  const discountAmount  = subtotal * discount;
  const isEmpty         = cart.length === 0;

  const PAY_OPTIONS: { key: PayMethod; label: string; Icon: any }[] = [
    { key: 'cash',  label: 'Cash',  Icon: Banknote   },
    { key: 'gcash', label: 'GCash', Icon: Smartphone },
    { key: 'maya',  label: 'Maya',  Icon: Smartphone },
    { key: 'card',  label: 'Card',  Icon: CreditCard },
  ];

  return (
    <SafeAreaView style={s.root}>
      {/* Offline Banner */}
      {isOffline && (
        <View style={s.offlineBanner}>
          <WifiOff size={13} color={C.dangerLt} />
          <Text style={s.offlineText}>Offline — Orders saving locally</Text>
        </View>
      )}

      {/* ── HEADER ── */}
      <View style={s.header}>
        <TouchableOpacity style={s.backBtn} onPress={() => router.back()}>
          <ChevronLeft size={20} color={C.text} strokeWidth={2.5} />
        </TouchableOpacity>
        <View style={{ flex: 1, alignItems: 'center' }}>
          <Text style={s.headerTitle}>Order Summary</Text>
          {!isEmpty && (
            <Text style={s.headerSub}>{cart.length} item{cart.length !== 1 ? 's' : ''}</Text>
          )}
        </View>
        <View style={{ width: 38 }} />
      </View>
      <View style={s.headerAccent} />

      {/* ── EMPTY STATE ── */}
      {isEmpty ? (
        <View style={s.emptyWrap}>
          <View style={s.emptyIcon}>
            <ShoppingBag size={36} color={C.gold} strokeWidth={1.5} />
          </View>
          <Text style={s.emptyTitle}>Cart is empty</Text>
          <Text style={s.emptySub}>Go back to the menu to add items.</Text>
          <TouchableOpacity style={s.emptyBtn} onPress={() => router.back()} activeOpacity={0.8}>
            <ChevronLeft size={15} color={C.cream} strokeWidth={2.5} />
            <Text style={s.emptyBtnText}>Back to Menu</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 30 }}>

          {/* ── ITEMS ── */}
          <View style={s.section}>
            <Text style={s.sectionTitle}>Items</Text>
            {cart.map((item: any, idx: number) => {
              const lineTotal = item.base_price * (item.quantity ?? 1);
              return (
                <View key={item.cartItemId ?? idx} style={s.cartRow}>
                  {/* qty stepper */}
                  <View style={s.qtyWrap}>
                    <TouchableOpacity style={s.qtyBtn}
                      onPress={() => {
                        if ((item.quantity ?? 1) <= 1) removeItem(item.cartItemId);
                        else updateQty?.(item.cartItemId, (item.quantity ?? 1) - 1);
                      }}>
                      <Minus size={11} color={C.textMuted} strokeWidth={3} />
                    </TouchableOpacity>
                    <Text style={s.qtyNum}>{item.quantity ?? 1}</Text>
                    <TouchableOpacity style={s.qtyBtn}
                      onPress={() => updateQty?.(item.cartItemId, (item.quantity ?? 1) + 1)}>
                      <Plus size={11} color={C.textMuted} strokeWidth={3} />
                    </TouchableOpacity>
                  </View>

                  {/* item details */}
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={s.cartItemName} numberOfLines={1}>{item.name}</Text>
                    {item.modifiers?.length > 0 && (
                      <View style={s.modsRow}>
                        {item.modifiers.map((m: any, mIdx: number) => (
                          <View key={mIdx} style={s.modChip}>
                            <ModIcon name={m.name} size={9} color={C.gold} />
                            <Text style={s.modChipText}>{m.name}</Text>
                          </View>
                        ))}
                      </View>
                    )}
                    {item.note ? (
                      <View style={s.noteRow}>
                        <NotebookPen size={10} color={C.textMuted} />
                        <Text style={s.noteText}>{item.note}</Text>
                      </View>
                    ) : null}
                    <Text style={s.unitPrice}>₱{item.base_price.toFixed(2)} each</Text>
                  </View>

                  {/* right: total + delete */}
                  <View style={s.cartRowRight}>
                    <Text style={s.lineTotal}>₱{lineTotal.toFixed(0)}</Text>
                    <TouchableOpacity style={s.deleteBtn} onPress={() => removeItem(item.cartItemId)}>
                      <Trash2 size={14} color={C.dangerLt} />
                    </TouchableOpacity>
                  </View>
                </View>
              );
            })}
          </View>

          {/* ── ORDER TYPE ── */}
          <View style={s.section}>
            <Text style={s.sectionTitle}>Order Type</Text>
            <OrderTypeToggle value={orderType} onChange={setOrderType} />
          </View>

          {/* ── DISCOUNT ── */}
          <View style={s.section}>
            <View style={s.sectionRow}>
              <Text style={s.sectionTitle}>Discount</Text>
              <TouchableOpacity style={s.addDiscBtn} onPress={initiateCustomDiscountAuth} activeOpacity={0.8}>
                <Lock size={9} color={C.gold} strokeWidth={2.5} />
                <Plus size={11} color={C.gold} strokeWidth={3} />
                <Text style={s.addDiscText}>Custom</Text>
              </TouchableOpacity>
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
              {/* None chip */}
              <TouchableOpacity
                style={[s.discChip, discount === 0 && s.discChipActive]}
                onPress={() => { setDiscount(0); setCustomDiscountName(null); }}
              >
                <X size={11} color={discount === 0 ? C.cream : C.textMuted} />
                <Text style={[s.discChipText, discount === 0 && { color: C.cream }]}>None</Text>
              </TouchableOpacity>

              {/* Custom discount chip */}
              {customDiscountName && discount > 0 && !dbDiscountMatch && (
                <TouchableOpacity style={[s.discChip, s.discChipActive]} onPress={() => { setDiscount(0); setCustomDiscountName(null); }}>
                  <Tag size={11} color={C.cream} />
                  <Text style={[s.discChipText, { color: C.cream }]}>
                    {customDiscountName} {(discount * 100).toFixed(0)}%
                  </Text>
                  <Check size={11} color={C.cream} strokeWidth={3} />
                </TouchableOpacity>
              )}

              {/* DB discount chips */}
              {discounts.map(d => {
                const on = discount === d.percentage && !customDiscountName;
                return (
                  <TouchableOpacity key={d.id} style={[s.discChip, on && s.discChipActive]}
                    onPress={() => { if (on) { setDiscount(0); } else { setCustomDiscountName(null); setDiscount(d.percentage); } }}>
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

          {/* ── PAYMENT METHOD ── */}
          <View style={s.section}>
            <Text style={s.sectionTitle}>Payment Method</Text>
            <View style={s.payGrid}>
              {PAY_OPTIONS.map(p => (
                <PayMethodBtn
                  key={p.key}
                  payKey={p.key}
                  label={p.label}
                  IconComp={p.Icon}
                  active={payMethod === p.key}
                  onPress={() => setPayMethod(p.key)}
                />
              ))}
            </View>
          </View>

          {/* ── SUMMARY ── */}
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
                    {discountLabel} ({(discount * 100).toFixed(0)}% off)
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

          {/* Error strip */}
          {error.length > 0 && (
            <View style={s.errorStrip}>
              <AlertTriangle size={14} color={C.dangerLt} />
              <Text style={s.errorText}>{error}</Text>
            </View>
          )}

          {/* ── CHECKOUT BUTTON ── */}
          <View style={s.checkoutWrap}>
            <TouchableOpacity
              style={[s.checkoutBtn, (isEmpty || processing) && s.checkoutBtnDisabled]}
              onPress={handleCheckout}
              disabled={isEmpty || processing}
              activeOpacity={0.88}
            >
              {processing ? (
                <ActivityIndicator color={C.cream} size="small" />
              ) : (
                <View style={s.checkoutInner}>
                  <Text style={s.checkoutLabel}>Process Payment</Text>
                  <View style={s.checkoutPricePill}>
                    <Text style={s.checkoutPriceText}>₱{total.toFixed(2)}</Text>
                  </View>
                </View>
              )}
            </TouchableOpacity>
          </View>

        </ScrollView>
      )}

      {/* ── MODAL: MANAGER PIN ── */}
      <Modal visible={authVisible} animationType="fade" transparent>
        <View style={md.overlay}>
          <View style={md.card}>
            <View style={md.topBar} />
            <View style={md.header}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <View style={md.lockIcon}><Lock size={16} color={C.gold} /></View>
                <Text style={md.title}>Manager Auth</Text>
              </View>
              <TouchableOpacity style={md.closeBtn} onPress={() => setAuthVisible(false)}>
                <X size={14} color={C.textDim} />
              </TouchableOpacity>
            </View>
            <Text style={md.subtitle}>Enter Manager PIN to apply a custom discount.</Text>

            {/* PIN dots */}
            <Animated.View style={[md.dotsRow, { transform: [{ translateX: pinShake }] }]}>
              {[0, 1, 2, 3].map(i => (
                <View key={i} style={[md.dot, i < authPin.length && md.dotFilled, authError ? { borderColor: C.dangerLt } : {}]} />
              ))}
            </Animated.View>

            <View style={md.errorRow}>
              {authError ? (
                <>
                  <AlertCircle size={12} color={C.dangerLt} />
                  <Text style={md.errorText}>{authError}</Text>
                </>
              ) : null}
            </View>

            {/* Keypad */}
            <View style={md.keypad}>
              {['1','2','3','4','5','6','7','8','9','','0','⌫'].map((k, i) => {
                if (!k) return <View key={i} style={md.keyEmpty} />;
                const isBack = k === '⌫';
                return (
                  <TouchableOpacity key={i} style={[md.key, isBack && md.keyBack]} onPress={() => handlePinKey(k)} disabled={authLoading} activeOpacity={0.65}>
                    {authLoading && authPin.length === 4
                      ? <ActivityIndicator size="small" color={C.textDim} />
                      : <Text style={[md.keyText, isBack && md.keyTextBack]}>{k}</Text>
                    }
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        </View>
      </Modal>

      {/* ── MODAL: CUSTOM DISCOUNT ── */}
      <Modal visible={showCustomDisc} animationType="fade" transparent>
        <View style={md.overlay}>
          <View style={md.card}>
            <View style={md.topBar} />
            <View style={md.header}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <View style={md.lockIcon}><Tag size={16} color={C.gold} /></View>
                <Text style={md.title}>Custom Discount</Text>
              </View>
              <TouchableOpacity style={md.closeBtn} onPress={() => setShowCustomDisc(false)}>
                <X size={14} color={C.textDim} />
              </TouchableOpacity>
            </View>
            <View style={{ paddingHorizontal: 20, paddingBottom: 20 }}>
              <Text style={md.inputLabel}>Reason / Name</Text>
              <TextInput style={md.input} placeholder="e.g. Spilled Coffee, Friend" placeholderTextColor={C.textDim}
                value={customDiscName} onChangeText={setCustomDiscName} />
              <Text style={md.inputLabel}>Percentage (%)</Text>
              <TextInput style={md.input} placeholder="e.g. 15" keyboardType="numeric"
                placeholderTextColor={C.textDim} value={customDiscPct} onChangeText={setCustomDiscPct} />
              <TouchableOpacity
                style={[md.applyBtn, (!customDiscName || !customDiscPct) && { opacity: 0.45 }]}
                onPress={applyCustomDiscount}
                disabled={!customDiscName || !customDiscPct}
                activeOpacity={0.85}
              >
                <Text style={md.applyBtnText}>Apply to Order</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ── SUCCESS OVERLAY ── */}
      {showSuccess && (
        <SuccessOverlay
          total={paidTotal}
          method={paidMethod}
          orderNum={orderNum}
          cartItems={cartSnapshot}
          subtotal={subtotalSnapshot}
          discountAmt={subtotalSnapshot * discount}
          discountLabel={discountLabel}
          baristaName={currentUser?.full_name ?? 'Barista'}
          isOffline={isOffline}
          storeSettings={storeSettings}
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
    backgroundColor: C.dangerBg, borderBottomWidth: 1, borderBottomColor: 'rgba(122,41,53,0.3)',
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 8,
  },
  offlineText: { color: C.dangerLt, fontSize: 12, fontWeight: '700' },

  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingTop: Platform.OS === 'android' ? 12 : 8, paddingBottom: 12,
  },
  backBtn: {
    width: 38, height: 38, borderRadius: 19,
    backgroundColor: 'rgba(36,51,80,0.5)',
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: C.border,
  },
  headerTitle:  { fontSize: 16, fontWeight: '800', color: C.text, letterSpacing: 0.3 },
  headerSub:    { fontSize: 11, fontWeight: '600', color: C.textMuted, marginTop: 3 },
  headerAccent: { height: 1.5, backgroundColor: 'rgba(196,154,85,0.3)', marginHorizontal: 16, borderRadius: 1, marginBottom: 4 },

  emptyWrap:  { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 40 },
  emptyIcon:  { width: 80, height: 80, borderRadius: 40, backgroundColor: 'rgba(196,154,85,0.08)', borderWidth: 1, borderColor: 'rgba(196,154,85,0.15)', alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  emptyTitle: { fontSize: 20, fontWeight: '800', color: C.text },
  emptySub:   { fontSize: 14, color: C.textMuted, textAlign: 'center', lineHeight: 22 },
  emptyBtn:   { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: C.navyMid, borderRadius: 12, paddingHorizontal: 20, paddingVertical: 12, marginTop: 6, borderWidth: 1, borderColor: 'rgba(196,154,85,0.15)' },
  emptyBtnText: { fontSize: 14, fontWeight: '700', color: C.cream },

  section:      { marginHorizontal: 16, marginTop: 18 },
  sectionTitle: { fontSize: 10, fontWeight: '800', letterSpacing: 1.8, textTransform: 'uppercase', color: C.textDim, marginBottom: 10 },
  sectionRow:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },

  // Cart rows
  cartRow: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 12,
    backgroundColor: C.bgCard, borderRadius: 14, padding: 14, marginBottom: 8,
    borderWidth: 1, borderColor: C.border,
  },
  cartRowRight: { alignItems: 'flex-end', gap: 10, marginLeft: 4 },
  cartItemName: { fontSize: 14, fontWeight: '700', color: C.text, marginBottom: 4 },
  modsRow:      { flexDirection: 'row', flexWrap: 'wrap', gap: 5, marginBottom: 4 },
  modChip:      { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(196,154,85,0.08)', borderRadius: 6, paddingHorizontal: 7, paddingVertical: 3, borderWidth: 1, borderColor: 'rgba(196,154,85,0.15)' },
  modChipText:  { fontSize: 10, fontWeight: '600', color: C.gold },
  noteRow:      { flexDirection: 'row', alignItems: 'flex-start', gap: 5, backgroundColor: 'rgba(36,51,80,0.3)', borderRadius: 6, paddingHorizontal: 7, paddingVertical: 4, marginBottom: 4 },
  noteText:     { fontSize: 11, color: C.textMuted, flex: 1, lineHeight: 15 },
  unitPrice:    { fontSize: 11, color: C.textDim, fontWeight: '500' },
  lineTotal:    { fontSize: 16, fontWeight: '800', color: C.text },
  deleteBtn:    { width: 30, height: 30, borderRadius: 9, backgroundColor: C.dangerBg, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(122,41,53,0.25)' },

  qtyWrap: { flexDirection: 'column', alignItems: 'center', gap: 6, backgroundColor: 'rgba(36,51,80,0.4)', borderRadius: 10, padding: 5, borderWidth: 1, borderColor: C.border },
  qtyBtn:  { width: 26, height: 26, borderRadius: 8, backgroundColor: 'rgba(36,51,80,0.6)', alignItems: 'center', justifyContent: 'center' },
  qtyNum:  { fontSize: 14, fontWeight: '800', color: C.text, minWidth: 18, textAlign: 'center' },

  addDiscBtn:    { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 100, borderWidth: 1.5, borderColor: 'rgba(196,154,85,0.3)', backgroundColor: 'rgba(196,154,85,0.07)' },
  addDiscText:   { fontSize: 11, fontWeight: '700', color: C.gold },
  discChip:      { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 9, borderRadius: 100, borderWidth: 1.5, borderColor: C.border, backgroundColor: 'rgba(36,51,80,0.2)' },
  discChipActive:{ backgroundColor: C.navyMid, borderColor: 'rgba(196,154,85,0.35)' },
  discChipText:  { fontSize: 13, fontWeight: '700', color: C.textMuted },

  payGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },

  summaryBox:        { backgroundColor: C.bgCard, borderRadius: 16, padding: 18, borderWidth: 1, borderColor: C.border },
  summaryRow:        { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  summaryLabel:      { fontSize: 14, fontWeight: '500', color: C.textMuted },
  summaryVal:        { fontSize: 14, fontWeight: '700', color: C.text },
  summaryTotalRow:   { borderTopWidth: 1, borderTopColor: 'rgba(36,51,80,0.5)', paddingTop: 14, marginTop: 4, marginBottom: 0 },
  summaryTotalLabel: { fontSize: 16, fontWeight: '700', color: C.text },
  summaryTotalVal:   { fontSize: 24, fontWeight: '900', color: C.gold },

  errorStrip: { flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: 16, marginTop: 12, backgroundColor: C.dangerBg, borderRadius: 12, padding: 14, borderWidth: 1, borderColor: 'rgba(122,41,53,0.25)' },
  errorText:  { fontSize: 13, fontWeight: '600', color: C.dangerLt, flex: 1 },

  checkoutWrap: { marginHorizontal: 16, marginTop: 20 },
  checkoutBtn: {
    backgroundColor: C.navyMid, borderRadius: 16,
    borderWidth: 1, borderColor: 'rgba(196,154,85,0.25)',
    shadowColor: '#000', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.4, shadowRadius: 16, elevation: 10,
  },
  checkoutBtnDisabled: { opacity: 0.4 },
  checkoutInner:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 18 },
  checkoutLabel:    { fontSize: 15, fontWeight: '800', color: C.cream },
  checkoutPricePill:{ backgroundColor: 'rgba(196,154,85,0.18)', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 7, borderWidth: 1, borderColor: 'rgba(196,154,85,0.25)' },
  checkoutPriceText:{ fontSize: 16, fontWeight: '800', color: C.gold },
});

// Modal styles (dark theme, matching Queue screen void modal)
const md = StyleSheet.create({
  overlay:   { flex: 1, backgroundColor: 'rgba(8,14,24,0.88)', alignItems: 'center', justifyContent: 'center', padding: 24 },
  card:      { backgroundColor: C.bgCard, borderRadius: 20, width: '100%', maxWidth: 380, overflow: 'hidden', borderWidth: 1.5, borderColor: C.border },
  topBar:    { height: 3, backgroundColor: C.gold },
  header:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 20, paddingBottom: 12 },
  lockIcon:  { width: 34, height: 34, borderRadius: 10, backgroundColor: 'rgba(196,154,85,0.1)', borderWidth: 1, borderColor: 'rgba(196,154,85,0.2)', alignItems: 'center', justifyContent: 'center' },
  title:     { fontSize: 16, fontWeight: '800', color: C.text },
  closeBtn:  { width: 30, height: 30, borderRadius: 9, backgroundColor: 'rgba(36,51,80,0.5)', alignItems: 'center', justifyContent: 'center' },
  subtitle:  { fontSize: 13, color: C.textMuted, textAlign: 'center', marginBottom: 22, paddingHorizontal: 20 },

  dotsRow:   { flexDirection: 'row', justifyContent: 'center', gap: 16, marginBottom: 10 },
  dot:       { width: 14, height: 14, borderRadius: 7, borderWidth: 2, borderColor: C.textDim },
  dotFilled: { backgroundColor: C.gold, borderColor: C.gold },
  errorRow:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, height: 22, marginBottom: 16 },
  errorText: { fontSize: 12, color: C.dangerLt, fontWeight: '600' },

  keypad:      { flexDirection: 'row', flexWrap: 'wrap', width: 230, alignSelf: 'center', justifyContent: 'center', gap: 12, marginBottom: 28 },
  keyEmpty:    { width: 62, height: 58 },
  key:         { width: 62, height: 58, borderRadius: 14, backgroundColor: 'rgba(36,51,80,0.4)', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: C.border },
  keyBack:     { backgroundColor: C.dangerBg, borderColor: 'rgba(122,41,53,0.3)' },
  keyText:     { fontSize: 22, fontWeight: '600', color: C.text },
  keyTextBack: { fontSize: 16, color: C.dangerLt },

  inputLabel: { fontSize: 10, fontWeight: '700', letterSpacing: 1.2, textTransform: 'uppercase', color: C.textMuted, marginBottom: 8 },
  input:      { backgroundColor: C.bg, borderWidth: 1.5, borderColor: C.border, borderRadius: 12, padding: 14, fontSize: 14, color: C.text, marginBottom: 14 },
  applyBtn:   { backgroundColor: C.navyMid, borderRadius: 14, paddingVertical: 15, alignItems: 'center', marginTop: 6, borderWidth: 1, borderColor: 'rgba(196,154,85,0.2)' },
  applyBtnText: { fontSize: 15, fontWeight: '800', color: C.cream },
});