import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { ethers } from 'ethers';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../constants/colors';
import UploadDropzone, { PickedFile } from '../../components/UploadDropzone';
import CertificateCard from '../../components/CertificateCard';
import { useBlockchain } from '../../hooks/useBlockchain';
import { useWallet } from '../../hooks/useWallet';
import type { CertificateData } from '../../utils/certificate';
import OfflineBanner from '../../components/OfflineBanner';
import { useNetwork } from '../../hooks/useNetwork';
import { checkMassClaiming, checkBotPattern, checkDuplicateClaim } from '../../utils/fraudDetection';
import { getStoredContent } from '../../hooks/useBlockchain';
import { canRegister } from '../../utils/planGating';

type Step = 1 | 2 | 3;
type LicenseTerms = 0 | 1 | 2;

const LICENSE_OPTIONS = [
  {
    value: 0 as LicenseTerms,
    label: 'No Usage Allowed',
    desc: 'All rights reserved. No one may use this work.',
    icon: 'ban-outline',
  },
  {
    value: 1 as LicenseTerms,
    label: 'Non-commercial Only',
    desc: 'Free to use for non-commercial purposes.',
    icon: 'ribbon-outline',
  },
  {
    value: 2 as LicenseTerms,
    label: 'Pay Per Use',
    desc: 'Commercial use allowed with payment.',
    icon: 'cash-outline',
  },
];

function getContentIcon(type: string): string {
  switch (type) {
    case 'image': return 'image-outline';
    case 'video': return 'videocam-outline';
    case 'music': return 'musical-notes-outline';
    case 'code': return 'code-slash-outline';
    default: return 'document-text-outline';
  }
}

