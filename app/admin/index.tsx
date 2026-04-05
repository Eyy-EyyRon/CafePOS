import React, { useEffect, useState, useCallback, useRef } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, SafeAreaView,
  StatusBar, Dimensions, Platform, ScrollView, RefreshControl,
  Animated, ActivityIndicator, Modal, TextInput, KeyboardAvoidingView,
  Easing,
} from 'react-native';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import * as Network from 'expo-network';
import { useAuth } from '../../hooks/useAuth';
import { supabase } from '../../.vscode/lib/supabase';
import { syncOutbox, getOutboxCount } from '../../.vscode/lib/syncEngine';
import {
  Coffee, LogOut, TrendingUp, TrendingDown, Package, Users, Flame, Plus,
  AlertTriangle, ShoppingBag, ArrowRight, RefreshCw,
  ChevronUp, ChevronDown, Clock, CheckCircle, WifiOff, CloudUpload, X, Coins,
  BarChart3, Zap, Activity, Star, AlertCircle,
} from 'lucide-react-native';

const { width: W } = Dimensions.get('window');
const isTablet = W >= 768;

// ─────────────────────────────────────────────
// DESIGN TOKENS — aligned with PocketQueue & CartScreen
// ─────────────────────────────────────────────
const C = {
  navy:       '#1A2640',
  navyMid:    '#243350',
  navyDeep:   '#111D30',
  gold:       '#C49A55',
  goldLight:  '#D4AE78',
  goldDim:    '#8A6A35',
  cream:      '#F0E8D8',
  creamDeep:  '#E5D9C4',
  bg:         '#0D1520',
  bgCard:     '#131E2E',
  bgCardMid:  '#16253A',
  bgCardAlt:  '#1A2D42',
  text:       '#EEE8DC',
  textMuted:  '#7A90AA',
  textDim:    '#3D566E',
  success:    '#1F6B41',
  successMid: '#256B45',
  successLt:  '#4DBF82',
  danger:     '#7A2935',
  dangerLt:   '#D97070',
  dangerBg:   'rgba(122,41,53,0.12)',
  warn:       '#8B6A30',
  warnLt:     '#E8B055',
  warnBg:     'rgba(139,106,48,0.12)',
  info:       '#2E6A8A',
  infoLt:     '#5AAAD4',
  infoBg:     'rgba(46,106,138,0.12)',
  orange:     '#C98830',
  border:     'rgba(36,51,80,0.6)',
};

const SHIFT_COLORS: Record<string, string> = {
  Morning: C.gold, Afternoon: C.navyMid, Evening: '#5A4A90', 'All Day': C.successMid,
};

// ─────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────
function peso(n: number) {
  return '₱' + Number(n).toLocaleString('en-PH', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}
function timeAgo(iso: string) {
  const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 1) return 'Just now';
  if (m < 60) return `${m}m ago`;
  return `${Math.floor(m / 60)}h ago`;
}
function getInitials(name: string) {
  return name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
}
function getAvatarColor(name: string) {
  const p = [C.navyMid, '#3A6B8A', C.gold, '#7A5030', '#4A6B4A', '#5A4A90'];
  let h = 0;
  for (let i = 0; i < name.length; i++) h = name.charCodeAt(i) + ((h << 5) - h);
  return p[Math.abs(h) % p.length];
}

// ─────────────────────────────────────────────
// ANIMATED COUNTER HOOK
// ─────────────────────────────────────────────
function useCountUp(target: number, duration = 900) {
  const [display, setDisplay] = useState(0);
  const prev = useRef(0);

  useEffect(() => {
    const start = prev.current;
    const diff  = target - start;
    if (diff === 0) return;
    const startTime = Date.now();

    const tick = () => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(elapsed / duration, 1);
      // Ease-out cubic
      const eased = 1 - Math.pow(1 - progress, 3);
      const current = Math.round(start + diff * eased);
      setDisplay(current);
      if (progress < 1) requestAnimationFrame(tick);
      else prev.current = target;
    };
    requestAnimationFrame(tick);
  }, [target, duration]);

  return display;
}

// ─────────────────────────────────────────────
// CREMA LOGO (SVG-style, no emojis)
// ─────────────────────────────────────────────
function CremaLogo() {
  return (
    <View style={logo.wrap}>
      {/* Coffee cup icon built from Views */}
      <View style={logo.cup}>
        <View style={logo.cupBody}>
          <View style={logo.cupSteam} />
          <View style={logo.cupSteam2} />
        </View>
        <View style={logo.cupHandle} />
        <View style={logo.cupSaucer} />
      </View>
    </View>
  );
}

const logo = StyleSheet.create({
  wrap:      { width: 40, height: 40, backgroundColor: C.gold, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  cup:       { alignItems: 'center', justifyContent: 'center', position: 'relative' },
  cupBody:   { width: 20, height: 14, backgroundColor: C.navy, borderRadius: 3, borderBottomLeftRadius: 5, borderBottomRightRadius: 5, alignItems: 'center' },
  cupSteam:  { position: 'absolute', top: -7, left: 4, width: 3, height: 6, backgroundColor: C.cream, borderRadius: 3, opacity: 0.8 },
  cupSteam2: { position: 'absolute', top: -7, left: 10, width: 3, height: 6, backgroundColor: C.cream, borderRadius: 3, opacity: 0.6 },
  cupHandle: { position: 'absolute', right: -8, top: 2, width: 7, height: 10, borderRadius: 4, borderWidth: 2.5, borderColor: C.navy, borderLeftWidth: 0 },
  cupSaucer: { width: 24, height: 3, backgroundColor: C.navy, borderRadius: 2, marginTop: 1 },
});

// ─────────────────────────────────────────────
// PULSING LIVE DOT
// ─────────────────────────────────────────────
function LiveDot() {
  const pulse = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1.8, duration: 800, easing: Easing.out(Easing.ease), useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 1,   duration: 800, easing: Easing.in(Easing.ease),  useNativeDriver: true }),
      ])
    ).start();
  }, []);
  return (
    <View style={{ width: 14, height: 14, alignItems: 'center', justifyContent: 'center' }}>
      <Animated.View style={{ position: 'absolute', width: 12, height: 12, borderRadius: 6, backgroundColor: C.successLt, opacity: 0.3, transform: [{ scale: pulse }] }} />
      <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: C.successLt }} />
    </View>
  );
}

