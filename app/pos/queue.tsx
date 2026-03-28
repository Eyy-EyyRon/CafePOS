import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet,
  SafeAreaView, StatusBar, ActivityIndicator, Alert
} from 'react-native';
import { supabase } from '../../.vscode/lib/supabase';
import { useRouter } from 'expo-router';
import { useKeepAwake } from 'expo-keep-awake';
import { ChevronLeft, CheckCircle2, Clock, Coffee, ShoppingBag, UtensilsCrossed } from 'lucide-react-native';

// ─────────────────────────────────────────────
// DESIGN TOKENS (Matching your POS)
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
  success:   '#2C7A4B',
  dangerLt:  '#C07070',
};

// ─────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────
type OrderItem = {
  id: string;
  qty: number;
  unit_price: number;
  modifiers_json: string; // JSON string of modifiers
  special_note: string | null;
  menu_items: { name: string };
};

type PendingOrder = {
  id: string;
  created_at: string;
  total: number;
  status: string;
  order_type: string;
  order_items: OrderItem[];
};

// Helper to format "3 mins ago"
const getElapsedTime = (dateString: string) => {
  const diff = Math.floor((new Date().getTime() - new Date(dateString).getTime()) / 60000);
  if (diff < 1) return 'Just now';
  return `${diff}m ago`;
};

