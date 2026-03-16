import React, { useEffect, useState } from 'react';
import { View, Text, FlatList, StyleSheet, RefreshControl } from 'react-native';
import { supabase } from '../../lib/supabase';
import { AlertTriangle, CheckCircle } from 'lucide-react-native';

// 1. Tell TypeScript exactly what an Ingredient looks like
interface Ingredient {
  id: string;
  name: string;
  current_stock: number;
  low_stock_threshold: number;
  unit: string;
}

export default function InventoryScreen() {
  // 2. Add <Ingredient[]> to let TypeScript know this array will hold ingredients
  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const fetchInventory = async () => {
    setRefreshing(true);
    const { data, error } = await supabase
      .from('ingredients')
      .select('*')
      .order('name');
    
    if (data) setIngredients(data as Ingredient[]);
    setRefreshing(false);
  };

  useEffect(() => {
    fetchInventory();
  }, []);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Live Stock</Text>
      
      <FlatList
        data={ingredients}
        keyExtractor={(item) => item.id}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={fetchInventory} />}
        renderItem={({ item }) => {
          const isLowStock = item.current_stock <= item.low_stock_threshold;
          
          return (
            <View style={[styles.card, isLowStock && styles.lowStockCard]}>
              <View>
                <Text style={styles.name}>{item.name}</Text>
                <Text style={styles.details}>Remaining: {item.current_stock} {item.unit}</Text>
              </View>
              
              <View style={styles.statusBox}>
                {isLowStock ? (
                  <>
                    <AlertTriangle color="#ff4444" size={24} />
                    <Text style={styles.alertText}>Low</Text>
                  </>
                ) : (
                  <>
                    <CheckCircle color="#4caf50" size={24} />
                    <Text style={styles.okText}>Good</Text>
                  </>
                )}
              </View>
            </View>
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fdfdfd', padding: 20 },
  title: { fontSize: 28, fontWeight: 'bold', marginTop: 30, marginBottom: 20 },
  card: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 15, backgroundColor: 'white', borderRadius: 12, marginBottom: 10, elevation: 2, shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 4, shadowOffset: { width: 0, height: 2 } },
  lowStockCard: { borderColor: '#ff4444', borderWidth: 1, backgroundColor: '#fff5f5' },
  name: { fontSize: 18, fontWeight: '600', marginBottom: 5 },
  details: { color: '#666', fontSize: 14 },
  statusBox: { alignItems: 'center' },
  alertText: { color: '#ff4444', fontSize: 12, fontWeight: 'bold', marginTop: 4 },
  okText: { color: '#4caf50', fontSize: 12, fontWeight: 'bold', marginTop: 4 }
});