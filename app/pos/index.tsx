import React, { useEffect, useState, useMemo, useRef, useCallback } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet,
  ScrollView, SafeAreaView, TextInput, Image,
  Animated, Dimensions, StatusBar, Platform,
  KeyboardAvoidingView,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import * as Network from 'expo-network';
import { supabase } from '../../.vscode/lib/supabase';
import { fetchMenuOfflineFirst, syncOutbox } from '../../.vscode/lib/syncEngine';
import { useCart } from '../../hooks/useCart';
import {
  LogOut, Search, X, Plus, Minus, ChevronRight,
  ShoppingBag, AlertTriangle, Check, Loader,
  SlidersHorizontal, Coffee, WifiOff,
  // ── Added Lucide Icons for Helpers ──
  IceCream, CupSoda, Croissant, Droplet, Snowflake, Cloud, Flame, Leaf, Sparkles, GlassWater
} from 'lucide-react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '../../hooks/useAuth';

const { width: W, height: H } = Dimensions.get('window');
const isTablet = W >= 768;

// ─────────────────────────────────────────────
// DESIGN TOKENS
// ─────────────────────────────────────────────
const C = {
  navy:       '#1E2D45',
  navyMid:    '#2C3E5C',
  navyLight:  '#3A5070',
  gold:       '#B8935A',
  goldLight:  '#D4AE78',
  cream:      '#F5EFE4',
  creamDeep:  '#EDE4D6',
  bg:         '#0F1923',
  bgCard:     '#162030',
  bgCardMid:  '#1A2840',
  text:       '#F5EFE4',
  textMuted:  '#8A9BB0',
  textDim:    '#4A6080',
  success:    '#2C7A4B',
  danger:     '#7A2E35',
  dangerLt:   '#C07070',
};

const CAT_COLORS = ['#2C3E5C','#3A6B8A','#7A5030','#4A6B4A','#4A3580','#6B3A5C'];
function getCatColor(cat: string, cats: string[]): string {
  const idx = cats.filter(c => c !== 'All').indexOf(cat);
  return CAT_COLORS[idx % CAT_COLORS.length] ?? C.navyMid;
}

// ─────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────
type ModifierOption = {
  id: string;
  modifier_group_id: string;
  name: string;
  price_adjustment: number;
  sort_order: number;
};
type ModifierGroup = {
  id: string;
  name: string;
  is_required: boolean;
  multi_select: boolean;
  sort_order: number;
  options: ModifierOption[];
};
type MenuItem = {
  id: string;
  name: string;
  price: number;
  is_active: boolean;
  category: string;
  image_url: string | null;
  modifierGroups: ModifierGroup[];
};
type SelectedMods = Record<string, ModifierOption[]>;

// ─────────────────────────────────────────────
// HELPERS (Now with SVGs)
// ─────────────────────────────────────────────
export function modTotal(sel: SelectedMods) {
  return Object.values(sel).flat().reduce((s, o) => s + o.price_adjustment, 0);
}

export function CatIcon({ cat, size, color, style }: { cat: string, size: number, color: string, style?: any }) {
  const c = cat ? cat.toLowerCase() : '';
  
  let Icon = Coffee;
  if (c.includes('ice'))  Icon = IceCream;
  else if (c.includes('cold')) Icon = CupSoda;
  else if (c.includes('past')) Icon = Croissant;

  return (
    <View style={style}>
      <Icon size={size} color={color} strokeWidth={1.5} />
    </View>
  );
}

export function ModIcon({ name, size, color }: { name: string, size: number, color: string }) {
  const n = name ? name.toLowerCase() : '';
  
  let Icon = Sparkles;
  if (n.includes('milk') || n.includes('oat') || n.includes('soy') || n.includes('almond')) Icon = GlassWater;
  else if (n.includes('sugar') || n.includes('syrup') || n.includes('sweet') || n.includes('caramel') || n.includes('vanilla')) Icon = Droplet;
  else if (n.includes('ice') || n.includes('cold')) Icon = Snowflake;
  else if (n.includes('shot') || n.includes('espresso') || n.includes('coffee') || n.includes('roast')) Icon = Coffee;
  else if (n.includes('cream') || n.includes('whip') || n.includes('foam')) Icon = Cloud;
  else if (n.includes('hot') || n.includes('warm') || n.includes('extra hot')) Icon = Flame;
  else if (n.includes('decaf')) Icon = Leaf;
  else if (n.includes('size') || n.includes('large') || n.includes('small') || n.includes('medium') || n.includes('grande') || n.includes('venti')) Icon = CupSoda;

  return <Icon size={size} color={color} strokeWidth={1.5} />;
}

