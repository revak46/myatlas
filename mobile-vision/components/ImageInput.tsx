// ============================================================
// components/ImageInput.tsx
// Camera icon button — opens library or camera
// Returns base64 image ready for vision.ts
// ============================================================

import React, { useState } from 'react';
import {
  TouchableOpacity,
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  Alert,
  ActionSheetIOS,
  Platform,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { analyseScreenshot, VisionSignal } from '../utils/vision';

interface ImageInputProps {
  onSignalReady: (signal: VisionSignal, imageUri: string) => void;
}

export default function ImageInput({ onSignalReady }: ImageInputProps) {
  const [loading, setLoading] = useState(false);

  const pickImage = async (useCamera: boolean) => {
    // Request permissions
    if (useCamera) {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission needed', 'Camera access is required to capture screenshots.');
        return;
      }
    } else {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission needed', 'Photo library access is required.');
        return;
      }
    }

    const result = useCamera
      ? await ImagePicker.launchCameraAsync({
          mediaTypes: ImagePicker.MediaTypeOptions.Images,
          base64: true,
          quality: 0.8,
        })
      : await ImagePicker.launchImageLibraryAsync({
          mediaTypes: ImagePicker.MediaTypeOptions.Images,
          base64: true,
          quality: 0.8,
        });

    if (result.canceled || !result.assets?.[0]) return;

    const asset = result.assets[0];
    if (!asset.base64) {
      Alert.alert('Error', 'Could not read image data.');
      return;
    }

    setLoading(true);
    try {
      const signal = await analyseScreenshot(asset.base64);
      onSignalReady(signal, asset.uri);
    } catch (err: any) {
      Alert.alert('Helm Error', err.message ?? 'Could not analyse image.');
    } finally {
      setLoading(false);
    }
  };

  const handlePress = () => {
    if (loading) return;

    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        {
          options: ['Cancel', 'Take Photo', 'Choose Screenshot'],
          cancelButtonIndex: 0,
        },
        (index) => {
          if (index === 1) pickImage(true);
          if (index === 2) pickImage(false);
        }
      );
    } else {
      // Android — simple alert
      Alert.alert('Add Image', 'Choose source', [
        { text: 'Camera', onPress: () => pickImage(true) },
        { text: 'Photo Library', onPress: () => pickImage(false) },
        { text: 'Cancel', style: 'cancel' },
      ]);
    }
  };

  return (
    <TouchableOpacity
      style={[styles.button, loading && styles.buttonLoading]}
      onPress={handlePress}
      activeOpacity={0.7}
    >
      {loading ? (
        <View style={styles.loadingRow}>
          <ActivityIndicator size="small" color="#5a82ff" />
          <Text style={styles.loadingText}>Helm reading...</Text>
        </View>
      ) : (
        <Text style={styles.icon}>📷</Text>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  button: {
    width: 48,
    height: 48,
    borderRadius: 12,
    backgroundColor: '#1a1a2e',
    borderWidth: 1,
    borderColor: '#5a82ff',
    justifyContent: 'center',
    alignItems: 'center',
  },
  buttonLoading: {
    borderColor: '#333',
    backgroundColor: '#111',
  },
  icon: {
    fontSize: 22,
  },
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 8,
  },
  loadingText: {
    color: '#5a82ff',
    fontSize: 11,
    fontStyle: 'italic',
  },
});
