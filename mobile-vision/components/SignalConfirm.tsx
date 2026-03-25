// ============================================================
// components/SignalConfirm.tsx
// Shows Helm's extracted signal — Yemi reviews + confirms
// Editable before saving to MyAtlas
// ============================================================

import React, { useState } from 'react';
import {
  Modal,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Image,
  Switch,
} from 'react-native';
import { VisionSignal, LifePillar } from '../utils/vision';

const PILLARS: LifePillar[] = [
  'Family', 'Travel', 'Photography', 'Growth', 'Finances', 'Work', 'General'
];

const PILLAR_COLOURS: Record<LifePillar, string> = {
  Family:      '#c07840',
  Travel:      '#7c5cb5',
  Photography: '#b84060',
  Growth:      '#4d9e6a',
  Finances:    '#a08c2a',
  Work:        '#4f6eb0',
  General:     '#555577',
};

interface SignalConfirmProps {
  visible: boolean;
  signal: VisionSignal | null;
  imageUri: string | null;
  onConfirm: (signal: VisionSignal) => void;
  onDismiss: () => void;
}

export default function SignalConfirm({
  visible,
  signal,
  imageUri,
  onConfirm,
  onDismiss,
}: SignalConfirmProps) {
  const [edited, setEdited] = useState<VisionSignal | null>(null);

  // Sync editable copy when signal changes
  React.useEffect(() => {
    if (signal) setEdited({ ...signal });
  }, [signal]);

  if (!edited) return null;

  const pillarColour = PILLAR_COLOURS[edited.pillar] ?? '#5a82ff';

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onDismiss}
    >
      <View style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.helmLabel}>HELM EXTRACTED</Text>
          <TouchableOpacity onPress={onDismiss}>
            <Text style={styles.dismissBtn}>✕</Text>
          </TouchableOpacity>
        </View>

        <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>

          {/* Screenshot thumbnail */}
          {imageUri && (
            <Image source={{ uri: imageUri }} style={styles.thumbnail} resizeMode="cover" />
          )}

          {/* Pillar selector */}
          <Text style={styles.fieldLabel}>PILLAR</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.pillarsRow}>
            {PILLARS.map((p) => (
              <TouchableOpacity
                key={p}
                style={[
                  styles.pillarChip,
                  edited.pillar === p && { backgroundColor: PILLAR_COLOURS[p], borderColor: PILLAR_COLOURS[p] },
                ]}
                onPress={() => setEdited({ ...edited, pillar: p })}
              >
                <Text style={[
                  styles.pillarChipText,
                  edited.pillar === p && styles.pillarChipTextActive,
                ]}>
                  {p}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          {/* Signal */}
          <Text style={styles.fieldLabel}>SIGNAL</Text>
          <TextInput
            style={[styles.input, styles.inputSingle]}
            value={edited.signal}
            onChangeText={(v) => setEdited({ ...edited, signal: v })}
            placeholderTextColor="#555"
            multiline={false}
          />

          {/* Details */}
          <Text style={styles.fieldLabel}>DETAILS</Text>
          <TextInput
            style={[styles.input, styles.inputMulti]}
            value={edited.details}
            onChangeText={(v) => setEdited({ ...edited, details: v })}
            placeholderTextColor="#555"
            multiline
            numberOfLines={3}
          />

          {/* Raw text extracted */}
          <Text style={styles.fieldLabel}>RAW TEXT FOUND</Text>
          <View style={styles.rawBox}>
            <Text style={styles.rawText}>{edited.raw_text || '—'}</Text>
          </View>

          {/* Tags */}
          <Text style={styles.fieldLabel}>TAGS</Text>
          <TextInput
            style={[styles.input, styles.inputSingle]}
            value={edited.tags.join(', ')}
            onChangeText={(v) =>
              setEdited({ ...edited, tags: v.split(',').map((t) => t.trim()).filter(Boolean) })
            }
            placeholder="tag1, tag2"
            placeholderTextColor="#555"
          />

          {/* Action needed toggle */}
          <View style={styles.toggleRow}>
            <Text style={styles.fieldLabel}>ACTION NEEDED</Text>
            <Switch
              value={edited.action_needed}
              onValueChange={(v) => setEdited({ ...edited, action_needed: v })}
              trackColor={{ false: '#333', true: pillarColour }}
              thumbColor={edited.action_needed ? '#fff' : '#888'}
            />
          </View>

          {/* Confidence badge */}
          <View style={styles.confidenceRow}>
            <Text style={styles.fieldLabel}>CONFIDENCE</Text>
            <View style={[
              styles.confidenceBadge,
              edited.confidence === 'high' && { backgroundColor: '#1a3a1a' },
              edited.confidence === 'medium' && { backgroundColor: '#3a2a0a' },
              edited.confidence === 'low' && { backgroundColor: '#3a1a1a' },
            ]}>
              <Text style={styles.confidenceText}>{edited.confidence.toUpperCase()}</Text>
            </View>
          </View>

        </ScrollView>

        {/* Confirm button */}
        <TouchableOpacity
          style={[styles.confirmBtn, { backgroundColor: pillarColour }]}
          onPress={() => onConfirm(edited)}
          activeOpacity={0.85}
        >
          <Text style={styles.confirmText}>Save to MyAtlas</Text>
        </TouchableOpacity>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0a0a0f',
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 32,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  helmLabel: {
    color: '#5a82ff',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 2,
  },
  dismissBtn: {
    color: '#666',
    fontSize: 18,
    padding: 4,
  },
  scroll: {
    flex: 1,
  },
  thumbnail: {
    width: '100%',
    height: 160,
    borderRadius: 10,
    marginBottom: 20,
    opacity: 0.85,
  },
  fieldLabel: {
    color: '#5a82ff',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1.5,
    marginBottom: 6,
    marginTop: 14,
  },
  pillarsRow: {
    flexDirection: 'row',
    marginBottom: 4,
  },
  pillarChip: {
    borderWidth: 1,
    borderColor: '#333',
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 6,
    marginRight: 8,
    backgroundColor: '#111',
  },
  pillarChipText: {
    color: '#666',
    fontSize: 12,
  },
  pillarChipTextActive: {
    color: '#fff',
    fontWeight: '600',
  },
  input: {
    backgroundColor: '#111',
    borderWidth: 1,
    borderColor: '#222',
    borderRadius: 8,
    color: '#e8e8ff',
    fontSize: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  inputSingle: {
    height: 44,
  },
  inputMulti: {
    minHeight: 80,
    textAlignVertical: 'top',
  },
  rawBox: {
    backgroundColor: '#0d0d18',
    borderWidth: 1,
    borderColor: '#1e1e3a',
    borderRadius: 8,
    padding: 12,
  },
  rawText: {
    color: '#8888bb',
    fontSize: 12,
    fontStyle: 'italic',
    lineHeight: 18,
  },
  toggleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 14,
  },
  confidenceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 14,
  },
  confidenceBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
    backgroundColor: '#1a1a2a',
  },
  confidenceText: {
    color: '#aaa',
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 1,
  },
  confirmBtn: {
    height: 52,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 16,
  },
  confirmText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
});