// ─────────────────────────────────────────────
// ANIMATED STAT CARD
// ─────────────────────────────────────────────
function StatCard({ label, value, rawValue, sub, accent, icon, trend, isRevenue }: {
  label: string; value: string; rawValue?: number; sub: string; accent: string;
  icon: React.ReactNode; trend?: 'up' | 'down' | null; isRevenue?: boolean;
}) {
  const slideY = useRef(new Animated.Value(16)).current;
  const fade   = useRef(new Animated.Value(0)).current;
  const countUp = useCountUp(rawValue ?? 0);

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fade,   { toValue: 1, duration: 400, useNativeDriver: true }),
      Animated.spring(slideY, { toValue: 0, speed: 14, bounciness: 5, useNativeDriver: true }),
    ]).start();
  }, []);

  const displayValue = isRevenue && rawValue !== undefined ? peso(countUp) : value;

  return (
    <Animated.View style={[sc.card, { opacity: fade, transform: [{ translateY: slideY }] }]}>
      {/* Top accent bar */}
      <View style={[sc.accentBar, { backgroundColor: accent }]} />

      <View style={sc.top}>
        <Text style={sc.label}>{label}</Text>
        <View style={[sc.iconBox, { backgroundColor: `${accent}20` }]}>
          {icon}
        </View>
      </View>

      <Text style={[sc.value, isRevenue && sc.valueLarge]}>{displayValue}</Text>

      <View style={sc.subRow}>
        {trend === 'up'   && <ChevronUp   size={12} color={C.successLt} />}
        {trend === 'down' && <ChevronDown size={12} color={C.dangerLt}  />}
        <Text style={[sc.sub, trend === 'up' ? { color: C.successLt } : trend === 'down' ? { color: C.dangerLt } : {}]}>
          {sub}
        </Text>
      </View>
    </Animated.View>
  );
}

