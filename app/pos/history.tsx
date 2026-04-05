import React, { useState, useEffect, useMemo } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet,
  SafeAreaView, TextInput, Modal, ActivityIndicator, KeyboardAvoidingView, Platform
} from 'react-native';
import { supabase } from '../../.vscode/lib/supabase';
import { useAuth } from '../../hooks/useAuth';
import { useRouter } from 'expo-router';
import * as Network from 'expo-network';
import {
  ChevronLeft, Search, Receipt, Clock, CheckCircle2, 
  AlertTriangle, Ban, Lock, X, FileText
} from 'lucide-react-native';

// ─────────────────────────────────────────────
// DESIGN TOKENS
// ─────────────────────────────────────────────
const C = {
  navy:      '#1E2D45',
  navyMid:   '#2C3E5C',
  gold:      '#B8935A',
  cream:     '#F5EFE4',
  creamDeep: '#EDE4D6',
  bg:        '#0F1923',
  bgCard:    '#162030',
  text:      '#F5EFE4',
  textMuted: '#8A9BB0',
  textDim:   '#4A6080',
  successLt: '#5AC88A',
  danger:    '#7A2E35',
  dangerLt:  '#C07070',
  orange:    '#E8B960'
};

export default function OrderHistoryScreen() {
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [isOffline, setIsOffline] = useState(false);
  
  // Void Modal State
  const [selectedOrder, setSelectedOrder] = useState<any>(null);
  const [showVoidModal, setShowVoidModal] = useState(false);
  const [voidReason, setVoidReason] = useState('');
  const [authPin, setAuthPin] = useState('');
  const [authError, setAuthError] = useState('');
  const [processing, setProcessing] = useState(false);

  const { currentUser } = useAuth();
  const router = useRouter();

  useEffect(() => {
    const checkNetwork = async () => {
      const state = await Network.getNetworkStateAsync();
      setIsOffline(!(state.isConnected && state.isInternetReachable));
    };
    checkNetwork();
    fetchHistory();
  }, []);

  const fetchHistory = async () => {
    setLoading(true);
    // Fetch today's orders
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const { data } = await supabase
      .from('orders')
      .select(`
        id, receipt_number, total_amount, payment_method, created_at, status, void_reason,
        order_items(qty, unit_price, menu_items(name))
      `)
      .gte('created_at', today.toISOString())
      .order('created_at', { ascending: false })
      .limit(50);

    if (data) setOrders(data);
    setLoading(false);
  };

  const filteredOrders = useMemo(() => {
    return orders.filter(o => 
      o.receipt_number?.toLowerCase().includes(search.toLowerCase()) || 
      o.status.includes(search.toLowerCase())
    );
  }, [orders, search]);

  // ─────────────────────────────────────────────
  // VOID LOGIC
  // ─────────────────────────────────────────────
  const openVoidModal = (order: any) => {
    setSelectedOrder(order);
    setVoidReason('');
    setAuthPin('');
    setAuthError('');
    setShowVoidModal(true);
  };

  const handleFlagForManager = async () => {
    if (!voidReason.trim()) {
      setAuthError('Please provide a reason for the manager.');
      return;
    }
    if (isOffline) {
      setAuthError('Must be online to request a void.');
      return;
    }

    setProcessing(true);
    try {
      const { error } = await supabase
        .from('orders')
        .update({ status: 'void_requested', void_reason: voidReason.trim() })
        .eq('id', selectedOrder.id);

      if (error) throw error;
      
      // Update local state
      setOrders(prev => prev.map(o => o.id === selectedOrder.id ? { ...o, status: 'void_requested', void_reason: voidReason.trim() } : o));
      setShowVoidModal(false);
    } catch (e: any) {
      setAuthError(e.message);
    } finally {
      setProcessing(false);
    }
  };

  const handleManagerPinWipe = async (val: string) => {
    if (authError) setAuthError('');
    if (val === '⌫') {
      setAuthPin(p => p.slice(0, -1));
      return;
    }
    if (authPin.length >= 4) return;
    
    const nextPin = authPin + val;
    setAuthPin(nextPin);
    
    if (nextPin.length === 4) {
      if (!voidReason.trim()) {
        setAuthError('Reason required before PIN.');
        setAuthPin('');
        return;
      }

      setProcessing(true);
      try {
        // 1. Verify PIN
        const { data: manager, error: pinErr } = await supabase
          .from('profiles')
          .select('id')
          .eq('pin_code', nextPin)
          .eq('role', 'manager')
          .eq('status', 'active')
          .single();

        if (!manager || pinErr) {
          setAuthError('Invalid Manager PIN');
          setAuthPin('');
          setProcessing(false);
          return;
        }

        // 2. Void Order Instantly
        const { error: voidErr } = await supabase
          .from('orders')
          .update({ 
            status: 'voided', 
            void_reason: voidReason.trim(),
            voided_by: manager.id 
          })
          .eq('id', selectedOrder.id);

        if (voidErr) throw voidErr;

        setOrders(prev => prev.map(o => o.id === selectedOrder.id ? { ...o, status: 'voided', void_reason: voidReason.trim() } : o));
        setShowVoidModal(false);
      } catch (e: any) {
        setAuthError('Network error verifying PIN.');
        setAuthPin('');
      } finally {
        setProcessing(false);
      }
    }
  };

  const renderStatusBadge = (status: string) => {
    if (status === 'completed') return <View style={[s.badge, { backgroundColor: 'rgba(90,200,138,0.15)', borderColor: 'rgba(90,200,138,0.3)' }]}><CheckCircle2 size={10} color={C.successLt}/><Text style={[s.badgeText, { color: C.successLt }]}>Completed</Text></View>;
    if (status === 'pending') return <View style={[s.badge, { backgroundColor: 'rgba(184,147,90,0.15)', borderColor: 'rgba(184,147,90,0.3)' }]}><Clock size={10} color={C.gold}/><Text style={[s.badgeText, { color: C.gold }]}>In Queue</Text></View>;
    if (status === 'void_requested') return <View style={[s.badge, { backgroundColor: 'rgba(232,185,96,0.15)', borderColor: 'rgba(232,185,96,0.3)' }]}><AlertTriangle size={10} color={C.orange}/><Text style={[s.badgeText, { color: C.orange }]}>Pending Void</Text></View>;
    if (status === 'voided') return <View style={[s.badge, { backgroundColor: 'rgba(192,112,112,0.15)', borderColor: 'rgba(192,112,112,0.3)' }]}><Ban size={10} color={C.dangerLt}/><Text style={[s.badgeText, { color: C.dangerLt }]}>Voided</Text></View>;
    return null;
  };

  return (
    <SafeAreaView style={s.root}>
      <View style={s.header}>
        <TouchableOpacity style={s.backBtn} onPress={() => router.back()}>
          <ChevronLeft size={22} color={C.text} strokeWidth={2.5} />
        </TouchableOpacity>
        <View style={{ flex: 1, alignItems: 'center' }}>
          <Text style={s.headerTitle}>Shift History</Text>
          <Text style={s.headerSub}>Today's Transactions</Text>
        </View>
        <View style={{ width: 38 }} />
      </View>

      <View style={s.searchWrap}>
        <Search size={16} color={C.textDim} />
        <TextInput
          style={s.searchInput}
          placeholder="Search by Receipt #..."
          placeholderTextColor={C.textDim}
          value={search}
          onChangeText={setSearch}
        />
      </View>

      {loading ? (
        <View style={s.center}><ActivityIndicator size="large" color={C.gold} /></View>
      ) : filteredOrders.length === 0 ? (
        <View style={s.center}>
          <Receipt size={48} color={C.textDim} />
          <Text style={s.emptyText}>No recent transactions found.</Text>
        </View>
      ) : (
        <FlatList
          data={filteredOrders}
          keyExtractor={item => item.id}
          contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
          renderItem={({ item }) => (
            <TouchableOpacity 
              style={[s.card, item.status === 'voided' && s.cardVoided]} 
              activeOpacity={0.8}
              onPress={() => item.status === 'completed' ? openVoidModal(item) : null}
            >
              <View style={s.cardHeader}>
                <Text style={s.receiptNum}>{item.receipt_number || 'UNKNOWN'}</Text>
                {renderStatusBadge(item.status)}
              </View>
              <View style={s.cardBody}>
                <View>
                  <Text style={s.time}>{new Date(item.created_at).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}</Text>
                  <Text style={s.method}>{item.payment_method.toUpperCase()}</Text>
                </View>
                <Text style={[s.total, item.status === 'voided' && { textDecorationLine: 'line-through', color: C.textDim }]}>
                  ₱{item.total_amount.toFixed(2)}
                </Text>
              </View>
              {item.status === 'completed' && (
                <View style={s.cardFooter}>
                  <Text style={s.footerHint}>Tap to void transaction</Text>
                </View>
              )}
              {item.void_reason && (
                <View style={s.voidReasonBox}>
                  <Text style={s.voidReasonText}><Text style={{fontWeight: '700'}}>Reason:</Text> {item.void_reason}</Text>
                </View>
              )}
            </TouchableOpacity>
          )}
        />
      )}

      {/* ── VOID MODAL ── */}
      <Modal visible={showVoidModal} transparent animationType="slide">
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={m.overlay}>
          <View style={m.card}>
            <View style={m.header}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <AlertTriangle size={18} color={C.orange} />
                <Text style={m.title}>Void Receipt {selectedOrder?.receipt_number}</Text>
              </View>
              <TouchableOpacity onPress={() => setShowVoidModal(false)} style={m.closeBtn}>
                <X size={18} color={C.textMuted} />
              </TouchableOpacity>
            </View>

            <View style={{ padding: 20 }}>
              <Text style={m.label}>Reason for Void (Required)</Text>
              <TextInput
                style={m.input}
                placeholder="e.g. Customer changed mind, Wrong entry..."
                placeholderTextColor={C.textDim}
                value={voidReason}
                onChangeText={setVoidReason}
                editable={!processing}
              />

              <View style={m.split}>
                {/* Option 1: Flag for Manager */}
                <View style={m.splitHalf}>
                  <Text style={m.splitTitle}>Manager Not Here?</Text>
                  <Text style={m.splitDesc}>Flag this ticket. The drawer will remain unbalanced until the manager approves it later.</Text>
                  <TouchableOpacity 
                    style={[m.flagBtn, processing && { opacity: 0.5 }]} 
                    onPress={handleFlagForManager}
                    disabled={processing}
                  >
                    {processing ? <ActivityIndicator color={C.cream} /> : <Text style={m.flagBtnText}>Flag for Manager</Text>}
                  </TouchableOpacity>
                </View>

                <View style={m.divider} />

                {/* Option 2: Manager PIN */}
                <View style={m.splitHalf}>
                  <Text style={m.splitTitle}>Manager Override</Text>
                  <Text style={m.splitDesc}>Enter Manager PIN to instantly void this ticket and balance the drawer.</Text>
                  
                  {/* PIN Dots */}
                  <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 12, marginVertical: 10 }}>
                    {[0, 1, 2, 3].map(i => (
                      <View key={i} style={[m.pinDot, i < authPin.length && m.pinDotFilled, authError ? { borderColor: C.dangerLt } : {}]} />
                    ))}
                  </View>

                  <View style={{ height: 16, alignItems: 'center', marginBottom: 10 }}>
                    {authError ? <Text style={{ color: C.dangerLt, fontSize: 11, fontWeight: '600' }}>{authError}</Text> : null}
                  </View>

                  {/* Tiny Keypad */}
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', width: 200, alignSelf: 'center', justifyContent: 'center', gap: 8 }}>
                    {['1','2','3','4','5','6','7','8','9','','0','⌫'].map((k, i) => {
                      if (!k) return <View key={i} style={{ width: 45, height: 45 }} />;
                      return (
                        <TouchableOpacity key={i} style={m.keyBtn} onPress={() => handleManagerPinWipe(k)} disabled={processing}>
                          <Text style={m.keyText}>{k}</Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </View>
              </View>
            </View>

          </View>
        </KeyboardAvoidingView>
      </Modal>

    </SafeAreaView>
  );
}

// ─────────────────────────────────────────────
// STYLES
// ─────────────────────────────────────────────
const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingTop: 12, paddingBottom: 12 },
  backBtn: { width: 38, height: 38, borderRadius: 19, backgroundColor: 'rgba(44,62,92,0.3)', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(44,62,92,0.4)' },
  headerTitle: { fontSize: 17, fontWeight: '800', color: C.text },
  headerSub:   { fontSize: 11, fontWeight: '500', color: C.textMuted, marginTop: 2 },
  
  searchWrap: { flexDirection: 'row', alignItems: 'center', gap: 10, marginHorizontal: 16, marginBottom: 10, backgroundColor: 'rgba(44,62,92,0.25)', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, borderWidth: 1, borderColor: 'rgba(44,62,92,0.35)' },
  searchInput: { flex: 1, fontSize: 15, fontWeight: '500', color: C.text },
  
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  emptyText: { color: C.textMuted, fontSize: 15, fontWeight: '500' },

  card: { backgroundColor: C.bgCard, borderRadius: 14, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: 'rgba(44,62,92,0.3)' },
  cardVoided: { opacity: 0.6, backgroundColor: 'rgba(122,46,53,0.05)', borderColor: 'rgba(122,46,53,0.2)' },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  receiptNum: { fontSize: 14, fontWeight: '800', color: C.text, letterSpacing: 0.5 },
  
  badge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, borderWidth: 1 },
  badgeText: { fontSize: 10, fontWeight: '700', textTransform: 'uppercase' },
  
  cardBody: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' },
  time: { fontSize: 13, color: C.textMuted, marginBottom: 2 },
  method: { fontSize: 12, fontWeight: '700', color: C.textDim, textTransform: 'uppercase' },
  total: { fontSize: 20, fontWeight: '800', color: C.gold },

  cardFooter: { marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: 'rgba(44,62,92,0.2)', alignItems: 'center' },
  footerHint: { fontSize: 11, color: C.gold, fontWeight: '600' },

  voidReasonBox: { marginTop: 12, padding: 10, backgroundColor: 'rgba(44,62,92,0.2)', borderRadius: 6 },
  voidReasonText: { fontSize: 12, color: C.textMuted, fontStyle: 'italic' }
});

