import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, Animated,
  Dimensions, StatusBar, ScrollView, Image, Platform,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import * as LocalAuthentication from 'expo-local-authentication';
import { supabase } from '../lib/supabase';
import { useAuth, UserProfile } from '../hooks/useAuth';
import { useRouter } from 'expo-router';

const { width: W, height: H } = Dimensions.get('window');
const isTablet = W >= 768;

// ─────────────────────────────────────────────
// DESIGN TOKENS — Fintech-inspired dark theme
// ─────────────────────────────────────────────
const C = {
  navy:        '#1E2D45',
  navyMid:     '#2C3E5C',
  navyLight:   '#3A5070',
  gold:        '#B8935A',
  goldLight:   '#D4AE78',
  goldDim:     'rgba(184,147,90,0.15)',
  cream:       '#F5EFE4',
  bg:          '#080F18',         // deeper — more fintech
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
  biometric:   '#1A4060',
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

// ─────────────────────────────────────────────
// CREMA LOGO — uses the actual image
// ─────────────────────────────────────────────
function CremaLogo({ size = 48 }: { size?: number }) {
  return (
    <View style={{
      width: size, height: size,
      borderRadius: size * 0.18,
      overflow: 'hidden',
      borderWidth: 1.5, borderColor: C.gold,
    }}>
      <Image source={require('../assets/crema.jpg')} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
    </View>
  );
}

// ─────────────────────────────────────────────
// SECURITY TRUST BADGE
// ─────────────────────────────────────────────
function TrustBadge() {
  const pulse = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1.15, duration: 1800, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 1,    duration: 1800, useNativeDriver: true }),
      ])
    ).start();
  }, []);
  return (
    <View style={tb.wrap}>
      <Animated.View style={[tb.dot, { transform: [{ scale: pulse }] }]} />
      <Text style={tb.text}>Session Secured · PIN Protected</Text>
    </View>
  );
}
const tb = StyleSheet.create({
  wrap: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dot:  { width: 6, height: 6, borderRadius: 3, backgroundColor: C.successLt },
  text: { fontSize: 10, fontWeight: '600', color: C.textMuted, letterSpacing: 0.8 },
});

