import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://vgiubpgzqygdjrzvvgdf.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZnaXVicGd6cXlnZGpyenZ2Z2RmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI4OTU1MDAsImV4cCI6MjA4ODQ3MTUwMH0.VrV4u9Z1ZNolxQDIlXyj11f5hsWLX6fC6OiTSrvPx8Q';

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});