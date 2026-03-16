import { create } from 'zustand';

// 1. Define the shape of a User/Profile based on your database
export interface UserProfile {
  id: string;
  full_name: string;
  role: string;
  pin_code: string;
  avatar_url?: string; // <--- ADDED THIS LINE
}

// 2. Define the shape of the Auth Store
interface AuthStore {
  currentUser: UserProfile | null;
  setSession: (user: UserProfile) => void;
  logout: () => void;
}

// 3. Create and export the store
export const useAuth = create<AuthStore>((set) => ({
  currentUser: null, // Starts as null (no one is logged in)
  
  // Set the currently logged-in barista/manager after a successful PIN entry
  setSession: (user) => set({ currentUser: user }),
  
  // Clear the session when logging out
  logout: () => set({ currentUser: null }),
}));