// ─────────────────────────────────────────────
// ANIMATED PIN DOT
// ─────────────────────────────────────────────
function PinDot({ filled, error }: { filled: boolean; error: boolean }) {
  const scale = useRef(new Animated.Value(1)).current;
  const bg    = useRef(new Animated.Value(0)).current;
  const prev  = useRef(false);

  useEffect(() => {
    if (filled && !prev.current) {
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
  }, [filled]);

  const dotColor = bg.interpolate({ inputRange: [0,1], outputRange: [C.gold, C.goldLight] });
  const size     = 15;

  return (
    <Animated.View style={{ transform: [{ scale }] }}>
      {filled
        ? <Animated.View style={[pd.dot, pd.filled, { backgroundColor: dotColor, width: size, height: size, borderRadius: size/2 }]} />
        : <View style={[pd.dot, error && pd.dotError, { width: size, height: size, borderRadius: size/2 }]} />
      }
    </Animated.View>
  );
}
const pd = StyleSheet.create({
  dot:       { borderWidth: 2, borderColor: C.textDim, backgroundColor: 'transparent' },
  filled:    { borderColor: C.gold },
  dotError:  { borderColor: C.errorLt },
});

// ─────────────────────────────────────────────
// KEYPAD BUTTON
// ─────────────────────────────────────────────
const KS = isTablet ? 78 : 70;

function KeyBtn({ label, onPress, variant = 'digit' }: {
  label: string; onPress: () => void; variant?: 'digit' | 'action' | 'bio';
}) {
  const sc  = useRef(new Animated.Value(1)).current;
  const glo = useRef(new Animated.Value(0)).current;

  const handlePress = useCallback(() => {
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
  }, [onPress, variant]);

  const bgMap: Record<string, [string, string]> = {
    digit:  ['rgba(26,42,60,0.9)',  'rgba(42,68,96,0.95)'],
    action: ['rgba(18,32,46,0.8)',  'rgba(28,48,68,0.9)'],
    bio:    ['rgba(26,64,96,0.5)',  'rgba(36,84,126,0.7)'],
  };
  const bgColor = glo.interpolate({ inputRange: [0,1], outputRange: bgMap[variant] });

  return (
    <Animated.View style={{ transform: [{ scale: sc }] }}>
      <TouchableOpacity onPress={handlePress} activeOpacity={1}>
        <Animated.View style={[
          kb.btn,
          variant === 'action' && kb.btnAction,
          variant === 'bio'    && kb.btnBio,
          { backgroundColor: bgColor },
        ]}>
          {variant === 'bio'
            ? <Text style={kb.bioEmoji}>👆</Text>
            : <Text style={[kb.text, variant === 'action' && kb.textAction]}>{label}</Text>
          }
        </Animated.View>
      </TouchableOpacity>
    </Animated.View>
  );
}
const kb = StyleSheet.create({
  btn: {
    width: KS, height: KS, borderRadius: KS / 2,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: 'rgba(44,62,92,0.5)',
    shadowColor: C.gold, shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0, shadowRadius: 0, elevation: 0,
  },
  btnAction: { borderColor: 'rgba(44,62,92,0.25)' },
  btnBio:    { borderColor: 'rgba(90,200,250,0.3)', borderWidth: 1.5 },
  text:       { fontSize: 24, fontWeight: '300', color: C.text, fontFamily: Platform.OS === 'ios' ? 'System' : 'sans-serif-light' },
  textAction: { fontSize: 20, fontWeight: '500', color: C.textMuted },
  bioEmoji:   { fontSize: 28 },
});

// ─────────────────────────────────────────────
// STAFF PROFILE TILE — clean card: image TOP, info BOTTOM, no overlap
// ─────────────────────────────────────────────
const TILE_GAP = 12;
const L_PAD    = 18;
const L_W      = isTablet ? W * 0.44 : W;
const TILE_W   = (L_W - L_PAD * 2 - TILE_GAP) / 2;

function ProfileTile({ person, isActive, onPress }: {
  person: UserProfile; isActive: boolean; onPress: () => void;
}) {
  const sc     = useRef(new Animated.Value(1)).current;
  const border = useRef(new Animated.Value(isActive ? 1 : 0)).current;

  useEffect(() => {
    Animated.spring(border, { toValue: isActive ? 1 : 0, useNativeDriver: false, speed: 16 }).start();
  }, [isActive]);

  const handlePress = () => {
    Haptics.selectionAsync();
    Animated.sequence([
      Animated.spring(sc, { toValue: 0.94, useNativeDriver: true, speed: 55 }),
      Animated.spring(sc, { toValue: 1,    useNativeDriver: true, speed: 38 }),
    ]).start();
    onPress();
  };

  const borderColor = border.interpolate({ inputRange: [0,1], outputRange: [C.border, C.gold] });
  const borderWidth = border.interpolate({ inputRange: [0,1], outputRange: [1, 2.5] });
  const isManager   = person.role === 'manager';

  return (
    <Animated.View style={{ width: TILE_W, transform: [{ scale: sc }] }}>
      <TouchableOpacity onPress={handlePress} activeOpacity={1}>
        <Animated.View style={[pt.card, { borderColor, borderWidth }]}>

          {/* ── PHOTO ZONE (top ~55% of card) — pure image, no text ── */}
          <View style={pt.photoZone}>
            <Image source={getAvatarSource(person)} style={pt.photo} resizeMode="cover" />
            {/* Active checkmark — top-right corner only */}
            {isActive && (
              <View style={pt.checkBadge}>
                <Text style={{ color: C.cream, fontSize: 11, fontWeight: '800' }}>✓</Text>
              </View>
            )}
          </View>

          {/* ── DIVIDER ── */}
          <View style={[pt.divider, isActive && { backgroundColor: C.gold }]} />

          {/* ── INFO ZONE (bottom ~45% of card) — text only, no image ── */}
          <View style={pt.infoZone}>
            <Text style={[pt.name, isActive && { color: C.gold }]} numberOfLines={1}>
              {person.full_name.split(' ')[0]}
            </Text>
            <Text style={pt.surname} numberOfLines={1}>
              {person.full_name.split(' ').slice(1).join(' ')}
            </Text>
            <View style={[pt.roleBadge, isManager && pt.roleBadgeMgr]}>
              <Text style={[pt.roleText, isManager && { color: C.gold }]}>
                {isManager ? '⭐ Manager' : '☕ Barista'}
              </Text>
            </View>
          </View>

        </Animated.View>
      </TouchableOpacity>
    </Animated.View>
  );
}

const PT_H = TILE_W * 1.2; // card height = 1.2× width
const pt = StyleSheet.create({
  card: {
    width: TILE_W, height: PT_H,
    borderRadius: 14, overflow: 'hidden',
    backgroundColor: C.surface,
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3, shadowRadius: 10, elevation: 6,
  },
  photoZone: { width: '100%', height: PT_H * 0.55, overflow: 'hidden', position: 'relative' },
  photo:     { width: '100%', height: '100%' },
  checkBadge:{
    position: 'absolute', top: 7, right: 7,
    width: 22, height: 22, borderRadius: 11,
    backgroundColor: C.gold, alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: C.bgCard,
    shadowColor: C.gold, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.6, shadowRadius: 4,
  },
  divider: { height: 1.5, backgroundColor: C.border, marginHorizontal: 0 },
  infoZone: {
    flex: 1, paddingHorizontal: 10, paddingTop: 8, paddingBottom: 8,
    justifyContent: 'space-between',
    backgroundColor: C.surface,
  },
  name:    { fontSize: 14, fontWeight: '700', color: C.text, lineHeight: 18 },
  surname: { fontSize: 11, fontWeight: '400', color: C.textMuted, lineHeight: 15, marginTop: 1 },
  roleBadge: {
    marginTop: 5, alignSelf: 'flex-start',
    paddingHorizontal: 7, paddingVertical: 3,
    borderRadius: 5, backgroundColor: 'rgba(26,42,62,0.9)',
    borderWidth: 1, borderColor: C.border,
  },
  roleBadgeMgr: { backgroundColor: 'rgba(184,147,90,0.12)', borderColor: C.borderGold },
  roleText: { fontSize: 9, fontWeight: '700', color: C.textMuted, letterSpacing: 0.8, textTransform: 'uppercase' },
});

// ─────────────────────────────────────────────
// PHONE PROFILE CARD — horizontal scroll variant
// ─────────────────────────────────────────────
const PC_W = 100;
const PC_H = 132;

function PhoneCard({ person, isActive, onPress }: {
  person: UserProfile; isActive: boolean; onPress: () => void;
}) {
  const sc = useRef(new Animated.Value(1)).current;
  const handlePress = () => {
    Haptics.selectionAsync();
    Animated.sequence([
      Animated.spring(sc, { toValue: 0.92, useNativeDriver: true, speed: 60 }),
      Animated.spring(sc, { toValue: 1,    useNativeDriver: true, speed: 38 }),
    ]).start();
    onPress();
  };
  const isManager = person.role === 'manager';
  return (
    <Animated.View style={{ transform: [{ scale: sc }], width: PC_W }}>
      <TouchableOpacity onPress={handlePress} activeOpacity={1}>
        <View style={[pc.card, isActive && pc.cardActive]}>
          {/* Photo zone */}
          <View style={pc.photoZone}>
            <Image source={getAvatarSource(person)} style={pc.photo} resizeMode="cover" />
            {isActive && (
              <View style={pc.check}><Text style={{ color: C.cream, fontSize: 9, fontWeight: '800' }}>✓</Text></View>
            )}
          </View>
          {/* Divider */}
          <View style={[pc.divider, isActive && { backgroundColor: C.gold }]} />
          {/* Info zone */}
          <View style={pc.infoZone}>
            <Text style={[pc.name, isActive && { color: C.gold }]} numberOfLines={1}>
              {person.full_name.split(' ')[0]}
            </Text>
            <View style={[pc.badge, isManager && pc.badgeMgr]}>
              <Text style={[pc.badgeText, isManager && { color: C.gold }]}>
                {isManager ? 'Manager' : 'Barista'}
              </Text>
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
  const [pin,       setPin]       = useState('');
  const [staff,     setStaff]     = useState<UserProfile[]>([]);
  const [selected,  setSelected]  = useState<UserProfile | null>(null);
  const [loading,   setLoading]   = useState(true);
  const [verifying, setVerifying] = useState(false);
  const [pinError,  setPinError]  = useState(false);
  const [bioAvail,  setBioAvail]  = useState(false);
  const [now,       setNow]       = useState(new Date());

  const { setSession } = useAuth();
  const router         = useRouter();

  const shakeX    = useRef(new Animated.Value(0)).current;
  const gridAlpha = useRef(new Animated.Value(1)).current;
  const tileAnims = useRef<Animated.Value[]>([]).current;

  // Clock
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  // Check biometric availability
  useEffect(() => {
    LocalAuthentication.hasHardwareAsync().then(has => {
      if (has) LocalAuthentication.isEnrolledAsync().then(enrolled => setBioAvail(enrolled));
    });
  }, []);

  // Fetch staff
  useEffect(() => {
    (async () => {
      const { data } = await supabase.from('profiles').select('*')
        .in('role', ['barista', 'manager']).eq('status', 'active').order('full_name');
      const people = (data as UserProfile[]) ?? [];
      setStaff(people);
      people.forEach((_, i) => { if (!tileAnims[i]) tileAnims[i] = new Animated.Value(0); });
      Animated.stagger(55, people.map((_, i) =>
        Animated.spring(tileAnims[i], { toValue: 1, useNativeDriver: true, speed: 16, bounciness: 5 })
      )).start();
      setLoading(false);
    })();
  }, []);

  // Grid fade on selection
  useEffect(() => {
    Animated.timing(gridAlpha, {
      toValue: selected ? 0 : 1, duration: selected ? 160 : 240, useNativeDriver: true,
    }).start();
  }, [selected?.id]);

  const handleSelect = (person: UserProfile) => {
    if (selected?.id === person.id) return;
    setSelected(person); setPin(''); setPinError(false);
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
    if (verifying) return;
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
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setSession(data as UserProfile);
      router.replace(data.role === 'manager' ? '/admin' : '/pos');
    } else {
      shake(); setPinError(true); setPin(''); setVerifying(false);
    }
  };

  const handleBiometric = async () => {
    if (!selected) return;
    const result = await LocalAuthentication.authenticateAsync({
      promptMessage: `Verify identity for ${selected.full_name}`,
      fallbackLabel: 'Use PIN instead',
      disableDeviceFallback: false,
    });
    if (result.success) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setSession(selected);
      router.replace(selected.role === 'manager' ? '/admin' : '/pos');
    } else {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    }
  };

  const timeStr = now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
  const dateStr = now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
  const KEYS    = ['1','2','3','4','5','6','7','8','9','C','0','⌫'];

  // ── PIN PANEL ──
  const PinPanel = () => (
    <View style={pp.wrap}>
      {/* Selected user header — horizontal card */}
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
          <TrustBadge />
        </View>
        <TouchableOpacity style={pp.switchBtn} onPress={() => { setSelected(null); setPin(''); setPinError(false); }}>
          <Text style={pp.switchText}>Switch</Text>
        </TouchableOpacity>
      </View>

      {/* PIN dots */}
      <Animated.View style={[pp.dots, { transform: [{ translateX: shakeX }] }]}>
        {[0,1,2,3].map(i => <PinDot key={i} filled={i < pin.length} error={pinError} />)}
      </Animated.View>

      {/* Status line */}
      <View style={pp.statusWrap}>
        {pinError   && <Text style={pp.err}>Incorrect PIN — please try again</Text>}
        {verifying  && <Text style={pp.verify}>Authenticating…</Text>}
        {!pinError && !verifying && pin.length === 0 && <Text style={pp.hint}>Enter your 4-digit PIN</Text>}
      </View>

      {/* Keypad */}
      <View style={pp.keypad}>
        {KEYS.map((k, i) => {
          // Replace '0' slot or add biometric as last key
          if (k === 'C' && bioAvail) {
            return <KeyBtn key="bio" label="bio" variant="bio" onPress={handleBiometric} />;
          }
          return (
            <KeyBtn key={k} label={k}
              variant={k === 'C' || k === '⌫' ? 'action' : 'digit'}
              onPress={() => pressKey(k)} />
          );
        })}
      </View>
    </View>
  );

  // Helpers
  const timeH   = now.getHours();
  const greeting = timeH < 12 ? 'Good morning' : timeH < 17 ? 'Good afternoon' : 'Good evening';

  // ── RENDER ──
  return (
    <View style={s.root}>
      <StatusBar barStyle="light-content" backgroundColor={C.bg} />

      {/* Deep space background dots */}
      <View style={s.bgDots} pointerEvents="none" />
      <View style={s.glowGold}   pointerEvents="none" />
      <View style={s.glowBlue}   pointerEvents="none" />

      {isTablet ? (
        // ════════════════════════════════
        // TABLET — two-column layout
        // ════════════════════════════════
        <View style={s.tablet}>

          {/* ── LEFT PANEL ── */}
          <View style={s.left}>

            {/* Big lockscreen clock */}
            <View style={s.clockBlock}>
              <Text style={s.clockTime}>{timeStr}</Text>
              <Text style={s.clockDate}>{dateStr}</Text>
              <Text style={s.clockGreet}>{greeting} 👋</Text>
            </View>

            {/* Brand row */}
            <View style={s.brandRow}>
              <CremaLogo size={42} />
              <View style={{ marginLeft: 12 }}>
                <Text style={s.brandName}>CREMA</Text>
                <Text style={s.brandSub}>Coffee &amp; Ice Cream · POS</Text>
              </View>
            </View>

            <View style={s.divider} />

            {/* ── GRID or PIN ── */}
            {selected ? (
              <View style={{ flex: 1, justifyContent: 'center', paddingBottom: 16 }}>
                <PinPanel />
              </View>
            ) : (
              <>
                <Text style={s.selectHdr}>Select profile to unlock</Text>
                <Animated.ScrollView showsVerticalScrollIndicator={false}
                  style={[{ flex: 1 }, { opacity: gridAlpha }]}
                  contentContainerStyle={{ paddingBottom: 24 }}>
                  {loading
                    ? <Text style={s.loadTxt}>Loading…</Text>
                    : (
                      <View style={s.grid}>
                        {staff.map((p, idx) => {
                          const anim = tileAnims[idx] ?? new Animated.Value(1);
                          return (
                            <Animated.View key={p.id} style={{
                              opacity: anim,
                              transform: [
                                { translateY: anim.interpolate({ inputRange:[0,1], outputRange:[20,0] }) },
                                { scale:      anim.interpolate({ inputRange:[0,1], outputRange:[0.9,1]  }) },
                              ],
                            }}>
                              <ProfileTile person={p} isActive={false} onPress={() => handleSelect(p)} />
                            </Animated.View>
                          );
                        })}
                      </View>
                    )
                  }
                </Animated.ScrollView>
              </>
            )}
          </View>

          {/* ── RIGHT PANEL — branding / empty ── */}
          <View style={s.right}>
            {!selected && (
              <View style={s.emptyRight}>
                <CremaLogo size={100} />
                <Text style={s.emptyTitle}>CREMA POS</Text>
                <Text style={s.emptySub}>Point of Sale · Staff Login</Text>
                <View style={s.emptyBadge}>
                  <Text style={s.emptyBadgeTxt}>🔒  End-to-end secured</Text>
                </View>
              </View>
            )}
          </View>

        </View>
      ) : (
        // ════════════════════════════════
        // PHONE — stacked layout
        // ════════════════════════════════
        <ScrollView contentContainerStyle={s.phone} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">

          {/* Clock */}
          <View style={s.phoneClock}>
            <Text style={s.phoneTime}>{timeStr}</Text>
            <Text style={s.phoneDate}>{dateStr}</Text>
          </View>

          <Text style={s.selectHdr}>{selected ? 'Enter your PIN' : 'Select profile to unlock'}</Text>

          {/* Staff scroll — hidden when selected */}
          {!selected && (
            <Animated.ScrollView horizontal showsHorizontalScrollIndicator={false}
              style={[{ marginBottom: 24 }, { opacity: gridAlpha }]}
              contentContainerStyle={{ gap: 12, paddingHorizontal: 2 }}>
              {staff.map((p, idx) => {
                const anim = tileAnims[idx] ?? new Animated.Value(1);
                return (
                  <Animated.View key={p.id} style={{
                    opacity: anim,
                    transform: [{ scale: anim.interpolate({ inputRange:[0,1], outputRange:[0.85,1] }) }],
                  }}>
                    <PhoneCard person={p} isActive={false} onPress={() => handleSelect(p)} />
                  </Animated.View>
                );
              })}
            </Animated.ScrollView>
          )}

          {selected && <PinPanel />}

          {!selected && (
            <View style={s.phoneBrand}>
              <CremaLogo size={30} />
              <Text style={s.phoneBrandName}>CREMA POS</Text>
            </View>
          )}
        </ScrollView>
      )}
    </View>
  );
}

