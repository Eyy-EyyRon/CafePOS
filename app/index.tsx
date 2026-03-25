import { Redirect } from 'expo-router';
import { useAuth } from '../hooks/useAuth';

export default function EntryPoint() {
  const { currentUser } = useAuth();

  if (currentUser) {
    // Route based on role!
    if (currentUser.role === 'manager') {
      // Expo Router maps app/admin/index.tsx to just "/admin"
      return <Redirect href="/admin" />;
    }
    return <Redirect href="/pos" />;
  }

  return <Redirect href="/login" />;
}