import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Alert, Image } from 'react-native';
import { supabase } from '../lib/supabase';
import { useAuth, UserProfile } from '../hooks/useAuth'; 
import { useRouter } from 'expo-router';
import { Lock } from 'lucide-react-native';

export default function LoginScreen() {
  const [pin, setPin] = useState('');
  const [staff, setStaff] = useState<UserProfile[]>([]);
  const [selectedStaff, setSelectedStaff] = useState<UserProfile | null>(null);
  
  const { setSession } = useAuth();
  const router = useRouter();

  useEffect(() => {
    const fetchStaff = async () => {
      const { data } = await supabase.from('profiles').select('*');
      setStaff(data as UserProfile[] || []);
    };
    fetchStaff();
  }, []);

  const handlePress = (val: string) => {
    if (pin.length < 4) {
      const newPin = pin + val;
      setPin(newPin);
      if (newPin.length === 4) verifyPin(newPin);
    }
  };

  const verifyPin = async (enteredPin: string) => {
    if (!selectedStaff) return;

    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', selectedStaff.id)
      .eq('pin_code', enteredPin)
      .single();

    if (data) {
      setSession(data as UserProfile);
      // Route based on role - manager goes to admin, others go to pos
      if (data.role === 'manager') {
        router.replace('/admin');
      } else {
        router.replace('/pos');
      }
    } else {
      Alert.alert("Invalid PIN", "Please try again.");
      setPin('');
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.header}>Select Account</Text>
      
      {/* FinTech Profile Selection */}
      <View style={styles.staffContainer}>
        {staff.map((person) => (
          <TouchableOpacity 
            key={person.id}
            onPress={() => {
              setSelectedStaff(person);
              setPin(''); // Reset PIN if they switch users
            }}
            style={[styles.staffCard, selectedStaff?.id === person.id && styles.selectedCard]}
          >
            {/* Dynamic Avatar based on their name */}
            <Image 
              source={{ uri: `https://ui-avatars.com/api/?name=${encodeURIComponent(person.full_name)}&background=4b3621&color=fff&size=150&bold=true` }} 
              style={styles.avatar} 
            />
            <Text style={styles.staffName}>{person.full_name}</Text>
            <Text style={styles.staffRole}>{person.role.toUpperCase()}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Conditionally Show PIN Pad only AFTER a profile is tapped */}
      {selectedStaff ? (
        <View style={styles.pinSection}>
          <View style={styles.pinHeader}>
            <Lock size={20} color="#4b3621" />
            <Text style={styles.welcomeText}>Enter PIN for {selectedStaff.full_name}</Text>
          </View>
          
          <Text style={styles.pinDisplay}>
            {pin.padEnd(4, '○').split('').map(char => char === '○' ? '○ ' : '● ').join('')}
          </Text>

          <View style={styles.keypad}>
            {['1', '2', '3', '4', '5', '6', '7', '8', '9', 'C', '0', '⌫'].map((key) => (
              <TouchableOpacity 
                key={key} 
                style={styles.key}
                onPress={() => {
                  if (key === 'C') setPin('');
                  else if (key === '⌫') setPin(pin.slice(0, -1));
                  else handlePress(key);
                }}
              >
                <Text style={styles.keyText}>{key}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      ) : (
        <View style={styles.emptyState}>
          <Text style={styles.instructionText}>Tap your profile picture to log in</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8F9FA', alignItems: 'center', justifyContent: 'center', paddingVertical: 40 },
  header: { fontSize: 28, fontWeight: '800', color: '#1A1A1A', marginBottom: 40 },
  
  // Profile Cards
  staffContainer: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 20, marginBottom: 40, paddingHorizontal: 20 },
  staffCard: { alignItems: 'center', padding: 15, borderRadius: 20, width: 120, opacity: 0.6 },
  selectedCard: { opacity: 1, backgroundColor: '#EFEBE9', shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.1, shadowRadius: 10, elevation: 5 },
  avatar: { width: 80, height: 80, borderRadius: 40, marginBottom: 12, borderWidth: 3, borderColor: '#fff' },
  staffName: { fontSize: 16, fontWeight: '700', color: '#333', textAlign: 'center' },
  staffRole: { fontSize: 12, fontWeight: '600', color: '#888', marginTop: 4, letterSpacing: 1 },
  
  // PIN Section
  pinSection: { alignItems: 'center', width: '100%' },
  pinHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 20 },
  welcomeText: { fontSize: 16, fontWeight: '600', color: '#4b3621' },
  pinDisplay: { fontSize: 32, letterSpacing: 8, marginBottom: 30, color: '#4b3621', height: 40 },
  
  // Keypad
  keypad: { width: 300, flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 15 },
  key: { width: 75, height: 75, justifyContent: 'center', alignItems: 'center', backgroundColor: '#FFF', borderRadius: 40, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 5, elevation: 2 },
  keyText: { fontSize: 26, fontWeight: '500', color: '#333' },
  
  // Empty State
  emptyState: { height: 300, justifyContent: 'center' },
  instructionText: { fontSize: 16, color: '#999', fontWeight: '500' }
});