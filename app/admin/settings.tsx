import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert, Image, KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../hooks/useAuth';
import * as ImagePicker from 'expo-image-picker';
import { Camera, Save, ShieldCheck } from 'lucide-react-native';

export default function SettingsScreen() {
  const { currentUser, setSession } = useAuth();
  
  // PIN State
  const [currentPin, setCurrentPin] = useState('');
  const [newPin, setNewPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  
  // Image State
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);

  // 1. Pick an Image from Camera Roll
  const pickImage = async () => {
    let result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.5,
    });

    if (!result.canceled) {
      setImageUri(result.assets[0].uri);
    }
  };

  // 2. Upload Image to Supabase Storage (Requires a 'avatars' bucket in Supabase)
  const handleUploadAvatar = async () => {
    if (!imageUri || !currentUser) return;
    setIsUploading(true);

    try {
      // Convert image to blob for Supabase
      const response = await fetch(imageUri);
      const blob = await response.blob();
      const fileExt = imageUri.split('.').pop();
      const fileName = `${currentUser.id}-${Date.now()}.${fileExt}`;

      // Upload to 'avatars' bucket
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(fileName, blob);

      if (uploadError) throw uploadError;

      // Get public URL
      const { data: publicUrlData } = supabase.storage.from('avatars').getPublicUrl(fileName);
      
      // Update the profile table with the new URL
      const { error: updateError } = await supabase
        .from('profiles')
        .update({ avatar_url: publicUrlData.publicUrl })
        .eq('id', currentUser.id);

      if (updateError) throw updateError;

      Alert.alert("Success", "Profile picture updated!");
      
      // Update local session
      setSession({ ...currentUser, avatar_url: publicUrlData.publicUrl });
      
    } catch (error: any) {
      Alert.alert("Upload Error", error.message);
    } finally {
      setIsUploading(false);
    }
  };

  // 3. Change PIN Logic
  const handleChangePin = async () => {
    if (!currentUser) return;
    
    if (currentPin !== currentUser.pin_code) {
      Alert.alert("Error", "Current PIN is incorrect.");
      return;
    }
    if (newPin.length !== 4) {
      Alert.alert("Error", "New PIN must be exactly 4 digits.");
      return;
    }
    if (newPin !== confirmPin) {
      Alert.alert("Error", "New PINs do not match.");
      return;
    }

    const { error } = await supabase
      .from('profiles')
      .update({ pin_code: newPin })
      .eq('id', currentUser.id);

    if (error) {
      Alert.alert("Error updating PIN", error.message);
    } else {
      Alert.alert("Success", "Your PIN has been successfully changed.");
      setSession({ ...currentUser, pin_code: newPin });
      setCurrentPin('');
      setNewPin('');
      setConfirmPin('');
    }
  };

  // Determine which image to show
  const displayImage = imageUri || currentUser?.avatar_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(currentUser?.full_name || 'User')}&background=4b3621&color=fff&size=150`;

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
        <Text style={styles.headerTitle}>Profile Settings</Text>

        {/* Profile Picture Section */}
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Profile Picture</Text>
          <View style={styles.avatarContainer}>
            <Image source={{ uri: displayImage }} style={styles.avatar} />
            <TouchableOpacity style={styles.cameraButton} onPress={pickImage}>
              <Camera color="white" size={20} />
            </TouchableOpacity>
          </View>
          
          {imageUri && (
            <TouchableOpacity 
              style={[styles.saveButton, isUploading && styles.disabledButton]} 
              onPress={handleUploadAvatar}
              disabled={isUploading}
            >
              <Save color="white" size={20} />
              <Text style={styles.buttonText}>{isUploading ? "Uploading..." : "Save Picture"}</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Change PIN Section */}
        <View style={styles.card}>
          <View style={styles.pinHeader}>
            <ShieldCheck color="#0EA5E9" size={24} />
            <Text style={styles.sectionTitle}>Change PIN</Text>
          </View>
          
          <Text style={styles.label}>Current PIN</Text>
          <TextInput 
            style={styles.input} 
            keyboardType="numeric" 
            secureTextEntry 
            maxLength={4} 
            value={currentPin} 
            onChangeText={setCurrentPin} 
            placeholder="••••"
          />

          <Text style={styles.label}>New PIN</Text>
          <TextInput 
            style={styles.input} 
            keyboardType="numeric" 
            secureTextEntry 
            maxLength={4} 
            value={newPin} 
            onChangeText={setNewPin} 
            placeholder="••••"
          />

          <Text style={styles.label}>Confirm New PIN</Text>
          <TextInput 
            style={styles.input} 
            keyboardType="numeric" 
            secureTextEntry 
            maxLength={4} 
            value={confirmPin} 
            onChangeText={setConfirmPin} 
            placeholder="••••"
          />

          <TouchableOpacity style={styles.saveButton} onPress={handleChangePin}>
            <Text style={styles.buttonText}>Update PIN</Text>
          </TouchableOpacity>
        </View>

      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC' },
  scrollContent: { padding: 20, paddingTop: 60, paddingBottom: 40 },
  headerTitle: { fontSize: 28, fontWeight: '800', color: '#0F172A', marginBottom: 20 },
  card: { backgroundColor: 'white', borderRadius: 20, padding: 20, marginBottom: 20, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.05, shadowRadius: 10, elevation: 3 },
  sectionTitle: { fontSize: 18, fontWeight: '700', color: '#1E293B', marginBottom: 15 },
  avatarContainer: { alignItems: 'center', marginBottom: 15 },
  avatar: { width: 120, height: 120, borderRadius: 60, borderWidth: 3, borderColor: '#F1F5F9' },
  cameraButton: { position: 'absolute', bottom: 0, right: '35%', backgroundColor: '#0EA5E9', padding: 10, borderRadius: 20, borderWidth: 3, borderColor: 'white' },
  pinHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 5 },
  label: { fontSize: 14, fontWeight: '600', color: '#64748B', marginBottom: 8, marginTop: 10 },
  input: { backgroundColor: '#F8FAFC', borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 12, padding: 14, fontSize: 18, color: '#0F172A', letterSpacing: 5 },
  saveButton: { backgroundColor: '#0EA5E9', flexDirection: 'row', justifyContent: 'center', alignItems: 'center', padding: 16, borderRadius: 12, marginTop: 20, gap: 8 },
  disabledButton: { backgroundColor: '#94A3B8' },
  buttonText: { color: 'white', fontSize: 16, fontWeight: 'bold' }
});