// ─────────────────────────────────────────────
// ANIMATED PRESS WRAPPER
// ─────────────────────────────────────────────
function Tap({ style, onPress, children, disabled }: any) {
  const sc = useRef(new Animated.Value(1)).current;
  const press = () => {
    if (disabled) return;
    Animated.sequence([
      Animated.spring(sc, { toValue: 0.94, useNativeDriver: false, speed: 60 }),
      Animated.spring(sc, { toValue: 1,    useNativeDriver: false, speed: 40 }),
    ]).start();
    onPress?.();
  };
  return (
    <Animated.View style={[{ transform: [{ scale: sc }] }, style]}>
      <TouchableOpacity onPress={press} activeOpacity={0.9} disabled={disabled}>
        {children}
      </TouchableOpacity>
    </Animated.View>
  );
}

// ─────────────────────────────────────────────
// CARD COMPONENT
// ─────────────────────────────────────────────
function MenuCard({ item, catColor, onPress }: { item: MenuItem; catColor: string; onPress: () => void }) {
  const sc   = useRef(new Animated.Value(1)).current;
  const glow = useRef(new Animated.Value(0)).current;

  const handlePress = () => {
    Animated.sequence([
      Animated.spring(sc, { toValue: 0.95, useNativeDriver: false, speed: 60 }),
      Animated.spring(sc, { toValue: 1,    useNativeDriver: false, speed: 40 }),
    ]).start();
    Animated.sequence([
      Animated.timing(glow, { toValue: 1, duration: 120, useNativeDriver: false }),
      Animated.timing(glow, { toValue: 0, duration: 300, useNativeDriver: false }),
    ]).start();
    onPress();
  };

  const borderColor = glow.interpolate({ inputRange: [0,1], outputRange: ['rgba(184,147,90,0.15)', 'rgba(184,147,90,0.7)'] });

  return (
    <Animated.View style={[sd.card, { transform: [{ scale: sc }], borderColor }]}>
      <TouchableOpacity onPress={handlePress} activeOpacity={1} style={{ flex: 1 }}>
        <View style={[sd.cardImg, { backgroundColor: `${catColor}18` }]}>
          {item.image_url
            ? <Image source={{ uri: item.image_url }} style={StyleSheet.absoluteFillObject} resizeMode="cover" />
            : (
              <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
                <CatIcon cat={item.category} size={isTablet ? 40 : 32} color={C.gold} />
              </View>
            )
          }
          <View style={[sd.catBadge, { backgroundColor: catColor }]}>
            <Text style={sd.catBadgeText}>{item.category}</Text>
          </View>
          <View style={sd.cardImgOverlay} />
        </View>

        <View style={sd.cardBody}>
          <Text style={sd.cardName} numberOfLines={2}>{item.name}</Text>
          <View style={sd.cardFooter}>
            <Text style={sd.cardPrice}>₱{item.price}</Text>
            <View style={sd.addBadge}>
              <Plus size={isTablet ? 16 : 13} color={C.cream} strokeWidth={3} />
            </View>
          </View>
        </View>
      </TouchableOpacity>
    </Animated.View>
  );
}

