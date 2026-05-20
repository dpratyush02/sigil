import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Share,
  Alert as RNAlert,
  Platform,
  Linking,
  Clipboard,
  ActivityIndicator,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../constants/colors';
import { useScanner } from '../../hooks/useScanner';
import { generateAndSharePDF, savePDFLocally } from '../../utils/pdfReport';
import DMCATemplate, { DMCAData } from '../../components/DMCATemplate';

// Use React Native's built-in Clipboard (avoids extra dependency)
const ClipboardAPI = Clipboard as any;

function buildAlertEvidenceText(alert: ReturnType<ReturnType<typeof useScanner>['getAlertById']>): string {
  if (!alert) return '';
  const score = Math.round(alert.confidence ?? alert.similarity ?? 0);
  return [
    '═══ SIGIL INFRINGEMENT EVIDENCE ═══',
    '',
    `Asset:         ${alert.contentName}`,
    `Type:          ${alert.contentType}`,
    `Source:        ${alert.source}`,
    `Match Score:   ${score}%`,
    `Detected:      ${new Date(alert.detectedAt).toLocaleString()}`,
    '',
    '── Detection Details ──',
    alert.reason ? `Reason:        ${alert.reason}` : null,
    '',
    '── Source ──',
    `URL:           ${alert.sourceUrl ?? 'Unknown'}`,
    '',
    '── On-Chain Registration ──',
    `TX Hash:       ${alert.txHash ?? 'N/A'}`,
    alert.ipfsCid ? `IPFS CID:      ${alert.ipfsCid}` : null,
    alert.contentHash ? `Content Hash:  ${alert.contentHash}` : null,
    alert.watermark ? `Watermark:     ${alert.watermark}` : null,
    '',
    alert.txHash ? `Verify: https://polygonscan.com/tx/${alert.txHash}` : null,
    '═══════════════════════════════════',
  ]
    .filter((l): l is string => l !== null)
    .join('\n');
}

function copyText(value: string) {
  try {
    ClipboardAPI.setString(value);
  } catch {
    Share.share({ message: value }).catch(() => {});
  }
}