const m = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(10,16,26,0.85)', justifyContent: 'flex-end' },
  card: { backgroundColor: C.bgCard, borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingBottom: 20 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20, borderBottomWidth: 1, borderBottomColor: 'rgba(44,62,92,0.3)' },
  title: { fontSize: 18, fontWeight: '800', color: C.text },
  closeBtn: { width: 32, height: 32, borderRadius: 16, backgroundColor: 'rgba(44,62,92,0.3)', alignItems: 'center', justifyContent: 'center' },
  
  label: { fontSize: 12, fontWeight: '700', color: C.textMuted, marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 },
  input: { backgroundColor: C.bg, borderWidth: 1, borderColor: 'rgba(44,62,92,0.4)', borderRadius: 10, padding: 14, color: C.text, fontSize: 15, marginBottom: 20 },

  split: { flexDirection: 'row', gap: 20, alignItems: 'flex-start' },
  splitHalf: { flex: 1, alignItems: 'center' },
  divider: { width: 1, backgroundColor: 'rgba(44,62,92,0.3)', height: '100%' },
  
  splitTitle: { fontSize: 14, fontWeight: '700', color: C.text, marginBottom: 6, textAlign: 'center' },
  splitDesc: { fontSize: 11, color: C.textMuted, textAlign: 'center', marginBottom: 16, lineHeight: 16 },

  flagBtn: { backgroundColor: C.orange, paddingVertical: 12, paddingHorizontal: 20, borderRadius: 10, width: '100%', alignItems: 'center' },
  flagBtnText: { color: '#5A3F05', fontSize: 14, fontWeight: '800' },

  pinDot: { width: 12, height: 12, borderRadius: 6, borderWidth: 1.5, borderColor: C.textDim, backgroundColor: 'transparent' },
  pinDotFilled: { backgroundColor: C.gold, borderColor: C.gold },
  
  keyBtn: { width: 45, height: 45, borderRadius: 22.5, backgroundColor: 'rgba(44,62,92,0.3)', alignItems: 'center', justifyContent: 'center' },
  keyText: { fontSize: 18, fontWeight: '600', color: C.text },
});