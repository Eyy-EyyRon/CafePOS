import { Redirect } from 'expo-router';
import { useAuth } from '../hooks/useAuth';

export default function EntryPoint() {
  const { currentUser } = useAuth();

  if (currentUser) {
    // Route based on role!
    if (currentUser.role === 'manager') {
      return <Redirect href="/admin/index" />;
    }
    return <Redirect href="/pos" />;
  }

  return <Redirect href="/login" />;
}