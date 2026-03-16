import { Tabs } from 'expo-router';
import { Coffee, ShoppingCart, ClipboardList } from 'lucide-react-native';
import { useCart } from '../../hooks/useCart';

export default function POSLayout() {
  const { cart } = useCart();

  return (
    <Tabs screenOptions={{ 
      tabBarActiveTintColor: '#4b3621', 
      headerShown: false,
      tabBarStyle: { height: 60, paddingBottom: 10 }
    }}>
      <Tabs.Screen 
        name="index" 
        options={{
          title: 'Menu',
          tabBarIcon: ({ color }) => <Coffee color={color} size={24} />
        }} 
      />
      
      <Tabs.Screen 
        name="cart" 
        options={{
          title: 'Checkout',
          tabBarIcon: ({ color }) => <ShoppingCart color={color} size={24} />,
          // Show a badge if there are items in the cart
          tabBarBadge: cart.length > 0 ? cart.length : undefined 
        }} 
      />

      <Tabs.Screen 
        name="inventory" 
        options={{
          title: 'Stock',
          tabBarIcon: ({ color }) => <ClipboardList color={color} size={24} />
        }} 
      />
    </Tabs>
  );
}