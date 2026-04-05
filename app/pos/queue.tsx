import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet,
  SafeAreaView, StatusBar, ActivityIndicator, Alert, Modal,
  KeyboardAvoidingView, Platform, TextInput, Animated, Vibration,
  ScrollView,
} from 'react-native';
import { supabase } from '../../.vscode/lib/supabase';
import { useRouter } from 'expo-router';
import { useKeepAwake } from 'expo-keep-awake';
import * as Network from 'expo-network';
import {
  ChevronLeft, CheckCircle2, Clock, Coffee, ShoppingBag,
  UtensilsCrossed, AlertTriangle, X, Ban, Wifi, WifiOff,
  Flame, AlertCircle,
} from 'lucide-react-native';

// ─────────────────────────────────────────────
// DESIGN TOKENS
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
  warnBg:     'rgba(176,122,32,0.12)',
  urgent:     '#8B2020',
  urgentLt:   '#E05050',
  urgentBg:   'rgba(139,32,32,0.15)',
  orange:     '#C98830',
  orangeLight:'#E0A040',
  border:     'rgba(36,51,80,0.6)',
  shimmer:    'rgba(196,154,85,0.06)',
};

// ─────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────
type OrderItem = {
  id: string;
  qty: number;
  unit_price: number;
  modifiers_json: string;
  special_note: string | null;
  menu_items: { name: string };
};

type PendingOrder = {
  id: string;
  receipt_number: string | null;
  created_at: string;
  total: number;
  status: string;
  order_type: string;
  order_items: OrderItem[];
};

// ─────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────
const getElapsedMinutes = (dateString: string) =>
  Math.floor((Date.now() - new Date(dateString).getTime()) / 60000);

const getElapsedLabel = (mins: number) => {
  if (mins < 1) return 'Just now';
  if (mins === 1) return '1 min ago';
  return `${mins} mins ago`;
};

// Heat level: 0=normal, 1=warm(>8min), 2=hot(>15min)
const getHeat = (mins: number): 0 | 1 | 2 => {
  if (mins >= 15) return 2;
  if (mins >= 8) return 1;
  return 0;
};

const HEAT_CONFIG = {
  0: { border: C.border, badge: null, label: null },
  1: { border: 'rgba(176,122,32,0.5)', badge: C.warnBg, label: C.warnLt },
  2: { border: 'rgba(139,32,32,0.6)', badge: C.urgentBg, label: C.urgentLt },
};

// ─────────────────────────────────────────────
// SUB-COMPONENTS
// ─────────────────────────────────────────────

const OfflineBanner = () => {
  const anim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.spring(anim, { toValue: 1, useNativeDriver: true, tension: 80 }).start();
  }, []);
  return (
    <Animated.View style={[ob.banner, { transform: [{ scaleY: anim }], opacity: anim }]}>
      <WifiOff size={13} color={C.dangerLt} />
      <Text style={ob.text}>You're offline — Queue is read-only</Text>
    </Animated.View>
  );
};

const ob = StyleSheet.create({
  banner: {
    backgroundColor: C.dangerBg,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(122,41,53,0.35)',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 9,
  },
  text: { color: C.dangerLt, fontSize: 12, fontWeight: '700', letterSpacing: 0.3 },
});

