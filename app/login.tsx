import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, Animated,
  Dimensions, StatusBar, ScrollView, Image, Platform,
  Modal, TextInput, KeyboardAvoidingView
} from 'react-native';
import * as Haptics from 'expo-haptics';
import * as LocalAuthentication from 'expo-local-authentication';
import * as Network from 'expo-network';
import AsyncStorage from '@react-native-async-storage/async-storage'; // ✨ Added this import
import { supabase } from '../.vscode/lib/supabase';
import { useAuth, UserProfile as BaseUserProfile } from '../hooks/useAuth';
import { useRouter } from 'expo-router';
import { Fingerprint, Wifi, Cloud, Printer, ShieldAlert, X, Loader2 } from 'lucide-react-native';

const { width: W, height: H } = Dimensions.get('window');
const isTablet = W >= 768;

// Extend UserProfile to include shift for the login sorting
type UserProfile = BaseUserProfile & { shift?: string | null };

// ─────────────────────────────────────────────
// DESIGN TOKENS
// ─────────────────────────────────────────────
const C = {
  navy:        '#1E2D45',
  navyMid:     '#2C3E5C',
  navyLight:   '#3A5070',
  gold:        '#B8935A',
  goldLight:   '#D4AE78',
  cream:       '#F5EFE4',
  bgCard:      '#0D1825',
  bgPanel:     '#0F1D2E',
  bgInput:     '#0A1520',
  surface:     '#12202F',
  border:      'rgba(44,62,92,0.4)',
  borderGold:  'rgba(184,147,90,0.35)',
  text:        '#F0EDE8',
  textSub:     '#B0BFD0',
  textMuted:   '#6A8099',
  textDim:     '#3A5070',
  success:     '#1A7A4A',
  successLt:   '#4DC882',
  error:       '#8B1A2A',
  errorLt:     '#FF6B7A',
  biometricLt: '#5AC8FA',
};

// ─────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────
function getAvatarBg(name: string): string {
  const p = [C.navyMid, '#3A6B8A', '#6B5A2A', '#2A5A6B', '#4A3580', '#2A5A3A'];
  let h = 0;
  for (let i = 0; i < name.length; i++) h = name.charCodeAt(i) + ((h << 5) - h);
  return p[Math.abs(h) % p.length];
}
function getAvatarSource(person: UserProfile | null | undefined) {
  if (!person) return { uri: '' };
  if (person.avatar_url) return { uri: person.avatar_url };
  const bg = getAvatarBg(person.full_name).replace('#', '');
  return { uri: `https://ui-avatars.com/api/?name=${encodeURIComponent(person.full_name)}&background=${bg}&color=F0EDE8&size=300&bold=true&font-size=0.4` };
}

// ✨ FIXED: Cross-platform local storage helper ✨
const getLastUser = async () => {
  try {
    if (Platform.OS === 'web' && typeof window !== 'undefined' && window.localStorage) {
      return window.localStorage.getItem('crema_last_user');
    }
    return await AsyncStorage.getItem('crema_last_user');
  } catch (e) {
    return null;
  }
};
const setLastUser = async (id: string) => {
  try {
    if (Platform.OS === 'web' && typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.setItem('crema_last_user', id);
      return;
    }
    await AsyncStorage.setItem('crema_last_user', id);
  } catch (e) {
    // Ignore storage errors safely
  }
};

function CremaLogo({ size = 48 }: { size?: number }) {
  return (
    <View style={{ width: size, height: size, borderRadius: size * 0.18, overflow: 'hidden', borderWidth: 1.5, borderColor: C.gold }}>
      <Image source={require('../assets/crema.jpg')} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
    </View>
  );
}

// ─────────────────────────────────────────────
// ANIMATED PIN DOT
// ─────────────────────────────────────────────
function PinDot({ filled, error, success }: { filled: boolean; error: boolean; success: boolean }) {
  const scale = useRef(new Animated.Value(1)).current;
  const bg    = useRef(new Animated.Value(0)).current;
  const prev  = useRef(false);

  useEffect(() => {
    if (success) {
      Animated.sequence([
        Animated.spring(scale, { toValue: 1.5, useNativeDriver: true, speed: 40 }),
        Animated.spring(scale, { toValue: 1,   useNativeDriver: true, speed: 20 }),
      ]).start();
    } else if (filled && !prev.current) {
      Animated.parallel([
        Animated.sequence([
          Animated.spring(scale, { toValue: 1.45, useNativeDriver: true, speed: 55, bounciness: 14 }),
          Animated.spring(scale, { toValue: 1,    useNativeDriver: true, speed: 28 }),
        ]),
        Animated.sequence([
          Animated.timing(bg, { toValue: 1, duration: 90,  useNativeDriver: false }),
          Animated.timing(bg, { toValue: 0, duration: 350, useNativeDriver: false }),
        ]),
      ]).start();
    }
    prev.current = filled;
  }, [filled, success]);

  const dotColor = success ? C.successLt : bg.interpolate({ inputRange: [0,1], outputRange: [C.gold, C.goldLight] });
  const size     = 15;

  return (
    <Animated.View style={{ transform: [{ scale }] }}>
      {filled || success
        ? <Animated.View style={[pd.dot, { borderColor: success ? C.successLt : C.gold, backgroundColor: dotColor as any, width: size, height: size, borderRadius: size/2 }]} />
        : <View style={[pd.dot, error && pd.dotError, { width: size, height: size, borderRadius: size/2 }]} />
      }
    </Animated.View>
  );
}
const pd = StyleSheet.create({
  dot:       { borderWidth: 2, borderColor: C.textDim, backgroundColor: 'transparent' },
  dotError:  { borderColor: C.errorLt },
});

