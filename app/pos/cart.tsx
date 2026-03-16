import React, { useState, useEffect } from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet, Alert, ActivityIndicator, SafeAreaView, TextInput, Modal, ScrollView } from 'react-native';
import { useCart } from '../../hooks/useCart';
import { useAuth } from '../../hooks/useAuth';
import { supabase } from '../../lib/supabase';
import { useRouter } from 'expo-router';
import { Trash2, Banknote, Smartphone, ChevronLeft, Tag, X } from 'lucide-react-native';

interface Discount {
  id: string;
  name: string;
  percentage: number;
}

export default function CartScreen() {
  const { cart, subtotal, total, discount, setDiscount, clearCart, removeItem } = useCart();
  const { currentUser } = useAuth();
  const router = useRouter();
  
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'gcash'>('cash');
  const [isProcessing, setIsProcessing] = useState(false);
  
  // Dynamic Discounts State
  const [availableDiscounts, setAvailableDiscounts] = useState<Discount[]>([]);
  const [isAddingDiscount, setIsAddingDiscount] = useState(false);
  const [newDiscName, setNewDiscName] = useState('');
  const [newDiscPercent, setNewDiscPercent] = useState('');

  useEffect(() => {
    fetchDiscounts();
  }, []);

  const fetchDiscounts = async () => {
    const { data } = await supabase.from('discounts').select('*').order('percentage', { ascending: false });
    if (data) setAvailableDiscounts(data);
  };

  const handleSaveDiscount = async () => {
    if (!newDiscName || !newDiscPercent) return;
    
    // Convert a whole number (e.g., 15) to a decimal (e.g., 0.15) for math
    const percentDecimal = parseFloat(newDiscPercent) / 100;

    const { error } = await supabase
      .from('discounts')
      .insert([{ name: newDiscName, percentage: percentDecimal }]);

    if (error) {
      Alert.alert("Error", error.message);
      return;
    }

    Alert.alert("Success", "Discount saved globally!");
    setIsAddingDiscount(false);
    setNewDiscName('');
    setNewDiscPercent('');
    fetchDiscounts(); // Refresh the list
  };

  const handleCheckout = async () => {
    if (cart.length === 0) {
      Alert.alert("Empty Order", "Please add items to the order first.");
      return;
    }
    setIsProcessing(true);

    try {
      const { data: sale, error: saleError } = await supabase
        .from('sales')
        .insert({
          barista_id: currentUser?.id,
          total_amount: total,
          payment_method: paymentMethod,
          order_type: 'dine-in'
        })
        .select()
        .single();

      if (saleError) throw saleError;

      const saleItems = cart.map(item => ({
        sale_id: sale.id,
        product_id: item.id,
        quantity: item.quantity,
        unit_price: item.base_price, 
      }));

      const { error: itemsError } = await supabase.from('sale_items').insert(saleItems);
      if (itemsError) throw itemsError;

      Alert.alert("Payment Successful", `Order complete! ₱${total.toFixed(2)} paid via ${paymentMethod.toUpperCase()}.`);
      clearCart();
      router.replace('/pos'); 
    } catch (error: any) {
      Alert.alert("Checkout Error", error.message);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <ChevronLeft color="#0F172A" size={28} />
        </TouchableOpacity>
        <Text style={styles.title}>Order Summary</Text>
        <View style={{ width: 40 }} />
      </View>

      <FlatList
        data={cart}
        keyExtractor={(item) => item.cartItemId}
        contentContainerStyle={styles.listContent}
        renderItem={({ item }) => (
          <View style={styles.cartItem}>
            <View style={styles.qtyBox}><Text style={styles.qtyText}>{item.quantity}x</Text></View>
            <View style={styles.itemInfo}>
              <Text style={styles.itemName}>{item.name}</Text>
              {item.modifiers && item.modifiers.length > 0 && (
                <Text style={styles.modifierText}>+ {item.modifiers.map(m => m.name).join(', ')}</Text>
              )}
              <Text style={styles.itemPrice}>₱{item.base_price} each</Text>
            </View>
            <View style={styles.itemRight}>
              <Text style={styles.itemTotal}>₱{item.quantity * item.base_price}</Text>
              <TouchableOpacity style={styles.deleteBtn} onPress={() => removeItem(item.cartItemId)}>
                <Trash2 color="#EF4444" size={20} />
              </TouchableOpacity>
            </View>
          </View>
        )}
      />

      <View style={styles.footer}>
        
        {/* Dynamic Discounts Section */}
        <View style={styles.sectionHeaderRow}>
          <Text style={styles.sectionLabel}>Apply Discount</Text>
          <TouchableOpacity onPress={() => setIsAddingDiscount(true)} style={styles.addNewInlineBtn}>
            <Text style={styles.addNewInlineText}>+ Custom</Text>
          </TouchableOpacity>
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.discountRow}>
          {availableDiscounts.map((d) => (
            <TouchableOpacity 
              key={d.id}
              style={[styles.discountBtn, discount === d.percentage && styles.activeDiscountBtn]} 
              onPress={() => setDiscount(discount === d.percentage ? 0 : d.percentage)}
            >
              <Tag color={discount === d.percentage ? '#FFF' : '#0EA5E9'} size={16} />
              <Text style={[styles.discountText, discount === d.percentage && styles.activeDiscountText]}>
                {d.name} ({(d.percentage * 100).toFixed(0)}%)
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        <Text style={styles.sectionLabel}>Payment Method</Text>
        <View style={styles.paymentRow}>
          <TouchableOpacity style={[styles.payBtn, paymentMethod === 'cash' && styles.activePayBtn]} onPress={() => setPaymentMethod('cash')}>
            <Banknote color={paymentMethod === 'cash' ? '#FFF' : '#64748B'} size={24} />
            <Text style={[styles.payBtnText, paymentMethod === 'cash' && styles.activePayBtnText]}>Cash</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.payBtn, paymentMethod === 'gcash' && styles.activePayBtn]} onPress={() => setPaymentMethod('gcash')}>
            <Smartphone color={paymentMethod === 'gcash' ? '#FFF' : '#64748B'} size={24} />
            <Text style={[styles.payBtnText, paymentMethod === 'gcash' && styles.activePayBtnText]}>GCash</Text>
          </TouchableOpacity>
        </View>

        {discount > 0 && (
          <>
            <View style={styles.subtotalRow}>
              <Text style={styles.subtotalLabel}>Subtotal:</Text>
              <Text style={styles.subtotalLabel}>₱{subtotal.toFixed(2)}</Text>
            </View>
            <View style={styles.subtotalRow}>
              <Text style={styles.discountLabel}>Discount ({(discount * 100).toFixed(0)}%):</Text>
              <Text style={styles.discountLabel}>-₱{(subtotal * discount).toFixed(2)}</Text>
            </View>
          </>
        )}

        <View style={styles.totalRow}>
          <Text style={styles.totalLabel}>Total Due</Text>
          <Text style={styles.totalAmount}>₱{total.toFixed(2)}</Text>
        </View>

        <TouchableOpacity 
          style={[styles.checkoutBtn, (cart.length === 0 || isProcessing) && styles.disabledBtn]} 
          onPress={handleCheckout}
          disabled={cart.length === 0 || isProcessing}
        >
          {isProcessing ? <ActivityIndicator color="#fff" /> : <Text style={styles.checkoutText}>Process Payment</Text>}
        </TouchableOpacity>
      </View>

      {/* NEW DISCOUNT MODAL */}
      <Modal visible={isAddingDiscount} animationType="fade" transparent={true}>
        <View style={styles.modalOverlay}>
          <View style={styles.smallModalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Add New Discount</Text>
              <TouchableOpacity onPress={() => setIsAddingDiscount(false)}>
                <X color="#64748B" size={24} />
              </TouchableOpacity>
            </View>
            
            <TextInput style={styles.modalInput} placeholder="Discount Name (e.g., Police)" value={newDiscName} onChangeText={setNewDiscName} />
            <TextInput style={styles.modalInput} placeholder="Percentage (e.g., 15)" keyboardType="numeric" value={newDiscPercent} onChangeText={setNewDiscPercent} />
            
            <TouchableOpacity style={styles.saveModalBtn} onPress={handleSaveDiscount}>
              <Text style={styles.saveModalText}>Save to System</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, marginTop: 20, marginBottom: 20 },
  backBtn: { backgroundColor: '#F1F5F9', padding: 8, borderRadius: 12 },
  title: { fontSize: 20, fontWeight: '800', color: '#0F172A' },
  listContent: { paddingHorizontal: 20, paddingBottom: 20 },
  cartItem: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFFFFF', padding: 16, borderRadius: 16, marginBottom: 12, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 8, elevation: 2 },
  qtyBox: { backgroundColor: '#F1F5F9', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, marginRight: 12 },
  qtyText: { fontSize: 16, fontWeight: '700', color: '#0EA5E9' },
  itemInfo: { flex: 1 },
  itemName: { fontSize: 16, fontWeight: '700', color: '#1E293B', marginBottom: 2 },
  modifierText: { fontSize: 12, color: '#0EA5E9', fontWeight: '600', marginBottom: 2 },
  itemPrice: { fontSize: 13, color: '#64748B', fontWeight: '500' },
  itemRight: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  itemTotal: { fontSize: 18, fontWeight: '800', color: '#0F172A' },
  deleteBtn: { backgroundColor: '#FEE2E2', padding: 10, borderRadius: 10 },
  footer: { backgroundColor: '#FFFFFF', padding: 24, borderTopLeftRadius: 32, borderTopRightRadius: 32, shadowColor: '#000', shadowOffset: { width: 0, height: -10 }, shadowOpacity: 0.05, shadowRadius: 20, elevation: 10 },
  sectionHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  sectionLabel: { fontSize: 14, fontWeight: '700', color: '#64748B', textTransform: 'uppercase', letterSpacing: 1 },
  addNewInlineBtn: { backgroundColor: '#E0F2FE', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8 },
  addNewInlineText: { color: '#0284C7', fontWeight: 'bold', fontSize: 12 },
  discountRow: { flexDirection: 'row', marginBottom: 20 },
  discountBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#F0F9FF', paddingHorizontal: 16, paddingVertical: 10, borderRadius: 12, borderWidth: 1, borderColor: '#BAE6FD', marginRight: 10 },
  activeDiscountBtn: { backgroundColor: '#0EA5E9', borderColor: '#0284C7' },
  discountText: { color: '#0EA5E9', fontWeight: '700', fontSize: 14 },
  activeDiscountText: { color: '#FFF' },
  paymentRow: { flexDirection: 'row', gap: 12, marginBottom: 20 },
  payBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#F1F5F9', paddingVertical: 16, borderRadius: 16, borderWidth: 2, borderColor: 'transparent' },
  activePayBtn: { backgroundColor: '#0EA5E9', borderColor: '#0284C7' },
  payBtnText: { fontSize: 16, fontWeight: '700', color: '#64748B' },
  activePayBtnText: { color: '#FFFFFF' },
  subtotalRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  subtotalLabel: { fontSize: 15, color: '#64748B', fontWeight: '500' },
  discountLabel: { fontSize: 15, color: '#EF4444', fontWeight: '600' },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', marginTop: 10, marginBottom: 20 },
  totalLabel: { fontSize: 18, fontWeight: '600', color: '#475569' },
  totalAmount: { fontSize: 36, fontWeight: '800', color: '#0F172A' },
  checkoutBtn: { backgroundColor: '#10B981', paddingVertical: 18, borderRadius: 16, alignItems: 'center' },
  disabledBtn: { backgroundColor: '#94A3B8' },
  checkoutText: { color: '#FFFFFF', fontSize: 20, fontWeight: '800' },
  
  // Modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center' },
  smallModalContent: { backgroundColor: 'white', borderRadius: 24, padding: 24, width: '85%' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  modalTitle: { fontSize: 20, fontWeight: 'bold', color: '#0F172A' },
  modalInput: { backgroundColor: '#F8FAFC', borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 12, padding: 14, fontSize: 16, color: '#0F172A', marginBottom: 15 },
  saveModalBtn: { backgroundColor: '#0EA5E9', padding: 16, borderRadius: 12, alignItems: 'center', marginTop: 10 },
  saveModalText: { color: 'white', fontSize: 16, fontWeight: 'bold' }
});