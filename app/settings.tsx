import React, { useState, useEffect } from 'react';
import { 
  View, Text, TouchableOpacity, StyleSheet, 
  Image, ActivityIndicator, Alert, SafeAreaView, StatusBar, Platform 
} from 'react-native';
import { useRouter } from 'expo-router';
import { supabase } from '../lib/supabase';
import { useAuth } from '../hooks/useAuth';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system/legacy'; // <-- Fix is here!
import { decode } from 'base64-arraybuffer';
import { ArrowLeft, Camera, User, BadgeCheck } from 'lucide-react-native';

const C = {
  navy:       '#1E2D45',
  navyMid:    '#2C3E5C',
  gold:       '#B8935A',
  cream:      '#F5EFE4',
  bg:         '#0F1923',
  bgCard:     '#162030',
  textMuted:  '#8A9BB0',
  dangerLt:   '#C07070',
};

function getAvatarBg(name: string): string {
  const palette = [C.navyMid, '#3A6B8A', C.gold, '#7A5030', '#4A6B4A', '#4A3580'];
  let h = 0;
  for (let i = 0; i < name.length; i++) h = name.charCodeAt(i) + ((h << 5) - h);
  return palette[Math.abs(h) % palette.length];
}

export default function SettingsScreen() {
  const { currentUser } = useAuth();
  const router = useRouter();
  
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  // Load current avatar on mount
  useEffect(() => {
    if (currentUser?.avatar_url) {
      setAvatarUrl(currentUser.avatar_url);
    }
  }, [currentUser]);

  const pickImage = async () => {
    // Ask for permission and open the image gallery
    let result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1], // Force a square crop
      quality: 0.5,   // Compress slightly to save data
    });

    if (!result.canceled && result.assets[0]) {
      uploadImage(result.assets[0].uri);
    }
  };

  const uploadImage = async (uri: string) => {
    if (!currentUser) return;
    setUploading(true);

    try {
      const fileExt = uri.split('.').pop()?.toLowerCase() || 'jpeg';
      const fileName = `${currentUser.id}-${Date.now()}.${fileExt}`;

      // 1. Read the image from the device as a base64 string using the legacy API
      const base64 = await FileSystem.readAsStringAsync(uri, { encoding: 'base64' });

      // 2. Convert base64 to an ArrayBuffer and upload to Supabase
      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(fileName, decode(base64), {
          contentType: `image/${fileExt === 'jpg' ? 'jpeg' : fileExt}`
        });

      if (uploadError) throw uploadError;

      // 3. Get the public URL for the image
      const { data } = supabase.storage.from('avatars').getPublicUrl(fileName);
      const publicUrl = data.publicUrl;

      // 4. Save the URL to the barista's profile in the database
      const { error: updateError } = await supabase
        .from('profiles')
        .update({ avatar_url: publicUrl })
        .eq('id', currentUser.id);

      if (updateError) throw updateError;

      setAvatarUrl(publicUrl);
      Alert.alert('Success', 'Profile photo updated!');
      
    } catch (error: any) {
      Alert.alert('Upload Failed', error.message || 'Something went wrong.');
    } finally {
      setUploading(false);
    }
  };

  if (!currentUser) return null;

  return (
    <SafeAreaView style={styles.root}>
      <StatusBar barStyle="light-content" backgroundColor={C.bg} />
      
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <ArrowLeft size={20} color={C.cream} />
          <Text style={styles.backText}>Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>My Profile</Text>
        <View style={{ width: 60 }} />
      </View>

      <View style={styles.content}>
        <View style={styles.card}>
          
          <View style={styles.avatarSection}>
            <TouchableOpacity 
              style={styles.avatarWrapper} 
              onPress={pickImage} 
              disabled={uploading}
              activeOpacity={0.8}
            >
              {avatarUrl ? (
                <Image source={{ uri: avatarUrl }} style={styles.avatarImage} />
              ) : (
                <Image 
                  source={{ uri: `https://ui-avatars.com/api/?name=${encodeURIComponent(currentUser.full_name)}&background=${getAvatarBg(currentUser.full_name).replace('#','')}&color=F5EFE4&size=200&bold=true` }} 
                  style={styles.avatarImage} 
                />
              )}
              
              <View style={styles.avatarOverlay}>
                {uploading ? (
                  <ActivityIndicator color={C.cream} />
                ) : (
                  <Camera size={24} color={C.cream} />
                )}
              </View>
            </TouchableOpacity>
            <Text style={styles.uploadHint}>Tap to change photo</Text>
          </View>

          <View style={styles.divider} />

          <View style={styles.infoRow}>
            <View style={styles.infoIconBox}>
              <User size={20} color={C.gold} />
            </View>
            <View>
              <Text style={styles.infoLabel}>Full Name</Text>
              <Text style={styles.infoValue}>{currentUser.full_name}</Text>
            </View>
          </View>

          <View style={styles.infoRow}>
            <View style={styles.infoIconBox}>
              <BadgeCheck size={20} color={C.gold} />
            </View>
            <View>
              <Text style={styles.infoLabel}>System Role</Text>
              <View style={styles.roleBadge}>
                <Text style={styles.roleBadgeText}>
                  {currentUser.role === 'manager' ? 'Manager' : 'Barista'}
                </Text>
              </View>
            </View>
          </View>

        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },
  header: { 
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, 
    paddingTop: Platform.OS === 'android' ? (StatusBar.currentHeight || 0) + 12 : 12,
    paddingBottom: 16,
    borderBottomWidth: 1, borderBottomColor: 'rgba(184,147,90,0.15)'
  },
  backBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, width: 80 },
  backText: { color: C.cream, fontSize: 16, fontWeight: '600' },
  headerTitle: { color: C.gold, fontSize: 16, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase' },
  
  content: { flex: 1, alignItems: 'center', paddingTop: 40, paddingHorizontal: 20 },
  card: {
    backgroundColor: C.bgCard,
    width: '100%', maxWidth: 400,
    borderRadius: 20, padding: 24,
    borderWidth: 1, borderColor: 'rgba(44,62,92,0.4)',
    shadowColor: '#000', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.4, shadowRadius: 16, elevation: 10
  },
  
  avatarSection: { alignItems: 'center', marginBottom: 24 },
  avatarWrapper: {
    width: 140, height: 140, borderRadius: 70,
    borderWidth: 3, borderColor: C.gold,
    overflow: 'hidden', position: 'relative',
    backgroundColor: C.navyMid,
  },
  avatarImage: { width: '100%', height: '100%' },
  avatarOverlay: {
    position: 'absolute', inset: 0,
    backgroundColor: 'rgba(15, 25, 35, 0.4)',
    alignItems: 'center', justifyContent: 'center'
  },
  uploadHint: { marginTop: 12, color: C.textMuted, fontSize: 13, fontWeight: '500' },

  divider: { height: 1, backgroundColor: 'rgba(44,62,92,0.3)', marginVertical: 20 },

  infoRow: { flexDirection: 'row', alignItems: 'center', gap: 16, marginBottom: 20 },
  infoIconBox: {
    width: 44, height: 44, borderRadius: 12,
    backgroundColor: 'rgba(184,147,90,0.1)',
    alignItems: 'center', justifyContent: 'center'
  },
  infoLabel: { fontSize: 11, fontWeight: '700', color: C.textMuted, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 },
  infoValue: { fontSize: 16, fontWeight: '700', color: C.cream },
  
  roleBadge: {
    backgroundColor: 'rgba(44,62,92,0.4)',
    paddingHorizontal: 12, paddingVertical: 4, borderRadius: 100, alignSelf: 'flex-start'
  },
  roleBadgeText: { color: C.cream, fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1 }
});