// ─────────────────────────────────────────────
// SIDEBAR / BOTTOM SHEET MODIFIER PANEL
// ─────────────────────────────────────────────
function ModifierSidebar({
  item, categories, selMods, setSelMods, qty, setQty, note, setNote,
  onClose, onAddToCart, isValid,
}: {
  item: MenuItem;
  categories: string[];
  selMods: SelectedMods;
  setSelMods: (fn: (prev: SelectedMods) => SelectedMods) => void;
  qty: number;
  setQty: (fn: (q: number) => number) => void;
  note: string;
  setNote: (n: string) => void;
  onClose: () => void;
  onAddToCart: () => void;
  isValid: boolean;
}) {
  const slideAnim = useRef(new Animated.Value(isTablet ? W : H)).current;
  const fadeV  = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.spring(slideAnim, { toValue: 0, useNativeDriver: true, speed: 18, bounciness: 3 }),
      Animated.timing(fadeV,  { toValue: 1, duration: 220,         useNativeDriver: true }),
    ]).start();
  }, []);

  const close = () => {
    Animated.parallel([
      Animated.timing(slideAnim, { toValue: isTablet ? W : H, duration: 260, useNativeDriver: true }),
      Animated.timing(fadeV,  { toValue: 0, duration: 200, useNativeDriver: true }),
    ]).start(onClose);
  };

  const toggleMod = (group: ModifierGroup, opt: ModifierOption) => {
    setSelMods(prev => {
      const cur = prev[group.id] ?? [];
      if (group.multi_select) {
        const exists = cur.find(o => o.id === opt.id);
        return { ...prev, [group.id]: exists ? cur.filter(o => o.id !== opt.id) : [...cur, opt] };
      }
      const same = cur.find(o => o.id === opt.id);
      return { ...prev, [group.id]: same ? [] : [opt] };
    });
  };

  const isSelected = (gid: string, oid: string) => (selMods[gid] ?? []).some(o => o.id === oid);
  const catColor   = getCatColor(item.category, categories);
  const total      = (item.price + modTotal(selMods)) * qty;

  const panelLayoutStyles = isTablet 
    ? [sb.panelTablet, { transform: [{ translateX: slideAnim }] }]
    : [sb.panelMobile, { transform: [{ translateY: slideAnim }] }];

  return (
    <>
      <Animated.View style={[sb.backdrop, { opacity: fadeV }]}>
        <TouchableOpacity style={StyleSheet.absoluteFillObject} activeOpacity={1} onPress={close} />
      </Animated.View>

      <Animated.View style={panelLayoutStyles}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          
          {!isTablet && (
            <View style={sb.mobileHandleWrap}>
              <View style={sb.mobileHandle} />
            </View>
          )}

          {isTablet && <View style={sb.topAccent} />}

          <View style={sb.header}>
            <View style={[sb.headerThumb, { backgroundColor: `${catColor}22` }]}>
              {item.image_url
                ? <Image source={{ uri: item.image_url }} style={StyleSheet.absoluteFillObject} resizeMode="cover" />
                : <CatIcon cat={item.category} size={26} color={C.gold} />
              }
            </View>
            <View style={{ flex: 1 }}>
              <Text style={sb.headerCat}>{item.category}</Text>
              <Text style={sb.headerName} numberOfLines={2}>{item.name}</Text>
              <Text style={sb.headerBase}>Base ₱{item.price}</Text>
            </View>
            <TouchableOpacity style={sb.closeBtn} onPress={close}>
              <X size={16} color={C.textMuted} />
            </TouchableOpacity>
          </View>

          <View style={sb.qtyBar}>
            <Text style={sb.sectionLabel}>Quantity</Text>
            <View style={sb.qtyRow}>
              <TouchableOpacity style={sb.qtyBtn} onPress={() => setQty(q => Math.max(1, q - 1))}>
                <Minus size={14} color={C.navyMid} strokeWidth={3} />
              </TouchableOpacity>
              <Text style={sb.qtyNum}>{qty}</Text>
              <TouchableOpacity style={[sb.qtyBtn, sb.qtyPlus]} onPress={() => setQty(q => q + 1)}>
                <Plus size={14} color={C.cream} strokeWidth={3} />
              </TouchableOpacity>
            </View>
          </View>

          <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false} contentContainerStyle={sb.scroll}>
            {item.modifierGroups.length === 0 ? (
              <View style={sb.noMods}>
                <SlidersHorizontal size={24} color={C.textDim} />
                <Text style={sb.noModsText}>No customisation options for this item.</Text>
              </View>
            ) : item.modifierGroups.map(group => (
              <View key={group.id} style={sb.group}>
                <View style={sb.groupHeader}>
                  <Text style={sb.groupName}>{group.name}</Text>
                  <View style={{ flexDirection: 'row', gap: 6 }}>
                    {group.is_required && (
                      <View style={sb.reqBadge}><Text style={sb.reqText}>Required</Text></View>
                    )}
                    {group.multi_select && (
                      <View style={sb.multiBadge}><Text style={sb.multiText}>Pick many</Text></View>
                    )}
                  </View>
                </View>

                <View style={sb.optGrid}>
                  {group.options.map(opt => {
                    const active = isSelected(group.id, opt.id);
                    return (
                      <TouchableOpacity
                        key={opt.id}
                        style={[sb.optTile, active && sb.optTileActive]}
                        onPress={() => toggleMod(group, opt)}
                        activeOpacity={0.8}
                      >
                        {active && (
                          <View style={sb.optTileCheckBadge}>
                            <Check size={10} color={C.cream} strokeWidth={3.5} />
                          </View>
                        )}
                        <View style={[sb.optTileImgWrap, active && { backgroundColor: `${C.gold}25` }]}>
                          <ModIcon name={opt.name} size={20} color={active ? C.gold : C.textDim} />
                        </View>
                        <Text style={[sb.optTileName, active && sb.optTileNameActive]} numberOfLines={2}>
                          {opt.name}
                        </Text>
                        {opt.price_adjustment !== 0 && (
                          <Text style={[sb.optTilePrice, active && sb.optTilePriceActive]}>
                            {opt.price_adjustment > 0 ? '+' : ''}₱{opt.price_adjustment}
                          </Text>
                        )}
                      </TouchableOpacity>
                    );
                  })}
                </View>

                {group.is_required && !(selMods[group.id]?.length) && (
                  <View style={sb.reqWarn}>
                    <AlertTriangle size={11} color={C.dangerLt} />
                    <Text style={sb.reqWarnText}>Please pick an option</Text>
                  </View>
                )}
              </View>
            ))}

            <View style={sb.noteBlock}>
              <Text style={sb.sectionLabel}>Special Instructions</Text>
              <TextInput
                style={sb.noteInput}
                placeholder="e.g. Extra hot, no foam, less ice…"
                placeholderTextColor={C.textDim}
                value={note}
                onChangeText={setNote}
                multiline
                maxLength={120}
              />
              <Text style={sb.noteCount}>{note.length}/120</Text>
            </View>
          </ScrollView>

          <View style={sb.footer}>
            {!isValid && (
              <View style={sb.validRow}>
                <AlertTriangle size={13} color={C.dangerLt} />
                <Text style={sb.validText}>Select all required options first</Text>
              </View>
            )}
            <Tap
              style={[sb.cta, !isValid && sb.ctaDisabled]}
              onPress={isValid ? onAddToCart : undefined}
              disabled={!isValid}
            >
              <View style={sb.ctaInner}>
                <ShoppingBag size={18} color={C.cream} />
                <Text style={sb.ctaLabel}>
                  Add {qty > 1 ? `${qty}×` : ''} to Order
                </Text>
                <View style={sb.ctaPrice}>
                  <Text style={sb.ctaPriceText}>₱{total.toFixed(0)}</Text>
                </View>
              </View>
            </Tap>
          </View>
        </KeyboardAvoidingView>
      </Animated.View>
    </>
  );
}