// ─────────────────────────────────────────────
// KEYPAD BUTTON
// ─────────────────────────────────────────────
const KS = isTablet ? 78 : 70;

function KeyBtn({ label, onPress, variant = 'digit', disabled = false }: {
  label: string; onPress: () => void; variant?: 'digit' | 'action' | 'bio'; disabled?: boolean;
}) {
  const sc  = useRef(new Animated.Value(1)).current;
  const glo = useRef(new Animated.Value(0)).current;

  const handlePress = useCallback(() => {
    if (disabled) return;
    if (variant === 'digit')  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (variant === 'action') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    if (variant === 'bio')    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);

    Animated.parallel([
      Animated.sequence([
        Animated.spring(sc,  { toValue: 0.82, useNativeDriver: true, speed: 65, bounciness: 0 }),
        Animated.spring(sc,  { toValue: 1,    useNativeDriver: true, speed: 42 }),
      ]),
      Animated.sequence([
        Animated.timing(glo, { toValue: 1, duration: 75,  useNativeDriver: false }),
        Animated.timing(glo, { toValue: 0, duration: 220, useNativeDriver: false }),
      ]),
    ]).start();
    onPress();
  }, [onPress, variant, disabled]);

  const bgMap: Record<string, [string, string]> = {
    digit:  ['rgba(26,42,60,0.9)',  'rgba(42,68,96,0.95)'],
    action: ['rgba(18,32,46,0.8)',  'rgba(28,48,68,0.9)'],
    bio:    ['rgba(26,64,96,0.5)',  'rgba(36,84,126,0.7)'],
  };
  const bgColor = glo.interpolate({ inputRange: [0,1], outputRange: bgMap[variant] });

  return (
    <Animated.View style={{ transform: [{ scale: sc }], opacity: disabled ? 0.5 : 1 }}>
      <TouchableOpacity onPress={handlePress} activeOpacity={1} disabled={disabled}>
        <Animated.View style={[
          kb.btn,
          variant === 'action' && kb.btnAction,
          variant === 'bio'    && kb.btnBio,
          { backgroundColor: bgColor as any },
        ]}>
          {variant === 'bio'
            ? <Fingerprint size={32} color={C.biometricLt} strokeWidth={1.5} /> 
            : <Text style={[kb.text, variant === 'action' && kb.textAction]}>{label}</Text>
          }
        </Animated.View>
      </TouchableOpacity>
    </Animated.View>
  );
}
const kb = StyleSheet.create({
  btn: { width: KS, height: KS, borderRadius: KS / 2, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(44,62,92,0.5)' },
  btnAction: { borderColor: 'rgba(44,62,92,0.25)' },
  btnBio:    { borderColor: 'rgba(90,200,250,0.3)', borderWidth: 1.5 },
  text:       { fontSize: 24, fontWeight: '300', color: C.text, fontFamily: Platform.OS === 'ios' ? 'System' : 'sans-serif-light' },
  textAction: { fontSize: 20, fontWeight: '500', color: C.textMuted },
});

// ─────────────────────────────────────────────
// PROFILE TILES
// ─────────────────────────────────────────────
const TILE_GAP = 12;
const L_PAD    = 18;
const L_W      = isTablet ? W * 0.44 : W;
const TILE_W   = (L_W - L_PAD * 2 - TILE_GAP) / 2;

function ProfileTile({ person, isActive, onPress }: { person: UserProfile; isActive: boolean; onPress: () => void; }) {
  const sc     = useRef(new Animated.Value(1)).current;
  const border = useRef(new Animated.Value(isActive ? 1 : 0)).current;

  useEffect(() => { Animated.spring(border, { toValue: isActive ? 1 : 0, useNativeDriver: false, speed: 16 }).start(); }, [isActive]);

  const handlePress = () => {
    Haptics.selectionAsync();
    Animated.sequence([ Animated.spring(sc, { toValue: 0.94, useNativeDriver: true, speed: 55 }), Animated.spring(sc, { toValue: 1, useNativeDriver: true, speed: 38 }) ]).start();
    onPress();
  };

  const borderColor = border.interpolate({ inputRange: [0,1], outputRange: [C.border, C.gold] });
  const borderWidth = border.interpolate({ inputRange: [0,1], outputRange: [1, 2.5] });
  const isManager   = person.role === 'manager';

  return (
    <Animated.View style={{ width: TILE_W, transform: [{ scale: sc }] }}>
      <TouchableOpacity onPress={handlePress} activeOpacity={1}>
        <Animated.View style={[pt.card, { borderColor, borderWidth }]}>
          <View style={pt.photoZone}>
            <Image source={getAvatarSource(person)} style={pt.photo} resizeMode="cover" />
            {isActive && <View style={pt.checkBadge}><Text style={{ color: C.cream, fontSize: 11, fontWeight: '800' }}>✓</Text></View>}
          </View>
          <View style={[pt.divider, isActive && { backgroundColor: C.gold }]} />
          <View style={pt.infoZone}>
            <Text style={[pt.name, isActive && { color: C.gold }]} numberOfLines={1}>{person.full_name.split(' ')[0]}</Text>
            <Text style={pt.surname} numberOfLines={1}>{person.full_name.split(' ').slice(1).join(' ')}</Text>
            <View style={[pt.roleBadge, isManager && pt.roleBadgeMgr]}>
              <Text style={[pt.roleText, isManager && { color: C.gold }]}>{isManager ? '⭐ Manager' : '☕ Barista'}</Text>
            </View>
          </View>
        </Animated.View>
      </TouchableOpacity>
    </Animated.View>
  );
}

const PT_H = TILE_W * 1.2;
const pt = StyleSheet.create({
  card: { width: TILE_W, height: PT_H, borderRadius: 14, overflow: 'hidden', backgroundColor: C.surface, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 10, elevation: 6 },
  photoZone: { width: '100%', height: PT_H * 0.55, overflow: 'hidden', position: 'relative' },
  photo:     { width: '100%', height: '100%' },
  checkBadge:{ position: 'absolute', top: 7, right: 7, width: 22, height: 22, borderRadius: 11, backgroundColor: C.gold, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: C.bgCard, shadowColor: C.gold, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.6, shadowRadius: 4 },
  divider: { height: 1.5, backgroundColor: C.border, marginHorizontal: 0 },
  infoZone: { flex: 1, paddingHorizontal: 10, paddingTop: 8, paddingBottom: 8, justifyContent: 'space-between', backgroundColor: C.surface },
  name:    { fontSize: 14, fontWeight: '700', color: C.text, lineHeight: 18 },
  surname: { fontSize: 11, fontWeight: '400', color: C.textMuted, lineHeight: 15, marginTop: 1 },
  roleBadge: { marginTop: 5, alignSelf: 'flex-start', paddingHorizontal: 7, paddingVertical: 3, borderRadius: 5, backgroundColor: 'rgba(26,42,62,0.9)', borderWidth: 1, borderColor: C.border },
  roleBadgeMgr: { backgroundColor: 'rgba(184,147,90,0.12)', borderColor: C.borderGold },
  roleText: { fontSize: 9, fontWeight: '700', color: C.textMuted, letterSpacing: 0.8, textTransform: 'uppercase' },
});

const PC_W = 100;
const PC_H = 132;
function PhoneCard({ person, isActive, onPress }: { person: UserProfile; isActive: boolean; onPress: () => void; }) {
  const sc = useRef(new Animated.Value(1)).current;
  const handlePress = () => {
    Haptics.selectionAsync();
    Animated.sequence([ Animated.spring(sc, { toValue: 0.92, useNativeDriver: true, speed: 60 }), Animated.spring(sc, { toValue: 1, useNativeDriver: true, speed: 38 }) ]).start();
    onPress();
  };
  const isManager = person.role === 'manager';
  return (
    <Animated.View style={{ transform: [{ scale: sc }], width: PC_W }}>
      <TouchableOpacity onPress={handlePress} activeOpacity={1}>
        <View style={[pc.card, isActive && pc.cardActive]}>
          <View style={pc.photoZone}>
            <Image source={getAvatarSource(person)} style={pc.photo} resizeMode="cover" />
            {isActive && <View style={pc.check}><Text style={{ color: C.cream, fontSize: 9, fontWeight: '800' }}>✓</Text></View>}
          </View>
          <View style={[pc.divider, isActive && { backgroundColor: C.gold }]} />
          <View style={pc.infoZone}>
            <Text style={[pc.name, isActive && { color: C.gold }]} numberOfLines={1}>{person.full_name.split(' ')[0]}</Text>
            <View style={[pc.badge, isManager && pc.badgeMgr]}>
              <Text style={[pc.badgeText, isManager && { color: C.gold }]}>{isManager ? 'Manager' : 'Barista'}</Text>
            </View>
          </View>
        </View>
      </TouchableOpacity>
    </Animated.View>
  );
}
const pc = StyleSheet.create({
  card:       { width: PC_W, height: PC_H, borderRadius: 12, overflow: 'hidden', backgroundColor: C.surface, borderWidth: 1, borderColor: C.border },
  cardActive: { borderColor: C.gold, borderWidth: 2.5 },
  photoZone:  { height: PC_H * 0.57, position: 'relative', overflow: 'hidden' },
  photo:      { width: '100%', height: '100%' },
  check:      { position: 'absolute', top: 5, right: 5, width: 18, height: 18, borderRadius: 9, backgroundColor: C.gold, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: C.bgCard },
  divider:    { height: 1.5, backgroundColor: C.border },
  infoZone:   { flex: 1, paddingHorizontal: 8, paddingTop: 6, paddingBottom: 5 },
  name:       { fontSize: 12, fontWeight: '700', color: C.text, marginBottom: 4 },
  badge:      { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, backgroundColor: 'rgba(26,42,62,0.9)', borderWidth: 1, borderColor: C.border, alignSelf: 'flex-start' },
  badgeMgr:   { backgroundColor: 'rgba(184,147,90,0.12)', borderColor: C.borderGold },
  badgeText:  { fontSize: 8, fontWeight: '700', color: C.textMuted, textTransform: 'uppercase', letterSpacing: 0.6 },
});

// ─────────────────────────────────────────────
// MAIN SCREEN
// ─────────────────────────────────────────────
export default function LoginScreen() {
  const [pin,         setPin]       = useState('');
  const [staff,       setStaff]     = useState<UserProfile[]>([]);
  const [selected,  setSelected]  = useState<UserProfile | null>(null);
  const [loading,   setLoading]   = useState(true);
  const [verifying, setVerifying] = useState(false);
  const [pinError,  setPinError]  = useState(false);
  const [unlockSuccess, setUnlockSuccess] = useState(false); 
  const [bioAvail,  setBioAvail]  = useState(false);
  const [now,       setNow]       = useState(new Date());
  const [isOffline, setIsOffline] = useState(false);

  // Manager Override State
  const [showOverride, setShowOverride] = useState(false);
  const [overrideStep, setOverrideStep] = useState<1 | 2>(1); 
  const [mgrPin, setMgrPin] = useState('');
  const [newPin, setNewPin] = useState('');
  const [overrideErr, setOverrideErr] = useState('');
  const [overrideLoading, setOverrideLoading] = useState(false);

  const { setSession } = useAuth();
  const router         = useRouter();

  const shakeX    = useRef(new Animated.Value(0)).current;
  const gridAlpha = useRef(new Animated.Value(1)).current;
  const tileAnims = useRef<Animated.Value[]>([]).current;

  // Clock & Network
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    const checkNet = async () => {
      const state = await Network.getNetworkStateAsync();
      setIsOffline(!(state.isConnected && state.isInternetReachable));
    };
    checkNet();
    const netInt = setInterval(checkNet, 5000);
    return () => { clearInterval(t); clearInterval(netInt); };
  }, []);

  useEffect(() => {
    LocalAuthentication.hasHardwareAsync().then(has => {
      if (has) LocalAuthentication.isEnrolledAsync().then(enrolled => setBioAvail(enrolled));
    });
  }, []);

  // Fetch Staff
  useEffect(() => {
    (async () => {
      const { data } = await supabase.from('profiles').select('*')
        .in('role', ['barista', 'manager']).eq('status', 'active');
      
      let people = (data as UserProfile[]) ?? [];
      const lastId = await getLastUser(); // ✨ ASYNC STORAGE SAFE FIX
      const currentHour = new Date().getHours();
      
      let currentShift = 'Morning';
      if (currentHour >= 12 && currentHour < 17) currentShift = 'Afternoon';
      if (currentHour >= 17) currentShift = 'Evening';

      people.sort((a, b) => {
        if (a.id === lastId) return -1;
        if (b.id === lastId) return 1;
        if (a.shift === currentShift && b.shift !== currentShift) return -1;
        if (b.shift === currentShift && a.shift !== currentShift) return 1;
        return a.full_name.localeCompare(b.full_name);
      });

      setStaff(people);
      
      if (lastId) {
        const last = people.find(p => p.id === lastId);
        if (last) setSelected(last);
      }

      people.forEach((_, i) => { if (!tileAnims[i]) tileAnims[i] = new Animated.Value(0); });
      Animated.stagger(55, people.map((_, i) =>
        Animated.spring(tileAnims[i], { toValue: 1, useNativeDriver: true, speed: 16, bounciness: 5 })
      )).start();
      setLoading(false);
    })();
  }, []);

  useEffect(() => {
    Animated.timing(gridAlpha, { toValue: selected ? 0 : 1, duration: selected ? 160 : 240, useNativeDriver: true }).start();
  }, [selected?.id]);

  const handleSelect = (person: UserProfile) => {
    if (selected?.id === person.id) return;
    setSelected(person); setPin(''); setPinError(false); setUnlockSuccess(false);
  };

  const shake = () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    Animated.sequence([
      Animated.timing(shakeX, { toValue: -13, duration: 50, useNativeDriver: true }),
      Animated.timing(shakeX, { toValue:  13, duration: 50, useNativeDriver: true }),
      Animated.timing(shakeX, { toValue:  -9, duration: 40, useNativeDriver: true }),
      Animated.timing(shakeX, { toValue:   9, duration: 40, useNativeDriver: true }),
      Animated.timing(shakeX, { toValue:  -4, duration: 32, useNativeDriver: true }),
      Animated.timing(shakeX, { toValue:   0, duration: 32, useNativeDriver: true }),
    ]).start();
  };

  const pressKey = (val: string) => {
    if (verifying || unlockSuccess) return;
    setPinError(false);
    if (val === '⌫') { setPin(p => p.slice(0, -1)); return; }
    if (val === 'C')  { setPin(''); return; }
    if (pin.length >= 4) return;
    const next = pin + val;
    setPin(next);
    if (next.length === 4) verifyPin(next);
  };

  const verifyPin = async (entered: string) => {
    if (!selected) return;
    setVerifying(true);
    const { data } = await supabase.from('profiles').select('*')
      .eq('id', selected.id).eq('pin_code', entered).single();
    
    if (data) {
      setUnlockSuccess(true);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setLastUser(selected.id); // Triggers Async save in background
      
      setTimeout(() => {
        setSession(data as UserProfile);
        router.replace(data.role === 'manager' ? '/admin' : '/pos');
      }, 350);
    } else {
      shake(); setPinError(true); setPin(''); setVerifying(false);
    }
  };

  const handleBiometric = async () => {
    if (!selected) return;
    const result = await LocalAuthentication.authenticateAsync({ promptMessage: `Verify identity for ${selected.full_name}`, fallbackLabel: 'Use PIN instead' });
    if (result.success) {
      setUnlockSuccess(true);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setLastUser(selected.id);
      setTimeout(() => {
        setSession(selected);
        router.replace(selected.role === 'manager' ? '/admin' : '/pos');
      }, 350);
    } else {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    }
  };

  const handleOverrideSubmit = async () => {
    if (overrideStep === 1) {
      if (mgrPin.length !== 4) return;
      setOverrideLoading(true); setOverrideErr('');
      const { data } = await supabase.from('profiles').select('id').eq('pin_code', mgrPin).eq('role', 'manager').single();
      if (data) {
        setOverrideStep(2); setOverrideErr('');
      } else {
        setOverrideErr('Invalid Manager PIN'); setMgrPin('');
      }
      setOverrideLoading(false);
    } else {
      if (newPin.length !== 4) return;
      setOverrideLoading(true); setOverrideErr('');
      const { error } = await supabase.from('profiles').update({ pin_code: newPin }).eq('id', selected?.id);
      if (!error) {
        setShowOverride(false); setPin(''); setMgrPin(''); setNewPin(''); setOverrideStep(1);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        alert('PIN Reset Successfully! You can now log in.');
      } else {
        setOverrideErr('Failed to reset PIN. Try again.');
      }
      setOverrideLoading(false);
    }
  };

  const timeStr = now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
  const dateStr = now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
  const KEYS = ['1','2','3','4','5','6','7','8','9','C','0','⌫'];
  const timeH = now.getHours();
  const greeting = timeH < 12 ? 'Good morning' : timeH < 17 ? 'Good afternoon' : 'Good evening';
  
  const theme = useMemo(() => {
    if (timeH >= 5 && timeH < 12) return { bg: '#0A121A', g1: 'rgba(212,174,120,0.06)', g2: 'rgba(250,160,100,0.04)' }; 
    if (timeH >= 12 && timeH < 17) return { bg: '#071018', g1: 'rgba(90,200,250,0.05)', g2: 'rgba(255,255,255,0.03)' }; 
    return { bg: '#050A0F', g1: 'rgba(74,53,128,0.07)', g2: 'rgba(30,45,69,0.09)' }; 
  }, [timeH]);

  const PinPanel = () => (
    <View style={pp.wrap}>
      <View style={pp.userCard}>
        <View style={pp.userPhoto}>
          <Image source={getAvatarSource(selected)} style={pp.userPhotoImg} resizeMode="cover" />
        </View>
        <View style={pp.userInfo}>
          <Text style={pp.userName}>{selected?.full_name}</Text>
          <View style={[pp.userRole, selected?.role === 'manager' && pp.userRoleMgr]}>
            <Text style={[pp.userRoleText, selected?.role === 'manager' && { color: C.gold }]}>
              {selected?.role === 'manager' ? '⭐ Manager' : '☕ Barista'}
            </Text>
          </View>
        </View>
        <TouchableOpacity style={pp.switchBtn} onPress={() => { setSelected(null); setPin(''); setPinError(false); }}>
          <Text style={pp.switchText}>Switch</Text>
        </TouchableOpacity>
      </View>

      <Animated.View style={[pp.dots, { transform: [{ translateX: shakeX }] }]}>
        {[0,1,2,3].map(i => <PinDot key={i} filled={i < pin.length} error={pinError} success={unlockSuccess} />)}
      </Animated.View>

      <View style={pp.statusWrap}>
        {unlockSuccess ? <Text style={[pp.verify, { color: C.successLt }]}>Unlocked!</Text>
        : pinError   ? <Text style={pp.err}>Incorrect PIN — please try again</Text>
        : verifying  ? <Text style={pp.verify}>Authenticating…</Text>
        : pin.length === 0 ? <Text style={pp.hint}>Enter your 4-digit PIN</Text> 
        : null}
      </View>

      <View style={pp.keypad}>
        {KEYS.map((k, i) => {
          if (k === 'C' && bioAvail) return <KeyBtn key="bio" label="bio" variant="bio" onPress={handleBiometric} disabled={verifying || unlockSuccess} />;
          return <KeyBtn key={k} label={k} variant={k === 'C' || k === '⌫' ? 'action' : 'digit'} onPress={() => pressKey(k)} disabled={verifying || unlockSuccess} />;
        })}
      </View>

      <TouchableOpacity style={pp.forgotBtn} onPress={() => { setMgrPin(''); setNewPin(''); setOverrideStep(1); setOverrideErr(''); setShowOverride(true); }}>
        <Text style={pp.forgotText}>Forgot PIN? Request Manager Override</Text>
      </TouchableOpacity>
    </View>
  );

  return (
    <View style={[s.root, { backgroundColor: theme.bg }]}>
      <StatusBar barStyle="light-content" backgroundColor={theme.bg} />

      <View style={s.bgDots} pointerEvents="none" />
      <View style={[s.glowGold, { backgroundColor: theme.g1 }]} pointerEvents="none" />
      <View style={[s.glowBlue, { backgroundColor: theme.g2 }]} pointerEvents="none" />

      <View style={s.healthBar}>
        <View style={s.healthItem}>
          <Wifi size={12} color={isOffline ? C.errorLt : C.successLt} />
          <Text style={[s.healthText, { color: isOffline ? C.errorLt : C.successLt }]}>{isOffline ? 'Offline Mode' : 'Online'}</Text>
        </View>
        <View style={s.healthItem}>
          <Cloud size={12} color={C.successLt} />
          <Text style={s.healthText}>Synced</Text>
        </View>
        <View style={s.healthItem}>
          <Printer size={12} color={C.successLt} />
          <Text style={s.healthText}>Printer Ready</Text>
        </View>
      </View>

      {isTablet ? (
        <View style={s.tablet}>
          <View style={s.left}>
            <View style={s.clockBlock}>
              <Text style={s.clockTime}>{timeStr}</Text>
              <Text style={s.clockDate}>{dateStr}</Text>
              <Text style={s.clockGreet}>{greeting} 👋</Text>
            </View>

            <View style={s.brandRow}>
              <CremaLogo size={42} />
              <View style={{ marginLeft: 12 }}>
                <Text style={s.brandName}>CREMA</Text>
                <Text style={s.brandSub}>Coffee &amp; Ice Cream · POS</Text>
              </View>
            </View>
            <View style={s.divider} />

            {selected ? (
              <View style={{ flex: 1, justifyContent: 'center', paddingBottom: 16 }}><PinPanel /></View>
            ) : (
              <>
                <Text style={s.selectHdr}>Select profile to unlock</Text>
                <Animated.ScrollView showsVerticalScrollIndicator={false} style={[{ flex: 1 }, { opacity: gridAlpha }]} contentContainerStyle={{ paddingBottom: 24 }}>
                  {loading ? <Text style={s.loadTxt}>Loading…</Text> : (
                    <View style={s.grid}>
                      {staff.map((p, idx) => {
                        const anim = tileAnims[idx] ?? new Animated.Value(1);
                        return (
                          <Animated.View key={p.id} style={{ opacity: anim, transform: [{ translateY: anim.interpolate({ inputRange:[0,1], outputRange:[20,0] }) }, { scale: anim.interpolate({ inputRange:[0,1], outputRange:[0.9,1] }) }] }}>
                            <ProfileTile person={p} isActive={false} onPress={() => handleSelect(p)} />
                          </Animated.View>
                        );
                      })}
                    </View>
                  )}
                </Animated.ScrollView>
              </>
            )}
          </View>

          <View style={s.right}>
            {!selected && (
              <View style={s.emptyRight}>
                <CremaLogo size={100} />
                <Text style={s.emptyTitle}>CREMA POS</Text>
                <Text style={s.emptySub}>Point of Sale · Staff Login</Text>
              </View>
            )}
          </View>
        </View>
      ) : (
        <ScrollView contentContainerStyle={s.phone} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
          <View style={s.phoneClock}>
            <Text style={s.phoneTime}>{timeStr}</Text>
            <Text style={s.phoneDate}>{dateStr}</Text>
          </View>
          <Text style={s.selectHdr}>{selected ? 'Enter your PIN' : 'Select profile to unlock'}</Text>
          {!selected && (
            <Animated.ScrollView horizontal showsHorizontalScrollIndicator={false} style={[{ marginBottom: 24 }, { opacity: gridAlpha }]} contentContainerStyle={{ gap: 12, paddingHorizontal: 2 }}>
              {staff.map((p, idx) => {
                const anim = tileAnims[idx] ?? new Animated.Value(1);
                return (
                  <Animated.View key={p.id} style={{ opacity: anim, transform: [{ scale: anim.interpolate({ inputRange:[0,1], outputRange:[0.85,1] }) }] }}>
                    <PhoneCard person={p} isActive={false} onPress={() => handleSelect(p)} />
                  </Animated.View>
                );
              })}
            </Animated.ScrollView>
          )}
          {selected && <PinPanel />}
        </ScrollView>
      )}

      {/* ✨ Manager Override Modal ✨ */}
      <Modal visible={showOverride} transparent animationType="fade">
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={m.overlay}>
          <View style={m.card}>
            <View style={m.header}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <ShieldAlert size={18} color={C.gold} />
                <Text style={m.title}>Manager Override</Text>
              </View>
              <TouchableOpacity onPress={() => setShowOverride(false)} style={m.closeBtn}><X size={18} color={C.textMuted} /></TouchableOpacity>
            </View>

            <View style={{ padding: 20 }}>
              {overrideStep === 1 ? (
                <>
                  <Text style={m.label}>Authorize Reset</Text>
                  <Text style={m.desc}>A manager must enter their 4-digit PIN to authorize a password reset for {selected?.full_name.split(' ')[0]}.</Text>
                  <TextInput
                    style={m.input} secureTextEntry keyboardType="numeric" maxLength={4}
                    placeholder="Enter Manager PIN" placeholderTextColor={C.textDim}
                    value={mgrPin} onChangeText={setMgrPin} autoFocus
                  />
                </>
              ) : (
                <>
                  <Text style={m.label}>New PIN for {selected?.full_name.split(' ')[0]}</Text>
                  <Text style={m.desc}>Authorization successful. Enter the new 4-digit PIN for this barista.</Text>
                  <TextInput
                    style={m.input} secureTextEntry keyboardType="numeric" maxLength={4}
                    placeholder="Enter New PIN" placeholderTextColor={C.textDim}
                    value={newPin} onChangeText={setNewPin} autoFocus
                  />
                </>
              )}

              {overrideErr ? <Text style={m.errorText}>{overrideErr}</Text> : null}

              <TouchableOpacity 
                style={[m.submitBtn, ((overrideStep === 1 && mgrPin.length !== 4) || (overrideStep === 2 && newPin.length !== 4)) && { opacity: 0.5 }]} 
                onPress={handleOverrideSubmit}
                disabled={overrideLoading || (overrideStep === 1 && mgrPin.length !== 4) || (overrideStep === 2 && newPin.length !== 4)}
              >
                {overrideLoading ? <Loader2 size={16} color="#111A26" style={{ width: 16, height: 16 }} /> : <Text style={m.submitBtnText}>{overrideStep === 1 ? 'Authorize' : 'Set New PIN'}</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

    </View>
  );
}

