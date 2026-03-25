import React, { useEffect, useState, useCallback, useRef } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, SafeAreaView,
  StatusBar, Dimensions, Platform, ScrollView, RefreshControl,
  Animated,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '../../hooks/useAuth';
import { supabase } from '../../lib/supabase';
import {
  Coffee, LogOut, TrendingUp, Package, Users,
  AlertTriangle, ShoppingBag, ArrowRight, RefreshCw,
  ChevronUp, ChevronDown, Clock, CheckCircle,
} from 'lucide-react-native';

const { width: W } = Dimensions.get('window');
const isTablet = W >= 768;

// ─────────────────────────────────────────────
// DESIGN TOKENS
// ─────────────────────────────────────────────
const C = {
  navy:      '#1E2D45',
  navyMid:   '#2C3E5C',
  gold:      '#B8935A',
  goldLight: '#D4AE78',
  cream:     '#F5EFE4',
  bg:        '#0D1520',
  bgCard:    '#131E2E',
  bgCardMid: '#1A2840',
  text:      '#F5EFE4',
  textMuted: '#8A9BB0',
  textDim:   '#4A6080',
  success:   '#2C7A4B',
  successLt: '#5AC88A',
  danger:    '#7A2E35',
  dangerLt:  '#C07070',
  warn:      '#8B6A30',
  warnLt:    '#C8A56A',
};

const SHIFT_COLORS: Record<string, string> = {
  Morning: C.gold, Afternoon: C.navyMid, Evening: '#4A3580', 'All Day': C.success,
};

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
  const p = [C.navyMid, '#3A6B8A', C.gold, '#7A5030', '#4A6B4A', '#4A3580'];
  let h = 0;
  for (let i = 0; i < name.length; i++) h = name.charCodeAt(i) + ((h << 5) - h);
  return p[Math.abs(h) % p.length];
}

// ─────────────────────────────────────────────
// ANIMATED STAT CARD
// ─────────────────────────────────────────────
function StatCard({ label, value, sub, accent, icon, trend }: {
  label: string; value: string; sub: string; accent: string;
  icon: React.ReactNode; trend?: 'up' | 'down' | null;
}) {
  const fade  = useRef(new Animated.Value(0)).current;
  const slideY = useRef(new Animated.Value(12)).current;
  useEffect(() => {
    Animated.parallel([
      Animated.timing(fade,   { toValue: 1, duration: 400, useNativeDriver: true }),
      Animated.spring(slideY, { toValue: 0, speed: 14, useNativeDriver: true }),
    ]).start();
  }, [value]);

  return (
    <Animated.View style={[sc.card, { opacity: fade, transform: [{ translateY: slideY }] }]}>
      <View style={[sc.accent, { backgroundColor: accent }]} />
      <View style={sc.top}>
        <Text style={sc.label}>{label}</Text>
        <View style={[sc.iconBox, { backgroundColor: `${accent}22` }]}>
          {icon}
        </View>
      </View>
      <Text style={sc.value}>{value}</Text>
      <View style={sc.subRow}>
        {trend === 'up'   && <ChevronUp   size={13} color={C.successLt} />}
        {trend === 'down' && <ChevronDown size={13} color={C.dangerLt} />}
        <Text style={[sc.sub, trend === 'up' ? { color: C.successLt } : trend === 'down' ? { color: C.dangerLt } : {}]}>
          {sub}
        </Text>
      </View>
    </Animated.View>
  );
}

const sc = StyleSheet.create({
  card:    { flex: 1, backgroundColor: C.bgCard, borderRadius: 14, padding: 16, borderWidth: 1, borderColor: 'rgba(44,62,92,0.3)', overflow: 'hidden', minWidth: isTablet ? 180 : (W - 48) / 2 },
  accent:  { position: 'absolute', top: 0, left: 0, right: 0, height: 3, borderRadius: 14 },
  top:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  label:   { fontSize: 9, fontWeight: '700', color: C.textDim, letterSpacing: 1.2, textTransform: 'uppercase', flex: 1 },
  iconBox: { width: 28, height: 28, borderRadius: 7, alignItems: 'center', justifyContent: 'center' },
  value:   { fontSize: 22, fontWeight: '800', color: C.text, marginBottom: 4 },
  subRow:  { flexDirection: 'row', alignItems: 'center', gap: 3 },
  sub:     { fontSize: 11, fontWeight: '500', color: C.textMuted },
});