// ─────────────────────────────────────────────
// MAIN SCREEN
// ─────────────────────────────────────────────
export default function POSMenu() {
  const [menuItems,  setMenuItems]  = useState<MenuItem[]>([]);
  const [categories, setCategories] = useState<string[]>(['All']);
  const [selCat,     setSelCat]     = useState('All');
  const [search,     setSearch]     = useState('');
  const [loading,    setLoading]    = useState(true);
  const [error,      setError]      = useState('');
  
  // ── QUEUE COUNT STATE ──
  const [queueCount, setQueueCount] = useState(0);

  // ── OFFLINE STATE ──
  const [isOffline, setIsOffline] = useState(false);

  // Sidebar state
  const [selItem,    setSelItem]    = useState<MenuItem | null>(null);
  const [selMods,    setSelMods]    = useState<SelectedMods>({});
  const [note,       setNote]       = useState('');
  const [qty,        setQty]        = useState(1);

  const { cart, addItem, total } = useCart();
  const { currentUser, logout }  = useAuth();
  const router = useRouter();

  // ── Network Monitor ──
  useEffect(() => {
    const checkNetwork = async () => {
      const state = await Network.getNetworkStateAsync();
      setIsOffline(!(state.isConnected && state.isInternetReachable));
    };
    checkNetwork();
    const interval = setInterval(checkNetwork, 5000); 
    return () => clearInterval(interval);
  }, []);
  
  // ── Fetch Queue Count ──
  useEffect(() => {
    const fetchQueueCount = async () => {
      if (isOffline) return;
      try {
        const { count, error } = await supabase
          .from('orders')
          .select('id', { count: 'exact', head: true })
          .eq('status', 'pending');
        if (!error && count !== null) {
          setQueueCount(count);
        }
      } catch (e) {
        console.log("Could not fetch queue count");
      }
    };
    
    // Fetch initially and then poll every 5 seconds
    fetchQueueCount();
    const interval = setInterval(fetchQueueCount, 5000);
    return () => clearInterval(interval);
  }, [isOffline]);

  // ── Fetch (Offline-First) Menu ──
  const fetchData = useCallback(async () => {
    setLoading(true); setError('');
    try {
      if (!isOffline) {
        await syncOutbox();
      }

      const items = await fetchMenuOfflineFirst();

      let groups: any[] = [];
      let options: any[] = [];
      let itemMods: any[] = [];
      
      if (!isOffline) {
        try {
          const [gRes, oRes, imRes] = await Promise.all([
            supabase.from('modifier_groups').select('*').order('sort_order'),
            supabase.from('modifier_options').select('*').order('sort_order'),
            supabase.from('menu_item_modifiers').select('menu_item_id,modifier_group_id'),
          ]);
          groups = gRes.data ?? [];
          options = oRes.data ?? [];
          itemMods = imRes.data ?? [];
        } catch(e) {
          console.log("Could not fetch modifiers due to network");
        }
      }

      const groupMap: Record<string, ModifierGroup> = {};
      groups.forEach((g: any) => { groupMap[g.id] = { ...g, options: [] }; });
      options.forEach((o: any) => { groupMap[o.modifier_group_id]?.options.push(o); });

      const itemGroupMap: Record<string, string[]> = {};
      itemMods.forEach((im: any) => {
        if (!itemGroupMap[im.menu_item_id]) itemGroupMap[im.menu_item_id] = [];
        itemGroupMap[im.menu_item_id].push(im.modifier_group_id);
      });

      const enriched: MenuItem[] = (items ?? []).map((item: any) => {
        const gids = itemGroupMap[item.id] ?? [];
        const applicable = gids.length
          ? gids.map((id: string) => groupMap[id]).filter(Boolean)
          : Object.values(groupMap);
        return { ...item, modifierGroups: applicable.sort((a, b) => a.sort_order - b.sort_order) };
      });

      setMenuItems(enriched);
      const cats = ['All', ...new Set((items ?? []).map((p: any) => p.category ?? 'Other'))];
      setCategories(cats as string[]);
    } catch (err: any) {
      setError(err.message ?? 'Failed to load menu');
    } finally {
      setLoading(false);
    }
  }, [isOffline]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const openSidebar = (item: MenuItem) => {
    setSelItem(item); setSelMods({}); setNote(''); setQty(1);
  };

  const handleAddToCart = () => {
    if (!selItem) return;
    const modArray  = Object.values(selMods).flat().map(o => ({ name: o.name, price: o.price_adjustment }));
    const unitPrice = selItem.price + modTotal(selMods);
    for (let i = 0; i < qty; i++) {
      addItem({ ...selItem, unitPrice, note }, modArray);
    }
    setSelItem(null);
  };

  const isValid = !selItem?.modifierGroups.some(g => g.is_required && !(selMods[g.id]?.length));

  const filtered = useMemo(() => menuItems.filter(item =>
    (selCat === 'All' || item.category === selCat) &&
    item.name.toLowerCase().includes(search.toLowerCase())
  ), [menuItems, selCat, search]);

  const greetHour = new Date().getHours();
  const greeting  = greetHour < 12 ? 'Morning' : greetHour < 17 ? 'Afternoon' : 'Evening';
  const cartCount = cart.reduce((s: number, i: any) => s + (i.qty ?? 1), 0);

  // ── RENDER ──
  return (
    <SafeAreaView style={s.root}>
      <StatusBar barStyle="light-content" backgroundColor={C.bg} />

      {/* ── OFFLINE BANNER ── */}
      {isOffline && (
        <View style={s.offlineBanner}>
          <WifiOff size={14} color="#FFF" />
          <Text style={s.offlineText}>
            No Internet Connection. Orders are saving locally.
          </Text>
        </View>
      )}

      <View style={s.layout}>

        {/* ══ LEFT / TOP : Menu area ══ */}
        <View style={s.mainArea}>

          {/* HEADER */}
          <View style={[s.header, isOffline && { paddingTop: 12 }]}>
            <View style={s.headerLogo}>
              <View style={s.logoImageWrap}>
                <Image 
                  source={require('../../assets/crema.jpg')} 
                  style={s.logoImage} 
                  resizeMode="cover" 
                />
              </View>

              <View style={{ flex: 1, paddingRight: 8 }}>
                <Text style={s.brandLabel}>CREMA POS</Text>
                <Text style={s.greeting} numberOfLines={1} ellipsizeMode="tail">
                  Good {greeting}, {currentUser?.full_name?.split(' ')[0] ?? 'Barista'}
                </Text>
              </View>
            </View>

            <View style={{ flexDirection: 'row', gap: 8, flexShrink: 0 }}>
              
              <TouchableOpacity style={s.iconBtn} onPress={() => router.push('/pos/queue')}>
                <Coffee size={16} color={C.textMuted} />
                {queueCount > 0 && (
                  <View style={s.queueBadge}>
                    <Text style={s.queueBadgeText}>{queueCount > 9 ? '9+' : queueCount}</Text>
                  </View>
                )}
              </TouchableOpacity>
              
              <TouchableOpacity style={s.iconBtn} onPress={() => router.push('/settings')}>
                <SlidersHorizontal size={16} color={C.textMuted} />
              </TouchableOpacity>
              <TouchableOpacity style={[s.iconBtn, { backgroundColor: 'rgba(122,46,53,0.15)', borderColor: 'rgba(122,46,53,0.2)' }]} onPress={() => { logout(); router.replace('/login'); }}>
                <LogOut size={16} color={C.dangerLt} />
              </TouchableOpacity>
            </View>
          </View>

          {/* SEARCH */}
          <View style={s.searchWrap}>
            <Search size={15} color={C.textDim} />
            <TextInput
              style={s.searchInput}
              placeholder="Search menu…"
              placeholderTextColor={C.textDim}
              value={search}
              onChangeText={setSearch}
            />
            {search.length > 0 && (
              <TouchableOpacity onPress={() => setSearch('')}>
                <X size={15} color={C.textDim} />
              </TouchableOpacity>
            )}
          </View>

          {/* CATEGORY TABS */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false}
            style={s.tabRow} contentContainerStyle={s.tabRowContent}>
            {categories.map(cat => {
              const active   = selCat === cat;
              const catColor = cat === 'All' ? C.gold : getCatColor(cat, categories);
              return (
                <TouchableOpacity
                  key={cat}
                  onPress={() => setSelCat(cat)}
                  style={[s.tab, active && { backgroundColor: catColor, borderColor: catColor }]}
                  activeOpacity={0.8}
                >
                  {cat !== 'All' && <CatIcon cat={cat} size={14} color={active ? C.cream : C.textMuted} style={{ marginRight: 6 }} />}
                  <Text style={[s.tabText, active && { color: C.cream }]}>{cat}</Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          {/* PRODUCT GRID */}
          {loading ? (
            <View style={s.center}>
              <Loader size={28} color={C.gold} />
              <Text style={s.loadingText}>Loading menu…</Text>
            </View>
          ) : error ? (
            <View style={s.center}>
              <AlertTriangle size={28} color={C.dangerLt} />
              <Text style={[s.loadingText, { color: C.dangerLt }]}>{error}</Text>
              <TouchableOpacity style={s.retryBtn} onPress={fetchData}>
                <Text style={s.retryText}>Retry</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <FlatList
              data={filtered}
              keyExtractor={item => item.id}
              numColumns={isTablet ? 3 : 2}
              key={isTablet ? 'tablet' : 'phone'}
              showsVerticalScrollIndicator={false}
              contentContainerStyle={s.grid}
              columnWrapperStyle={{ gap: 10 }}
              ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
              ListEmptyComponent={
                <View style={s.center}>
                  <Coffee size={32} color={C.textDim} />
                  <Text style={s.loadingText}>No items found.</Text>
                </View>
              }
              renderItem={({ item }) => (
                <MenuCard
                  item={item}
                  catColor={getCatColor(item.category, categories)}
                  onPress={() => openSidebar(item)}
                />
              )}
            />
          )}
        </View>

        {/* ══ CART BAR ══ */}
        {cartCount > 0 && !selItem && (
          <TouchableOpacity
            style={s.cartBar}
            onPress={() => router.push('/pos/cart')}
            activeOpacity={0.88}
          >
            <View style={s.cartBadge}>
              <Text style={s.cartBadgeText}>{cartCount}</Text>
            </View>
            <Text style={s.cartLabel}>View Order</Text>
            <View style={{ flex: 1 }} />
            <Text style={s.cartTotal}>₱{total.toFixed(2)}</Text>
            <ChevronRight size={18} color={C.cream} strokeWidth={2.5} />
          </TouchableOpacity>
        )}
      </View>

      {/* ══ MODIFIER PANEL WRAPPER ══ */}
      {selItem && (
        <View style={StyleSheet.absoluteFillObject} pointerEvents="box-none">
          <ModifierSidebar
            item={selItem}
            categories={categories}
            selMods={selMods}
            setSelMods={setSelMods}
            qty={qty}
            setQty={setQty}
            note={note}
            setNote={setNote}
            onClose={() => setSelItem(null)}
            onAddToCart={handleAddToCart}
            isValid={isValid}
          />
        </View>
      )}
    </SafeAreaView>
  );
}

// ─────────────────────────────────────────────
// MAIN SCREEN STYLES
// ─────────────────────────────────────────────
const CARD_W = (W - 32 - 10) / 2;
const CARD_W_T = (W - 32 - 20) / 3;

const s = StyleSheet.create({
  root:   { flex: 1, backgroundColor: C.bg },
  layout: { flex: 1 },
  mainArea: { flex: 1 },
  
  // ── OFFLINE BANNER ──
  offlineBanner: {
    backgroundColor: C.danger,
    paddingVertical: 6,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    width: '100%',
    zIndex: 999, // Ensure it sits above everything
  },
  offlineText: {
    color: '#FFF',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.5,
  },

  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: Platform.OS === 'android' ? (StatusBar.currentHeight || 0) + 12 : 12,
    paddingBottom: 10,
    borderBottomWidth: 1, borderBottomColor: 'rgba(184,147,90,0.12)',
  },
  headerLogo:  { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 },
  
  logoImageWrap: {
    width: 36, 
    height: 36, 
    borderRadius: 8, 
    overflow: 'hidden',
    backgroundColor: C.navyMid, 
    borderWidth: 1.5,
    borderColor: 'rgba(184,147,90,0.4)',
  },
  logoImage: {
    width: '100%',
    height: '100%',
  },

  brandLabel:  { fontSize: 9, fontWeight: '800', letterSpacing: 2.5, color: C.gold, textTransform: 'uppercase' },
  greeting:    { fontSize: 13, fontWeight: '700', color: C.text, marginTop: 1 },
  iconBtn: { 
    width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(44,62,92,0.15)', 
    alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(44,62,92,0.3)',
    position: 'relative'
  },
  queueBadge: {
    position: 'absolute', top: -4, right: -4, backgroundColor: C.danger,
    width: 16, height: 16, borderRadius: 8, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1.5, borderColor: C.bg
  },
  queueBadgeText: { color: '#FFF', fontSize: 8, fontWeight: '900' },
  
  searchWrap: {
    flexDirection: 'row', alignItems: 'center', gap: 10, marginHorizontal: 16, marginVertical: 10,
    backgroundColor: 'rgba(44,62,92,0.25)', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 11,
    borderWidth: 1, borderColor: 'rgba(44,62,92,0.35)',
  },
  searchInput: { flex: 1, fontSize: 14, fontWeight: '500', color: C.text },
  tabRow:        { maxHeight: 42, marginBottom: 10 },
  tabRowContent: { paddingHorizontal: 16, gap: 8, alignItems: 'center' },
  tab: {
    flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 7,
    borderRadius: 100, borderWidth: 1, borderColor: 'rgba(44,62,92,0.35)', backgroundColor: 'rgba(44,62,92,0.15)',
  },
  tabText: { fontSize: 13, fontWeight: '700', color: C.textMuted },
  grid: { paddingHorizontal: 16, paddingBottom: 100 },
  center:      { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, minHeight: 240 },
  loadingText: { fontSize: 14, fontWeight: '500', color: C.textMuted, textAlign: 'center' },
  retryBtn:    { paddingHorizontal: 20, paddingVertical: 10, backgroundColor: C.navyMid, borderRadius: 8, marginTop: 4 },
  retryText:   { fontSize: 13, fontWeight: '700', color: C.cream },
  cartBar: {
    position: 'absolute', bottom: 20, left: 16, right: 16, backgroundColor: C.navyMid,
    borderRadius: 16, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14, gap: 12,
    borderWidth: 1, borderColor: 'rgba(184,147,90,0.3)',
    shadowColor: '#000', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.45, shadowRadius: 16, elevation: 12,
  },
  cartBadge:     { width: 28, height: 28, borderRadius: 14, backgroundColor: C.gold, alignItems: 'center', justifyContent: 'center' },
  cartBadgeText: { color: C.cream, fontSize: 13, fontWeight: '800' },
  cartLabel:     { fontSize: 15, fontWeight: '700', color: C.cream },
  cartTotal:     { fontSize: 16, fontWeight: '800', color: C.gold },
});

// ─────────────────────────────────────────────
// CARD STYLES
// ─────────────────────────────────────────────
const sd = StyleSheet.create({
  card: {
    flex: 1, backgroundColor: C.bgCard, borderRadius: 14, overflow: 'hidden',
    borderWidth: 1, borderColor: 'rgba(184,147,90,0.15)',
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 5,
  },
  cardImg: { width: '100%', height: isTablet ? CARD_W_T * 0.72 : CARD_W * 0.75, overflow: 'hidden', position: 'relative' },
  cardImgOverlay: { position: 'absolute', bottom: 0, left: 0, right: 0, height: 40, backgroundColor: 'rgba(15,25,35,0.5)' },
  catBadge: { position: 'absolute', bottom: 6, left: 8, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 100 },
  catBadgeText: { fontSize: 8, fontWeight: '800', color: C.cream, letterSpacing: 0.8, textTransform: 'uppercase' },
  cardBody:   { padding: isTablet ? 12 : 10 },
  cardName:   { fontSize: isTablet ? 14 : 13, fontWeight: '700', color: C.text, marginBottom: 8, lineHeight: 19 },
  cardFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  cardPrice:  { fontSize: isTablet ? 17 : 15, fontWeight: '800', color: C.gold },
  addBadge:   { width: isTablet ? 30 : 26, height: isTablet ? 30 : 26, borderRadius: 15, backgroundColor: C.navyMid, alignItems: 'center', justifyContent: 'center' },
});

// ─────────────────────────────────────────────
// SIDEBAR / MODAL STYLES
// ─────────────────────────────────────────────
const PANEL_W = 420;

const sb = StyleSheet.create({
  backdrop: {
    position: 'absolute', inset: 0, zIndex: 10,
    backgroundColor: 'rgba(10,16,26,0.65)',
  },
  // Tablet: Slide in from right
  panelTablet: {
    position: 'absolute', right: 0, top: 0, bottom: 0, width: PANEL_W,
    zIndex: 20, backgroundColor: C.cream,
    shadowColor: '#000', shadowOffset: { width: -6, height: 0 }, shadowOpacity: 0.4, shadowRadius: 20, elevation: 20,
  },
  // Mobile: Bottom sheet
  panelMobile: {
    position: 'absolute', left: 0, right: 0, bottom: 0, maxHeight: H * 0.9, height: H * 0.85,
    zIndex: 20, backgroundColor: C.cream,
    borderTopLeftRadius: 24, borderTopRightRadius: 24, overflow: 'hidden',
    shadowColor: '#000', shadowOffset: { width: 0, height: -6 }, shadowOpacity: 0.3, shadowRadius: 20, elevation: 20,
  },
  
  mobileHandleWrap: { width: '100%', alignItems: 'center', paddingVertical: 12 },
  mobileHandle: { width: 40, height: 5, borderRadius: 3, backgroundColor: 'rgba(44,62,92,0.2)' },
  topAccent: { height: 4, backgroundColor: C.gold },

  header: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 12,
    padding: 16, paddingTop: Platform.OS === 'ios' || isTablet ? 14 : 0,
    borderBottomWidth: 1, borderBottomColor: 'rgba(44,62,92,0.1)',
  },
  headerThumb: { width: 64, height: 64, borderRadius: 10, overflow: 'hidden', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  headerCat:   { fontSize: 9, fontWeight: '700', letterSpacing: 1.5, textTransform: 'uppercase', color: C.textMuted, marginBottom: 3 },
  headerName:  { fontSize: 17, fontWeight: '800', color: C.navy, lineHeight: 22, marginBottom: 4 },
  headerBase:  { fontSize: 12, fontWeight: '500', color: C.textMuted },
  closeBtn:    { width: 28, height: 28, borderRadius: 14, backgroundColor: 'rgba(44,62,92,0.1)', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },

  qtyBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: 'rgba(44,62,92,0.08)',
  },
  qtyRow:  { flexDirection: 'row', alignItems: 'center', gap: 14 },
  qtyBtn:  { width: 34, height: 34, borderRadius: 17, backgroundColor: C.creamDeep, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(44,62,92,0.15)' },
  qtyPlus: { backgroundColor: C.navyMid, borderColor: C.navyMid },
  qtyNum:  { fontSize: 20, fontWeight: '800', color: C.navy, minWidth: 26, textAlign: 'center' },

  scroll: { paddingHorizontal: 16, paddingBottom: 16, paddingTop: 4 },
  sectionLabel: { fontSize: 10, fontWeight: '800', letterSpacing: 1.5, textTransform: 'uppercase', color: C.textDim, marginBottom: 10 },
  
  group:       { marginTop: 16 },
  groupHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  groupName:   { fontSize: 14, fontWeight: '700', color: C.navy, flex: 1 },
  reqBadge:    { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 100, backgroundColor: 'rgba(122,46,53,0.1)', borderWidth: 1, borderColor: 'rgba(122,46,53,0.2)' },
  reqText:     { fontSize: 9, fontWeight: '700', color: '#7A2E35', letterSpacing: 0.5 },
  multiBadge:  { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 100, backgroundColor: 'rgba(44,62,92,0.08)', borderWidth: 1, borderColor: 'rgba(44,62,92,0.15)' },
  multiText:   { fontSize: 9, fontWeight: '600', color: C.textDim, letterSpacing: 0.5 },

  // ✨ MODIFIER TILES GRID ✨
  optGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  optTile: {
    width: isTablet ? '31%' : '30%', 
    aspectRatio: 0.9,
    backgroundColor: C.creamDeep,
    borderRadius: 14,
    padding: 8,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: 'rgba(44,62,92,0.1)',
    position: 'relative'
  },
  optTileActive: {
    backgroundColor: 'rgba(184,147,90,0.1)',
    borderColor: C.gold,
  },
  optTileImgWrap: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: 'rgba(44,62,92,0.06)',
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 8
  },
  optTileEmoji: { fontSize: 20 },
  optTileName: { fontSize: 11, fontWeight: '600', color: C.navy, textAlign: 'center', lineHeight: 14 },
  optTileNameActive: { color: C.gold, fontWeight: '700' },
  optTilePrice: { fontSize: 10, fontWeight: '700', color: C.textDim, marginTop: 4 },
  optTilePriceActive: { color: C.gold },
  optTileCheckBadge: {
    position: 'absolute', top: -6, right: -6, zIndex: 5,
    width: 18, height: 18, borderRadius: 9, backgroundColor: C.navyMid,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: C.cream
  },

  reqWarn: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 8 },
  reqWarnText: { fontSize: 11, fontWeight: '600', color: C.dangerLt },

  noMods:     { paddingVertical: 32, alignItems: 'center', gap: 10 },
  noModsText: { fontSize: 13, color: C.textMuted, textAlign: 'center', lineHeight: 20 },

  noteBlock: { marginTop: 24 },
  noteInput: {
    backgroundColor: C.creamDeep, borderWidth: 1.5,
    borderColor: 'rgba(44,62,92,0.15)', borderRadius: 10,
    padding: 12, fontSize: 13, color: C.navy,
    minHeight: 72, textAlignVertical: 'top', lineHeight: 20,
  },
  noteCount: { fontSize: 10, color: C.textDim, textAlign: 'right', marginTop: 4 },

  footer: {
    padding: 16,
    paddingBottom: Platform.OS === 'ios' ? 28 : 16,
    borderTopWidth: 1, borderTopColor: 'rgba(44,62,92,0.1)',
    backgroundColor: C.cream,
  },
  validRow:  { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 10 },
  validText: { fontSize: 12, fontWeight: '600', color: C.dangerLt },
  cta: {
    backgroundColor: C.navy, borderRadius: 14, overflow: 'hidden',
    shadowColor: '#000', shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.35, shadowRadius: 10, elevation: 8,
  },
  ctaDisabled: { opacity: 0.4 },
  ctaInner: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 18, paddingVertical: 16, gap: 10,
  },
  ctaLabel: { flex: 1, fontSize: 15, fontWeight: '700', color: C.cream, marginLeft: 4 },
  ctaPrice: { backgroundColor: 'rgba(184,147,90,0.2)', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4 },
  ctaPriceText: { fontSize: 16, fontWeight: '800', color: C.gold },
});