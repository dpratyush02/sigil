import React, { useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../constants/colors';

export interface PickedFile {
  name: string;
  uri: string;
  type: 'image' | 'video' | 'music' | 'code' | 'text';
  mimeType?: string;
  size?: number;
}

interface UploadDropzoneProps {
  onFilePicked: (file: PickedFile) => void;
}

function detectType(name: string, mimeType?: string): PickedFile['type'] {
  const ext = name.split('.').pop()?.toLowerCase() || '';
  if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'tiff', 'raw'].includes(ext)) return 'image';
  if (['mp4', 'mov', 'avi', 'mkv', 'webm'].includes(ext)) return 'video';
  if (['mp3', 'wav', 'flac', 'aac', 'm4a', 'ogg'].includes(ext)) return 'music';
  if (['js', 'ts', 'py', 'sol', 'jsx', 'tsx', 'go', 'rs', 'cpp', 'c', 'java'].includes(ext)) return 'code';
  return 'text';
}

// ─── Web fallback (no native modules) ──────────────────────────────────────────
function WebDropzone({ onFilePicked }: UploadDropzoneProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const url = URL.createObjectURL(file);
    onFilePicked({
      name: file.name,
      uri: url,
      type: detectType(file.name, file.type),
      mimeType: file.type,
      size: file.size,
    });
    // Reset so re-picking same file still fires onChange
    if (inputRef.current) inputRef.current.value = '';
  };

  return (
    <TouchableOpacity
      style={styles.dropzone}
      activeOpacity={0.7}
      onPress={() => inputRef.current?.click()}
    >
      {/* Hidden native file input */}
      {/* @ts-ignore — web only */}
      <input
        ref={inputRef}
        type="file"
        style={{ display: 'none' }}
        onChange={handleChange}
        accept="image/*,video/*,audio/*,.js,.ts,.jsx,.tsx,.py,.sol,.go,.rs,.cpp,.c,.java,.txt,.json,.md"
      />
      <Ionicons name="cloud-upload-outline" size={36} color={Colors.primary} />
      <Text style={styles.title}>Click to upload</Text>
      <Text style={styles.subtitle}>Images, Videos, Music, Code &amp; Text</Text>
      <Text style={styles.hint}>RAW · TIFF · PNG · MP4 · MP3 · JS · PY · SOL</Text>
      <View style={styles.pill}>
        <Text style={styles.pillText}>Max 500MB</Text>
      </View>
    </TouchableOpacity>
  );
}

// ─── Native version (dynamic imports to avoid web bundler issues) ───────────────
function NativeDropzone({ onFilePicked }: UploadDropzoneProps) {
  const handlePickMedia = async () => {
    // Lazy-load native pickers only when this actually runs
    const [DocumentPicker, ImagePicker] = await Promise.all([
      import('expo-document-picker'),
      import('expo-image-picker'),
    ]);

    Alert.alert('Select Content Type', 'What would you like to protect?', [
      {
        text: 'Image / Photo',
        onPress: async () => {
          const result = await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ['images'],
            quality: 0.8,
          });
          if (!result.canceled && result.assets[0]) {
            const asset = result.assets[0];
            const name = asset.fileName || `image_${Date.now()}.jpg`;
            onFilePicked({ name, uri: asset.uri, type: 'image', mimeType: asset.mimeType || 'image/jpeg', size: asset.fileSize });
          }
        },
      },
      {
        text: 'Video',
        onPress: async () => {
          const result = await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ['videos'],
          });
          if (!result.canceled && result.assets[0]) {
            const asset = result.assets[0];
            const name = asset.fileName || `video_${Date.now()}.mp4`;
            onFilePicked({ name, uri: asset.uri, type: 'video', mimeType: asset.mimeType || 'video/mp4', size: asset.fileSize });
          }
        },
      },
      {
        text: 'Music / Audio',
        onPress: async () => {
          const result = await DocumentPicker.getDocumentAsync({
            type: ['audio/*'],
            copyToCacheDirectory: true,
          });
          if (!result.canceled && result.assets?.[0]) {
            const asset = result.assets[0];
            onFilePicked({ name: asset.name, uri: asset.uri, type: 'music', mimeType: asset.mimeType || 'audio/mpeg', size: asset.size });
          }
        },
      },
      {
        text: 'Code / Text File',
        onPress: async () => {
          const result = await DocumentPicker.getDocumentAsync({
            type: ['text/*', 'application/json', 'application/javascript', 'application/octet-stream'],
            copyToCacheDirectory: true,
          });
          if (!result.canceled && result.assets?.[0]) {
            const asset = result.assets[0];
            const type = detectType(asset.name, asset.mimeType || '');
            onFilePicked({ name: asset.name, uri: asset.uri, type, mimeType: asset.mimeType || 'text/plain', size: asset.size });
          }
        },
      },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  return (
    <TouchableOpacity style={styles.dropzone} onPress={handlePickMedia} activeOpacity={0.7}>
      <Ionicons name="cloud-upload-outline" size={36} color={Colors.primary} />
      <Text style={styles.title}>Tap to upload</Text>
      <Text style={styles.subtitle}>Images, Videos, Music, Code &amp; Text</Text>
      <Text style={styles.hint}>RAW · TIFF · PNG · MP4 · MP3 · JS · PY · SOL</Text>
      <View style={styles.pill}>
        <Text style={styles.pillText}>Max 500MB</Text>
      </View>
    </TouchableOpacity>
  );
}

// ─── Exported component ─────────────────────────────────────────────────────────
export default function UploadDropzone(props: UploadDropzoneProps) {
  if (Platform.OS === 'web') return <WebDropzone {...props} />;
  return <NativeDropzone {...props} />;
}

const styles = StyleSheet.create({
  dropzone: {
    borderWidth: 1.5,
    borderColor: Colors.primary + '55',
    borderStyle: 'dashed',
    borderRadius: 20,
    paddingVertical: 32,
    paddingHorizontal: 24,
    alignItems: 'center',
    backgroundColor: Colors.overlayYellow,
    gap: 6,
  },
  title: { fontSize: 16, fontWeight: '700', color: Colors.onSurface, marginTop: 8 },
  subtitle: { fontSize: 13, color: Colors.onSurfaceVariant },
  hint: { fontSize: 11, color: Colors.textMuted, letterSpacing: 0.5, marginTop: 2 },
  pill: {
    backgroundColor: Colors.border,
    borderRadius: 99,
    paddingHorizontal: 12,
    paddingVertical: 4,
    marginTop: 8,
  },
  pillText: { fontSize: 11, color: Colors.textMuted, fontWeight: '600' },
});