// ─────────────────────────────────────────────
// STYLES
// ─────────────────────────────────────────────
const pp = StyleSheet.create({
  wrap:        { width: '100%', alignItems: 'center' },
  userCard: { flexDirection: 'row', alignItems: 'center', width: '100%', marginBottom: 24, backgroundColor: C.surface, borderRadius: 12, padding: 12, borderWidth: 1, borderColor: C.border, gap: 12 },
  userPhoto:    { width: 52, height: 52, borderRadius: 10, overflow: 'hidden', borderWidth: 2, borderColor: C.gold, flexShrink: 0 },
  userPhotoImg: { width: '100%', height: '100%' },
  userInfo:     { flex: 1, gap: 4 },
  userName:     { fontSize: 16, fontWeight: '700', color: C.text },
  userRole:     { alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 5, backgroundColor: 'rgba(26,42,62,0.9)', borderWidth: 1, borderColor: C.border },
  userRoleMgr:  { backgroundColor: 'rgba(184,147,90,0.12)', borderColor: C.borderGold },
  userRoleText: { fontSize: 9, fontWeight: '700', color: C.textMuted, letterSpacing: 0.8, textTransform: 'uppercase' },
  switchBtn:    { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, backgroundColor: 'rgba(44,62,92,0.25)', borderWidth: 1, borderColor: C.border },
  switchText:   { fontSize: 11, fontWeight: '600', color: C.textMuted },
  dots:       { flexDirection: 'row', gap: 22, marginBottom: 10, alignItems: 'center', height: 30 },
  statusWrap: { height: 18, alignItems: 'center', justifyContent: 'center', marginBottom: 22 },
  err:    { fontSize: 12, fontWeight: '600', color: C.errorLt },
  verify: { fontSize: 12, fontWeight: '600', color: C.gold },
  hint:   { fontSize: 12, fontWeight: '400', color: C.textDim },
  keypad: { flexDirection: 'row', flexWrap: 'wrap', width: KS * 3 + 18 * 2, gap: 16, justifyContent: 'center' },
  forgotBtn: { marginTop: 24, paddingVertical: 8, paddingHorizontal: 16 },
  forgotText: { fontSize: 11, fontWeight: '600', color: C.textDim, textDecorationLine: 'underline' }
});