export default function EvidenceScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { getAlertById } = useScanner();
  const alert = getAlertById(id ?? '');
  const [copied, setCopied] = useState<string | null>(null);
  const [pdfLoading, setPdfLoading] = useState(false);

  const handleCopy = useCallback((value: string, label: string) => {
    copyText(value);
    setCopied(label);
    setTimeout(() => setCopied(null), 1500);
  }, []);

  const handleShareEvidence = useCallback(async () => {
    if (!alert) return;
    try {
      await Share.share({
        message: buildAlertEvidenceText(alert),
        title: `SIGIL — Evidence for ${alert.contentName}`,
      });
    } catch (err: any) {
      if (err?.message !== 'The user did not share') {
        RNAlert.alert('Share failed', err?.message ?? 'Unknown error');
      }
    }
  }, [alert]);

  const handleExportPDF = useCallback(async () => {
    if (!alert) return;
    setPdfLoading(true);
    try {
      await generateAndSharePDF(alert);
    } catch (err: any) {
      RNAlert.alert('PDF Export Failed', err?.message ?? 'Could not generate PDF. Please try again.');
    } finally {
      setPdfLoading(false);
    }
  }, [alert]);

  const handleSavePDF = useCallback(async () => {
    if (!alert) return;
    setPdfLoading(true);
    try {
      const uri = await savePDFLocally(alert);
      RNAlert.alert('PDF Saved', `Evidence report saved to:\n${uri}`, [{ text: 'OK' }]);
    } catch (err: any) {
      RNAlert.alert('Save Failed', err?.message ?? 'Could not save PDF.');
    } finally {
      setPdfLoading(false);
    }
  }, [alert]);

  const handleOpenInBrowser = useCallback(async () => {
    if (!alert?.sourceUrl) return;
    const url = alert.sourceUrl;
    // Security: only allow http/https — block javascript:, data:, deep-links etc.
    if (!/^https?:\/\//i.test(url)) {
      RNAlert.alert('Invalid URL', 'Only http/https links can be opened.');
      return;
    }
    const supported = await Linking.canOpenURL(url);
    if (supported) {
      await Linking.openURL(url);
    } else {
      RNAlert.alert('Cannot Open', `URL not supported:\n${url}`);
    }
  }, [alert]);

  const handleViewOnChain = useCallback(async () => {
    if (!alert?.txHash) return;
    await Linking.openURL(`https://polygonscan.com/tx/${alert.txHash}`);
  }, [alert]);

  const handleRequestPayment = useCallback(() => {
    if (!alert) return;
    RNAlert.alert(
      'Request Payment',
      `Generate a payment request for unauthorized use of "${alert.contentName}"?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Copy Template',
          onPress: () =>
            handleCopy(
              `DMCA Payment Request\n\nI am the owner of "${alert.contentName}", registered on Polygon.\nTX: ${alert.txHash ?? 'N/A'}\n\nI demand removal or licensing of content at:\n${alert.sourceUrl ?? 'Unknown'}\n\nContact me to arrange licensing terms.`,
              'payment'
            ),
        },
      ]
    );
  }, [alert, handleCopy]);

  const handleCopyDMCA = useCallback(() => {
    if (!alert) return;
    const template = [
      `DMCA TAKEDOWN NOTICE`,
      ``,
      `To: ${alert.source} Legal Team`,
      `Re: Copyright Infringement`,
      ``,
      `I am the copyright owner of "${alert.contentName}".`,
      `The following URL contains infringing content:`,
      alert.sourceUrl ?? 'Unknown',
      ``,
      `My original work is registered on-chain:`,
      `Network: Polygon Mainnet`,
      `TX Hash: ${alert.txHash ?? 'N/A'}`,
      `IPFS CID: ${alert.ipfsCid ?? 'N/A'}`,
      `Content Hash: ${alert.contentHash ?? 'N/A'}`,
      ``,
      `I request immediate removal of this content under 17 U.S.C. § 512.`,
    ].join('\n');
    handleCopy(template, 'dmca');
    RNAlert.alert('DMCA Notice Copied', 'Template copied to clipboard — paste it into your email client.');
  }, [alert, handleCopy]);

  // ── Not found ────────────────────────────────────────────────────────────────
  if (!alert) {
    return (
      <SafeAreaView style={s.container}>
        <View style={s.errorContainer}>
          <Ionicons name="warning-outline" size={48} color={Colors.accent} />
          <Text style={s.errorTitle}>Evidence Not Found</Text>
          <Text style={s.errorSubtitle}>
            {id ? `Alert ID: ${id}` : 'No alert ID provided'}
          </Text>
          <Text style={s.errorNote}>This alert may have been archived or doesn't exist.</Text>
          <TouchableOpacity style={s.backBtn} onPress={() => router.back()}>
            <Text style={s.backBtnText}>Go Back</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const score = Math.round(alert.confidence ?? alert.similarity ?? 0);
  const confidenceColor = score >= 85 ? Colors.accent : score >= 65 ? '#F97316' : '#EF4444';
  const confidenceLabel =
    score >= 85 ? 'HIGH CONFIDENCE' : score >= 65 ? 'MEDIUM CONFIDENCE' : 'LOW CONFIDENCE';

  const yourCode =
    alert.evidence?.originalSnippet ??
    `// ${alert.contentName}\n// SIGIL Hash: ${alert.contentHash?.slice(0, 12) ?? 'N/A'}...\n// Original implementation`;
  const foundCode =
    alert.evidence?.foundSnippet ??
    `// Source: ${alert.sourceUrl}\n// Similarity: ${score}%\n// No license found`;

  const shortTxHash = alert.txHash
    ? `${alert.txHash.slice(0, 10)}...${alert.txHash.slice(-8)}`
    : 'Pending';
  const shortCid = alert.ipfsCid
    ? `${alert.ipfsCid.slice(0, 10)}...${alert.ipfsCid.slice(-8)}`
    : 'Pending';

  return (
    <SafeAreaView style={s.container} edges={['top', 'bottom']}>
      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} style={s.headerBack}>
          <Ionicons name="chevron-back" size={22} color={Colors.textPrimary} />
        </TouchableOpacity>
        <Text style={s.headerTitle}>Evidence Report</Text>
        <TouchableOpacity style={s.headerAction} onPress={handleShareEvidence}>
          <Ionicons name="share-outline" size={20} color={Colors.textMuted} />
        </TouchableOpacity>
      </View>

      <ScrollView style={s.scroll} contentContainerStyle={s.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Confidence Banner */}
        <View style={[s.banner, { backgroundColor: confidenceColor + '22', borderColor: confidenceColor + '66' }]}>
          <Ionicons name="shield-checkmark" size={20} color={confidenceColor} />
          <Text style={[s.bannerText, { color: confidenceColor }]}>{confidenceLabel} — {score}%</Text>
          {alert.reviewed && (
            <View style={s.reviewedTag}>
              <Ionicons name="checkmark-circle" size={13} color="#22C55E" />
              <Text style={s.reviewedTagText}>Reviewed</Text>
            </View>
          )}
        </View>

        {/* Asset Info */}
        <View style={s.card}>
          <Text style={s.label}>ASSET</Text>
          <Text style={s.assetName}>{alert.contentName}</Text>
          {alert.sourceUrl ? (
            <TouchableOpacity onPress={handleOpenInBrowser} activeOpacity={0.7}>
              <Text style={s.assetUrl} numberOfLines={1}>{alert.sourceUrl} ↗</Text>
            </TouchableOpacity>
          ) : (
            <Text style={s.assetUrlMuted}>No source URL</Text>
          )}
          <View style={s.badgeRow}>
            <View style={s.badge}><Text style={s.badgeText}>{alert.contentType.toUpperCase()}</Text></View>
            <View style={s.badge}><Text style={s.badgeText}>{alert.source}</Text></View>
          </View>
        </View>

        {/* PDF Export Actions */}
        <View style={s.pdfRow}>
          <TouchableOpacity
            style={[s.pdfBtn, pdfLoading && s.pdfBtnDisabled]}
            onPress={handleExportPDF}
            disabled={pdfLoading}
            activeOpacity={0.8}
          >
            {pdfLoading ? (
              <ActivityIndicator size="small" color="#000" />
            ) : (
              <Ionicons name="document-text" size={16} color="#000" />
            )}
            <Text style={s.pdfBtnText}>{pdfLoading ? 'Generating…' : 'Export PDF'}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={s.pdfBtnOutline}
            onPress={handleSavePDF}
            disabled={pdfLoading}
            activeOpacity={0.8}
          >
            <Ionicons name="download-outline" size={16} color={Colors.accent} />
            <Text style={s.pdfBtnOutlineText}>Save Locally</Text>
          </TouchableOpacity>
        </View>

        {/* Code diff */}
        <Text style={s.sectionLabel}>CONTENT COMPARISON</Text>
        <View style={s.diffRow}>
          <View style={[s.diffPanel, { borderLeftColor: '#22C55E' }]}>
            <View style={s.diffHeader}>
              <View style={[s.diffDot, { backgroundColor: '#22C55E' }]} />
              <Text style={s.diffTitle}>YOURS</Text>
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <Text style={[s.diffCode, { color: '#22C55E' }]}>{yourCode}</Text>
            </ScrollView>
          </View>
          <View style={[s.diffPanel, { borderLeftColor: '#EF4444' }]}>
            <View style={s.diffHeader}>
              <View style={[s.diffDot, { backgroundColor: '#EF4444' }]} />
              <Text style={s.diffTitle}>FOUND</Text>
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <Text style={[s.diffCode, { color: '#EF4444' }]}>{foundCode}</Text>
            </ScrollView>
          </View>
        </View>

        {/* Similarity Breakdown */}
        {alert.layers && (
          <>
            <Text style={s.sectionLabel}>SIMILARITY BREAKDOWN</Text>
            <View style={s.metaCard}>
              {alert.layers.exact && (
                <SimilarityRow label="Exact Match" pct={100} color="#EF4444" />
              )}
              <SimilarityRow label="Levenshtein" pct={alert.layers.levenshtein ?? 0} color={Colors.accent} />
              <SimilarityRow label="Token Overlap" pct={alert.layers.tokenOverlap ?? 0} color={Colors.accent} />
              <SimilarityRow label="Cosine" pct={alert.layers.cosine ?? 0} color={Colors.accent} />
              <View style={s.divider} />
              <SimilarityRow label="Combined Score" pct={score} color={confidenceColor} bold />
            </View>
          </>
        )}

        {/* On-Chain Metadata */}
        <Text style={s.sectionLabel}>ON-CHAIN METADATA</Text>
        <View style={s.metaCard}>
          <MetaRow
            icon="link"
            label="TX HASH"
            value={shortTxHash}
            onCopy={alert.txHash ? () => handleCopy(alert.txHash!, 'txHash') : undefined}
            copyDone={copied === 'txHash'}
            onOpen={alert.txHash ? handleViewOnChain : undefined}
          />
          <View style={s.divider} />
          <MetaRow
            icon="cloud"
            label="IPFS CID"
            value={shortCid}
            onCopy={alert.ipfsCid ? () => handleCopy(alert.ipfsCid!, 'cid') : undefined}
            copyDone={copied === 'cid'}
          />
          <View style={s.divider} />
          <MetaRow icon="time" label="DETECTED" value={new Date(alert.detectedAt).toLocaleString()} />
          <View style={s.divider} />
          <MetaRow
            icon="finger-print"
            label="CONTENT HASH"
            value={
              alert.contentHash
                ? `${alert.contentHash.slice(0, 10)}...${alert.contentHash.slice(-8)}`
                : 'N/A'
            }
            onCopy={alert.contentHash ? () => handleCopy(alert.contentHash!, 'hash') : undefined}
            copyDone={copied === 'hash'}
          />
          {alert.watermark && (
            <>
              <View style={s.divider} />
              <MetaRow icon="shield" label="SIGIL WATERMARK" value={alert.watermark} />
            </>
          )}
        </View>

        {/* Legal Disclaimer */}
        <View style={s.legalDisclaimer}>
          <Ionicons name="alert-circle-outline" size={14} color="#6B7280" />
          <Text style={s.legalDisclaimerText}>
            <Text style={{ color: '#9CA3AF', fontWeight: '700' }}>Legal Notice: </Text>
            This report reflects a timestamped blockchain claim and automated similarity analysis only.
            It is not legal proof of copyright ownership. Consult a qualified intellectual property
            attorney before taking any legal action.
          </Text>
        </View>

        {/* DMCA Template */}
        <Text style={s.sectionLabel}>DMCA TAKEDOWN NOTICE</Text>
        <DMCATemplate
          data={{
            contentName: alert.contentName,
            contentType: alert.contentType,
            ownerWallet: alert.txHash ? '(your wallet)' : 'Unknown',
            registrationDate: new Date(alert.detectedAt).toLocaleDateString('en-US', {
              month: 'long', day: 'numeric', year: 'numeric',
            }),
            txHash: alert.txHash ?? 'Pending',
            ipfsCid: alert.ipfsCid,
            contentHash: alert.contentHash ?? '',
            infringingUrl: alert.sourceUrl ?? 'Unknown',
            infringingPlatform: alert.source,
            detectedAt: new Date(alert.detectedAt).toLocaleDateString(),
            similarity: score,
          }}
        />

        {/* Dispute / Provenance Nav */}
        <View style={s.disputeRow}>
          <TouchableOpacity
            style={s.disputeBtn}
            onPress={() =>
              router.push({
                pathname: '/dispute/[id]',
                params: { id: alert.contentHash ?? id },
              } as any)
            }
            activeOpacity={0.85}
          >
            <Ionicons name="flag-outline" size={16} color="#F97316" />
            <Text style={s.disputeBtnText}>Challenge This Claim</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={s.provenanceBtn}
            onPress={() =>
              router.push({
                pathname: '/provenance/[id]',
                params: { id: alert.contentHash ?? id },
              } as any)
            }
            activeOpacity={0.85}
          >
            <Ionicons name="git-network-outline" size={16} color="#60A5FA" />
            <Text style={s.provenanceBtnText}>View Provenance</Text>
          </TouchableOpacity>
        </View>

        {/* Action Buttons */}
        <View style={s.actions}>
          <TouchableOpacity style={s.btnPrimary} onPress={handleShareEvidence}>
            <Ionicons name="share-social-outline" size={18} color="#000" />
            <Text style={s.btnPrimaryText}>Share Evidence (Text)</Text>
          </TouchableOpacity>

          {alert.sourceUrl && (
            <TouchableOpacity style={s.btnOutline} onPress={handleOpenInBrowser}>
              <Ionicons name="globe-outline" size={18} color={Colors.textPrimary} />
              <Text style={s.btnOutlineText}>Open Source URL</Text>
            </TouchableOpacity>
          )}

          <TouchableOpacity style={s.btnOutline} onPress={handleRequestPayment}>
            <Ionicons name="cash-outline" size={18} color={Colors.textPrimary} />
            <Text style={s.btnOutlineText}>Request Payment</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────
function SimilarityRow({
  label,
  pct,
  color,
  bold,
}: {
  label: string;
  pct: number;
  color: string;
  bold?: boolean;
}) {
  return (
    <View style={s.simRow}>
      <Text style={[s.simLabel, bold && { color, fontWeight: '700' }]}>{label}</Text>
      <View style={s.simTrack}>
        <View style={[s.simFill, { width: `${Math.min(pct, 100)}%`, backgroundColor: color }]} />
      </View>
      <Text style={[s.simPct, { color }]}>{pct}%</Text>
    </View>
  );
}

function MetaRow({
  icon,
  label,
  value,
  onCopy,
  copyDone,
  onOpen,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: string;
  onCopy?: () => void;
  copyDone?: boolean;
  onOpen?: () => void;
}) {
  return (
    <View style={s.metaRow}>
      <View style={s.metaIcon}>
        <Ionicons name={icon} size={14} color={Colors.accent} />
      </View>
      <View style={s.metaContent}>
        <Text style={s.metaKey}>{label}</Text>
        <Text style={s.metaValue} selectable>{value}</Text>
      </View>
      <View style={{ flexDirection: 'row', gap: 4 }}>
        {onCopy && (
          <TouchableOpacity onPress={onCopy} style={s.metaBtn}>
            <Ionicons
              name={copyDone ? 'checkmark-outline' : 'copy-outline'}
              size={15}
              color={copyDone ? '#22C55E' : Colors.textMuted}
            />
          </TouchableOpacity>
        )}
        {onOpen && (
          <TouchableOpacity onPress={onOpen} style={s.metaBtn}>
            <Ionicons name="open-outline" size={15} color={Colors.textMuted} />
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  errorContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 16 },
  errorTitle: { fontSize: 20, fontWeight: '700', color: Colors.textPrimary },
  errorSubtitle: { fontSize: 14, color: Colors.textMuted },
  errorNote: { fontSize: 12, color: Colors.textMuted, textAlign: 'center', lineHeight: 18 },
  backBtn: { marginTop: 16, paddingHorizontal: 24, paddingVertical: 12, backgroundColor: Colors.accent, borderRadius: 99 },
  backBtnText: { fontSize: 14, fontWeight: '700', color: '#000' },
  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 20, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  headerBack: { padding: 4 },
  headerTitle: { flex: 1, textAlign: 'center', fontSize: 17, fontWeight: '700', color: Colors.textPrimary, letterSpacing: 0.5 },
  headerAction: { padding: 4 },
  scroll: { flex: 1 },
  scrollContent: { padding: 20, paddingBottom: 40, gap: 16 },
  banner: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 20, paddingVertical: 14,
    borderRadius: 14, borderWidth: 1.5,
  },
  bannerText: { fontSize: 13, fontWeight: '800', letterSpacing: 0.8, flex: 1 },
  reviewedTag: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    backgroundColor: '#22C55E22', borderRadius: 6,
    paddingHorizontal: 8, paddingVertical: 3,
  },
  reviewedTagText: { fontSize: 11, fontWeight: '700', color: '#22C55E' },
  card: { backgroundColor: Colors.surface, borderRadius: 16, padding: 16, gap: 4 },
  label: { fontSize: 10, fontWeight: '700', color: Colors.accent, letterSpacing: 2 },
  assetName: { fontSize: 18, fontWeight: '700', color: Colors.textPrimary },
  assetUrl: { fontSize: 12, color: Colors.accent, marginTop: 2 },
  assetUrlMuted: { fontSize: 12, color: Colors.textMuted, marginTop: 2 },
  badgeRow: { flexDirection: 'row', gap: 8, marginTop: 8 },
  badge: { paddingHorizontal: 8, paddingVertical: 3, backgroundColor: Colors.background, borderRadius: 6, borderWidth: 1, borderColor: Colors.border },
  badgeText: { fontSize: 10, fontWeight: '700', color: Colors.textMuted, letterSpacing: 1 },

  pdfRow: { flexDirection: 'row', gap: 10 },
  pdfBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, backgroundColor: Colors.accent, paddingVertical: 13, borderRadius: 12,
  },
  pdfBtnDisabled: { opacity: 0.6 },
  pdfBtnText: { fontSize: 14, fontWeight: '700', color: '#000' },
  pdfBtnOutline: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, borderWidth: 1.5, borderColor: Colors.accent + '88',
    paddingVertical: 13, borderRadius: 12,
  },
  pdfBtnOutlineText: { fontSize: 14, fontWeight: '700', color: Colors.accent },

  sectionLabel: { fontSize: 11, fontWeight: '700', color: Colors.textMuted, letterSpacing: 2, marginTop: 4 },
  diffRow: { flexDirection: 'row', gap: 8 },
  diffPanel: { flex: 1, backgroundColor: Colors.surface, borderRadius: 12, padding: 12, minHeight: 160, borderLeftWidth: 2 },
  diffHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 },
  diffDot: { width: 8, height: 8, borderRadius: 4 },
  diffTitle: { fontSize: 10, fontWeight: '800', color: Colors.textPrimary, letterSpacing: 1.5 },
  diffCode: { fontSize: 9, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', lineHeight: 14 },

  simRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12, paddingVertical: 8 },
  simLabel: { fontSize: 12, color: Colors.textMuted, width: 110, flexShrink: 0 },
  simTrack: { flex: 1, height: 4, backgroundColor: Colors.background, borderRadius: 99, overflow: 'hidden' },
  simFill: { height: 4, borderRadius: 99 },
  simPct: { fontSize: 12, fontWeight: '700', width: 36, textAlign: 'right' },

  metaCard: { backgroundColor: Colors.surface, borderRadius: 16, padding: 4 },
  metaRow: { flexDirection: 'row', alignItems: 'center', padding: 12, gap: 12 },
  metaIcon: { width: 28, height: 28, borderRadius: 8, backgroundColor: Colors.background, alignItems: 'center', justifyContent: 'center' },
  metaContent: { flex: 1, gap: 2 },
  metaKey: { fontSize: 10, fontWeight: '700', color: Colors.textMuted, letterSpacing: 1.5 },
  metaValue: { fontSize: 13, color: Colors.textPrimary, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' },
  metaBtn: { width: 28, height: 28, borderRadius: 8, backgroundColor: Colors.background, alignItems: 'center', justifyContent: 'center' },
  divider: { height: 1, backgroundColor: Colors.border, marginHorizontal: 12 },
  actions: { gap: 12, marginTop: 8 },
  btnPrimary: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, backgroundColor: Colors.accent, paddingVertical: 16, borderRadius: 99 },
  btnPrimaryText: { fontSize: 15, fontWeight: '800', color: '#000', letterSpacing: 0.5 },
  btnOutline: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, borderWidth: 1.5, borderColor: Colors.border, paddingVertical: 16, borderRadius: 99 },
  btnOutlineText: { fontSize: 15, fontWeight: '700', color: Colors.textPrimary, letterSpacing: 0.5 },
  btnDanger: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, borderWidth: 1.5, borderColor: '#EF444466', paddingVertical: 16, borderRadius: 99 },
  btnDangerText: { fontSize: 15, fontWeight: '700', color: '#EF4444', letterSpacing: 0.5 },
  legalDisclaimer: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    backgroundColor: '#1E1E1E',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: '#2A2A2A',
    marginBottom: 8,
  },
  legalDisclaimerText: {
    flex: 1,
    fontSize: 11,
    color: '#6B7280',
    lineHeight: 17,
    fontStyle: 'italic',
  },
  disputeRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 8,
  },
  disputeBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#F9731633',
    backgroundColor: '#F9731608',
  },
  disputeBtnText: { fontSize: 13, fontWeight: '700', color: '#F97316' },
  provenanceBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#60A5FA33',
    backgroundColor: '#60A5FA08',
  },
  provenanceBtnText: { fontSize: 13, fontWeight: '700', color: '#60A5FA' },
});