// ─────────────────────────────────────────────
// PIN PANEL STYLES
// ─────────────────────────────────────────────
const pp = StyleSheet.create({
  wrap:        { width: '100%', alignItems: 'center' },
  userCard: {
    flexDirection: 'row', alignItems: 'center',
    width: '100%', marginBottom: 24,
    backgroundColor: C.surface,
    borderRadius: 12, padding: 12,
    borderWidth: 1, borderColor: C.border,
    gap: 12,
  },
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
});

// ─────────────────────────────────────────────
// MAIN STYLES
// ─────────────────────────────────────────────
const s = StyleSheet.create({
  root:    { flex: 1, backgroundColor: C.bg },
  bgDots:  { position: 'absolute', inset: 0, opacity: 0.4, backgroundColor: 'transparent' },
  glowGold:{ position: 'absolute', top: -100, right: -60, width: 340, height: 340, borderRadius: 170, backgroundColor: 'rgba(184,147,90,0.04)' },
  glowBlue:{ position: 'absolute', bottom: -80, left: -60,  width: 300, height: 300, borderRadius: 150, backgroundColor: 'rgba(44,100,160,0.07)' },

  // Tablet
  tablet:  { flex: 1, flexDirection: 'row' },
  left: {
    width: L_W,
    paddingTop: Platform.OS === 'android' ? 20 : 48,
    paddingHorizontal: L_PAD,
    paddingBottom: 20,
    borderRightWidth: 1, borderRightColor: 'rgba(44,62,92,0.2)',
    backgroundColor: C.bgPanel,
  },
  right: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  // Clock (tablet)
  clockBlock: { marginBottom: 24 },
  clockTime:  { fontSize: isTablet ? 80 : 56, fontWeight: '200', color: C.text, letterSpacing: -2, lineHeight: isTablet ? 86 : 62, fontFamily: Platform.OS === 'android' ? 'sans-serif-thin' : 'System' },
  clockDate:  { fontSize: 13, fontWeight: '600', color: C.goldLight, marginTop: 6, letterSpacing: 1.5, textTransform: 'uppercase' },
  clockGreet: { fontSize: 14, fontWeight: '400', color: C.textMuted, marginTop: 10 },

  // Brand row (tablet)
  brandRow:  { flexDirection: 'row', alignItems: 'center', marginBottom: 16 },
  brandName: { fontSize: 18, fontWeight: '800', color: C.text, letterSpacing: 3.5 },
  brandSub:  { fontSize: 9,  fontWeight: '500', color: C.gold,  letterSpacing: 2,   textTransform: 'uppercase', marginTop: 2 },

  divider:   { height: 1, backgroundColor: 'rgba(44,62,92,0.25)', marginBottom: 16 },
  selectHdr: { fontSize: 10, fontWeight: '700', color: C.textDim, letterSpacing: 2.5, textTransform: 'uppercase', marginBottom: 14 },

  grid:     { flexDirection: 'row', flexWrap: 'wrap', gap: TILE_GAP },
  loadTxt:  { color: C.textMuted, fontSize: 13, padding: 16, textAlign: 'center' },

  // Right panel empty
  emptyRight: { alignItems: 'center', gap: 16, opacity: 0.5 },
  emptyTitle: { fontSize: 24, fontWeight: '800', color: C.text, letterSpacing: 4, marginTop: 16 },
  emptySub:   { fontSize: 12, color: C.textMuted, letterSpacing: 1 },
  emptyBadge: { marginTop: 8, paddingHorizontal: 14, paddingVertical: 7, borderRadius: 100, backgroundColor: 'rgba(26,122,74,0.15)', borderWidth: 1, borderColor: 'rgba(26,122,74,0.3)' },
  emptyBadgeTxt: { fontSize: 11, fontWeight: '600', color: C.successLt, letterSpacing: 0.5 },

  // Phone
  phone:      { flexGrow: 1, paddingTop: 52, paddingHorizontal: 20, paddingBottom: 40, alignItems: 'center' },
  phoneClock: { alignItems: 'center', marginBottom: 32 },
  phoneTime:  { fontSize: 58, fontWeight: '200', color: C.text, letterSpacing: -2, fontFamily: Platform.OS === 'android' ? 'sans-serif-thin' : 'System' },
  phoneDate:  { fontSize: 13, fontWeight: '600', color: C.goldLight, marginTop: 4, letterSpacing: 1.2, textTransform: 'uppercase' },
  phoneBrand: { marginTop: 32, flexDirection: 'row', alignItems: 'center', gap: 10, opacity: 0.4 },
  phoneBrandName: { fontSize: 13, fontWeight: '800', color: C.text, letterSpacing: 3 },
});