const s = StyleSheet.create({
  root:    { flex: 1 },
  bgDots:  { position: 'absolute', inset: 0, opacity: 0.4, backgroundColor: 'transparent' },
  glowGold:{ position: 'absolute', top: -100, right: -60, width: 340, height: 340, borderRadius: 170 },
  glowBlue:{ position: 'absolute', bottom: -80, left: -60,  width: 300, height: 300, borderRadius: 150 },

  healthBar: { position: 'absolute', bottom: 16, width: '100%', flexDirection: 'row', justifyContent: 'center', gap: 24, zIndex: 100 },
  healthItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  healthText: { fontSize: 10, fontWeight: '700', letterSpacing: 0.8, textTransform: 'uppercase', color: C.successLt },

  tablet:  { flex: 1, flexDirection: 'row' },
  left: { width: L_W, paddingTop: Platform.OS === 'android' ? 20 : 48, paddingHorizontal: L_PAD, paddingBottom: 20, borderRightWidth: 1, borderRightColor: 'rgba(44,62,92,0.2)', backgroundColor: C.bgPanel },
  right: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  clockBlock: { marginBottom: 24 },
  clockTime:  { fontSize: isTablet ? 80 : 56, fontWeight: '200', color: C.text, letterSpacing: -2, lineHeight: isTablet ? 86 : 62, fontFamily: Platform.OS === 'android' ? 'sans-serif-thin' : 'System' },
  clockDate:  { fontSize: 13, fontWeight: '600', color: C.goldLight, marginTop: 6, letterSpacing: 1.5, textTransform: 'uppercase' },
  clockGreet: { fontSize: 14, fontWeight: '400', color: C.textMuted, marginTop: 10 },

  brandRow:  { flexDirection: 'row', alignItems: 'center', marginBottom: 16 },
  brandName: { fontSize: 18, fontWeight: '800', color: C.text, letterSpacing: 3.5 },
  brandSub:  { fontSize: 9,  fontWeight: '500', color: C.gold,  letterSpacing: 2,   textTransform: 'uppercase', marginTop: 2 },

  divider:   { height: 1, backgroundColor: 'rgba(44,62,92,0.25)', marginBottom: 16 },
  selectHdr: { fontSize: 10, fontWeight: '700', color: C.textDim, letterSpacing: 2.5, textTransform: 'uppercase', marginBottom: 14 },
  grid:     { flexDirection: 'row', flexWrap: 'wrap', gap: TILE_GAP },
  loadTxt:  { color: C.textMuted, fontSize: 13, padding: 16, textAlign: 'center' },

  emptyRight: { alignItems: 'center', gap: 16, opacity: 0.5 },
  emptyTitle: { fontSize: 24, fontWeight: '800', color: C.text, letterSpacing: 4, marginTop: 16 },
  emptySub:   { fontSize: 12, color: C.textMuted, letterSpacing: 1 },

  phone:      { flexGrow: 1, paddingTop: 52, paddingHorizontal: 20, paddingBottom: 40, alignItems: 'center' },
  phoneClock: { alignItems: 'center', marginBottom: 32 },
  phoneTime:  { fontSize: 58, fontWeight: '200', color: C.text, letterSpacing: -2, fontFamily: Platform.OS === 'android' ? 'sans-serif-thin' : 'System' },
  phoneDate:  { fontSize: 13, fontWeight: '600', color: C.goldLight, marginTop: 4, letterSpacing: 1.2, textTransform: 'uppercase' },
  phoneBrand: { marginTop: 32, flexDirection: 'row', alignItems: 'center', gap: 10, opacity: 0.4 },
  phoneBrandName: { fontSize: 13, fontWeight: '800', color: C.text, letterSpacing: 3 },
});