const sc = StyleSheet.create({
  card:      { flex: 1, backgroundColor: C.bgCard, borderRadius: 16, padding: 16, borderWidth: 1, borderColor: C.border, overflow: 'hidden', minWidth: isTablet ? 180 : (W - 48) / 2 },
  accentBar: { position: 'absolute', top: 0, left: 0, right: 0, height: 3 },
  top:       { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  label:     { fontSize: 9, fontWeight: '700', color: C.textDim, letterSpacing: 1.4, textTransform: 'uppercase', flex: 1 },
  iconBox:   { width: 30, height: 30, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  value:     { fontSize: 22, fontWeight: '900', color: C.text, marginBottom: 6, letterSpacing: -0.5 },
  valueLarge:{ fontSize: 20 },
  subRow:    { flexDirection: 'row', alignItems: 'center', gap: 3 },
  sub:       { fontSize: 11, fontWeight: '500', color: C.textMuted },
});

// ─────────────────────────────────────────────
// ANIMATED STOCK BAR
// ─────────────────────────────────────────────
function StockBar({ pct, critical }: { pct: number; critical: boolean }) {
  const width = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(width, {
      toValue: Math.max(pct, 3),
      duration: 700,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
  }, [pct]);

  return (
    <View style={sb.track}>
      <Animated.View style={[sb.fill, {
        width: width.interpolate({ inputRange: [0, 100], outputRange: ['0%', '100%'] }),
        backgroundColor: critical ? C.dangerLt : C.warnLt,
      }]} />
    </View>
  );
}
const sb = StyleSheet.create({
  track: { height: 5, backgroundColor: 'rgba(36,51,80,0.4)', borderRadius: 100, overflow: 'hidden', marginTop: 6 },
  fill:  { height: '100%', borderRadius: 100 },
});

// ─────────────────────────────────────────────
// SECTION HEADER COMPONENT
// ─────────────────────────────────────────────
function SectionHeader({ label, right }: { label: string; right?: React.ReactNode }) {
  return (
    <View style={sh.row}>
      <View style={sh.labelRow}>
        <View style={sh.dot} />
        <Text style={sh.label}>{label}</Text>
      </View>
      {right}
    </View>
  );
}
const sh = StyleSheet.create({
  row:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 24, marginBottom: 12 },
  labelRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  dot:      { width: 3, height: 14, backgroundColor: C.gold, borderRadius: 2 },
  label:    { fontSize: 10, fontWeight: '800', color: C.textMuted, letterSpacing: 2, textTransform: 'uppercase' },
});

// ─────────────────────────────────────────────
// PANEL WRAPPER
// ─────────────────────────────────────────────
function Panel({ children }: { children: React.ReactNode }) {
  return <View style={pw.panel}>{children}</View>;
}
const pw = StyleSheet.create({
  panel: { backgroundColor: C.bgCard, borderRadius: 18, borderWidth: 1, borderColor: C.border, overflow: 'hidden' },
});

// ─────────────────────────────────────────────
// MAIN SCREEN
// ─────────────────────────────────────────────
export default function AdminDashboard() {
  const { currentUser, logout } = useAuth();
  const router = useRouter();

  const [loading,       setLoading]       = useState(true);
  const [refreshing,    setRefreshing]    = useState(false);
  const [isOffline,     setIsOffline]     = useState(false);
  const [pendingOutbox, setPendingOutbox] = useState(0);
  const [isSyncing,     setIsSyncing]     = useState(false);

  // KPIs
  const [todayRev,     setTodayRev]     = useState(0);
  const [yesterdayRev, setYesterdayRev] = useState(0);
  const [todayOrders,  setTodayOrders]  = useState(0);
  const [activeStaff,  setActiveStaff]  = useState(0);
  const [totalStaff,   setTotalStaff]   = useState(0);
  const [topSeller,    setTopSeller]    = useState<{ name: string; count: number } | null>(null);

  // Lists
  const [recentOrders, setRecentOrders] = useState<any[]>([]);
  const [lowStock,     setLowStock]     = useState<any[]>([]);
  const [staff,        setStaff]        = useState<any[]>([]);

  // Modals
  const [restockItem,    setRestockItem]    = useState<any>(null);
  const [restockQty,     setRestockQty]     = useState('');
  const [isRestocking,   setIsRestocking]   = useState(false);
  const [shiftStaff,     setShiftStaff]     = useState<any>(null);
  const [shiftDetails,   setShiftDetails]   = useState<any>(null);
  const [shiftLoading,   setShiftLoading]   = useState(false);

  // Staggered entrance anims — 7 sections
  const anims = useRef([...Array(7)].map(() => new Animated.Value(0))).current;

  // Sync rotation anim
  const syncRot = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (isSyncing) {
      Animated.loop(
        Animated.timing(syncRot, { toValue: 1, duration: 900, easing: Easing.linear, useNativeDriver: true })
      ).start();
    } else {
      syncRot.stopAnimation();
      syncRot.setValue(0);
    }
  }, [isSyncing]);

  // ── Network monitor ──
  useEffect(() => {
    const check = async () => {
      const state = await Network.getNetworkStateAsync();
      const offline = !(state.isConnected && state.isInternetReachable);
      setIsOffline(offline);
      const cnt = await getOutboxCount();
      setPendingOutbox(cnt);
      if (!offline && cnt > 0 && !isSyncing) {
        await syncOutbox();
        setPendingOutbox(await getOutboxCount());
        load(true);
      }
    };
    check();
    const iv = setInterval(check, 5000);
    return () => clearInterval(iv);
  }, [isSyncing]);

  // ── Realtime subscription ──
  useEffect(() => {
    const channel = supabase.channel('admin_live')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'orders' }, () => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
        load(true);
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  // ── Manual sync ──
  const handleSync = async () => {
    if (isOffline) return;
    setIsSyncing(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    try {
      await syncOutbox();
      const remaining = await getOutboxCount();
      setPendingOutbox(remaining);
      await load();
      if (remaining === 0) Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch { }
    finally { setIsSyncing(false); }
  };

  // ── Data load ──
  const load = useCallback(async (silent = false) => {
    try {
      const today     = new Date(); today.setHours(0, 0, 0, 0);
      const yesterday = new Date(today); yesterday.setDate(yesterday.getDate() - 1);

      const [
        { data: todayOrd },
        { data: yestOrd },
        { data: staffData },
        { data: ings },
        { data: recent },
        { data: todayItems },
      ] = await Promise.all([
        supabase.from('orders').select('id,total,created_at').gte('created_at', today.toISOString()),
        supabase.from('orders').select('total').gte('created_at', yesterday.toISOString()).lt('created_at', today.toISOString()),
        supabase.from('profiles').select('id,full_name,status,shift,role').eq('role', 'barista').order('full_name'),
        supabase.from('ingredients').select('id,name,current_stock,par_level,unit').order('name'),
        supabase.from('orders').select(`id,total,created_at,order_type,order_items(qty,menu_items(name))`).order('created_at', { ascending: false }).limit(8),
        supabase.from('order_items').select('qty,menu_items(name),orders!inner(created_at)').gte('orders.created_at', today.toISOString()),
      ]);

      const tRev = (todayOrd ?? []).reduce((s: number, o: any) => s + Number(o.total), 0);
      const yRev = (yestOrd  ?? []).reduce((s: number, o: any) => s + Number(o.total), 0);
      setTodayRev(tRev);
      setYesterdayRev(yRev);
      setTodayOrders((todayOrd ?? []).length);

      if (todayItems?.length) {
        const counts: Record<string, number> = {};
        todayItems.forEach((i: any) => { const n = i.menu_items?.name; if (n) counts[n] = (counts[n] || 0) + Number(i.qty); });
        const top = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
        if (top) setTopSeller({ name: top[0], count: top[1] });
      } else setTopSeller(null);

      const allStaff = staffData ?? [];
      setStaff(allStaff);
      setActiveStaff(allStaff.filter((s: any) => s.status === 'active').length);
      setTotalStaff(allStaff.length);

      const low = (ings ?? [])
        .filter((i: any) => i.current_stock < i.par_level)
        .sort((a: any, b: any) => (a.current_stock / a.par_level) - (b.current_stock / b.par_level))
        .slice(0, 5);
      setLowStock(low);

      setRecentOrders(
        (recent ?? []).map((o: any) => {
          const names = (o.order_items ?? []).map((oi: any) => oi.menu_items?.name).filter(Boolean);
          return {
            id: o.id,
            total: Number(o.total),
            created_at: o.created_at,
            order_type: o.order_type,
            label: names.length
              ? names.slice(0, 2).join(', ') + (names.length > 2 ? ` +${names.length - 2}` : '')
              : 'Order',
          };
        })
      );

    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load().then(() => {
      Animated.stagger(70, anims.map(a =>
        Animated.spring(a, { toValue: 1, useNativeDriver: true, speed: 14, bounciness: 5 })
      )).start();
    });
  }, [load]);

  const onRefresh = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setRefreshing(true);
    load();
  };

  // ── Restock ──
  const handleRestock = async () => {
    if (!restockItem || !restockQty || isNaN(Number(restockQty))) return;
    setIsRestocking(true);
    const newTotal = Number(restockItem.current_stock) + Number(restockQty);
    const { error } = await supabase.from('ingredients').update({ current_stock: newTotal }).eq('id', restockItem.id);
    if (!error) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setRestockItem(null); setRestockQty('');
      load(true);
    }
    setIsRestocking(false);
  };

  // ── Shift audit ──
  const openShift = async (person: any) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setShiftStaff(person); setShiftLoading(true);
    const { data: shift } = await supabase.from('cash_drawer_shifts').select('*').eq('barista_id', person.id).eq('status', 'open').single();
    if (shift) {
      const { data: sales } = await supabase.from('sales').select('total_amount').eq('barista_id', person.id).eq('payment_method', 'cash').gte('created_at', shift.opened_at);
      const cashSales = (sales ?? []).reduce((sum: number, s: any) => sum + Number(s.total_amount), 0);
      setShiftDetails({ ...shift, cashSales, expectedCash: Number(shift.starting_cash) + cashSales });
    } else setShiftDetails('closed');
    setShiftLoading(false);
  };

  // Derived
  const revTrend    = yesterdayRev === 0 ? null : todayRev >= yesterdayRev ? 'up' as const : 'down' as const;
  const revSub      = yesterdayRev === 0 ? 'First day on record' : `${revTrend === 'up' ? '+' : ''}${(((todayRev - yesterdayRev) / yesterdayRev) * 100).toFixed(1)}% vs yesterday`;
  const greetHour   = new Date().getHours();
  const greeting    = greetHour < 12 ? 'Good morning' : greetHour < 17 ? 'Good afternoon' : 'Good evening';
  const firstName   = currentUser?.full_name?.split(' ')[0] ?? 'Manager';

  const spinInterp = syncRot.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });

  // Stagger wrapper
  const A = ({ idx, children, style }: any) => (
    <Animated.View style={[style, {
      opacity: anims[idx],
      transform: [{ translateY: anims[idx].interpolate({ inputRange: [0, 1], outputRange: [24, 0] }) }],
    }]}>
      {children}
    </Animated.View>
  );

  return (
    <SafeAreaView style={s.root}>
      <StatusBar barStyle="light-content" backgroundColor={C.bg} />

      {/* ── OFFLINE BANNER ── */}
      {isOffline && (
        <View style={s.offlineBanner}>
          <WifiOff size={12} color={C.dangerLt} />
          <Text style={s.offlineText}>Offline · Analytics may be outdated</Text>
        </View>
      )}

      {/* ── HEADER ── */}
      <View style={s.header}>
        <View style={s.headerLeft}>
          <CremaLogo />
          <View>
            <Text style={s.brand}>CREMA</Text>
            <Text style={s.greeting}>{greeting}, {firstName}</Text>
          </View>
        </View>
        <TouchableOpacity
          style={s.logoutBtn}
          onPress={async () => { await logout(); router.replace('/login'); }}
          activeOpacity={0.8}
        >
          <LogOut size={17} color={C.dangerLt} />
        </TouchableOpacity>
      </View>
      <View style={s.headerAccent} />

      {/* ── MAIN SCROLL ── */}
      <ScrollView
        style={{ flex: 1 }}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={s.scroll}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={C.gold}
            colors={[C.gold]}
          />
        }
      >

        {/* ── 0. KPI CARDS ── */}
        <A idx={0}>
          <SectionHeader label="Today at a Glance" />
          <View style={s.kpiGrid}>
            <StatCard
              label="Revenue"
              value={peso(todayRev)}
              rawValue={todayRev}
              isRevenue
              sub={revSub}
              accent={C.infoLt}
              trend={revTrend}
              icon={<TrendingUp size={14} color={C.infoLt} strokeWidth={2} />}
            />
            <StatCard
              label="Orders"
              value={String(todayOrders)}
              sub="Completed today"
              accent={C.gold}
              icon={<ShoppingBag size={14} color={C.gold} strokeWidth={2} />}
            />
          </View>
          <View style={[s.kpiGrid, { marginTop: 10 }]}>
            <StatCard
              label="Staff Active"
              value={`${activeStaff}/${totalStaff}`}
              sub="Baristas on shift"
              accent={C.successLt}
              icon={<Users size={14} color={C.successLt} strokeWidth={2} />}
            />
            <StatCard
              label="Stock Alerts"
              value={String(lowStock.length)}
              sub={lowStock.length > 0 ? 'Needs restocking' : 'All levels healthy'}
              accent={lowStock.length > 0 ? C.dangerLt : C.successLt}
              trend={lowStock.length > 0 ? 'down' : null}
              icon={<AlertTriangle size={14} color={lowStock.length > 0 ? C.dangerLt : C.successLt} strokeWidth={2} />}
            />
          </View>
        </A>

        {/* ── 1. TOP SELLER ── */}
        {topSeller && (
          <A idx={1}>
            <View style={s.topSeller}>
              {/* Glow behind icon */}
              <View style={s.topSellerGlow} />
              <View style={s.topSellerIcon}>
                <Flame size={18} color={C.orange} strokeWidth={2} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.topSellerTag}>Today's Top Mover</Text>
                <Text style={s.topSellerName} numberOfLines={1}>{topSeller.name}</Text>
              </View>
              <View style={s.topSellerCount}>
                <Text style={s.topSellerNum}>{topSeller.count}</Text>
                <Text style={s.topSellerSub}>sold</Text>
              </View>
            </View>
          </A>
        )}

        {/* ── 2. QUICK ACTIONS ── */}
        <A idx={2}>
          <SectionHeader label="Quick Actions" />
          <View style={s.actionsRow}>

            {/* Sync banner — full width if pending */}
            {!isOffline && pendingOutbox > 0 && (
              <TouchableOpacity style={s.syncCard} onPress={handleSync} activeOpacity={0.8}>
                <View style={s.syncIconWrap}>
                  <Animated.View style={{ transform: [{ rotate: spinInterp }] }}>
                    {isSyncing
                      ? <ActivityIndicator color={C.infoLt} size="small" />
                      : <CloudUpload size={20} color={C.infoLt} strokeWidth={2} />
                    }
                  </Animated.View>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.syncTitle}>Sync Pending Orders</Text>
                  <Text style={s.syncSub}>{pendingOutbox} offline order{pendingOutbox !== 1 ? 's' : ''} waiting</Text>
                </View>
                <View style={s.syncBadge}>
                  <Text style={s.syncBadgeText}>{pendingOutbox}</Text>
                </View>
              </TouchableOpacity>
            )}

            <View style={s.actionPair}>
              <TouchableOpacity style={s.actionCard} onPress={() => router.push('/pos')} activeOpacity={0.8}>
                <View style={[s.actionIconBox, { backgroundColor: 'rgba(196,154,85,0.12)' }]}>
                  <Coffee size={22} color={C.gold} strokeWidth={1.8} />
                </View>
                <Text style={s.actionTitle}>Launch POS</Text>
                <Text style={s.actionSub}>Open register</Text>
              </TouchableOpacity>

              <TouchableOpacity style={s.actionCard} onPress={() => router.push('/pos/queue')} activeOpacity={0.8}>
                <View style={[s.actionIconBox, { backgroundColor: 'rgba(77,191,130,0.1)' }]}>
                  <Activity size={22} color={C.successLt} strokeWidth={1.8} />
                </View>
                <Text style={s.actionTitle}>Live Queue</Text>
                <Text style={s.actionSub}>Pending orders</Text>
              </TouchableOpacity>

              <TouchableOpacity style={s.actionCard} onPress={onRefresh} activeOpacity={0.8}>
                <View style={[s.actionIconBox, { backgroundColor: 'rgba(36,51,80,0.5)' }]}>
                  <Animated.View style={{ transform: [{ rotate: refreshing ? '180deg' : '0deg' }] }}>
                    <RefreshCw size={22} color={C.textMuted} strokeWidth={1.8} />
                  </Animated.View>
                </View>
                <Text style={s.actionTitle}>Refresh</Text>
                <Text style={s.actionSub}>Reload data</Text>
              </TouchableOpacity>
            </View>
          </View>
        </A>

        {/* ── 3. RECENT ORDERS ── */}
        <A idx={3}>
          <SectionHeader
            label="Recent Orders"
            right={
              <View style={s.liveBadge}>
                <LiveDot />
                <Text style={s.liveText}>LIVE</Text>
              </View>
            }
          />
          <Panel>
            {recentOrders.length === 0
              ? <Text style={s.emptyText}>No orders yet today.</Text>
              : recentOrders.map((o, i) => (
                <View key={o.id} style={[s.orderRow, i < recentOrders.length - 1 && s.divider]}>
                  {/* order type indicator */}
                  <View style={[s.orderTypeDot, { backgroundColor: o.order_type === 'takeout' ? C.orange : C.successMid }]} />
                  <View style={{ flex: 1 }}>
                    <Text style={s.orderName} numberOfLines={1}>{o.label}</Text>
                    <View style={s.orderMeta}>
                      <Clock size={10} color={C.textDim} />
                      <Text style={s.orderTime}>{timeAgo(o.created_at)}</Text>
                      <Text style={s.orderTypePill}>{o.order_type === 'takeout' ? 'Takeout' : 'Dine-in'}</Text>
                    </View>
                  </View>
                  <Text style={s.orderTotal}>{peso(o.total)}</Text>
                </View>
              ))
            }
          </Panel>
        </A>

        {/* ── 4. STOCK ALERTS ── */}
        <A idx={4}>
          <SectionHeader label="Stock Alerts" />
          <Panel>
            {lowStock.length === 0
              ? (
                <View style={s.allGoodRow}>
                  <View style={s.allGoodIcon}>
                    <CheckCircle size={16} color={C.successLt} strokeWidth={2} />
                  </View>
                  <Text style={s.allGoodText}>All ingredients above par level</Text>
                </View>
              )
              : lowStock.map((ing, i) => {
                const pct  = Math.round((ing.current_stock / ing.par_level) * 100);
                const crit = pct < 50;
                return (
                  <TouchableOpacity
                    key={ing.id}
                    style={[s.stockRow, i < lowStock.length - 1 && s.divider]}
                    onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setRestockItem(ing); setRestockQty(''); }}
                    activeOpacity={0.75}
                  >
                    <View style={[s.stockSeverity, { backgroundColor: crit ? C.dangerBg : C.warnBg, borderColor: crit ? 'rgba(122,41,53,0.3)' : 'rgba(139,106,48,0.3)' }]}>
                      <AlertCircle size={14} color={crit ? C.dangerLt : C.warnLt} strokeWidth={2} />
                    </View>
                    <View style={{ flex: 1, marginRight: 12 }}>
                      <Text style={s.stockName}>{ing.name}</Text>
                      <StockBar pct={pct} critical={crit} />
                    </View>
                    <View style={{ alignItems: 'flex-end', minWidth: 60 }}>
                      <Text style={[s.stockQty, { color: crit ? C.dangerLt : C.warnLt }]}>
                        {ing.current_stock}
                        <Text style={s.stockUnit}>/{ing.par_level}{ing.unit}</Text>
                      </Text>
                      <Text style={s.restockHint}>Tap to restock</Text>
                    </View>
                  </TouchableOpacity>
                );
              })
            }
          </Panel>
        </A>

        {/* ── 5. TEAM ── */}
        <A idx={5}>
          <SectionHeader label="Team on Shift" />
          <Panel>
            {staff.length === 0
              ? <Text style={s.emptyText}>No baristas registered.</Text>
              : staff.slice(0, 6).map((p, i) => {
                const col    = getAvatarColor(p.full_name);
                const active = p.status === 'active';
                return (
                  <TouchableOpacity
                    key={p.id}
                    style={[s.staffRow, i < Math.min(staff.length, 6) - 1 && s.divider]}
                    onPress={() => openShift(p)}
                    activeOpacity={0.75}
                  >
                    {/* Avatar */}
                    <View style={{ position: 'relative' }}>
                      <View style={[s.avatar, { backgroundColor: col }]}>
                        <Text style={s.avatarInitials}>{getInitials(p.full_name)}</Text>
                      </View>
                      {/* Presence dot */}
                      <View style={[s.presenceDot, { backgroundColor: active ? C.successLt : C.textDim, borderColor: C.bgCard }]} />
                    </View>

                    <View style={{ flex: 1 }}>
                      <Text style={s.staffName} numberOfLines={1}>{p.full_name}</Text>
                      <Text style={s.staffHint}>Tap for shift audit</Text>
                    </View>

                    {p.shift && (
                      <View style={[s.shiftPill, {
                        backgroundColor: `${SHIFT_COLORS[p.shift] ?? C.navyMid}22`,
                        borderColor: `${SHIFT_COLORS[p.shift] ?? C.navyMid}44`,
                      }]}>
                        <Text style={[s.shiftText, { color: SHIFT_COLORS[p.shift] ?? C.textMuted }]}>
                          {p.shift}
                        </Text>
                      </View>
                    )}
                  </TouchableOpacity>
                );
              })
            }
          </Panel>
        </A>

        <View style={{ height: 40 }} />
      </ScrollView>

      {/* ── RESTOCK MODAL ── */}
      <Modal visible={!!restockItem} transparent animationType="slide">
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={md.overlay}>
          <View style={md.sheet}>
            <View style={md.handle} />
            <View style={md.header}>
              <View style={md.headerLeft}>
                <View style={md.headerIcon}>
                  <Package size={16} color={C.warnLt} strokeWidth={2} />
                </View>
                <View>
                  <Text style={md.title}>Restock</Text>
                  <Text style={md.subtitle}>{restockItem?.name}</Text>
                </View>
              </View>
              <TouchableOpacity style={md.closeBtn} onPress={() => setRestockItem(null)}>
                <X size={16} color={C.textMuted} />
              </TouchableOpacity>
            </View>

            <View style={{ padding: 20 }}>
              {/* Stock status row */}
              <View style={md.stockStatus}>
                <View style={md.stockStatusItem}>
                  <Text style={md.stockStatusLabel}>Current</Text>
                  <Text style={[md.stockStatusVal, { color: C.dangerLt }]}>
                    {restockItem?.current_stock}{restockItem?.unit}
                  </Text>
                </View>
                <View style={md.stockStatusDivider} />
                <View style={md.stockStatusItem}>
                  <Text style={md.stockStatusLabel}>Par Level</Text>
                  <Text style={md.stockStatusVal}>{restockItem?.par_level}{restockItem?.unit}</Text>
                </View>
                <View style={md.stockStatusDivider} />
                <View style={md.stockStatusItem}>
                  <Text style={md.stockStatusLabel}>Needed</Text>
                  <Text style={[md.stockStatusVal, { color: C.successLt }]}>
                    {Math.max(0, (restockItem?.par_level ?? 0) - (restockItem?.current_stock ?? 0))}{restockItem?.unit}
                  </Text>
                </View>
              </View>

              <Text style={md.label}>Add Quantity ({restockItem?.unit})</Text>
              <View style={md.inputRow}>
                <Plus size={16} color={C.textDim} />
                <TextInput
                  style={md.input}
                  keyboardType="numeric"
                  placeholder="0"
                  placeholderTextColor={C.textDim}
                  value={restockQty}
                  onChangeText={setRestockQty}
                  autoFocus
                />
                <Text style={md.unitLabel}>{restockItem?.unit}</Text>
              </View>

              <TouchableOpacity
                style={[md.submitBtn, (!restockQty || isRestocking) && { opacity: 0.5 }]}
                onPress={handleRestock}
                disabled={isRestocking || !restockQty}
                activeOpacity={0.85}
              >
                {isRestocking
                  ? <ActivityIndicator color={C.bg} size="small" />
                  : <Text style={md.submitBtnText}>Update Inventory</Text>
                }
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* ── SHIFT AUDIT MODAL ── */}
      <Modal visible={!!shiftStaff} transparent animationType="slide">
        <View style={md.overlay}>
          <View style={md.sheet}>
            <View style={md.handle} />
            <View style={md.header}>
              <View style={md.headerLeft}>
                <View style={[md.headerIcon, { backgroundColor: 'rgba(196,154,85,0.12)', borderColor: 'rgba(196,154,85,0.25)' }]}>
                  <Coins size={16} color={C.gold} strokeWidth={2} />
                </View>
                <View>
                  <Text style={md.title}>Shift Audit</Text>
                  <Text style={md.subtitle}>{shiftStaff?.full_name}</Text>
                </View>
              </View>
              <TouchableOpacity style={md.closeBtn} onPress={() => setShiftStaff(null)}>
                <X size={16} color={C.textMuted} />
              </TouchableOpacity>
            </View>

            <View style={{ padding: 20 }}>
              {shiftLoading ? (
                <View style={{ paddingVertical: 30, alignItems: 'center' }}>
                  <ActivityIndicator color={C.gold} />
                </View>
              ) : shiftDetails === 'closed' ? (
                <View style={md.closedState}>
                  <AlertCircle size={20} color={C.textDim} strokeWidth={1.5} />
                  <Text style={md.closedText}>No open shift for this barista.</Text>
                </View>
              ) : (
                <>
                  <View style={md.auditRows}>
                    {[
                      { label: 'Shift started', val: new Date(shiftDetails?.opened_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }), color: C.text },
                      { label: 'Starting drawer', val: peso(shiftDetails?.starting_cash ?? 0), color: C.text },
                      { label: 'Cash sales taken', val: `+ ${peso(shiftDetails?.cashSales ?? 0)}`, color: C.successLt },
                    ].map((row, i) => (
                      <View key={i} style={[md.auditRow, i < 2 && md.auditRowBorder]}>
                        <Text style={md.auditLabel}>{row.label}</Text>
                        <Text style={[md.auditVal, { color: row.color }]}>{row.val}</Text>
                      </View>
                    ))}
                  </View>

                  <View style={md.expectedBox}>
                    <View style={{ flex: 1 }}>
                      <Text style={md.expectedLabel}>Expected in Drawer</Text>
                      <Text style={md.expectedVal}>{peso(shiftDetails?.expectedCash ?? 0)}</Text>
                    </View>
                    <Coins size={28} color={C.gold} strokeWidth={1.5} />
                  </View>
                </>
              )}
            </View>
          </View>
        </View>
      </Modal>

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
  offlineText: { color: C.dangerLt, fontSize: 11, fontWeight: '700', letterSpacing: 0.3 },

  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingTop: 12, paddingBottom: 14,
  },
  headerLeft:  { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
  brand:       { fontSize: 9, fontWeight: '800', color: C.gold, letterSpacing: 2.5, textTransform: 'uppercase' },
  greeting:    { fontSize: 15, fontWeight: '700', color: C.text, marginTop: 2 },
  logoutBtn:   { width: 38, height: 38, borderRadius: 12, backgroundColor: C.dangerBg, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(122,41,53,0.25)' },
  headerAccent:{ height: 1.5, backgroundColor: 'rgba(196,154,85,0.25)', marginHorizontal: 20, borderRadius: 1, marginBottom: 4 },

  scroll: { paddingHorizontal: 16, paddingTop: 4 },

  kpiGrid: { flexDirection: 'row', gap: 10 },

  // Top seller
  topSeller: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    backgroundColor: 'rgba(201,136,48,0.08)',
    borderWidth: 1, borderColor: 'rgba(201,136,48,0.25)',
    borderRadius: 18, padding: 16, marginTop: 10,
    overflow: 'hidden',
  },
  topSellerGlow: {
    position: 'absolute', left: -20, top: -20,
    width: 80, height: 80, borderRadius: 40,
    backgroundColor: 'rgba(201,136,48,0.12)',
  },
  topSellerIcon: {
    width: 42, height: 42, borderRadius: 13,
    backgroundColor: 'rgba(201,136,48,0.15)',
    borderWidth: 1, borderColor: 'rgba(201,136,48,0.25)',
    alignItems: 'center', justifyContent: 'center',
  },
  topSellerTag:  { fontSize: 9, fontWeight: '700', textTransform: 'uppercase', color: C.orange, letterSpacing: 1.2, marginBottom: 3 },
  topSellerName: { fontSize: 16, fontWeight: '800', color: C.text },
  topSellerCount:{ alignItems: 'flex-end' },
  topSellerNum:  { fontSize: 26, fontWeight: '900', color: C.text, letterSpacing: -1 },
  topSellerSub:  { fontSize: 10, color: C.textMuted, fontWeight: '600' },

  // Quick Actions
  actionsRow:  { gap: 10 },
  syncCard: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    backgroundColor: C.infoBg,
    borderWidth: 1, borderColor: 'rgba(46,106,138,0.35)',
    borderRadius: 16, padding: 14,
  },
  syncIconWrap: {
    width: 40, height: 40, borderRadius: 12,
    backgroundColor: 'rgba(90,170,212,0.15)',
    alignItems: 'center', justifyContent: 'center',
  },
  syncTitle: { fontSize: 14, fontWeight: '700', color: C.text },
  syncSub:   { fontSize: 12, color: C.textMuted, marginTop: 2 },
  syncBadge: { backgroundColor: C.infoLt, borderRadius: 100, paddingHorizontal: 9, paddingVertical: 4 },
  syncBadgeText: { fontSize: 12, fontWeight: '800', color: C.bg },

  actionPair:    { flexDirection: 'row', gap: 10 },
  actionCard:    { flex: 1, backgroundColor: C.bgCard, borderRadius: 16, padding: 16, borderWidth: 1, borderColor: C.border, alignItems: 'flex-start' },
  actionIconBox: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
  actionTitle:   { fontSize: 13, fontWeight: '800', color: C.text, marginBottom: 3 },
  actionSub:     { fontSize: 11, color: C.textMuted },

  // Live badge
  liveBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 9, paddingVertical: 4, borderRadius: 100, backgroundColor: 'rgba(31,107,65,0.15)', borderWidth: 1, borderColor: 'rgba(77,191,130,0.25)' },
  liveText:  { fontSize: 9, fontWeight: '800', color: C.successLt, letterSpacing: 1.5 },

  // Shared panel internals
  divider:   { borderBottomWidth: 1, borderBottomColor: 'rgba(36,51,80,0.5)' },
  emptyText: { fontSize: 13, color: C.textMuted, padding: 20, textAlign: 'center' },

  // Orders
  orderRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14, gap: 12 },
  orderTypeDot: { width: 8, height: 8, borderRadius: 4, flexShrink: 0 },
  orderName: { fontSize: 13, fontWeight: '700', color: C.text, marginBottom: 4 },
  orderMeta: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  orderTime: { fontSize: 11, color: C.textMuted },
  orderTypePill: { fontSize: 9, fontWeight: '700', color: C.textDim, textTransform: 'uppercase', letterSpacing: 0.5 },
  orderTotal: { fontSize: 15, fontWeight: '800', color: C.gold },

  // Stock
  stockRow:     { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14, gap: 12 },
  stockSeverity:{ width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center', borderWidth: 1, flexShrink: 0 },
  stockName:    { fontSize: 13, fontWeight: '700', color: C.text },
  stockQty:     { fontSize: 13, fontWeight: '800' },
  stockUnit:    { fontSize: 11, color: C.textDim, fontWeight: '500' },
  restockHint:  { fontSize: 9, fontWeight: '700', color: C.textDim, textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 4 },

  allGoodRow:  { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 16 },
  allGoodIcon: { width: 32, height: 32, borderRadius: 9, backgroundColor: 'rgba(31,107,65,0.15)', alignItems: 'center', justifyContent: 'center' },
  allGoodText: { fontSize: 13, color: C.successLt, fontWeight: '600' },

  // Staff
  staffRow:       { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 13, gap: 12 },
  avatar:         { width: 36, height: 36, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  avatarInitials: { fontSize: 12, fontWeight: '800', color: C.cream },
  presenceDot:    { position: 'absolute', bottom: -1, right: -1, width: 10, height: 10, borderRadius: 5, borderWidth: 2 },
  staffName:      { fontSize: 13, fontWeight: '700', color: C.text, marginBottom: 2 },
  staffHint:      { fontSize: 10, color: C.textDim, fontWeight: '600' },
  shiftPill:      { paddingHorizontal: 9, paddingVertical: 4, borderRadius: 100, borderWidth: 1 },
  shiftText:      { fontSize: 9, fontWeight: '800', letterSpacing: 0.7, textTransform: 'uppercase' },
});

