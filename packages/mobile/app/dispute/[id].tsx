/**
 * SIGIL — Dispute Submission Screen
 *
 * Allows anyone to challenge an ownership claim within the 7-day window.
 * Dispute data stored locally. No on-chain interaction.
 */

import React, { useState, useCallback } from 'react';
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
  submitDispute,
  formatChallengeWindow,
  challengeWindowRemaining,
} from '../../services/dispute';
import { useWallet } from '../../hooks/useWallet';

export default function DisputeScreen() {
  const { id: contentHash } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { address } = useWallet();

  const [statement, setStatement] = useState('');
  const [evidenceNote, setEvidenceNote] = useState('');
  const [evidenceUrl1, setEvidenceUrl1] = useState('');
  const [evidenceUrl2, setEvidenceUrl2] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  // Parse out registeredAt from query param if passed
  const registeredAtParam = useLocalSearchParams<{ registeredAt?: string }>().registeredAt;
  const registeredAt = registeredAtParam ? parseInt(registeredAtParam, 10) : Date.now() - 1000;
  const windowRemaining = challengeWindowRemaining(registeredAt);
  const windowLabel = formatChallengeWindow(registeredAt);

  const handleSubmit = useCallback(async () => {
    if (!statement.trim()) {
      RNAlert.alert('Required', 'Please provide a statement explaining the basis of your dispute.');
      return;
    }
    if (!address) {
      RNAlert.alert('Wallet Required', 'Connect your wallet to submit a dispute.');
      return;
    }
    if (windowRemaining === 0) {
      RNAlert.alert('Window Closed', 'The 7-day challenge window for this claim has expired.');
      return;
    }

    setSubmitting(true);
    try {
      const urls = [evidenceUrl1, evidenceUrl2].filter((u) => u.trim().length > 0);
      await submitDispute({
        contentHash: contentHash ?? '',
        contentName: contentHash ?? 'Unknown',
        claimantAddress: address,
        claimantStatement: statement.trim(),
        evidenceUrls: urls,
        evidenceNote: evidenceNote.trim(),
      });
      setSubmitted(true);
    } catch (err: any) {
      RNAlert.alert('Submission Failed', err?.message ?? 'Could not submit dispute. Try again.');
    } finally {
      setSubmitting(false);
    }
  }, [statement, evidenceNote, evidenceUrl1, evidenceUrl2, address, contentHash, windowRemaining]);

  if (submitted) {
    return (
      <SafeAreaView style={s.root}>
        <View style={s.successWrap}>
          <View style={s.successIcon}>
            <Ionicons name="checkmark-circle" size={52} color="#22C55E" />
          </View>
          <Text style={s.successTitle}>Dispute Submitted</Text>
          <Text style={s.successBody}>
            Your dispute has been recorded. The claim status will update to "Challenge Active".
            Disputes are reviewed within 48 hours.
          </Text>
          <View style={s.disclaimerBox}>
            <Ionicons name="information-circle-outline" size={15} color="#6B7280" />
            <Text style={s.disclaimerText}>
              This dispute system is informational. SIGIL does not adjudicate legal ownership.
              For legal disputes, consult a qualified attorney.
            </Text>
          </View>
          <TouchableOpacity style={s.doneBtn} onPress={() => router.back()}>
            <Text style={s.doneBtnText}>Done</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

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
          <Text style={s.headerTitle}>Challenge Claim</Text>
          <View style={{ width: 22 }} />
        </View>

        <ScrollView
          contentContainerStyle={s.scroll}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* Info card */}
          <View style={s.infoCard}>
            <View style={s.infoRow}>
              <Ionicons name="timer-outline" size={16} color="#F97316" />
              <Text style={s.infoText}>{windowLabel}</Text>
            </View>
            {windowRemaining === 0 && (
              <Text style={s.windowClosed}>
                The challenge window for this claim has closed. You can no longer dispute it.
              </Text>
            )}
          </View>

          {/* Disclaimer */}
          <View style={s.disclaimerBox}>
            <Ionicons name="alert-circle-outline" size={15} color="#9CA3AF" />
            <Text style={s.disclaimerText}>
              Filing a dispute creates a local record only. It does not constitute legal action.
              This system helps surface conflicting claims — it does not determine legal ownership.
              Consult an attorney for legal disputes.
            </Text>
          </View>

          {/* Statement */}
          <Text style={s.fieldLabel}>Your Statement *</Text>
          <Text style={s.fieldHint}>
            Explain why you believe this claim is incorrect or was made in bad faith.
          </Text>
          <TextInput
            style={[s.textArea, { height: 120 }]}
            multiline
            placeholder="e.g. I published this work on [date] at [URL], prior to the date of this claim..."
            placeholderTextColor="#4B5563"
            value={statement}
            onChangeText={setStatement}
            textAlignVertical="top"
            editable={windowRemaining > 0}
          />

          {/* Evidence URLs */}
          <Text style={s.fieldLabel}>Evidence URLs (optional)</Text>
          <Text style={s.fieldHint}>Links to your original publication, GitHub commit, etc.</Text>
          <TextInput
            style={s.input}
            placeholder="https://github.com/you/repo/commit/..."
            placeholderTextColor="#4B5563"
            value={evidenceUrl1}
            onChangeText={setEvidenceUrl1}
            autoCapitalize="none"
            keyboardType="url"
            editable={windowRemaining > 0}
          />
          <TextInput
            style={[s.input, { marginTop: 8 }]}
            placeholder="https://example.com/your-publication"
            placeholderTextColor="#4B5563"
            value={evidenceUrl2}
            onChangeText={setEvidenceUrl2}
            autoCapitalize="none"
            keyboardType="url"
            editable={windowRemaining > 0}
          />

          {/* Additional note */}
          <Text style={s.fieldLabel}>Additional Notes (optional)</Text>
          <TextInput
            style={[s.textArea, { height: 80 }]}
            multiline
            placeholder="Any additional context or information..."
            placeholderTextColor="#4B5563"
            value={evidenceNote}
            onChangeText={setEvidenceNote}
            textAlignVertical="top"
            editable={windowRemaining > 0}
          />

          {/* Submit */}
          <TouchableOpacity
            style={[
              s.submitBtn,
              (submitting || windowRemaining === 0) && { opacity: 0.5 },
            ]}
            onPress={handleSubmit}
            activeOpacity={0.85}
            disabled={submitting || windowRemaining === 0}
          >
            {submitting ? (
              <ActivityIndicator color="#1A1A1A" />
            ) : (
              <>
                <Ionicons name="flag-outline" size={18} color="#1A1A1A" />
                <Text style={s.submitBtnText}>Submit Dispute</Text>
              </>
            )}
          </TouchableOpacity>

          <View style={{ height: 40 }} />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
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
  scroll: { paddingHorizontal: 16, paddingTop: 20, gap: 16 },
  infoCard: {
    backgroundColor: '#1E1E1E',
    borderRadius: 14,
    padding: 14,
    gap: 6,
    borderWidth: 1,
    borderColor: '#F9731633',
  },
  infoRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  infoText: { fontSize: 13, color: '#F97316', fontWeight: '600' },
  windowClosed: { fontSize: 12, color: '#EF4444', lineHeight: 18 },
  disclaimerBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    backgroundColor: '#1E1E1E',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: '#2A2A2A',
  },
  disclaimerText: {
    flex: 1,
    fontSize: 11,
    color: '#9CA3AF',
    lineHeight: 17,
    fontStyle: 'italic',
  },
  fieldLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: '#FFFFFF',
    marginBottom: 4,
  },
  fieldHint: {
    fontSize: 11,
    color: '#6B7280',
    marginBottom: 8,
    lineHeight: 16,
  },
  textArea: {
    backgroundColor: '#1E1E1E',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#2A2A2A',
    padding: 14,
    fontSize: 13,
    color: '#FFFFFF',
    lineHeight: 20,
  },
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
  submitBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#FACC15',
    borderRadius: 99,
    paddingVertical: 16,
    marginTop: 8,
  },
  submitBtnText: { fontSize: 15, fontWeight: '800', color: '#1A1A1A' },
  // Success state
  successWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    gap: 16,
  },
  successIcon: {
    width: 80,
    height: 80,
    borderRadius: 24,
    backgroundColor: '#22C55E18',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#22C55E33',
  },
  successTitle: { fontSize: 22, fontWeight: '800', color: '#FFFFFF', textAlign: 'center' },
  successBody: {
    fontSize: 14,
    color: '#9CA3AF',
    textAlign: 'center',
    lineHeight: 22,
  },
  doneBtn: {
    backgroundColor: '#FACC15',
    borderRadius: 99,
    paddingHorizontal: 40,
    paddingVertical: 14,
    marginTop: 8,
  },
  doneBtnText: { fontSize: 15, fontWeight: '800', color: '#1A1A1A' },
});