// ─────────────────────────────────────────────
// MAIN SCREEN
// ─────────────────────────────────────────────
export default function AdminDashboard() {
  const { currentUser, logout } = useAuth();
  const router = useRouter();

  const [loading,       setLoading]       = useState(true);
  const [refreshing,    setRefreshing]    = useState(false);

  // KPIs
  const [todayRev,      setTodayRev]      = useState(0);
  const [yesterdayRev,  setYesterdayRev]  = useState(0);
  const [todayOrders,   setTodayOrders]   = useState(0);
  const [activeStaff,   setActiveStaff]   = useState(0);
  const [totalStaff,    setTotalStaff]    = useState(0);

  // Panels
  const [recentOrders,  setRecentOrders]  = useState<any[]>([]);
  const [lowStock,      setLowStock]      = useState<any[]>([]);
  const [staff,         setStaff]         = useState<any[]>([]);

  const load = useCallback(async () => {
    try {
      const today     = new Date(); today.setHours(0, 0, 0, 0);
      const yesterday = new Date(today); yesterday.setDate(yesterday.getDate() - 1);

      const [
        { data: todayOrd },
        { data: yestOrd },
        { data: staffData },
        { data: ings },
        { data: recent },
      ] = await Promise.all([
        supabase.from('orders').select('id,total,created_at').gte('created_at', today.toISOString()),
        supabase.from('orders').select('total').gte('created_at', yesterday.toISOString()).lt('created_at', today.toISOString()),
        supabase.from('profiles').select('id,full_name,status,shift,role').eq('role', 'barista').order('full_name'),
        supabase.from('ingredients').select('id,name,current_stock,par_level,unit').order('name'),
        supabase.from('orders').select(`id,total,created_at,order_items(qty,menu_items(name))`).order('created_at', { ascending: false }).limit(8),
      ]);

      // KPIs
      const tRev = (todayOrd ?? []).reduce((s: number, o: any) => s + Number(o.total), 0);
      const yRev = (yestOrd  ?? []).reduce((s: number, o: any) => s + Number(o.total), 0);
      setTodayRev(tRev);
      setYesterdayRev(yRev);
      setTodayOrders((todayOrd ?? []).length);

      // Staff
      const allStaff = staffData ?? [];
      setStaff(allStaff);
      setActiveStaff(allStaff.filter((s: any) => s.status === 'active').length);
      setTotalStaff(allStaff.length);

      // Low stock
      const low = (ings ?? []).filter((i: any) => i.current_stock < i.par_level)
        .sort((a: any, b: any) => (a.current_stock / a.par_level) - (b.current_stock / b.par_level))
        .slice(0, 5);
      setLowStock(low);

      // Recent orders with item names
      const orders = (recent ?? []).map((o: any) => {
        const names = (o.order_items ?? []).map((oi: any) => oi.menu_items?.name).filter(Boolean);
        return {
          id: o.id,
          total: Number(o.total),
          created_at: o.created_at,
          label: names.length
            ? names.slice(0, 2).join(', ') + (names.length > 2 ? ` +${names.length - 2}` : '')
            : 'Order',
        };
      });
      setRecentOrders(orders);

    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const onRefresh = () => { setRefreshing(true); load(); };

  const revTrend = yesterdayRev === 0 ? null
    : todayRev >= yesterdayRev ? 'up' as const : 'down' as const;

  const revSub = yesterdayRev === 0
    ? 'No data yesterday'
    : `${revTrend === 'up' ? '+' : ''}${(((todayRev - yesterdayRev) / yesterdayRev) * 100).toFixed(1)}% vs yesterday`;

  const greetHour = new Date().getHours();
  const greeting  = greetHour < 12 ? 'Good morning' : greetHour < 17 ? 'Good afternoon' : 'Good evening';

  // ── RENDER ──
  return (
    <SafeAreaView style={s.root}>
      <StatusBar barStyle="light-content" backgroundColor={C.bg} />

      {/* HEADER */}
      <View style={s.header}>
        <View style={s.headerLeft}>
          {/* Mini logo */}
          <View style={s.logo}>
            <View style={s.logoRow}>
              {['🍦','☕'].map((e,i) => <View key={i} style={s.logoQ}><Text style={s.logoEmoji}>{e}</Text></View>)}
            </View>
            <View style={s.logoRow}>
              {['🥤','☕'].map((e,i) => <View key={i} style={s.logoQ}><Text style={s.logoEmoji}>{e}</Text></View>)}
            </View>
          </View>
          <View>
            <Text style={s.brand}>CREMA · Management</Text>
            <Text style={s.greeting}>{greeting}, {currentUser?.full_name?.split(' ')[0] ?? 'Manager'} ☕</Text>
          </View>
        </View>
        <TouchableOpacity style={s.logoutBtn} onPress={async () => { await logout(); router.replace('/login'); }}>
          <LogOut size={18} color={C.dangerLt} />
        </TouchableOpacity>
      </View>

      {/* GOLD ACCENT */}
      <View style={s.headerAccent} />

      <ScrollView
        style={{ flex: 1 }}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={s.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.gold} />}
      >

        {/* ── KPI CARDS ── */}
        <Text style={s.sectionLabel}>Today at a Glance</Text>
        <View style={s.kpiGrid}>
          <StatCard
            label="Revenue"
            value={peso(todayRev)}
            sub={revSub}
            accent="#3A6B8A"
            trend={revTrend}
            icon={<TrendingUp size={14} color="#3A6B8A" />}
          />
          <StatCard
            label="Orders"
            value={String(todayOrders)}
            sub="Completed today"
            accent={C.gold}
            icon={<ShoppingBag size={14} color={C.gold} />}
          />
        </View>
        <View style={[s.kpiGrid, { marginTop: 10 }]}>
          <StatCard
            label="Staff Active"
            value={`${activeStaff}/${totalStaff}`}
            sub="Baristas on shift"
            accent={C.success}
            icon={<Users size={14} color={C.success} />}
          />
          <StatCard
            label="Low Stock"
            value={String(lowStock.length)}
            sub={lowStock.length > 0 ? 'Needs restocking' : 'All stock healthy'}
            accent={lowStock.length > 0 ? C.danger : C.success}
            trend={lowStock.length > 0 ? 'down' : null}
            icon={<AlertTriangle size={14} color={lowStock.length > 0 ? C.dangerLt : C.successLt} />}
          />
        </View>

        {/* ── RECENT ORDERS ── */}
        <View style={s.panelHeader}>
          <Text style={s.sectionLabel}>Recent Orders</Text>
          <View style={s.liveBadge}>
            <View style={s.liveDot} />
            <Text style={s.liveText}>Live</Text>
          </View>
        </View>
        <View style={s.panel}>
          {recentOrders.length === 0
            ? <Text style={s.emptyText}>No orders yet today.</Text>
            : recentOrders.map((o, i) => (
              <View key={o.id} style={[s.orderRow, i < recentOrders.length - 1 && s.rowDivider]}>
                <View style={{ flex: 1 }}>
                  <Text style={s.orderName} numberOfLines={1}>{o.label}</Text>
                  <Text style={s.orderTime}>{timeAgo(o.created_at)}</Text>
                </View>
                <Text style={s.orderTotal}>{peso(o.total)}</Text>
              </View>
            ))
          }
          {recentOrders.length > 0 && (
            <TouchableOpacity style={s.panelFooter} onPress={onRefresh}>
              <RefreshCw size={12} color={C.textDim} />
              <Text style={s.panelFooterText}>Pull to refresh</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* ── LOW STOCK ALERTS ── */}
        <Text style={s.sectionLabel}>Stock Alerts</Text>
        <View style={s.panel}>
          {lowStock.length === 0
            ? (
              <View style={s.allGoodRow}>
                <CheckCircle size={16} color={C.successLt} />
                <Text style={[s.emptyText, { color: C.successLt, marginBottom: 0 }]}>All ingredients above par level</Text>
              </View>
            )
            : lowStock.map((ing, i) => {
              const pct = Math.round((ing.current_stock / ing.par_level) * 100);
              const crit = pct < 50;
              return (
                <View key={ing.id} style={[s.stockRow, i < lowStock.length - 1 && s.rowDivider]}>
                  <View style={{ flex: 1, marginRight: 12 }}>
                    <Text style={s.stockName}>{ing.name}</Text>
                    <View style={s.stockBarBg}>
                      <View style={[s.stockBarFill, { width: `${pct}%`, backgroundColor: crit ? C.dangerLt : C.warnLt }]} />
                    </View>
                  </View>
                  <Text style={[s.stockQty, { color: crit ? C.dangerLt : C.warnLt }]}>
                    {ing.current_stock}{ing.unit}
                    <Text style={{ color: C.textDim, fontWeight: '400' }}>/{ing.par_level}{ing.unit}</Text>
                  </Text>
                </View>
              );
            })
          }
        </View>

        {/* ── STAFF ON SHIFT ── */}
        <Text style={s.sectionLabel}>Team</Text>
        <View style={s.panel}>
          {staff.length === 0
            ? <Text style={s.emptyText}>No baristas registered.</Text>
            : staff.slice(0, 6).map((p, i) => {
              const col = getAvatarColor(p.full_name);
              return (
                <View key={p.id} style={[s.staffRow, i < Math.min(staff.length, 6) - 1 && s.rowDivider]}>
                  <View style={[s.staffAvatar, { backgroundColor: col }]}>
                    <Text style={s.staffInitials}>{getInitials(p.full_name)}</Text>
                  </View>
                  <Text style={s.staffName} numberOfLines={1}>{p.full_name}</Text>
                  {p.shift && (
                    <View style={[s.shiftPill, { backgroundColor: `${SHIFT_COLORS[p.shift] ?? C.navyMid}22`, borderColor: `${SHIFT_COLORS[p.shift] ?? C.navyMid}55` }]}>
                      <Text style={[s.shiftText, { color: SHIFT_COLORS[p.shift] ?? C.textMuted }]}>{p.shift}</Text>
                    </View>
                  )}
                  <View style={[s.statusDot, { backgroundColor: p.status === 'active' ? C.successLt : C.dangerLt }]} />
                </View>
              );
            })
          }
        </View>

        {/* ── QUICK ACTIONS ── */}
        <Text style={s.sectionLabel}>Quick Actions</Text>
        <View style={s.actionsGrid}>
          <TouchableOpacity style={[s.actionCard, { borderColor: 'rgba(184,147,90,0.3)' }]} onPress={() => router.push('/pos')} activeOpacity={0.8}>
            <View style={[s.actionIcon, { backgroundColor: 'rgba(184,147,90,0.12)' }]}>
              <Coffee size={24} color={C.gold} />
            </View>
            <Text style={s.actionTitle}>Launch POS</Text>
            <Text style={s.actionSub}>Open cash register</Text>
            <ArrowRight size={14} color={C.textDim} style={{ marginTop: 8 }} />
          </TouchableOpacity>

          <TouchableOpacity style={[s.actionCard, { borderColor: 'rgba(44,120,75,0.3)' }]} onPress={onRefresh} activeOpacity={0.8}>
            <View style={[s.actionIcon, { backgroundColor: 'rgba(44,120,75,0.12)' }]}>
              <RefreshCw size={24} color={C.successLt} />
            </View>
            <Text style={s.actionTitle}>Refresh</Text>
            <Text style={s.actionSub}>Reload all data</Text>
            <ArrowRight size={14} color={C.textDim} style={{ marginTop: 8 }} />
          </TouchableOpacity>

          <View style={[s.actionCard, { borderColor: 'rgba(44,62,92,0.2)', opacity: 0.6 }]}>
            <View style={[s.actionIcon, { backgroundColor: 'rgba(44,62,92,0.15)' }]}>
              <Package size={24} color={C.textMuted} />
            </View>
            <Text style={s.actionTitle}>Full Dashboard</Text>
            <Text style={s.actionSub}>Use the web portal for analytics, menu & staff management</Text>
          </View>
        </View>

        <View style={{ height: 32 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

// ─────────────────────────────────────────────
// STYLES
// ─────────────────────────────────────────────
const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },

  // Header
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: Platform.OS === 'android' ? 12 : 8,
    paddingBottom: 14,
  },
  headerLeft:   { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
  logo:         { width: 36, height: 36, backgroundColor: C.gold, borderRadius: 7, padding: 3, gap: 2 },
  logoRow:      { flexDirection: 'row', flex: 1, gap: 2 },
  logoQ:        { flex: 1, backgroundColor: C.navyMid, borderRadius: 2, alignItems: 'center', justifyContent: 'center' },
  logoEmoji:    { fontSize: 7 },
  brand:        { fontSize: 9, fontWeight: '700', color: C.gold, letterSpacing: 2, textTransform: 'uppercase' },
  greeting:     { fontSize: 15, fontWeight: '700', color: C.text, marginTop: 2 },
  logoutBtn:    { width: 38, height: 38, borderRadius: 19, backgroundColor: 'rgba(122,46,53,0.15)', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(122,46,53,0.2)' },
  headerAccent: { height: 2, backgroundColor: C.gold, marginHorizontal: 20, borderRadius: 1, opacity: 0.4, marginBottom: 4 },

  // Scroll
  scroll: { paddingHorizontal: 16, paddingTop: 12 },

  // Section label
  sectionLabel: { fontSize: 10, fontWeight: '800', color: C.textDim, letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 10, marginTop: 20 },

  // KPI grid
  kpiGrid: { flexDirection: 'row', gap: 10 },

  // Panel
  panel:       { backgroundColor: C.bgCard, borderRadius: 14, borderWidth: 1, borderColor: 'rgba(44,62,92,0.25)', overflow: 'hidden' },
  panelHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  panelFooter: { flexDirection: 'row', alignItems: 'center', gap: 6, padding: 12, justifyContent: 'center', borderTopWidth: 1, borderTopColor: 'rgba(44,62,92,0.12)' },
  panelFooterText: { fontSize: 11, color: C.textDim },

  rowDivider: { borderBottomWidth: 1, borderBottomColor: 'rgba(44,62,92,0.1)' },
  emptyText:  { fontSize: 13, color: C.textMuted, padding: 16, textAlign: 'center' },
  allGoodRow: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 14 },

  // Live badge
  liveBadge: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 100, backgroundColor: 'rgba(44,122,75,0.12)', borderWidth: 1, borderColor: 'rgba(44,122,75,0.25)' },
  liveDot:   { width: 6, height: 6, borderRadius: 3, backgroundColor: C.successLt },
  liveText:  { fontSize: 9, fontWeight: '700', color: C.successLt, letterSpacing: 1, textTransform: 'uppercase' },

  // Order row
  orderRow:  { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 13 },
  orderName: { fontSize: 13, fontWeight: '600', color: C.text, marginBottom: 2 },
  orderTime: { fontSize: 11, color: C.textMuted },
  orderTotal:{ fontSize: 15, fontWeight: '800', color: C.gold },

  // Stock row
  stockRow:    { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12 },
  stockName:   { fontSize: 13, fontWeight: '600', color: C.text, marginBottom: 5 },
  stockBarBg:  { height: 5, backgroundColor: 'rgba(44,62,92,0.2)', borderRadius: 100, overflow: 'hidden' },
  stockBarFill:{ height: '100%', borderRadius: 100 },
  stockQty:    { fontSize: 12, fontWeight: '700', minWidth: 72, textAlign: 'right' },

  // Staff row
  staffRow:     { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 11, gap: 10 },
  staffAvatar:  { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  staffInitials:{ fontSize: 11, fontWeight: '800', color: C.cream },
  staffName:    { flex: 1, fontSize: 13, fontWeight: '600', color: C.text },
  shiftPill:    { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 100, borderWidth: 1 },
  shiftText:    { fontSize: 9, fontWeight: '700', letterSpacing: 0.5, textTransform: 'uppercase' },
  statusDot:    { width: 7, height: 7, borderRadius: 4, flexShrink: 0 },

  // Actions grid
  actionsGrid: { flexDirection: isTablet ? 'row' : 'row', flexWrap: 'wrap', gap: 10 },
  actionCard: {
    flex: 1, minWidth: (W - 42) / 2 - 5,
    backgroundColor: C.bgCard, borderRadius: 14,
    padding: 16, borderWidth: 1,
  },
  actionIcon:  { width: 48, height: 48, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
  actionTitle: { fontSize: 14, fontWeight: '700', color: C.text, marginBottom: 4 },
  actionSub:   { fontSize: 12, color: C.textMuted, lineHeight: 18 },
});