// ── Modal styles ──
const md = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(8,14,24,0.88)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: C.bgCard,
    borderTopLeftRadius: 26, borderTopRightRadius: 26,
    borderWidth: 1.5, borderColor: C.border,
    paddingBottom: Platform.OS === 'ios' ? 34 : 20,
  },
  handle: { width: 38, height: 4, borderRadius: 2, backgroundColor: 'rgba(36,51,80,0.7)', alignSelf: 'center', marginTop: 12, marginBottom: 4 },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingVertical: 16,
    borderBottomWidth: 1, borderBottomColor: 'rgba(36,51,80,0.4)',
  },
  headerLeft:  { flexDirection: 'row', alignItems: 'center', gap: 12 },
  headerIcon:  { width: 36, height: 36, borderRadius: 10, backgroundColor: C.warnBg, borderWidth: 1, borderColor: 'rgba(139,106,48,0.3)', alignItems: 'center', justifyContent: 'center' },
  title:       { fontSize: 16, fontWeight: '800', color: C.text },
  subtitle:    { fontSize: 12, fontWeight: '600', color: C.textMuted, marginTop: 1 },
  closeBtn:    { width: 32, height: 32, borderRadius: 10, backgroundColor: 'rgba(36,51,80,0.5)', alignItems: 'center', justifyContent: 'center' },

  // Restock
  stockStatus:       { flexDirection: 'row', backgroundColor: C.bg, borderRadius: 14, padding: 16, marginBottom: 20, borderWidth: 1, borderColor: C.border },
  stockStatusItem:   { flex: 1, alignItems: 'center' },
  stockStatusLabel:  { fontSize: 10, fontWeight: '600', color: C.textDim, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 6 },
  stockStatusVal:    { fontSize: 18, fontWeight: '800', color: C.text },
  stockStatusDivider:{ width: 1, backgroundColor: C.border, marginHorizontal: 8 },

  label:    { fontSize: 10, fontWeight: '700', color: C.textMuted, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 10 },
  inputRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: C.bg, borderWidth: 1.5, borderColor: C.border, borderRadius: 14, paddingHorizontal: 16, marginBottom: 20, gap: 10 },
  input:    { flex: 1, paddingVertical: 14, color: C.text, fontSize: 20, fontWeight: '800' },
  unitLabel:{ fontSize: 14, fontWeight: '600', color: C.textMuted },
  submitBtn:{ backgroundColor: C.gold, paddingVertical: 15, borderRadius: 14, alignItems: 'center' },
  submitBtnText: { color: C.bg, fontSize: 14, fontWeight: '800', letterSpacing: 0.5, textTransform: 'uppercase' },

  // Audit
  closedState: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 20, justifyContent: 'center' },
  closedText:  { fontSize: 14, color: C.textMuted },
  auditRows:   { backgroundColor: C.bg, borderRadius: 14, borderWidth: 1, borderColor: C.border, marginBottom: 14, overflow: 'hidden' },
  auditRow:    { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14 },
  auditRowBorder: { borderBottomWidth: 1, borderBottomColor: 'rgba(36,51,80,0.5)' },
  auditLabel:  { fontSize: 13, color: C.textMuted, fontWeight: '500' },
  auditVal:    { fontSize: 14, fontWeight: '800', color: C.text },

  expectedBox: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: 'rgba(196,154,85,0.1)',
    borderWidth: 1.5, borderColor: 'rgba(196,154,85,0.25)',
    borderRadius: 16, padding: 18,
  },
  expectedLabel: { fontSize: 10, fontWeight: '700', color: C.goldDim, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 },
  expectedVal:   { fontSize: 28, fontWeight: '900', color: C.gold, letterSpacing: -1 },
});