function formatBytes(bytes?: number): string {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1048576).toFixed(1)} MB`;
}

export default function RegisterScreen() {
  const [step, setStep] = useState<Step>(1);
  const [contentName, setContentName] = useState('');
  const [pickedFile, setPickedFile] = useState<PickedFile | null>(null);
  const [pastedText, setPastedText] = useState('');
  const [license, setLicense] = useState<LicenseTerms>(1);
  const [rate, setRate] = useState('');
  const [certificate, setCertificate] = useState<CertificateData | null>(null);

  const { register, isLoading } = useBlockchain();
  const { address, signer } = useWallet();
  const { isOnline } = useNetwork();

  const handleFilePickd = (file: PickedFile) => {
    setPickedFile(file);
    if (!contentName) setContentName(file.name.replace(/\.[^.]+$/, ''));
  };

  const handleNext = () => {
    if (step === 1) {
      if (!contentName.trim()) {
        Alert.alert('Missing Info', 'Please enter a content name.');
        return;
      }
      if (!pickedFile && !pastedText.trim()) {
        Alert.alert('Missing Content', 'Please upload a file or paste your content.');
        return;
      }
      setStep(2);
    } else if (step === 2) {
      setStep(3);
    }
  };

  // Compute licensePrice bigint for Pay Per Use
  const licensePrice = useMemo<bigint | undefined>(() => {
    if (license !== 2) return undefined;
    const parsed = parseFloat(rate);
    if (!rate || isNaN(parsed) || parsed <= 0) return undefined;
    try {
      return ethers.parseEther(parsed.toString());
    } catch {
      return undefined;
    }
  }, [license, rate]);

  // POL wei preview string
  const weiPreview = useMemo(() => {
    if (licensePrice === undefined) return '';
    return `${licensePrice.toString()} wei`;
  }, [licensePrice]);

  const handleRegister = async () => {
    const walletAddress = address || '0x0000000000000000000000000000000000000000';

    if (!address) {
      Alert.alert('Wallet Not Connected', 'Please connect your wallet on the Profile tab first.');
      return;
    }

    // ── Plan gating check ─────────────────────────────────────────────────────
    try {
      const allContent = await getStoredContent();
      const gate = await canRegister(walletAddress, allContent.length);
      if (!gate.allowed) {
        Alert.alert(
          'Registration Limit Reached',
          `${gate.reason}\n\n${gate.upgradePrompt ?? ''}`,
          [{ text: 'OK' }]
        );
        return;
      }
    } catch {
      // Non-blocking — proceed if gating check fails
    }

    // Validate rate when Pay Per Use
    if (license === 2) {
      const parsed = parseFloat(rate);
      if (!rate || isNaN(parsed) || parsed <= 0) {
        Alert.alert('Invalid Rate', 'Enter a license price in POL (e.g. 0.5).');
        return;
      }
      if (parsed > 1000) {
        Alert.alert('Rate Too High', 'Maximum license price is 1000 POL.');
        return;
      }
    }

    let rawContent: string;
    let isFile = false;

    if (pickedFile) {
      rawContent = pickedFile.uri;
      isFile = true;
    } else {
      rawContent = pastedText;
      isFile = false;
    }

    // ── Fraud & duplicate checks ──────────────────────────────────────────────
    try {
      const allContent = await getStoredContent();
      const existingHashes = allContent.map((c) => c.contentHash);
      // All local registrations are from this device/wallet — use all timestamps
      const timestamps = allContent.map((c) => c.registeredAt);

      // Duplicate hash check
      const { hashContent } = await import('../../utils/hash');
      const previewHash = await hashContent(rawContent, isFile).catch(() => '');
      if (previewHash) {
        const dupFlag = await checkDuplicateClaim(previewHash, existingHashes);
        if (dupFlag) {
          const confirmed = await new Promise<boolean>((res) => {
            Alert.alert(
              'Existing Claim Detected',
              'This content or a near-identical claim already exists on SIGIL. You can continue with a warning or attach additional provenance to strengthen your claim.',
              [
                { text: 'Cancel', style: 'cancel', onPress: () => res(false) },
                { text: 'Continue Anyway', onPress: () => res(true) },
              ]
            );
          });
          if (!confirmed) return;
        }
      }

      // Mass-claiming / bot pattern checks (use all local content as proxy for this wallet)
      await checkMassClaiming(timestamps, walletAddress);
      await checkBotPattern(timestamps, walletAddress);
    } catch {
      // Non-blocking — proceed regardless
    }

    const result = await register({
      contentName: contentName.trim(),
      contentType: pickedFile?.type || 'text',
      rawContent,
      isFile,
      terms: license,
      licensePrice,
      walletAddress,
      signer: signer ?? undefined,
    });

    if (result) {
      setCertificate(result.certificate);
      setStep(3);
    } else {
      Alert.alert('Registration Failed', 'Something went wrong. Please try again.');
    }
  };

  const handleReset = () => {
    setStep(1);
    setContentName('');
    setPickedFile(null);
    setPastedText('');
    setLicense(1);
    setRate('');
    setCertificate(null);
  };

  const steps = ['Upload', 'Terms', 'Confirm'];

  // Register button is disabled when offline or loading
  const registerDisabled = isLoading || !isOnline;

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <OfflineBanner />
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={styles.scroll}
        >
          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.title}>Claim Your Work</Text>
            <Text style={styles.subtitle}>Register on-chain · Timestamp your claim</Text>
          </View>

          {/* Step indicator */}
          {!certificate && (
            <View style={styles.steps}>
              {steps.map((label, i) => {
                const stepNum = (i + 1) as Step;
                const isActive = step === stepNum;
                const isDone = step > stepNum;
                return (
                  <React.Fragment key={label}>
                    <View style={styles.stepItem}>
                      <View style={[styles.stepDot, isActive && styles.stepDotActive, isDone && styles.stepDotDone]}>
                        {isDone ? (
                          <Ionicons name="checkmark" size={12} color={Colors.onPrimary} />
                        ) : (
                          <Text style={[styles.stepNum, isActive && styles.stepNumActive]}>{stepNum}</Text>
                        )}
                      </View>
                      <Text style={[styles.stepLabel, isActive && styles.stepLabelActive]}>{label}</Text>
                    </View>
                    {i < steps.length - 1 && (
                      <View style={[styles.stepLine, isDone && styles.stepLineDone]} />
                    )}
                  </React.Fragment>
                );
              })}
            </View>
          )}

          {/* STEP 1 — Upload */}
          {step === 1 && (
            <View style={styles.stepContent}>
              {/* Asset metadata */}
              <View style={styles.fieldGroup}>
                <Text style={styles.fieldLabel}>Asset Metadata</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Content name or title..."
                  placeholderTextColor={Colors.textMuted}
                  value={contentName}
                  onChangeText={setContentName}
                />
              </View>

              {/* Upload zone */}
              <UploadDropzone onFilePicked={handleFilePickd} />

              {/* Picked file preview */}
              {pickedFile && (
                <View style={styles.filePreview}>
                  <View style={styles.fileIconWrap}>
                    <Ionicons name={getContentIcon(pickedFile.type) as any} size={22} color={Colors.primary} />
                  </View>
                  <View style={styles.fileInfo}>
                    <Text style={styles.fileName}>{pickedFile.name}</Text>
                    <Text style={styles.fileMeta}>{pickedFile.type} · {formatBytes(pickedFile.size)}</Text>
                  </View>
                  <TouchableOpacity onPress={() => setPickedFile(null)}>
                    <Ionicons name="close-circle" size={20} color={Colors.textMuted} />
                  </TouchableOpacity>
                </View>
              )}

              {/* OR paste */}
              {!pickedFile && (
                <>
                  <View style={styles.orRow}>
                    <View style={styles.orLine} />
                    <Text style={styles.orText}>or paste code / text</Text>
                    <View style={styles.orLine} />
                  </View>
                  <TextInput
                    style={styles.textArea}
                    placeholder="Paste your code or text here..."
                    placeholderTextColor={Colors.textMuted}
                    multiline
                    numberOfLines={6}
                    value={pastedText}
                    onChangeText={setPastedText}
                    textAlignVertical="top"
                  />
                </>
              )}

              <TouchableOpacity style={styles.nextBtn} onPress={handleNext} activeOpacity={0.85}>
                <Text style={styles.nextBtnText}>Set License Terms</Text>
                <Ionicons name="arrow-forward" size={18} color={Colors.onPrimary} />
              </TouchableOpacity>
            </View>
          )}

          {/* STEP 2 — Terms */}
          {step === 2 && (
            <View style={styles.stepContent}>
              <Text style={styles.stepHeading}>Licensing Protocol</Text>
              <Text style={styles.stepSubheading}>How can others use your work?</Text>

              {LICENSE_OPTIONS.map((opt) => (
                <TouchableOpacity
                  key={opt.value}
                  style={[styles.licenseCard, license === opt.value && styles.licenseCardActive]}
                  onPress={() => setLicense(opt.value)}
                  activeOpacity={0.8}
                >
                  <View style={[styles.licenseIconWrap, license === opt.value && styles.licenseIconWrapActive]}>
                    <Ionicons name={opt.icon as any} size={20} color={license === opt.value ? Colors.onPrimary : Colors.textMuted} />
                  </View>
                  <View style={styles.licenseText}>
                    <Text style={[styles.licenseLabel, license === opt.value && styles.licenseLabelActive]}>
                      {opt.label}
                    </Text>
                    <Text style={styles.licenseDesc}>{opt.desc}</Text>
                  </View>
                  <View style={[styles.radioOuter, license === opt.value && styles.radioOuterActive]}>
                    {license === opt.value && <View style={styles.radioInner} />}
                  </View>
                </TouchableOpacity>
              ))}

              {license === 2 && (
                <View style={styles.fieldGroup}>
                  <Text style={styles.fieldLabel}>License Price (POL)</Text>
                  <View style={styles.rateInput}>
                    <Text style={styles.rateDollar}>◈</Text>
                    <TextInput
                      style={styles.rateField}
                      placeholder="0.00"
                      placeholderTextColor={Colors.textMuted}
                      keyboardType="decimal-pad"
                      value={rate}
                      onChangeText={setRate}
                    />
                    <Text style={styles.rateSuffix}>POL per use</Text>
                  </View>
                  {weiPreview ? (
                    <Text style={styles.weiPreview}>{weiPreview}</Text>
                  ) : null}
                </View>
              )}

              <View style={styles.btnRow}>
                <TouchableOpacity style={styles.backBtn} onPress={() => setStep(1)}>
                  <Ionicons name="arrow-back" size={18} color={Colors.onSurface} />
                  <Text style={styles.backBtnText}>Back</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.nextBtnHalf} onPress={handleNext} activeOpacity={0.85}>
                  <Text style={styles.nextBtnText}>Review</Text>
                  <Ionicons name="arrow-forward" size={18} color={Colors.onPrimary} />
                </TouchableOpacity>
              </View>
            </View>
          )}

          {/* STEP 3 — Confirm / Success */}
          {step === 3 && !certificate && (
            <View style={styles.stepContent}>
              <Text style={styles.stepHeading}>Confirm Registration</Text>

              {/* Summary */}
              <View style={styles.summaryCard}>
                <View style={styles.summaryRow}>
                  <Text style={styles.summaryLabel}>Content</Text>
                  <Text style={styles.summaryValue}>{contentName}</Text>
                </View>
                <View style={styles.summaryRow}>
                  <Text style={styles.summaryLabel}>Type</Text>
                  <Text style={styles.summaryValue}>{pickedFile?.type || 'text'}</Text>
                </View>
                <View style={styles.summaryRow}>
                  <Text style={styles.summaryLabel}>License</Text>
                  <Text style={styles.summaryValue}>{LICENSE_OPTIONS[license].label}</Text>
                </View>
                {license === 2 && rate ? (
                  <View style={styles.summaryRow}>
                    <Text style={styles.summaryLabel}>Price</Text>
                    <Text style={styles.summaryValue}>{rate} POL / use</Text>
                  </View>
                ) : null}
                <View style={styles.summaryRow}>
                  <Text style={styles.summaryLabel}>Network</Text>
                  <Text style={[styles.summaryValue, styles.network]}>Polygon Mainnet</Text>
                </View>
              </View>

              <View style={styles.infoBox}>
                <Ionicons name="information-circle-outline" size={16} color={Colors.primary} />
                <Text style={styles.infoText}>
                  This will hash your content, upload metadata to IPFS, and record a timestamped claim on the Polygon blockchain. This is not a legal determination of ownership.
                </Text>
              </View>

              <View style={styles.btnRow}>
                <TouchableOpacity style={styles.backBtn} onPress={() => setStep(2)}>
                  <Ionicons name="arrow-back" size={18} color={Colors.onSurface} />
                  <Text style={styles.backBtnText}>Back</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.nextBtnHalf, registerDisabled && styles.btnDisabled]}
                  onPress={handleRegister}
                  disabled={registerDisabled}
                  activeOpacity={0.85}
                >
                  {isLoading ? (
                    <ActivityIndicator color={Colors.onPrimary} />
                  ) : !isOnline ? (
                    <>
                      <Ionicons name="cloud-offline-outline" size={16} color={Colors.onPrimary} />
                      <Text style={styles.nextBtnText}>Offline</Text>
                    </>
                  ) : (
                    <>
                      <Ionicons name="lock-closed-outline" size={16} color={Colors.onPrimary} />
                      <Text style={styles.nextBtnText}>Register</Text>
                    </>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          )}

          {/* SUCCESS — Certificate */}
          {certificate && (
            <View style={styles.stepContent}>
              <View style={styles.successHeader}>
                <View style={styles.successIcon}>
                  <Ionicons name="checkmark-circle" size={48} color={Colors.primary} />
                </View>
                <Text style={styles.successTitle}>Registered on Blockchain</Text>
                <Text style={styles.successSubtitle}>Your claim is timestamped on the Polygon blockchain</Text>
              </View>

              <CertificateCard certificate={certificate} />

              <TouchableOpacity style={styles.registerAnother} onPress={handleReset}>
                <Text style={styles.registerAnotherText}>Register Another</Text>
              </TouchableOpacity>
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  scroll: { paddingHorizontal: 20, paddingBottom: 40, gap: 20 },
  header: { paddingTop: 12, gap: 4 },
  title: { fontSize: 26, fontWeight: '700', color: Colors.onSurface },
  subtitle: { fontSize: 13, color: Colors.textMuted },
  steps: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.cardElevated,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  stepItem: { alignItems: 'center', gap: 4 },
  stepDot: {
    width: 28,
    height: 28,
    borderRadius: 99,
    backgroundColor: Colors.surfaceContainerHighest,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: Colors.border,
  },
  stepDotActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  stepDotDone: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  stepNum: { fontSize: 12, fontWeight: '700', color: Colors.textMuted },
  stepNumActive: { color: Colors.onPrimary },
  stepLabel: { fontSize: 10, color: Colors.textMuted, fontWeight: '600' },
  stepLabelActive: { color: Colors.primary },
  stepLine: { flex: 1, height: 1, backgroundColor: Colors.border, marginBottom: 14 },
  stepLineDone: { backgroundColor: Colors.primary },
  stepContent: { gap: 16 },
  stepHeading: { fontSize: 20, fontWeight: '700', color: Colors.onSurface },
  stepSubheading: { fontSize: 13, color: Colors.textMuted, marginTop: -8 },
  fieldGroup: { gap: 8 },
  fieldLabel: { fontSize: 12, fontWeight: '600', color: Colors.onSurfaceVariant, letterSpacing: 0.5 },
  input: {
    backgroundColor: Colors.cardElevated,
    borderRadius: 14,
    padding: 14,
    fontSize: 14,
    color: Colors.onSurface,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  filePreview: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: Colors.cardElevated,
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: Colors.primary + '44',
  },
  fileIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: Colors.overlayYellow,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fileInfo: { flex: 1 },
  fileName: { fontSize: 14, fontWeight: '600', color: Colors.onSurface },
  fileMeta: { fontSize: 11, color: Colors.textMuted, marginTop: 2 },
  orRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  orLine: { flex: 1, height: 1, backgroundColor: Colors.border },
  orText: { fontSize: 12, color: Colors.textMuted },
  textArea: {
    backgroundColor: Colors.cardElevated,
    borderRadius: 14,
    padding: 14,
    fontSize: 13,
    color: Colors.onSurface,
    borderWidth: 1,
    borderColor: Colors.border,
    minHeight: 120,
    fontFamily: 'monospace',
  },
  nextBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    backgroundColor: Colors.primary,
    borderRadius: 99,
    paddingVertical: 16,
  },
  nextBtnText: { fontSize: 15, fontWeight: '700', color: Colors.onPrimary },
  licenseCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: Colors.cardElevated,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  licenseCardActive: { borderColor: Colors.primary, backgroundColor: Colors.overlayYellow },
  licenseIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: Colors.surfaceContainerHighest,
    alignItems: 'center',
    justifyContent: 'center',
  },
  licenseIconWrapActive: { backgroundColor: Colors.primary },
  licenseText: { flex: 1, gap: 2 },
  licenseLabel: { fontSize: 14, fontWeight: '700', color: Colors.onSurfaceVariant },
  licenseLabelActive: { color: Colors.primary },
  licenseDesc: { fontSize: 12, color: Colors.textMuted },
  radioOuter: {
    width: 20,
    height: 20,
    borderRadius: 99,
    borderWidth: 2,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioOuterActive: { borderColor: Colors.primary },
  radioInner: { width: 10, height: 10, borderRadius: 99, backgroundColor: Colors.primary },
  rateInput: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.cardElevated,
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: Colors.border,
    gap: 8,
  },
  rateDollar: { fontSize: 16, fontWeight: '700', color: Colors.primary },
  rateField: { flex: 1, fontSize: 14, color: Colors.onSurface },
  rateSuffix: { fontSize: 12, color: Colors.textMuted },
  weiPreview: { fontSize: 10, color: Colors.textMuted, fontFamily: 'monospace', paddingLeft: 4 },
  btnRow: { flexDirection: 'row', gap: 10 },
  backBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: Colors.cardElevated,
    borderRadius: 99,
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  backBtnText: { fontSize: 14, fontWeight: '600', color: Colors.onSurface },
  nextBtnHalf: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: Colors.primary,
    borderRadius: 99,
    paddingVertical: 14,
  },
  btnDisabled: { opacity: 0.6 },
  summaryCard: {
    backgroundColor: Colors.cardElevated,
    borderRadius: 16,
    padding: 16,
    gap: 12,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between' },
  summaryLabel: { fontSize: 13, color: Colors.textMuted },
  summaryValue: { fontSize: 13, fontWeight: '600', color: Colors.onSurface },
  network: { color: Colors.primary },
  infoBox: {
    flexDirection: 'row',
    gap: 8,
    backgroundColor: Colors.overlayYellow,
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: Colors.primary + '33',
    alignItems: 'flex-start',
  },
  infoText: { flex: 1, fontSize: 12, color: Colors.onSurfaceVariant, lineHeight: 18 },
  successHeader: { alignItems: 'center', gap: 8, paddingTop: 12 },
  successIcon: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: Colors.overlayYellow,
    alignItems: 'center',
    justifyContent: 'center',
  },
  successTitle: { fontSize: 22, fontWeight: '700', color: Colors.onSurface },
  successSubtitle: { fontSize: 13, color: Colors.textMuted },
  registerAnother: {
    alignItems: 'center',
    paddingVertical: 16,
  },
  registerAnotherText: { fontSize: 14, fontWeight: '600', color: Colors.primary },
});
