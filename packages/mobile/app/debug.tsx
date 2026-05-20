/**
 * SIGIL — Debug / Diagnostics Screen
 *
 * Shows:
 * - Wallet address + connection state
 * - Blockchain RPC + contract address
 * - Scanner health (last scan, success/fail, total matches)
 * - API rate limit status per scanner
 * - Recent logs (last 50)
 * - Registered content count
 */

import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  RefreshControl,
  Share,
  Alert,
  Clipboard,
  Platform,
  Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Colors } from '../constants/colors';
import { getScanHealth, ScanHealth } from '../services/scanner';
import { getStoredContent } from '../hooks/useBlockchain';
import { Storage } from '../utils/storage';
import { Logger } from '../utils/logger';
import { CONTRACT_ADDRESS, IS_MOCK_MODE } from '../constants/contract';

const SECTION_LABELS: Record<string, string> = {
  wallet: 'WALLET',
  blockchain: 'BLOCKCHAIN',
  scanner: 'SCANNER HEALTH',
  content: 'REGISTERED CONTENT',
  logs: 'RECENT LOGS',
};

interface DiagState {
  wallet: string | null;
  scanHealth: ScanHealth | null;
  contentCount: number;
  logs: Array<{ level: string; domain: string; msg: string; ts: number }>;
  isLoading: boolean;
}