const m = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(10,16,26,0.85)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  card: { width: '100%', maxWidth: 400, backgroundColor: C.surface, borderRadius: 16, borderWidth: 1, borderColor: 'rgba(184,147,90,0.3)', shadowColor: '#000', shadowOffset: { width: 0, height: 20 }, shadowOpacity: 0.5, shadowRadius: 30 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20, borderBottomWidth: 1, borderBottomColor: 'rgba(44,62,92,0.3)' },
  title: { fontSize: 16, fontWeight: '700', color: C.text },
  closeBtn: { width: 32, height: 32, borderRadius: 16, backgroundColor: 'rgba(44,62,92,0.3)', alignItems: 'center', justifyContent: 'center' },
  label: { fontSize: 14, fontWeight: '700', color: C.text, marginBottom: 6 },
  desc: { fontSize: 12, color: C.textMuted, lineHeight: 18, marginBottom: 20 },
  input: { backgroundColor: C.bgInput, borderWidth: 1, borderColor: 'rgba(44,62,92,0.4)', borderRadius: 10, padding: 16, color: C.text, fontSize: 24, letterSpacing: 12, textAlign: 'center', fontWeight: '700', marginBottom: 20 },
  errorText: { color: C.errorLt, fontSize: 12, fontWeight: '600', textAlign: 'center', marginBottom: 16 },
  submitBtn: { backgroundColor: C.gold, paddingVertical: 14, borderRadius: 10, alignItems: 'center' },
  submitBtnText: { color: '#111A26', fontSize: 14, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 1 },
});