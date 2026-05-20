/**
 * SIGIL — Provenance Attachment Screen
 *
 * Allows users to attach provenance evidence to their registered content:
 *  - GitHub commit URLs
 *  - Web publication links
 *  - EXIF metadata notes
 *  - IPFS snapshots
 *  - Manual statements
 *
 * All data stored locally. Strengthens confidence score.
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert as RNAlert,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../constants/colors';
import {
  getProvenance,
  addProvenanceSource,
  removeProvenanceSource,
  provenanceTypeLabel,
  provenanceTypeIcon,
  ProvenanceSource,
  ProvenanceSourceType,
  ProvenanceRecord,
} from '../../utils/provenance';

const SOURCE_TYPES: { type: ProvenanceSourceType; label: string; placeholder: string }[] = [
  {
    type: 'github_commit',
    label: 'GitHub Commit',
    placeholder: 'https://github.com/user/repo/commit/abc123',
  },
  {
    type: 'web_publication',
    label: 'Web Publication',
    placeholder: 'https://example.com/my-article',
  },
  {
    type: 'exif_metadata',
    label: 'EXIF Metadata Note',
    placeholder: 'Canon EOS R5 · Created 2024-01-15 09:22:11 UTC',
  },
  {
    type: 'ipfs_snapshot',
    label: 'IPFS Snapshot',
    placeholder: 'ipfs://QmXxx... or https://ipfs.io/ipfs/Qm...',
  },
  {
    type: 'manual_note',
    label: 'Statement / Note',
    placeholder: 'Describe when and where you created this work...',
  },
];

export default function ProvenanceScreen() {
  const { id: contentHash } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();

  const [record, setRecord] = useState<ProvenanceRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedType, setSelectedType] = useState<ProvenanceSourceType>('github_commit');
  const [url, setUrl] = useState('');
  const [timestamp, setTimestamp] = useState('');
  const [label, setLabel] = useState('');
  const [saving, setSaving] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);

  const loadRecord = useCallback(async () => {
    setLoading(true);
    const r = await getProvenance(contentHash ?? '');
    setRecord(r);
    setLoading(false);
  }, [contentHash]);

  useEffect(() => {
    loadRecord();
  }, [loadRecord]);

  const handleAdd = useCallback(async () => {
    if (!url.trim()) {
      RNAlert.alert('Required', 'Please enter a URL or description.');
      return;
    }

    setSaving(true);
    try {
      const typeConfig = SOURCE_TYPES.find((t) => t.type === selectedType);
      const tsMs = timestamp ? new Date(timestamp).getTime() : undefined;
      const updated = await addProvenanceSource(contentHash ?? '', {
        type: selectedType,
        label: label.trim() || typeConfig?.label || selectedType,
        url: url.trim(),
        timestamp: tsMs && !isNaN(tsMs) ? tsMs : undefined,
      });
      setRecord(updated);
      setUrl('');
      setTimestamp('');
      setLabel('');
    } catch (err: any) {
      RNAlert.alert('Error', err?.message ?? 'Could not add source.');
    } finally {
      setSaving(false);
    }
  }, [url, timestamp, label, selectedType, contentHash]);

  const handleRemove = useCallback(
    async (sourceId: string) => {
      setRemovingId(sourceId);
      try {
        await removeProvenanceSource(contentHash ?? '', sourceId);
        await loadRecord();
      } finally {
        setRemovingId(null);
      }
    },
    [contentHash, loadRecord]
  );

  const selectedConfig = SOURCE_TYPES.find((t) => t.type === selectedType)!;

  return (
    <SafeAreaView style={s.root} edges={['top', 'left', 'right']}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        {/* Header */}
        <View style={s.header}>
          <TouchableOpacity onPress={() => router.back()} hitSlop={12}>
            <Ionicons name="arrow-back" size={22} color={Colors.textPrimary} />
          </TouchableOpacity>
          <Text style={s.headerTitle}>Provenance</Text>
          <View style={{ width: 22 }} />
        </View>

        <ScrollView
          contentContainerStyle={s.scroll}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* Info */}
          <View style={s.infoCard}>
            <Ionicons name="information-circle-outline" size={16} color="#60A5FA" />
            <Text style={s.infoText}>
              Attach verifiable evidence of prior creation. Each source raises your ownership
              confidence score and strengthens your position in a dispute.
            </Text>
          </View>

          {/* Existing sources */}
          {!loading && record && record.sources.length > 0 && (
            <View style={s.section}>
              <Text style={s.sectionTitle}>Attached Sources ({record.sources.length})</Text>
              {record.sources.map((src) => (
                <SourceRow
                  key={src.id}
                  source={src}
                  removing={removingId === src.id}
                  onRemove={() => handleRemove(src.id)}
                />
              ))}
            </View>
          )}

          {!loading && (!record || record.sources.length === 0) && (
            <View style={s.emptyCard}>
              <Ionicons name="git-network-outline" size={28} color="#4B5563" />
              <Text style={s.emptyText}>No provenance sources yet</Text>
            </View>
          )}

          {loading && (
            <View style={s.emptyCard}>
              <ActivityIndicator color="#FACC15" />
            </View>
          )}

          {/* Add new source */}
          <Text style={s.sectionTitle}>Add Source</Text>

          {/* Type selector */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={s.typeRow}
          >
            {SOURCE_TYPES.map((t) => (
              <TouchableOpacity
                key={t.type}
                style={[
                  s.typeChip,
                  selectedType === t.type && s.typeChipActive,
                ]}
                onPress={() => setSelectedType(t.type)}
              >
                <Ionicons
                  name={provenanceTypeIcon(t.type) as any}
                  size={13}
                  color={selectedType === t.type ? '#1A1A1A' : '#9CA3AF'}
                />
                <Text
                  style={[
                    s.typeChipText,
                    selectedType === t.type && s.typeChipTextActive,
                  ]}
                >
                  {t.label}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          {/* URL / content input */}
          <Text style={s.fieldLabel}>{selectedConfig.label}</Text>
          <TextInput
            style={[
              s.input,
              (selectedType === 'manual_note' || selectedType === 'exif_metadata') && {
                height: 80,
                textAlignVertical: 'top',
              },
            ]}
            placeholder={selectedConfig.placeholder}
            placeholderTextColor="#4B5563"
            value={url}
            onChangeText={setUrl}
            autoCapitalize="none"
            keyboardType={selectedType === 'manual_note' ? 'default' : 'url'}
            multiline={selectedType === 'manual_note' || selectedType === 'exif_metadata'}
          />

          {/* Timestamp (optional) */}
          <Text style={s.fieldLabel}>Creation Date (optional)</Text>
          <Text style={s.fieldHint}>ISO date, e.g. 2024-01-15 or 2024-01-15T09:22:11Z</Text>
          <TextInput
            style={s.input}
            placeholder="2024-01-15"
            placeholderTextColor="#4B5563"
            value={timestamp}
            onChangeText={setTimestamp}
            keyboardType="default"
          />

          {/* Custom label */}
          <Text style={s.fieldLabel}>Label (optional)</Text>
          <TextInput
            style={s.input}
            placeholder="e.g. Initial commit · first draft"
            placeholderTextColor="#4B5563"
            value={label}
            onChangeText={setLabel}
          />

          {/* Add button */}
          <TouchableOpacity
            style={[s.addBtn, saving && { opacity: 0.5 }]}
            onPress={handleAdd}
            activeOpacity={0.85}
            disabled={saving}
          >
            {saving ? (
              <ActivityIndicator color="#1A1A1A" />
            ) : (
              <>
                <Ionicons name="add-circle-outline" size={18} color="#1A1A1A" />
                <Text style={s.addBtnText}>Add Source</Text>
              </>
            )}
          </TouchableOpacity>

          <View style={{ height: 40 }} />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function SourceRow({
  source,
  removing,
  onRemove,
}: {
  source: ProvenanceSource;
  removing: boolean;
  onRemove: () => void;
}) {
  return (
    <View style={s.sourceCard}>
      <View style={s.sourceIcon}>
        <Ionicons
          name={provenanceTypeIcon(source.type) as any}
          size={16}
          color="#FACC15"
        />
      </View>
      <View style={s.sourceInfo}>
        <Text style={s.sourceLabel}>{source.label}</Text>
        {source.url && (
          <Text style={s.sourceUrl} numberOfLines={1}>
            {source.url}
          </Text>
        )}
        {source.timestamp && (
          <Text style={s.sourceMeta}>
            {new Date(source.timestamp).toLocaleDateString()}
          </Text>
        )}
        <Text style={s.sourceAdded}>
          Added {new Date(source.addedAt).toLocaleDateString()}
        </Text>
      </View>
      <TouchableOpacity
        onPress={onRemove}
        disabled={removing}
        hitSlop={10}
        style={s.removeBtn}
      >
        {removing ? (
          <ActivityIndicator size="small" color="#EF4444" />
        ) : (
          <Ionicons name="trash-outline" size={16} color="#EF444466" />
        )}
      </TouchableOpacity>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#131313' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#1E1E1E',
  },
  headerTitle: { fontSize: 17, fontWeight: '700', color: '#FFFFFF' },
  scroll: { paddingHorizontal: 16, paddingTop: 20, gap: 14 },
  infoCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    backgroundColor: '#60A5FA18',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: '#60A5FA33',
  },
  infoText: {
    flex: 1,
    fontSize: 12,
    color: '#9CA3AF',
    lineHeight: 18,
  },
  section: { gap: 8 },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#9CA3AF',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  emptyCard: {
    backgroundColor: '#1E1E1E',
    borderRadius: 14,
    padding: 28,
    alignItems: 'center',
    gap: 10,
    borderWidth: 1,
    borderColor: '#2A2A2A',
  },
  emptyText: { fontSize: 13, color: '#4B5563' },
  typeRow: { gap: 8, paddingBottom: 4 },
  typeChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#1E1E1E',
    borderRadius: 99,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderWidth: 1,
    borderColor: '#2A2A2A',
  },
  typeChipActive: { backgroundColor: '#FACC15', borderColor: '#FACC15' },
  typeChipText: { fontSize: 12, color: '#9CA3AF', fontWeight: '600' },
  typeChipTextActive: { color: '#1A1A1A' },
  fieldLabel: { fontSize: 13, fontWeight: '700', color: '#FFFFFF' },
  fieldHint: { fontSize: 11, color: '#6B7280', marginTop: -10, lineHeight: 16 },
  input: {
    backgroundColor: '#1E1E1E',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#2A2A2A',
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 13,
    color: '#FFFFFF',
  },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#FACC15',
    borderRadius: 99,
    paddingVertical: 16,
    marginTop: 4,
  },
  addBtnText: { fontSize: 15, fontWeight: '800', color: '#1A1A1A' },
  sourceCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    backgroundColor: '#1E1E1E',
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: '#2A2A2A',
  },
  sourceIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: '#FACC1511',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#FACC1533',
    flexShrink: 0,
  },
  sourceInfo: { flex: 1, gap: 2 },
  sourceLabel: { fontSize: 13, fontWeight: '700', color: '#FFFFFF' },
  sourceUrl: { fontSize: 11, color: '#9CA3AF' },
  sourceMeta: { fontSize: 11, color: '#6B7280' },
  sourceAdded: { fontSize: 10, color: '#4B5563' },
  removeBtn: { padding: 4 },
});