// ─────────────────────────────────────────────
// TICKET CARD
// ─────────────────────────────────────────────
const TicketCard = ({
  item,
  onComplete,
  onVoid,
  completing,
}: {
  item: PendingOrder;
  onComplete: () => void;
  onVoid: () => void;
  completing: boolean;
}) => {
  const slideAnim = useRef(new Animated.Value(30)).current;
  const fadeAnim  = useRef(new Animated.Value(0)).current;
  const [tick, setTick]   = useState(0); // force re-render for live timer

  useEffect(() => {
    Animated.parallel([
      Animated.spring(slideAnim, { toValue: 0, useNativeDriver: true, tension: 90, friction: 11 }),
      Animated.timing(fadeAnim,  { toValue: 1, duration: 280, useNativeDriver: true }),
    ]).start();

    // Tick every 30s to refresh elapsed time
    const iv = setInterval(() => setTick(t => t + 1), 30000);
    return () => clearInterval(iv);
  }, []);

  const shortId  = item.receipt_number || item.id.slice(-5).toUpperCase();
  const isTakeout = item.order_type === 'takeout';
  const elapsed  = getElapsedMinutes(item.created_at);
  const heat     = getHeat(elapsed);
  const hc       = HEAT_CONFIG[heat];

  return (
    <Animated.View style={[
      s.ticket,
      { borderColor: hc.border },
      { opacity: fadeAnim, transform: [{ translateY: slideAnim }] },
    ]}>
      {/* HEAT STRIP — top accent line */}
      {heat > 0 && (
        <View style={[s.heatStrip, { backgroundColor: heat === 2 ? C.urgentLt : C.warnLt }]} />
      )}

      {/* ── HEADER ── */}
      <View style={s.ticketHeader}>
        <View style={s.headerLeft}>
          <Text style={s.ticketId}>#{shortId}</Text>
          <View style={s.timeRow}>
            <Clock size={11} color={heat > 0 ? hc.label! : C.textMuted} />
            <Text style={[s.timeText, heat > 0 && { color: hc.label! }]}>
              {getElapsedLabel(elapsed)}
            </Text>
            {heat === 2 && <Flame size={12} color={C.urgentLt} />}
            {heat === 1 && <AlertCircle size={11} color={C.warnLt} />}
          </View>
        </View>

        <View style={s.headerRight}>
          <View style={[s.typeBadge, isTakeout ? s.badgeTakeout : s.badgeDineIn]}>
            {isTakeout
              ? <ShoppingBag size={11} color="#FFF" />
              : <UtensilsCrossed size={11} color="#FFF" />
            }
            <Text style={s.typeText}>{isTakeout ? 'TAKEOUT' : 'DINE-IN'}</Text>
          </View>
          <Text style={s.totalText}>₱{item.total.toFixed(2)}</Text>
        </View>
      </View>

      {/* ── PERFORATED DIVIDER ── */}
      <View style={s.perfRow}>
        <View style={s.perfNub} />
        <View style={s.perfLine} />
        <View style={s.perfNub} />
      </View>

      {/* ── ITEMS ── */}
      <View style={s.ticketBody}>
        {item.order_items.map((oi, idx) => {
          let mods: any[] = [];
          try { mods = oi.modifiers_json ? JSON.parse(oi.modifiers_json) : []; } catch {}

          return (
            <View key={oi.id} style={[s.itemRow, idx < item.order_items.length - 1 && s.itemRowBorder]}>
              <View style={s.qtyBubble}>
                <Text style={s.qtyText}>{oi.qty}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.itemName}>{oi.menu_items?.name || 'Unknown Item'}</Text>
                {mods.length > 0 && (
                  <View style={s.modList}>
                    {mods.map((m: any, i: number) => (
                      <Text key={i} style={s.modText}>↳ {m.name}</Text>
                    ))}
                  </View>
                )}
                {oi.special_note ? (
                  <View style={s.noteRow}>
                    <Text style={s.noteText}>📝 {oi.special_note}</Text>
                  </View>
                ) : null}
              </View>
            </View>
          );
        })}
      </View>

      {/* ── ACTIONS ── */}
      <View style={s.ticketActions}>
        <TouchableOpacity
          style={s.voidBtn}
          activeOpacity={0.75}
          onPress={onVoid}
          disabled={completing}
        >
          <Ban size={15} color={C.dangerLt} />
          <Text style={s.voidBtnText}>Void</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[s.completeBtn, completing && s.completeBtnBusy]}
          activeOpacity={0.8}
          onPress={onComplete}
          disabled={completing}
        >
          {completing ? (
            <ActivityIndicator color="#FFF" size="small" />
          ) : (
            <>
              <CheckCircle2 size={17} color="#FFF" />
              <Text style={s.completeBtnText}>Mark Complete</Text>
            </>
          )}
        </TouchableOpacity>
      </View>
    </Animated.View>
  );
};