export default function PocketQueueScreen() {
  useKeepAwake(); // Keep screen on while looking at tickets
  const router = useRouter();
  
  const [orders, setOrders] = useState<PendingOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [completingId, setCompletingId] = useState<string | null>(null);

  const fetchPendingOrders = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('orders')
        .select(`
          id, created_at, total, status, order_type,
          order_items ( id, qty, unit_price, modifiers_json, special_note, menu_items(name) )
        `)
        .eq('status', 'pending')
        .order('created_at', { ascending: true }); // Oldest first (FIFO)

      if (error) throw error;
      setOrders(data as unknown as PendingOrder[]);
    } catch (err: any) {
      console.error("Queue fetch error:", err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  // Poll for new orders every 10 seconds (or use Supabase Realtime)
  useEffect(() => {
    fetchPendingOrders();
    const interval = setInterval(fetchPendingOrders, 10000);
    return () => clearInterval(interval);
  }, [fetchPendingOrders]);

  const handleComplete = async (orderId: string) => {
    setCompletingId(orderId);
    try {
      const { error } = await supabase.from('orders').update({ status: 'completed' }).eq('id', orderId);
      if (error) throw error;
      
      // Optimistically remove from list
      setOrders(prev => prev.filter(o => o.id !== orderId));
    } catch (err: any) {
      Alert.alert('Error', 'Failed to complete order. Try again.');
    } finally {
      setCompletingId(null);
    }
  };

  const renderTicket = ({ item }: { item: PendingOrder }) => {
    const shortId = item.id.slice(-5).toUpperCase();
    const isTakeout = item.order_type === 'takeout';

    return (
      <View style={s.ticket}>
        {/* TICKET HEADER */}
        <View style={s.ticketHeader}>
          <View>
            <Text style={s.ticketId}>Order #{shortId}</Text>
            <View style={s.timeRow}>
              <Clock size={12} color={C.textMuted} />
              <Text style={s.timeText}>{getElapsedTime(item.created_at)}</Text>
            </View>
          </View>
          <View style={[s.typeBadge, isTakeout ? s.badgeTakeout : s.badgeDineIn]}>
            {isTakeout ? <ShoppingBag size={12} color="#FFF" /> : <UtensilsCrossed size={12} color="#FFF" />}
            <Text style={s.typeText}>{isTakeout ? 'TAKEOUT' : 'DINE-IN'}</Text>
          </View>
        </View>

        <View style={s.divider} />

        {/* TICKET ITEMS */}
        <View style={s.ticketBody}>
          {item.order_items.map((oi) => {
            // Safely parse modifiers
            let mods: any[] = [];
            try { mods = oi.modifiers_json ? JSON.parse(oi.modifiers_json) : []; } catch (e) {}

            return (
              <View key={oi.id} style={s.itemRow}>
                <Text style={s.itemQty}>{oi.qty}x</Text>
                <View style={{ flex: 1 }}>
                  <Text style={s.itemName}>{oi.menu_items?.name || 'Unknown Item'}</Text>
                  
                  {/* Modifiers List */}
                  {mods.length > 0 && (
                    <View style={s.modList}>
                      {mods.map((m: any, i: number) => (
                        <Text key={i} style={s.modText}>+ {m.name}</Text>
                      ))}
                    </View>
                  )}
                  
                  {/* Special Note */}
                  {oi.special_note ? (
                    <Text style={s.noteText}>📝 {oi.special_note}</Text>
                  ) : null}
                </View>
              </View>
            );
          })}
        </View>

        {/* TICKET ACTION */}
        <TouchableOpacity 
          style={s.completeBtn} 
          activeOpacity={0.8}
          onPress={() => handleComplete(item.id)}
          disabled={completingId === item.id}
        >
          {completingId === item.id 
            ? <ActivityIndicator color="#FFF" size="small" />
            : <>
                <CheckCircle2 size={18} color="#FFF" />
                <Text style={s.completeBtnText}>Mark as Completed</Text>
              </>
          }
        </TouchableOpacity>
      </View>
    );
  };

  return (
    <SafeAreaView style={s.root}>
      <StatusBar barStyle="light-content" backgroundColor={C.bg} />
      
      <View style={s.header}>
        <TouchableOpacity style={s.backBtn} onPress={() => router.back()}>
          <ChevronLeft size={22} color={C.text} strokeWidth={2.5} />
        </TouchableOpacity>
        <View style={{ flex: 1, alignItems: 'center' }}>
          <Text style={s.headerTitle}>Active Queue</Text>
          <Text style={s.headerSub}>{orders.length} pending orders</Text>
        </View>
        <View style={{ width: 38 }} />
      </View>

      {loading ? (
        <View style={s.center}>
          <ActivityIndicator color={C.gold} size="large" />
        </View>
      ) : orders.length === 0 ? (
        <View style={s.center}>
          <Coffee size={48} color={C.textMuted} strokeWidth={1.5} />
          <Text style={s.emptyTitle}>All Caught Up!</Text>
          <Text style={s.emptySub}>There are no pending orders in the queue right now.</Text>
        </View>
      ) : (
        <FlatList
          data={orders}
          keyExtractor={item => item.id}
          renderItem={renderTicket}
          contentContainerStyle={s.list}
          showsVerticalScrollIndicator={false}
        />
      )}
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },
  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: 'rgba(184,147,90,0.15)',
  },
  backBtn: {
    width: 38, height: 38, borderRadius: 19,
    backgroundColor: 'rgba(44,62,92,0.3)',
    alignItems: 'center', justifyContent: 'center',
  },
  headerTitle: { fontSize: 17, fontWeight: '800', color: C.text },
  headerSub:   { fontSize: 11, fontWeight: '600', color: C.gold, marginTop: 2 },
  
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 30 },
  emptyTitle: { fontSize: 20, fontWeight: '700', color: C.text, marginTop: 16 },
  emptySub: { fontSize: 14, color: C.textMuted, textAlign: 'center', marginTop: 8, lineHeight: 20 },

  list: { padding: 16, paddingBottom: 40 },
  
  // TICKET STYLING
  ticket: {
    backgroundColor: C.bgCard,
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: 'rgba(44,62,92,0.4)',
  },
  ticketHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  ticketId: { fontSize: 18, fontWeight: '800', color: C.cream, marginBottom: 4 },
  timeRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  timeText: { fontSize: 12, color: C.textMuted, fontWeight: '500' },
  
  typeBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8 },
  badgeDineIn: { backgroundColor: C.success },
  badgeTakeout: { backgroundColor: '#B87A3A' }, // Orange-ish for takeout
  typeText: { color: '#FFF', fontSize: 10, fontWeight: '800', letterSpacing: 1 },

  divider: { height: 1, backgroundColor: 'rgba(44,62,92,0.3)', marginVertical: 16, borderStyle: 'dashed' },

  ticketBody: { marginBottom: 16 },
  itemRow: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 12 },
  itemQty: { fontSize: 16, fontWeight: '800', color: C.gold, width: 32 },
  itemName: { fontSize: 16, fontWeight: '700', color: C.text, marginBottom: 4 },
  
  modList: { marginLeft: 4, borderLeftWidth: 2, borderLeftColor: 'rgba(184,147,90,0.3)', paddingLeft: 8 },
  modText: { fontSize: 13, fontWeight: '500', color: C.gold, marginBottom: 2 },
  noteText: { fontSize: 12, fontStyle: 'italic', color: C.dangerLt, marginTop: 4 },

  completeBtn: {
    backgroundColor: C.success,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    paddingVertical: 14, borderRadius: 12,
  },
  completeBtnText: { color: '#FFF', fontSize: 15, fontWeight: '700' },
});