export default function DebugScreen() {
  const router = useRouter();
  const [state, setState] = useState<DiagState>({
    wallet: null,
    scanHealth: null,
    contentCount: 0,
    logs: [],
    isLoading: true,
  });
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const [wallet, health, content, rawLogs] = await Promise.allSettled([
        Storage.getItem('sigil_wallet'),
        getScanHealth(),
        getStoredContent(),
        Storage.getItem('sigil_logs'),
      ]);

      let logs: DiagState['logs'] = [];
      try {
        if (rawLogs.status === 'fulfilled' && rawLogs.value) {
          const parsed = JSON.parse(rawLogs.value);
          // Logger stores { ts, level, domain, msg } — normalize for display
          logs = parsed.map((e: any) => ({
            ts: e.ts,
            level: (e.level ?? 'info').toUpperCase(),
            domain: e.domain ?? e.tag ?? 'general',
            msg: typeof e.msg === 'string' ? e.msg : JSON.stringify(e.msg),
          })).slice(-50).reverse();
        }
      } catch {}

      setState({
        wallet: wallet.status === 'fulfilled' ? wallet.value : null,
        scanHealth: health.status === 'fulfilled' ? health.value : null,
        contentCount: content.status === 'fulfilled' ? content.value.length : 0,
        logs,
        isLoading: false,
      });
    } catch (err) {
      Logger.error('general', 'Failed to load diagnostics', { msg: String(err) });
      setState((prev) => ({ ...prev, isLoading: false }));
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const handleExportLogs = useCallback(async () => {
    const raw = await Storage.getItem('sigil_logs').catch(() => '[]');
    await Share.share({
      message: `SIGIL Debug Logs\n\n${raw ?? '[]'}`,
      title: 'SIGIL Logs',
    });
  }, []);

  const handleClearLogs = useCallback(() => {
    Alert.alert('Clear Logs', 'Delete all stored logs?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Clear',
        style: 'destructive',
        onPress: async () => {
          await Storage.removeItem('sigil_logs');
          setState((prev) => ({ ...prev, logs: [] }));
        },
      },
    ]);
  }, []);

  const handleCopy = useCallback((value: string) => {
    try {
      (Clipboard as any).setString(value);
    } catch {}
  }, []);

  const { wallet, scanHealth, contentCount, logs, isLoading } = state;

  return (
    <SafeAreaView style={s.container} edges={['top', 'left', 'right']}>
      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} style={s.backBtn}>
          <Ionicons name="chevron-back" size={22} color={Colors.textPrimary} />
        </TouchableOpacity>
        <Text style={s.headerTitle}>Diagnostics</Text>
        <TouchableOpacity onPress={handleExportLogs} style={s.shareBtn}>
          <Ionicons name="share-outline" size={20} color={Colors.textMuted} />
        </TouchableOpacity>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />}
        contentContainerStyle={s.scroll}
      >
        {isLoading && (
          <View style={s.loading}>
            <Text style={s.loadingText}>Loading diagnostics...</Text>
          </View>
        )}

        {/* Wallet */}
        <Section title="WALLET">
          <InfoRow label="Address" value={wallet ?? 'Not connected'} onCopy={wallet ? () => handleCopy(wallet) : undefined} />
          <InfoRow label="Mode" value={IS_MOCK_MODE ? 'MOCK (no real txs)' : 'LIVE'} valueColor={IS_MOCK_MODE ? '#F59E0B' : '#22C55E'} />
        </Section>

        {/* Blockchain */}
        <Section title="BLOCKCHAIN">
          <InfoRow label="Network" value="Polygon Mainnet (137)" />
          <InfoRow label="Contract" value={`${CONTRACT_ADDRESS.slice(0, 10)}...${CONTRACT_ADDRESS.slice(-8)}`} onCopy={() => handleCopy(CONTRACT_ADDRESS)} />
          <InfoRow
            label="PolygonScan"
            value="View Contract ↗"
            link={`https://polygonscan.com/address/${CONTRACT_ADDRESS}`}
            valueColor={Colors.primary}
          />
        </Section>

        {/* Scanner Health */}
        <Section title="SCANNER HEALTH">
          {scanHealth ? (
            <>
              <InfoRow
                label="Last Scan"
                value={
                  scanHealth.lastScanAt > 0
                    ? new Date(scanHealth.lastScanAt).toLocaleString()
                    : 'Never'
                }
              />
              <InfoRow
                label="Status"
                value={
                  scanHealth.lastScanAt === 0
                    ? 'Not scanned'
                    : scanHealth.lastScanSuccess
                    ? 'Success'
                    : `Failed: ${scanHealth.lastScanError}`
                }
                valueColor={
                  scanHealth.lastScanAt === 0
                    ? Colors.textMuted
                    : scanHealth.lastScanSuccess
                    ? '#22C55E'
                    : '#EF4444'
                }
              />
              <InfoRow label="Total Scans" value={String(scanHealth.totalScans)} />
              <InfoRow label="Total Matches" value={String(scanHealth.totalMatches)} />
              <InfoRow label="Lock State" value={scanHealth.isLocked ? 'LOCKED ⚠️' : 'Free'} valueColor={scanHealth.isLocked ? '#F59E0B' : '#22C55E'} />
            </>
          ) : (
            <Text style={s.mutedText}>No scan data yet</Text>
          )}
        </Section>

        {/* Scanners */}
        <Section title="SCANNERS">
          {['GitHub', 'Reddit', 'StackOverflow', 'HuggingFace', 'npm', 'Web'].map((src) => (
            <InfoRow key={src} label={src} value="Active" valueColor="#22C55E" />
          ))}
        </Section>

        {/* Registered Content */}
        <Section title="REGISTERED CONTENT">
          <InfoRow label="Total Registered" value={String(contentCount)} />
        </Section>

        {/* Recent Logs */}
        <View style={s.sectionHeader}>
          <Text style={s.sectionTitle}>RECENT LOGS</Text>
          <View style={s.logActions}>
            <TouchableOpacity onPress={handleExportLogs} style={s.logBtn}>
              <Ionicons name="download-outline" size={14} color={Colors.textMuted} />
              <Text style={s.logBtnText}>Export</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={handleClearLogs} style={[s.logBtn, s.logBtnDanger]}>
              <Ionicons name="trash-outline" size={14} color="#EF4444" />
              <Text style={[s.logBtnText, { color: '#EF4444' }]}>Clear</Text>
            </TouchableOpacity>
          </View>
        </View>
        <View style={s.logsCard}>
          {logs.length === 0 ? (
            <Text style={s.mutedText}>No logs stored.</Text>
          ) : (
            logs.map((log, i) => (
              <View key={i} style={s.logRow}>
                <Text
                  style={[
                    s.logLevel,
                    {
                      color:
                        log.level === 'ERROR'
                          ? '#EF4444'
                          : log.level === 'WARN'
                          ? '#F59E0B'
                          : '#22C55E',
                    },
                  ]}
                >
                  {log.level}
                </Text>
                <Text style={s.logTag}>[{log.domain}]</Text>
                <Text style={s.logMsg} numberOfLines={2}>{log.msg}</Text>
              </View>
            ))
          )}
        </View>

        {/* Build Info */}
        <Section title="BUILD INFO">
          <InfoRow label="Environment" value={__DEV__ ? 'Development' : 'Production'} valueColor={__DEV__ ? '#F59E0B' : '#22C55E'} />
          <InfoRow label="Platform" value={Platform.OS} />
        </Section>
      </ScrollView>
    </SafeAreaView>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View>
      <Text style={s.sectionTitle}>{title}</Text>
      <View style={s.card}>{children}</View>
    </View>
  );
}