// ─────────────────────────────────────────────
// VOID MODAL
// ─────────────────────────────────────────────
const VoidModal = ({
  visible,
  order,
  isOffline,
  onClose,
  onFlagForManager,
  onPinSubmit,
}: {
  visible: boolean;
  order: PendingOrder | null;
  isOffline: boolean;
  onClose: () => void;
  onFlagForManager: (reason: string) => Promise<void>;
  onPinSubmit: (pin: string, reason: string) => Promise<{ error?: string }>;
}) => {
  const [reason, setReason]         = useState('');
  const [pin, setPin]               = useState('');
  const [error, setError]           = useState('');
  const [busy, setBusy]             = useState(false);
  const [activeTab, setActiveTab]   = useState<'flag' | 'pin'>('pin');
  const shakeAnim = useRef(new Animated.Value(0)).current;

  const shake = () => {
    Animated.sequence([
      Animated.timing(shakeAnim, { toValue: 6, duration: 60, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: -6, duration: 60, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 4, duration: 60, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 0, duration: 60, useNativeDriver: true }),
    ]).start();
  };

  useEffect(() => {
    if (visible) { setReason(''); setPin(''); setError(''); setBusy(false); }
  }, [visible]);

  const handleKey = async (k: string) => {
    if (busy) return;
    if (error) setError('');
    if (k === '⌫') { setPin(p => p.slice(0, -1)); return; }
    if (pin.length >= 4) return;
    const next = pin + k;
    setPin(next);

    if (next.length === 4) {
      if (!reason.trim()) {
        setError('Enter a reason first');
        setPin('');
        shake();
        return;
      }
      setBusy(true);
      const res = await onPinSubmit(next, reason.trim());
      if (res.error) {
        setError(res.error);
        setPin('');
        shake();
        Vibration.vibrate(200);
      }
      setBusy(false);
    }
  };

  const handleFlag = async () => {
    if (!reason.trim()) { setError('Reason is required'); shake(); return; }
    if (isOffline)       { setError('Cannot flag while offline'); shake(); return; }
    setBusy(true);
    await onFlagForManager(reason.trim());
    setBusy(false);
  };

  const shortId = order?.receipt_number || order?.id.slice(-5).toUpperCase();

  return (
    <Modal visible={visible} transparent animationType="slide">
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={vm.overlay}
      >
        <View style={vm.sheet}>
          {/* Handle */}
          <View style={vm.handle} />

          {/* Header */}
          <View style={vm.header}>
            <View style={vm.headerLeft}>
              <View style={vm.warnIcon}>
                <AlertTriangle size={16} color={C.warnLt} />
              </View>
              <View>
                <Text style={vm.title}>Void Order</Text>
                <Text style={vm.subtitle}>#{shortId}</Text>
              </View>
            </View>
            <TouchableOpacity style={vm.closeBtn} onPress={onClose} disabled={busy}>
              <X size={16} color={C.textMuted} />
            </TouchableOpacity>
          </View>

          <ScrollView style={{ flex: 1 }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            <View style={{ padding: 20 }}>
              {/* Reason input */}
              <Text style={vm.label}>Reason for Void</Text>
              <TextInput
                style={vm.input}
                placeholder="e.g. Customer changed mind, Duplicate entry…"
                placeholderTextColor={C.textDim}
                value={reason}
                onChangeText={t => { setReason(t); if (error) setError(''); }}
                editable={!busy}
                returnKeyType="done"
              />

              {/* Tabs */}
              <View style={vm.tabs}>
                <TouchableOpacity
                  style={[vm.tab, activeTab === 'pin' && vm.tabActive]}
                  onPress={() => setActiveTab('pin')}
                >
                  <Text style={[vm.tabText, activeTab === 'pin' && vm.tabTextActive]}>Manager PIN</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[vm.tab, activeTab === 'flag' && vm.tabActive]}
                  onPress={() => setActiveTab('flag')}
                >
                  <Text style={[vm.tabText, activeTab === 'flag' && vm.tabTextActive]}>Flag Later</Text>
                </TouchableOpacity>
              </View>

              {/* Error */}
              {error ? (
                <Animated.View style={[vm.errorRow, { transform: [{ translateX: shakeAnim }] }]}>
                  <AlertCircle size={13} color={C.dangerLt} />
                  <Text style={vm.errorText}>{error}</Text>
                </Animated.View>
              ) : null}

              {/* PIN Tab */}
              {activeTab === 'pin' && (
                <View style={vm.pinPanel}>
                  <Text style={vm.panelDesc}>
                    Manager enters their 4-digit PIN to immediately void and balance the drawer.
                  </Text>

                  {/* PIN dots */}
                  <View style={vm.dotsRow}>
                    {[0, 1, 2, 3].map(i => (
                      <View key={i} style={[
                        vm.dot,
                        i < pin.length && vm.dotFilled,
                        error && { borderColor: C.dangerLt },
                      ]} />
                    ))}
                  </View>

                  {/* Keypad */}
                  <View style={vm.keypad}>
                    {['1','2','3','4','5','6','7','8','9','','0','⌫'].map((k, i) => {
                      if (!k) return <View key={i} style={vm.keyEmpty} />;
                      const isBack = k === '⌫';
                      return (
                        <TouchableOpacity
                          key={i}
                          style={[vm.key, isBack && vm.keyBack]}
                          onPress={() => handleKey(k)}
                          disabled={busy}
                          activeOpacity={0.65}
                        >
                          {busy && pin.length === 4 && k === '⌫'
                            ? <ActivityIndicator size="small" color={C.textMuted} />
                            : <Text style={[vm.keyText, isBack && vm.keyTextBack]}>{k}</Text>
                          }
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </View>
              )}

              {/* FLAG Tab */}
              {activeTab === 'flag' && (
                <View style={vm.flagPanel}>
                  <View style={vm.flagInfo}>
                    <AlertTriangle size={15} color={C.warnLt} />
                    <Text style={vm.flagInfoText}>
                      This order will be removed from the queue but the drawer won't be balanced until a manager reviews and approves it.
                    </Text>
                  </View>
                  <TouchableOpacity
                    style={[vm.flagBtn, (busy || isOffline) && { opacity: 0.5 }]}
                    onPress={handleFlag}
                    disabled={busy || isOffline}
                    activeOpacity={0.8}
                  >
                    {busy
                      ? <ActivityIndicator color={C.cream} size="small" />
                      : <Text style={vm.flagBtnText}>Flag for Manager Review</Text>
                    }
                  </TouchableOpacity>
                  {isOffline && (
                    <Text style={vm.offlineNote}>⚠ Flagging requires an internet connection</Text>
                  )}
                </View>
              )}
            </View>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
};

// ─────────────────────────────────────────────
// MAIN SCREEN
// ─────────────────────────────────────────────
export default function PocketQueueScreen() {
  useKeepAwake();
  const router = useRouter();

  const [orders, setOrders]         = useState<PendingOrder[]>([]);
  const [loading, setLoading]       = useState(true);
  const [completingId, setCompletingId] = useState<string | null>(null);
  const [isOffline, setIsOffline]   = useState(false);
  const [selectedOrder, setSelectedOrder] = useState<PendingOrder | null>(null);
  const [showVoid, setShowVoid]     = useState(false);

  const checkNetwork = async () => {
    const s = await Network.getNetworkStateAsync();
    setIsOffline(!(s.isConnected && s.isInternetReachable));
  };

  const fetchOrders = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('orders')
        .select(`
          id, receipt_number, created_at, total, status, order_type,
          order_items ( id, qty, unit_price, modifiers_json, special_note, menu_items(name) )
        `)
        .eq('status', 'pending')
        .order('created_at', { ascending: true });
      if (error) throw error;
      setOrders(data as unknown as PendingOrder[]);
    } catch (err: any) {
      console.error('Queue fetch:', err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    checkNetwork();
    fetchOrders();
    const iv = setInterval(() => { checkNetwork(); fetchOrders(); }, 10000);
    return () => clearInterval(iv);
  }, [fetchOrders]);

  const handleComplete = async (orderId: string) => {
    setCompletingId(orderId);
    try {
      const { error } = await supabase.from('orders').update({ status: 'completed' }).eq('id', orderId);
      if (error) throw error;
      setOrders(prev => prev.filter(o => o.id !== orderId));
    } catch {
      Alert.alert('Error', 'Failed to complete order. Please try again.');
    } finally {
      setCompletingId(null);
    }
  };

  const openVoid = (order: PendingOrder) => {
    setSelectedOrder(order);
    setShowVoid(true);
  };

  const handleFlagForManager = async (reason: string) => {
    const { error } = await supabase
      .from('orders')
      .update({ status: 'void_requested', void_reason: reason })
      .eq('id', selectedOrder?.id);
    if (!error) {
      setOrders(prev => prev.filter(o => o.id !== selectedOrder?.id));
      setShowVoid(false);
    }
  };

  const handlePinSubmit = async (pin: string, reason: string): Promise<{ error?: string }> => {
    try {
      const { data: manager, error: pinErr } = await supabase
        .from('profiles')
        .select('id')
        .eq('pin_code', pin)
        .eq('role', 'manager')
        .eq('status', 'active')
        .single();

      if (!manager || pinErr) return { error: 'Invalid Manager PIN' };

      const { error: voidErr } = await supabase
        .from('orders')
        .update({ status: 'voided', void_reason: reason, voided_by: manager.id })
        .eq('id', selectedOrder?.id);

      if (voidErr) throw voidErr;

      setOrders(prev => prev.filter(o => o.id !== selectedOrder?.id));
      setShowVoid(false);
      return {};
    } catch {
      return { error: 'Network error. Try again.' };
    }
  };

  // Urgency counts for header badge
  const urgentCount = orders.filter(o => getHeat(getElapsedMinutes(o.created_at)) === 2).length;

  return (
    <SafeAreaView style={s.root}>
      <StatusBar barStyle="light-content" backgroundColor={C.bg} />

      {/* ── HEADER ── */}
      <View style={s.header}>
        <TouchableOpacity style={s.backBtn} onPress={() => router.back()}>
          <ChevronLeft size={20} color={C.text} strokeWidth={2.5} />
        </TouchableOpacity>

        <View style={{ flex: 1, alignItems: 'center' }}>
          <Text style={s.headerTitle}>Kitchen Queue</Text>
          <View style={s.headerMeta}>
            {isOffline
              ? <><WifiOff size={11} color={C.dangerLt} /><Text style={[s.headerSub, { color: C.dangerLt }]}>Offline</Text></>
              : <><Wifi size={11} color={C.successLt} /><Text style={s.headerSub}>{orders.length} pending</Text></>
            }
            {urgentCount > 0 && (
              <View style={s.urgentBadge}>
                <Flame size={9} color="#FFF" />
                <Text style={s.urgentBadgeText}>{urgentCount} urgent</Text>
              </View>
            )}
          </View>
        </View>

        <View style={{ width: 38 }} />
      </View>

      {/* Offline banner */}
      {isOffline && <OfflineBanner />}

      {/* ── CONTENT ── */}
      {loading ? (
        <View style={s.center}>
          <ActivityIndicator color={C.gold} size="large" />
          <Text style={s.loadingText}>Loading queue…</Text>
        </View>
      ) : orders.length === 0 ? (
        <View style={s.center}>
          <View style={s.emptyIcon}>
            <Coffee size={36} color={C.gold} strokeWidth={1.5} />
          </View>
          <Text style={s.emptyTitle}>All Clear!</Text>
          <Text style={s.emptySub}>No pending orders right now.{'\n'}New tickets will appear automatically.</Text>
        </View>
      ) : (
        <FlatList
          data={orders}
          keyExtractor={item => item.id}
          renderItem={({ item }) => (
            <TicketCard
              item={item}
              completing={completingId === item.id}
              onComplete={() => handleComplete(item.id)}
              onVoid={() => openVoid(item)}
            />
          )}
          contentContainerStyle={s.list}
          showsVerticalScrollIndicator={false}
        />
      )}

      {/* ── VOID MODAL ── */}
      <VoidModal
        visible={showVoid}
        order={selectedOrder}
        isOffline={isOffline}
        onClose={() => setShowVoid(false)}
        onFlagForManager={handleFlagForManager}
        onPinSubmit={handlePinSubmit}
      />
    </SafeAreaView>
  );
}

// ─────────────────────────────────────────────
// STYLES
// ─────────────────────────────────────────────
const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },

  // HEADER
  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 14,
    borderBottomWidth: 1, borderBottomColor: 'rgba(196,154,85,0.12)',
  },
  backBtn: {
    width: 38, height: 38, borderRadius: 19,
    backgroundColor: 'rgba(36,51,80,0.5)',
    alignItems: 'center', justifyContent: 'center',
  },
  headerTitle: { fontSize: 16, fontWeight: '800', color: C.text, letterSpacing: 0.3 },
  headerMeta:  { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 3 },
  headerSub:   { fontSize: 11, fontWeight: '600', color: C.successLt },
  urgentBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    backgroundColor: C.urgentLt, paddingHorizontal: 7, paddingVertical: 2, borderRadius: 10,
  },
  urgentBadgeText: { color: '#FFF', fontSize: 10, fontWeight: '800' },

  // STATES
  center:      { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  loadingText: { color: C.textMuted, marginTop: 14, fontSize: 13, fontWeight: '600' },
  emptyIcon:   {
    width: 80, height: 80, borderRadius: 40,
    backgroundColor: 'rgba(196,154,85,0.08)',
    borderWidth: 1, borderColor: 'rgba(196,154,85,0.15)',
    alignItems: 'center', justifyContent: 'center', marginBottom: 16,
  },
  emptyTitle:  { fontSize: 22, fontWeight: '800', color: C.text },
  emptySub:    { fontSize: 14, color: C.textMuted, textAlign: 'center', marginTop: 8, lineHeight: 22 },

  list: { padding: 14, paddingBottom: 44 },

  // TICKET
  ticket: {
    backgroundColor: C.bgCard,
    borderRadius: 18,
    marginBottom: 14,
    borderWidth: 1.5,
    borderColor: C.border,
    overflow: 'hidden',
  },
  heatStrip: { height: 3, width: '100%' },

  ticketHeader: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'flex-start', padding: 16, paddingBottom: 0,
  },
  headerLeft:  {},
  headerRight: { alignItems: 'flex-end', gap: 6 },

  ticketId: { fontSize: 20, fontWeight: '900', color: C.cream, letterSpacing: -0.5 },
  timeRow:  { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 },
  timeText: { fontSize: 12, color: C.textMuted, fontWeight: '600' },

  typeBadge:   { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8 },
  badgeDineIn: { backgroundColor: C.successMid },
  badgeTakeout:{ backgroundColor: '#9A6A20' },
  typeText:    { color: '#FFF', fontSize: 9, fontWeight: '800', letterSpacing: 1.2 },
  totalText:   { fontSize: 13, fontWeight: '700', color: C.goldLight },

  // Perforated divider
  perfRow:  { flexDirection: 'row', alignItems: 'center', marginVertical: 14, marginHorizontal: 0 },
  perfNub:  { width: 14, height: 14, borderRadius: 7, backgroundColor: C.bg, marginHorizontal: -7, zIndex: 1 },
  perfLine: { flex: 1, borderWidth: 1, borderStyle: 'dashed', borderColor: 'rgba(36,51,80,0.7)' },

  // Items
  ticketBody:    { paddingHorizontal: 16, paddingBottom: 4 },
  itemRow:       { flexDirection: 'row', alignItems: 'flex-start', paddingVertical: 10, gap: 12 },
  itemRowBorder: { borderBottomWidth: 1, borderBottomColor: 'rgba(36,51,80,0.4)' },

  qtyBubble: {
    width: 28, height: 28, borderRadius: 8,
    backgroundColor: 'rgba(196,154,85,0.12)',
    borderWidth: 1, borderColor: 'rgba(196,154,85,0.2)',
    alignItems: 'center', justifyContent: 'center',
    marginTop: 1,
  },
  qtyText:  { fontSize: 13, fontWeight: '800', color: C.gold },
  itemName: { fontSize: 15, fontWeight: '700', color: C.text, lineHeight: 20 },
  modList:  { marginTop: 4, gap: 2 },
  modText:  { fontSize: 12, color: C.gold, fontWeight: '500', opacity: 0.85 },
  noteRow:  { marginTop: 5, backgroundColor: 'rgba(217,112,112,0.08)', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4, borderLeftWidth: 2, borderLeftColor: C.dangerLt },
  noteText: { fontSize: 12, color: C.dangerLt, fontStyle: 'italic', fontWeight: '500' },

  // Actions
  ticketActions: {
    flexDirection: 'row', gap: 10,
    padding: 14, paddingTop: 12,
    borderTopWidth: 1, borderTopColor: 'rgba(36,51,80,0.4)',
    marginTop: 6,
  },
  voidBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingVertical: 12, paddingHorizontal: 18,
    backgroundColor: C.dangerBg,
    borderWidth: 1, borderColor: 'rgba(122,41,53,0.35)',
    borderRadius: 12,
  },
  voidBtnText: { color: C.dangerLt, fontSize: 13, fontWeight: '700' },
  completeBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7,
    paddingVertical: 13, borderRadius: 12,
    backgroundColor: C.success,
  },
  completeBtnBusy: { opacity: 0.7 },
  completeBtnText: { color: '#FFF', fontSize: 14, fontWeight: '800' },
});

