import React, { useEffect, useState } from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet, ScrollView, SafeAreaView, Modal, TextInput, Alert } from 'react-native';
import { supabase } from '../../lib/supabase';
import { useCart, Modifier } from '../../hooks/useCart';
import { LogOut, Coffee, X, Plus } from 'lucide-react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '../../hooks/useAuth';

interface Product {
  id: string;
  name: string;
  base_price: number;
  is_available: boolean;
  category: string;
  modifiers: Modifier[]; // Now comes from the database!
}

export default function POSMenu() {
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  
  // Customization Modal State
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [activeModifiers, setActiveModifiers] = useState<Modifier[]>([]);
  
  // New Add-on Form State
  const [isAddingMod, setIsAddingMod] = useState(false);
  const [newModName, setNewModName] = useState('');
  const [newModPrice, setNewModPrice] = useState('');

  const { cart, addItem, total } = useCart();
  const { currentUser, logout } = useAuth();
  const router = useRouter();

  useEffect(() => {
    fetchProducts();
  }, []);

  const fetchProducts = async () => {
    const { data } = await supabase.from('products').select('*').eq('is_available', true);
    if (data) {
      setProducts(data as Product[]);
      const uniqueCategories = ['All', ...new Set(data.map(p => p.category || 'Other'))];
      setCategories(uniqueCategories);
    }
  };

  const handleLogout = () => {
    logout();
    router.replace('/login');
  };

  const handleProductTap = (product: Product) => {
    setSelectedProduct(product);
    setActiveModifiers([]);
    setIsAddingMod(false);
  };

  const toggleModifier = (mod: Modifier) => {
    setActiveModifiers(prev => 
      prev.includes(mod) ? prev.filter(m => m !== mod) : [...prev, mod]
    );
  };

  // Save a brand new add-on to the product in Supabase!
  const saveNewModifier = async () => {
    if (!newModName || !newModPrice || !selectedProduct) return;
    
    const newModifier: Modifier = { 
      name: newModName, 
      price: parseFloat(newModPrice) 
    };
    
    // Get existing modifiers or default to empty array
    const currentMods = selectedProduct.modifiers || [];
    const updatedMods = [...currentMods, newModifier];

    // Update Supabase Database
    const { error } = await supabase
      .from('products')
      .update({ modifiers: updatedMods })
      .eq('id', selectedProduct.id);

    if (error) {
      Alert.alert("Error", "Could not save add-on.");
      return;
    }

    // Update Local Screen instantly
    const updatedProduct = { ...selectedProduct, modifiers: updatedMods };
    setSelectedProduct(updatedProduct);
    
    setProducts(products.map(p => p.id === updatedProduct.id ? updatedProduct : p));
    
    // Reset Form
    setIsAddingMod(false);
    setNewModName('');
    setNewModPrice('');
  };

  const handleAddToCart = () => {
    if (selectedProduct) {
      addItem(selectedProduct, activeModifiers);
      setSelectedProduct(null);
    }
  };

  const filteredProducts = selectedCategory === 'All' 
    ? products 
    : products.filter(p => (p.category || 'Other') === selectedCategory);

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <View>
          <Text style={styles.greeting}>Good shift, {currentUser?.full_name?.split(' ')[0] || 'Barista'}</Text>
          <Text style={styles.title}>Cafe Menu</Text>
        </View>
        <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout}>
          <LogOut color="#EF4444" size={24} />
        </TouchableOpacity>
      </View>

      <View style={styles.tabContainer}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabScroll}>
          {categories.map((cat) => (
            <TouchableOpacity 
              key={cat} 
              style={[styles.tab, selectedCategory === cat && styles.activeTab]}
              onPress={() => setSelectedCategory(cat)}
            >
              <Text style={[styles.tabText, selectedCategory === cat && styles.activeTabText]}>{cat}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      <FlatList
        data={filteredProducts}
        numColumns={2}
        keyExtractor={(item) => item.id}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.gridContent}
        renderItem={({ item }) => (
          <TouchableOpacity style={styles.productCard} onPress={() => handleProductTap(item)}>
            <View style={styles.imagePlaceholder}>
              <Coffee color="#8B5A2B" size={32} />
            </View>
            <View style={styles.cardInfo}>
              <Text style={styles.productName} numberOfLines={2}>{item.name}</Text>
              <Text style={styles.productPrice}>₱{item.base_price}</Text>
            </View>
            <View style={styles.quickAdd}><Text style={styles.quickAddText}>+</Text></View>
          </TouchableOpacity>
        )}
      />

      {cart.length > 0 && (
        <TouchableOpacity style={styles.cartBar} onPress={() => router.push('/pos/cart')}>
          <View style={styles.cartInfo}>
            <View style={styles.cartBadge}><Text style={styles.cartBadgeText}>{cart.length}</Text></View>
            <Text style={styles.cartTotalText}>View Order</Text>
          </View>
          <Text style={styles.cartTotalText}>₱{total.toFixed(2)}</Text>
        </TouchableOpacity>
      )}

      {/* CUSTOMIZATION MODAL */}
      <Modal visible={!!selectedProduct} animationType="slide" transparent={true}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Customize {selectedProduct?.name}</Text>
              <TouchableOpacity onPress={() => setSelectedProduct(null)}>
                <X color="#64748B" size={24} />
              </TouchableOpacity>
            </View>
            
            <View style={styles.sectionHeaderRow}>
              <Text style={styles.sectionLabel}>Saved Add-ons</Text>
              {!isAddingMod && (
                <TouchableOpacity onPress={() => setIsAddingMod(true)} style={styles.addNewInlineBtn}>
                  <Text style={styles.addNewInlineText}>+ New</Text>
                </TouchableOpacity>
              )}
            </View>

            <View style={styles.modifierGrid}>
              {/* List the saved modifiers */}
              {selectedProduct?.modifiers && selectedProduct.modifiers.length > 0 ? (
                selectedProduct.modifiers.map((mod, index) => {
                  const isActive = activeModifiers.includes(mod);
                  return (
                    <TouchableOpacity 
                      key={index} 
                      style={[styles.modButton, isActive && styles.modButtonActive]}
                      onPress={() => toggleModifier(mod)}
                    >
                      <Text style={[styles.modText, isActive && styles.modTextActive]}>{mod.name}</Text>
                      <Text style={[styles.modPrice, isActive && styles.modTextActive]}>+₱{mod.price}</Text>
                    </TouchableOpacity>
                  );
                })
              ) : (
                <Text style={styles.noModsText}>No add-ons saved for this drink yet.</Text>
              )}
            </View>

            {/* Form to add a new modifier */}
            {isAddingMod && (
              <View style={styles.newModForm}>
                <TextInput style={[styles.modInput, { flex: 2 }]} placeholder="Name (e.g. Oat Milk)" value={newModName} onChangeText={setNewModName} />
                <TextInput style={[styles.modInput, { flex: 1 }]} placeholder="Price" keyboardType="numeric" value={newModPrice} onChangeText={setNewModPrice} />
                <TouchableOpacity style={styles.saveModBtn} onPress={saveNewModifier}>
                  <Text style={styles.saveModText}>Save</Text>
                </TouchableOpacity>
              </View>
            )}

            <TouchableOpacity style={styles.addToCartBtn} onPress={handleAddToCart}>
              <Text style={styles.addToCartText}>
                Add to Order (₱{(selectedProduct?.base_price || 0) + activeModifiers.reduce((s, m) => s + m.price, 0)})
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 50, paddingHorizontal: 20, marginBottom: 15 },
  greeting: { fontSize: 14, fontWeight: '600', color: '#64748B', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 },
  title: { fontSize: 28, fontWeight: '800', color: '#0F172A' },
  logoutBtn: { backgroundColor: '#FEE2E2', padding: 10, borderRadius: 12 },
  tabContainer: { height: 60, marginBottom: 10 },
  tabScroll: { paddingHorizontal: 15, alignItems: 'center' },
  tab: { paddingHorizontal: 20, paddingVertical: 10, borderRadius: 20, backgroundColor: '#FFFFFF', marginHorizontal: 5, borderWidth: 1, borderColor: '#E2E8F0' },
  activeTab: { backgroundColor: '#4b3621', borderColor: '#4b3621' },
  tabText: { fontSize: 15, fontWeight: '600', color: '#64748B' },
  activeTabText: { color: '#FFFFFF' },
  gridContent: { paddingHorizontal: 10, paddingBottom: 120 },
  productCard: { flex: 1, margin: 8, backgroundColor: '#FFFFFF', borderRadius: 20, padding: 12, alignItems: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.05, shadowRadius: 10, elevation: 3 },
  imagePlaceholder: { width: '100%', aspectRatio: 1, borderRadius: 16, backgroundColor: '#F1F5F9', justifyContent: 'center', alignItems: 'center', marginBottom: 12 },
  cardInfo: { width: '100%', alignItems: 'flex-start' },
  productName: { fontSize: 16, fontWeight: '700', color: '#1E293B', marginBottom: 4 },
  productPrice: { fontSize: 15, fontWeight: '600', color: '#0EA5E9' },
  quickAdd: { position: 'absolute', bottom: 12, right: 12, width: 28, height: 28, borderRadius: 14, backgroundColor: '#4b3621', justifyContent: 'center', alignItems: 'center' },
  quickAddText: { color: 'white', fontSize: 18, fontWeight: 'bold', marginTop: -2 },
  cartBar: { position: 'absolute', bottom: 25, left: 20, right: 20, backgroundColor: '#0F172A', height: 64, borderRadius: 32, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 24, shadowColor: '#000', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.2, shadowRadius: 15, elevation: 8 },
  cartInfo: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  cartBadge: { backgroundColor: '#0EA5E9', width: 32, height: 32, borderRadius: 16, justifyContent: 'center', alignItems: 'center' },
  cartBadgeText: { color: 'white', fontSize: 16, fontWeight: 'bold' },
  cartTotalText: { color: 'white', fontSize: 18, fontWeight: '700' },
  
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalContent: { backgroundColor: 'white', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingBottom: 40 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  modalTitle: { fontSize: 22, fontWeight: 'bold', color: '#0F172A' },
  sectionHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  sectionLabel: { fontSize: 14, fontWeight: '700', color: '#64748B', textTransform: 'uppercase', letterSpacing: 1 },
  addNewInlineBtn: { backgroundColor: '#E0F2FE', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8 },
  addNewInlineText: { color: '#0284C7', fontWeight: 'bold', fontSize: 12 },
  modifierGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 20 },
  modButton: { padding: 12, borderRadius: 12, borderWidth: 1, borderColor: '#E2E8F0', backgroundColor: '#F8FAFC' },
  modButtonActive: { borderColor: '#0EA5E9', backgroundColor: '#E0F2FE' },
  modText: { fontSize: 14, fontWeight: '600', color: '#475569' },
  modTextActive: { color: '#0284C7' },
  modPrice: { fontSize: 12, color: '#94A3B8', marginTop: 2 },
  noModsText: { color: '#94A3B8', fontStyle: 'italic', marginBottom: 10 },
  
  newModForm: { flexDirection: 'row', gap: 10, marginBottom: 20, backgroundColor: '#F1F5F9', padding: 10, borderRadius: 12 },
  modInput: { backgroundColor: 'white', padding: 10, borderRadius: 8, borderWidth: 1, borderColor: '#E2E8F0' },
  saveModBtn: { backgroundColor: '#0EA5E9', justifyContent: 'center', paddingHorizontal: 15, borderRadius: 8 },
  saveModText: { color: 'white', fontWeight: 'bold' },
  
  addToCartBtn: { backgroundColor: '#10B981', padding: 18, borderRadius: 16, alignItems: 'center', marginTop: 10 },
  addToCartText: { color: 'white', fontSize: 18, fontWeight: 'bold' }
});