function InfoRow({
  label,
  value,
  mono,
  valueColor,
  onCopy,
  link,
}: {
  label: string;
  value: string;
  mono?: boolean;
  valueColor?: string;
  onCopy?: () => void;
  link?: string;
}) {
  
  return (
    <View style={s.infoRow}>
      <Text style={s.infoLabel}>{label}</Text>
      <TouchableOpacity
        style={s.infoValueRow}
        onPress={
          link ? () => Linking.openURL(link) : onCopy ?? undefined
        }
        disabled={!link && !onCopy}
        activeOpacity={0.7}
      >
        <Text
          style={[
            s.infoValue,
            mono && s.infoValueMono,
            valueColor ? { color: valueColor } : null,
          ]}
          numberOfLines={1}
        >
          {value}
        </Text>
        {onCopy && <Ionicons name="copy-outline" size={13} color={Colors.textMuted} style={{ marginLeft: 4 }} />}
      </TouchableOpacity>
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 20, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  backBtn: { padding: 4 },
  headerTitle: { flex: 1, textAlign: 'center', fontSize: 17, fontWeight: '700', color: Colors.textPrimary, letterSpacing: 0.5 },
  shareBtn: { padding: 4 },
  scroll: { padding: 20, paddingBottom: 60, gap: 16 },
  loading: { alignItems: 'center', paddingVertical: 40 },
  loadingText: { color: Colors.textMuted, fontSize: 14 },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 0,
  },
  sectionTitle: {
    fontSize: 11, fontWeight: '700',
    color: Colors.textMuted, letterSpacing: 2,
    marginBottom: 8,
  },
  card: {
    backgroundColor: Colors.surface,
    borderRadius: 14,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  infoLabel: { fontSize: 12, fontWeight: '600', color: Colors.textMuted, flex: 1 },
  infoValueRow: { flexDirection: 'row', alignItems: 'center', flex: 2, justifyContent: 'flex-end' },
  infoValue: { fontSize: 12, color: Colors.textPrimary, textAlign: 'right', flexShrink: 1 },
  infoValueMono: { fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', fontSize: 11 },
  mutedText: { color: Colors.textMuted, fontSize: 13, padding: 14 },
  logActions: { flexDirection: 'row', gap: 8, marginBottom: 8 },
  logBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 10, paddingVertical: 5,
    borderRadius: 8, borderWidth: 1, borderColor: Colors.border,
    backgroundColor: Colors.cardElevated,
  },
  logBtnDanger: { borderColor: '#EF444433' },
  logBtnText: { fontSize: 12, fontWeight: '600', color: Colors.textMuted },
  logsCard: {
    backgroundColor: Colors.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.border,
    overflow: 'hidden',
    maxHeight: 320,
  },
  logRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border + '55',
  },
  logLevel: { fontSize: 10, fontWeight: '800', width: 40, letterSpacing: 0.5 },
  logTag: { fontSize: 10, color: Colors.textMuted, width: 72, flexShrink: 0 },
  logMsg: { fontSize: 11, color: Colors.textPrimary, flex: 1, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' },
});