// ─────────────────────────────────────────────
// VOID MODAL STYLES
// ─────────────────────────────────────────────
const vm = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(8,14,24,0.88)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: C.bgCard,
    borderTopLeftRadius: 26, borderTopRightRadius: 26,
    maxHeight: '92%',
  },
  handle: {
    width: 38, height: 4, borderRadius: 2,
    backgroundColor: 'rgba(36,51,80,0.6)',
    alignSelf: 'center', marginTop: 12, marginBottom: 4,
  },
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 20, paddingVertical: 16,
    borderBottomWidth: 1, borderBottomColor: 'rgba(36,51,80,0.4)',
  },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  warnIcon: {
    width: 34, height: 34, borderRadius: 10,
    backgroundColor: C.warnBg,
    borderWidth: 1, borderColor: 'rgba(176,122,32,0.3)',
    alignItems: 'center', justifyContent: 'center',
  },
  title:    { fontSize: 16, fontWeight: '800', color: C.text },
  subtitle: { fontSize: 12, fontWeight: '600', color: C.textMuted, marginTop: 1 },
  closeBtn: {
    width: 32, height: 32, borderRadius: 10,
    backgroundColor: 'rgba(36,51,80,0.5)',
    alignItems: 'center', justifyContent: 'center',
  },

  label: { fontSize: 11, fontWeight: '700', color: C.textMuted, letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: 8 },
  input: {
    backgroundColor: C.bg,
    borderWidth: 1.5, borderColor: 'rgba(36,51,80,0.6)',
    borderRadius: 12, padding: 14,
    color: C.text, fontSize: 14, marginBottom: 20,
  },

  // Tabs
  tabs: {
    flexDirection: 'row', backgroundColor: 'rgba(13,21,32,0.8)',
    borderRadius: 12, padding: 4, marginBottom: 16,
  },
  tab:     { flex: 1, paddingVertical: 9, alignItems: 'center', borderRadius: 9 },
  tabActive: { backgroundColor: C.navyMid },
  tabText:   { fontSize: 13, fontWeight: '600', color: C.textMuted },
  tabTextActive: { color: C.text },

  // Error
  errorRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 12 },
  errorText: { fontSize: 12, color: C.dangerLt, fontWeight: '600' },

  // PIN panel
  pinPanel:  { alignItems: 'center' },
  panelDesc: { fontSize: 12, color: C.textMuted, textAlign: 'center', lineHeight: 18, marginBottom: 20 },
  dotsRow:   { flexDirection: 'row', gap: 14, marginBottom: 20 },
  dot:       { width: 14, height: 14, borderRadius: 7, borderWidth: 2, borderColor: C.textDim },
  dotFilled: { backgroundColor: C.gold, borderColor: C.gold },
  keypad:    { flexDirection: 'row', flexWrap: 'wrap', width: 222, justifyContent: 'center', gap: 10, marginBottom: 8 },
  keyEmpty:  { width: 64, height: 56 },
  key: {
    width: 64, height: 56, borderRadius: 14,
    backgroundColor: 'rgba(36,51,80,0.4)',
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: 'rgba(36,51,80,0.6)',
  },
  keyBack:  { backgroundColor: 'rgba(122,41,53,0.12)', borderColor: 'rgba(122,41,53,0.25)' },
  keyText:  { fontSize: 20, fontWeight: '600', color: C.text },
  keyTextBack: { color: C.dangerLt, fontSize: 16 },

  // Flag panel
  flagPanel: {},
  flagInfo: {
    flexDirection: 'row', gap: 10, alignItems: 'flex-start',
    backgroundColor: C.warnBg, borderRadius: 12, padding: 14,
    borderWidth: 1, borderColor: 'rgba(176,122,32,0.25)',
    marginBottom: 16,
  },
  flagInfoText: { flex: 1, fontSize: 13, color: C.warnLt, lineHeight: 19 },
  flagBtn: {
    backgroundColor: C.orange, paddingVertical: 15,
    borderRadius: 14, alignItems: 'center',
  },
  flagBtnText: { color: '#4A2C05', fontSize: 14, fontWeight: '800' },
  offlineNote: { textAlign: 'center', fontSize: 11, color: C.dangerLt, marginTop: 10, fontWeight: '600' },
});