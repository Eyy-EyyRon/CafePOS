import { Tabs } from 'expo-router';
import { Store, Trash2, Wallet, UserCog } from 'lucide-react-native';

export default function AdminLayout() {
  return (
    <Tabs screenOptions={{ 
      tabBarActiveTintColor: '#0284c7', 
      headerShown: false,
      tabBarStyle: { height: 60, paddingBottom: 10 }
    }}>
      <Tabs.Screen 
        name="index" 
        options={{
          title: 'Restock',
          tabBarIcon: ({ color }) => <Store color={color} size={24} />
        }} 
      />
      <Tabs.Screen 
        name="waste" 
        options={{
          title: 'Waste Log',
          tabBarIcon: ({ color }) => <Trash2 color={color} size={24} />
        }} 
      />
      <Tabs.Screen 
        name="eod" 
        options={{
          title: 'Cash Drawer',
          tabBarIcon: ({ color }) => <Wallet color={color} size={24} />
        }} 
      />
      {/* NEW SETTINGS TAB */}
      <Tabs.Screen 
        name="settings" 
        options={{
          title: 'Profile',
          tabBarIcon: ({ color }) => <UserCog color={color} size={24} />
        }} 
      />
    </Tabs>
  );
}