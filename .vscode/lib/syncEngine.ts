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
// 3. CENTRALIZED SUPABASE PUSH LOGIC
// ─────────────────────────────────────────────
async function pushOrderToSupabase(orderDataInput: any, orderItems: any[]) {
  // 1. Pull the special _saleDetails out so Supabase doesn't get confused
  const { _saleDetails, ...orderData } = orderDataInput;

  // 2. Insert into orders table
  const { data: order, error: orderErr } = await supabase
    .from('orders')
    .insert(orderData)
    .select('id')
    .single();
    
  if (orderErr) throw orderErr;

  // 3. Insert into order_items table
  const itemsToInsert = orderItems.map((item: any) => ({ ...item, order_id: order.id }));
  const { error: itemsErr } = await supabase.from('order_items').insert(itemsToInsert);
  
  if (itemsErr) throw itemsErr;

  // 4. Insert into sales & sale_items tables (for Analytics & Reporting)
  if (_saleDetails) {
    const { data: sale, error: saleErr } = await supabase.from('sales').insert({
      barista_id: orderData.barista_id,
      total_amount: orderData.total,
      payment_method: _saleDetails.payment_method,
      order_type: _saleDetails.order_type,
      tax_amount: _saleDetails.tax_amount,
    }).select('id').single();

    if (sale && !saleErr) {
      const saleItems = orderItems.map((item: any) => ({
        sale_id: sale.id,
        product_id: item.menu_item_id,
        quantity: item.qty,
        unit_price: item.unit_price,
        total_item_cost: item.qty * item.unit_price,
      }));
      await supabase.from('sale_items').insert(saleItems);
    }
  }

  // ✨ 5. DEDUCT INVENTORY BASED ON RECIPE & TRIGGER ALERTS ✨
  try {
    const menuIds = [...new Set(orderItems.map(i => i.menu_item_id))];
    
    const { data: recipes } = await supabase
      .from('recipe_costing')
      .select('menu_item_id, ingredient_id, recipe_qty')
      .in('menu_item_id', menuIds);

    if (recipes && recipes.length > 0) {
      const deductions: Record<string, number> = {};
      
      orderItems.forEach(item => {
        const itemRecipes = recipes.filter(r => r.menu_item_id === item.menu_item_id);
        itemRecipes.forEach(recipe => {
          const qtyToDeduct = Number(recipe.recipe_qty) * Number(item.qty);
          deductions[recipe.ingredient_id] = (deductions[recipe.ingredient_id] || 0) + qtyToDeduct;
        });
      });

      for (const [ingredientId, amount] of Object.entries(deductions)) {
        // Fetch current stock AND par level
        const { data: currentIng } = await supabase
           .from('ingredients')
           .select('current_stock, par_level, name')
           .eq('id', ingredientId)
           .single();
           
        if (currentIng) {
           const oldStock = Number(currentIng.current_stock);
           const parLevel = Number(currentIng.par_level);
           const newStock = Math.max(0, oldStock - amount);

           // Update database stock
           await supabase
             .from('ingredients')
             .update({ current_stock: newStock })
             .eq('id', ingredientId);

           // 🚨 TRIGGER LOW STOCK ALERT 🚨
           // Only trigger if it WAS above/equal to par, and NOW it is below par.
           if (oldStock >= parLevel && newStock < parLevel) {
              // 1. Check Manager Settings
              const { data: settings } = await supabase
                .from('store_settings')
                .select('alert_email, alert_low_stock')
                .eq('id', 1)
                .single();

              // 2. If alerts are turned ON and an email is provided, call our Edge Function!
              if (settings && settings.alert_low_stock && settings.alert_email) {
                 await supabase.functions.invoke('send-alert', {
                   body: {
                     email: settings.alert_email,
                     ingredientName: currentIng.name,
                     currentStock: newStock,
                     parLevel: parLevel
                   }
                 });
              }
           }
        }
      }
    }
  } catch (e) {
    console.error("Failed to deduct inventory or send alert:", e);
    // Catch silently so the order process itself doesn't crash the POS
  }

  return order.id;
}

// ─────────────────────────────────────────────
// 4. THE OUTBOX (Save orders offline)
// ─────────────────────────────────────────────
export async function submitOrder(orderDataInput: any, orderItems: any[]) {
  const online = await isOnline();

  const payload = {
    id: Date.now().toString(), // Temp local ID
    orderData: orderDataInput,
    orderItems,
    timestamp: new Date().toISOString()
  };

  if (online) {
    try {
      // Try to send directly to Supabase
      await pushOrderToSupabase(orderDataInput, orderItems);
      return payload.id; // Success!
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
  return payload.id; 
}

// ─────────────────────────────────────────────
// 5. THE BACKGROUND SYNC (Push outbox to DB)
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
      // Try to push to Supabase using the centralized function
      await pushOrderToSupabase(pending.orderData, pending.orderItems);
    } catch (e) {
      console.error("Failed to sync an order, keeping in outbox", e);
      failedOrders.push(pending); // Keep it if it fails so we don't lose money
    }
  }

  // Update the outbox with only the ones that failed (hopefully 0)
  await AsyncStorage.setItem(CACHE_KEYS.OUTBOX, JSON.stringify(failedOrders));
}

// ─────────────────────────────────────────────
// 6. OUTBOX UTILITY (Count pending items)
// ─────────────────────────────────────────────
export async function getOutboxCount(): Promise<number> {
  try {
    const outboxStr = await AsyncStorage.getItem(CACHE_KEYS.OUTBOX);
    if (!outboxStr) return 0;
    
    const outbox = JSON.parse(outboxStr);
    return Array.isArray(outbox) ? outbox.length : 0;
  } catch (error) {
    console.error('Failed to get outbox count:', error);
    return 0;
  }
}