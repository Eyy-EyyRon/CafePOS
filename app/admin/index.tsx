import React, { useEffect, useState } from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet, TextInput, Alert, KeyboardAvoidingView, Platform, Keyboard, Modal } from 'react-native';
import { supabase } from '../../lib/supabase';
import { Plus, LogOut, Package, X } from 'lucide-react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '../../hooks/useAuth';

interface Ingredient {
  id: string;
  name: string;
  current_stock: number;
  unit: string;
  low_stock_threshold: number;
}

export default function RestockScreen() {
  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
  const [addAmounts, setAddAmounts] = useState<{ [key: string]: string }>({});
  
  // Modal State for New Ingredient
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [newName, setNewName] = useState('');
  const [newStock, setNewStock] = useState('');
  const [newUnit, setNewUnit] = useState('');
  const [newThreshold, setNewThreshold] = useState('');

  const router = useRouter();
  const { logout } = useAuth();

  const fetchInventory = async () => {
    const { data } = await supabase.from('ingredients').select('*').order('name');
    if (data) setIngredients(data as Ingredient[]);
  };

  useEffect(() => {
    fetchInventory();
  }, []);

  const handleRestock = async (id: string, name: string) => {
    const amountStr = addAmounts[id];
    const amountToAdd = parseFloat(amountStr);

    if (!amountStr || isNaN(amountToAdd) || amountToAdd <= 0) {
      Alert.alert("Invalid Amount", "Please enter a valid number to restock.");
      return;
    }

    Keyboard.dismiss();

    const { error } = await supabase.rpc('increment_stock', {
      row_id: id,
      amount: amountToAdd
    });

    if (error) {
      const currentItem = ingredients.find(i => i.id === id);
      if (currentItem) {
        await supabase
          .from('ingredients')
          .update({ current_stock: currentItem.current_stock + amountToAdd })
          .eq('id', id);
      }
    }

    Alert.alert("Success", `Added ${amountToAdd} to ${name}!`);
    setAddAmounts(prev => ({ ...prev, [id]: '' }));
    fetchInventory();
  };

  // Create a brand new item
  const handleCreateNewItem = async () => {
    if (!newName || !newStock || !newUnit || !newThreshold) {
      Alert.alert("Missing Fields", "Please fill out all fields to create an item.");
      return;
    }

    const { data, error } = await supabase
      .from('ingredients')
      .insert([{
        name: newName,
        current_stock: parseFloat(newStock),
        unit: newUnit.toLowerCase(),
        low_stock_threshold: parseFloat(newThreshold)
      }]);

    if (error) {
      Alert.alert("Error", error.message);
      return;
    }

    Alert.alert("Success", `${newName} has been added to inventory!`);
    
    // Reset form and close modal
    setNewName('');
    setNewStock('');
    setNewUnit('');
    setNewThreshold('');
    setIsModalVisible(false);
    
    // Refresh the list to show the new item
    fetchInventory();
  };

  const handleLogout = () => {
    logout();
    router.replace('/login');
  };

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.container}>
      <View style={styles.header}>
        <View>
          <Text style={styles.greeting}>Manager Dashboard</Text>
          <Text style={styles.title}>Restock Supplies</Text>
        </View>
        <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout}>
          <LogOut color="#EF4444" size={24} />
        </TouchableOpacity>
      </View>

      {/* Add New Item Button */}
      <TouchableOpacity style={styles.createNewBtn} onPress={() => setIsModalVisible(true)}>
        <Plus color="white" size={20} />
        <Text style={styles.createNewText}>Add New Ingredient</Text>
      </TouchableOpacity>

      <FlatList
        data={ingredients}
        keyExtractor={(item) => item.id}
        showsVerticalScrollIndicator={false}
        keyboardDismissMode="on-drag"
        contentContainerStyle={styles.listContent}
        renderItem={({ item }) => (
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <View style={styles.iconBox}>
                <Package color="#0EA5E9" size={24} />
              </View>
              <View style={styles.infoCol}>
                <Text style={styles.itemName}>{item.name}</Text>
                <View style={styles.stockBadge}>
                  <Text style={styles.stockText}>In Stock: {item.current_stock} {item.unit}</Text>
                </View>
              </View>
            </View>

            <View style={styles.actionRow}>
              <TextInput
                style={styles.input}
                placeholder={`+ Add Qty (${item.unit})`}
                placeholderTextColor="#94A3B8"
                keyboardType="numeric"
                returnKeyType="done"
                value={addAmounts[item.id] || ''}
                onChangeText={(text) => setAddAmounts(prev => ({ ...prev, [item.id]: text }))}
              />
              <TouchableOpacity 
                style={[styles.addButton, !addAmounts[item.id] && styles.addButtonDisabled]}
                onPress={() => handleRestock(item.id, item.name)}
                disabled={!addAmounts[item.id]}
              >
                <Plus color="white" size={20} />
                <Text style={styles.addText}>Add</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
      />

      {/* NEW ITEM MODAL */}
      <Modal visible={isModalVisible} animationType="slide" transparent={true}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>New Ingredient</Text>
              <TouchableOpacity onPress={() => setIsModalVisible(false)}>
                <X color="#64748B" size={24} />
              </TouchableOpacity>
            </View>

            <Text style={styles.label}>Ingredient Name</Text>
            <TextInput style={styles.modalInput} placeholder="e.g. Matcha Powder" value={newName} onChangeText={setNewName} />

            <View style={styles.row}>
              <View style={{ flex: 1, marginRight: 10 }}>
                <Text style={styles.label}>Initial Stock</Text>
                <TextInput style={styles.modalInput} placeholder="e.g. 1000" keyboardType="numeric" value={newStock} onChangeText={setNewStock} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.label}>Unit</Text>
                <TextInput style={styles.modalInput} placeholder="e.g. g, ml, pcs" value={newUnit} onChangeText={setNewUnit} />
              </View>
            </View>

            <Text style={styles.label}>Low Stock Warning Level</Text>
            <TextInput style={styles.modalInput} placeholder="Alert me when it drops below..." keyboardType="numeric" value={newThreshold} onChangeText={setNewThreshold} />

            <TouchableOpacity style={styles.submitModalBtn} onPress={handleCreateNewItem}>
              <Text style={styles.submitModalText}>Save to Inventory</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 60, marginBottom: 15, paddingHorizontal: 20 },
  greeting: { fontSize: 14, fontWeight: '600', color: '#64748B', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 },
  title: { fontSize: 28, fontWeight: '800', color: '#0F172A' },
  logoutBtn: { backgroundColor: '#FEE2E2', padding: 10, borderRadius: 12 },
  
  createNewBtn: { backgroundColor: '#10B981', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', padding: 14, borderRadius: 12, marginHorizontal: 20, marginBottom: 20, shadowColor: '#10B981', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.2, shadowRadius: 8, elevation: 3 },
  createNewText: { color: 'white', fontWeight: 'bold', fontSize: 16, marginLeft: 8 },

  listContent: { paddingHorizontal: 20, paddingBottom: 40 },
  card: { backgroundColor: '#FFFFFF', borderRadius: 20, padding: 16, marginBottom: 16, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.05, shadowRadius: 10, elevation: 3 },
  cardHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 16 },
  iconBox: { width: 48, height: 48, borderRadius: 14, backgroundColor: '#E0F2FE', alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  infoCol: { flex: 1, justifyContent: 'center' },
  itemName: { fontSize: 18, fontWeight: '700', color: '#1E293B', marginBottom: 4 },
  stockBadge: { backgroundColor: '#F1F5F9', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8, alignSelf: 'flex-start' },
  stockText: { fontSize: 13, fontWeight: '600', color: '#475569' },
  actionRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderTopWidth: 1, borderTopColor: '#F1F5F9', paddingTop: 16 },
  input: { flex: 1, height: 48, backgroundColor: '#F8FAFC', borderRadius: 12, paddingHorizontal: 16, fontSize: 16, color: '#0F172A', borderWidth: 1, borderColor: '#E2E8F0', marginRight: 12 },
  addButton: { height: 48, backgroundColor: '#0EA5E9', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 20, borderRadius: 12 },
  addButtonDisabled: { backgroundColor: '#94A3B8' },
  addText: { color: '#FFFFFF', fontWeight: '700', fontSize: 16, marginLeft: 6 },

  // Modal Styles
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalContent: { backgroundColor: 'white', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingBottom: 40 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  modalTitle: { fontSize: 22, fontWeight: 'bold', color: '#0F172A' },
  label: { fontSize: 14, fontWeight: '600', color: '#475569', marginBottom: 8, marginTop: 10 },
  modalInput: { backgroundColor: '#F8FAFC', borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 12, padding: 14, fontSize: 16, color: '#0F172A' },
  row: { flexDirection: 'row', justifyContent: 'space-between' },
  submitModalBtn: { backgroundColor: '#0EA5E9', padding: 16, borderRadius: 12, alignItems: 'center', marginTop: 24 },
  submitModalText: { color: 'white', fontSize: 16, fontWeight: 'bold' }
});