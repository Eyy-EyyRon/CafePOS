import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Network from 'expo-network';
import { supabase } from './supabase';

const CACHE_KEYS = {
  MENU: '@crema_menu_cache',
  PROFILES: '@crema_profiles_cache',
  OUTBOX: '@crema_order_outbox',
};

// ─────────────────────────────────────────────
// 1. NETWORK CHECKER
// ─────────────────────────────────────────────
export async function isOnline() {
  const networkState = await Network.getNetworkStateAsync();
  return networkState.isConnected && networkState.isInternetReachable;
}

// ─────────────────────────────────────────────
// 2. READ CACHING (Load menu even if offline)
// ─────────────────────────────────────────────
export async function fetchMenuOfflineFirst() {
  const online = await isOnline();

  if (online) {
    // If online, get fresh data from Supabase
    const { data, error } = await supabase.from('menu_items').select('*');
    if (!error && data) {
      // Save a copy to local storage for later
      await AsyncStorage.setItem(CACHE_KEYS.MENU, JSON.stringify(data));
      return data;
    }
  }

  // If offline (or Supabase failed), load from local cache
  const cached = await AsyncStorage.getItem(CACHE_KEYS.MENU);
  return cached ? JSON.parse(cached) : [];
}

// ─────────────────────────────────────────────
// 3. THE OUTBOX (Save orders offline)
// ─────────────────────────────────────────────
export async function submitOrder(orderData: any, orderItems: any[]) {
  const online = await isOnline();

  const payload = {
    id: Date.now().toString(), // Temp local ID
    orderData,
    orderItems,
    timestamp: new Date().toISOString()
  };

  if (online) {
    try {
      // Try to send directly to Supabase
      const { data: order, error } = await supabase.from('orders').insert(orderData).select('id').single();
      if (error) throw error;
      
      const itemsToInsert = orderItems.map(item => ({ ...item, order_id: order.id }));
      await supabase.from('order_items').insert(itemsToInsert);
      return true; // Success!
    } catch (e) {
      console.log("Supabase failed, routing to outbox...", e);
      // Fall through to outbox logic if the internet dropped exactly during submission
    }
  }

  // WE ARE OFFLINE: Save to local outbox
  const outboxStr = await AsyncStorage.getItem(CACHE_KEYS.OUTBOX);
  const outbox = outboxStr ? JSON.parse(outboxStr) : [];
  
  outbox.push(payload);
  await AsyncStorage.setItem(CACHE_KEYS.OUTBOX, JSON.stringify(outbox));
  
  console.log(`Order saved locally. ${outbox.length} orders pending sync.`);
  return true; // App acts like it succeeded so the barista can keep working!
}

// ─────────────────────────────────────────────
// 4. THE BACKGROUND SYNC (Push outbox to DB)
// ─────────────────────────────────────────────
export async function syncOutbox() {
  const online = await isOnline();
  if (!online) return; // Still offline, do nothing

  const outboxStr = await AsyncStorage.getItem(CACHE_KEYS.OUTBOX);
  if (!outboxStr) return; // Nothing to sync
  
  const outbox = JSON.parse(outboxStr);
  if (outbox.length === 0) return;

  console.log(`Syncing ${outbox.length} offline orders to Supabase...`);

  const failedOrders = [];

  for (const pending of outbox) {
    try {
      // Push to Supabase
      const { data: order, error } = await supabase.from('orders').insert(pending.orderData).select('id').single();
      if (error) throw error;
      
      const itemsToInsert = pending.orderItems.map((item: any) => ({ ...item, order_id: order.id }));
      await supabase.from('order_items').insert(itemsToInsert);
    } catch (e) {
      console.error("Failed to sync an order, keeping in outbox", e);
      failedOrders.push(pending); // Keep it if it fails so we don't lose money
    }
  }

  // Update the outbox with only the ones that failed (hopefully 0)
  await AsyncStorage.setItem(CACHE_KEYS.OUTBOX, JSON.stringify(failedOrders));
}