/**
 * SIGIL — Settings Screen
 *
 * NOTE: Push notifications and background scanning are disabled until
 * a production dev build is created. Toggles save to storage but don't
 * wire to native APIs. Re-enable by importing expo-notifications,
 * expo-background-fetch, expo-task-manager and restoring handlers.
 */

import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Switch,
  StyleSheet,
  Alert,
  Share,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Colors } from '../constants/colors';
import { Storage } from '../utils/storage';
import { Logger } from '../utils/logger';
import { clearQueue } from '../utils/offlineQueue';

const SCAN_FREQ_OPTIONS = [
  { label: '15 minutes', value: 15 * 60 },
  { label: '30 minutes', value: 30 * 60 },
  { label: '1 hour', value: 60 * 60 },
  { label: '6 hours', value: 6 * 60 * 60 },
];

const SETTINGS_KEY = 'sigil_settings';

interface SigilSettings {
  notificationsEnabled: boolean;
  backgroundScanEnabled: boolean;
  scanFrequency: number;
  autoReconnectWallet: boolean;
  analyticsEnabled: boolean;
}

const DEFAULT_SETTINGS: SigilSettings = {
  notificationsEnabled: true,
  backgroundScanEnabled: true,
  scanFrequency: 15 * 60,
  autoReconnectWallet: true,
  analyticsEnabled: false,
};

async function loadSettings(): Promise<SigilSettings> {
  try {
    const raw = await Storage.getItem(SETTINGS_KEY);
    return raw ? { ...DEFAULT_SETTINGS, ...JSON.parse(raw) } : DEFAULT_SETTINGS;
  } catch {
    return DEFAULT_SETTINGS;
  }
}

async function saveSettings(s: SigilSettings): Promise<void> {
  await Storage.setItem(SETTINGS_KEY, JSON.stringify(s));
}

export default function SettingsScreen() {
  const router = useRouter();
  const [settings, setSettings] = useState<SigilSettings>(DEFAULT_SETTINGS);
  const [loaded, setLoaded] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    loadSettings().then((s) => {
      setSettings(s);
      setLoaded(true);
    });
  }, []);

  const update = useCallback(async (patch: Partial<SigilSettings>) => {
    setSettings((prev) => {
      const next = { ...prev, ...patch };
      saveSettings(next);
      return next;
    });
  }, []);

  // Notifications: save preference only — native wiring re-enabled at build time
  const handleNotificationsToggle = (val: boolean) => {
    update({ notificationsEnabled: val });
  };

  // Background scan: save preference only — native wiring re-enabled at build time
  const handleBackgroundScanToggle = (val: boolean) => {
    update({ backgroundScanEnabled: val });
  };

  const handleFrequencySelect = () => {
    const buttons = [
      ...SCAN_FREQ_OPTIONS.map((opt) => ({
        text: opt.label + (opt.value === settings.scanFrequency ? ' ✓' : ''),
        onPress: () => update({ scanFrequency: opt.value }),
      })),
      { text: 'Cancel', style: 'cancel' as const },
    ];
    Alert.alert('Scan Frequency', 'How often should SIGIL check for matches?', buttons);
  };

  const handleExportLogs = async () => {
    setExporting(true);
    try {
      const logs = await Logger.getRecent(200);
      const text = logs
        .map(
          (l: any) =>
            `[${new Date(l.ts).toISOString()}] [${l.level.toUpperCase()}] [${l.domain}] ${l.msg}`,
        )
        .join('\n');
      await Share.share({ message: text || 'No logs available.', title: 'SIGIL Debug Logs' });
    } catch {
      Alert.alert('Export Failed', 'Could not export logs.');
    } finally {
      setExporting(false);
    }
  };

  const handleClearCache = () => {
    Alert.alert(
      'Clear Cache',
      'This will clear cached scan results and offline queue. Your registered content and alerts will be preserved.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear',
          style: 'destructive',
          onPress: async () => {
            setClearing(true);
            try {
              await clearQueue();
              await Storage.removeItem('sigil_scan_cache');
              Alert.alert('Done', 'Cache cleared successfully.');
            } catch {
              Alert.alert('Error', 'Failed to clear cache.');
            } finally {
              setClearing(false);
            }
          },
        },
      ],
    );
  };

  const handleResetApp = () => {
    Alert.alert(
      'Reset App Data',
      'This will permanently delete all your alerts, registered content, and settings. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete Everything',
          style: 'destructive',
          onPress: async () => {
            try {
              const keys = [
                'sigil_alerts',
                'sigil_content',
                'sigil_notified',
                'sigil_scan_lock',
                'sigil_scan_queue',
                'sigil_scan_health',
                'sigil_scan_cache',
                'sigil_offline_queue',
                SETTINGS_KEY,
              ];
              await Promise.all(keys.map((k) => Storage.removeItem(k)));
              Alert.alert('Reset Complete', 'All app data has been deleted. Please restart the app.');
            } catch {
              Alert.alert('Error', 'Reset failed — please try again.');
            }
          },
        },
      ],
    );
  };

  if (!loaded) {
    return (
      <SafeAreaView style={s.container}>
        <ActivityIndicator color={Colors.primary} style={{ flex: 1 }} />
      </SafeAreaView>
    );
  }

  const freqLabel =
    SCAN_FREQ_OPTIONS.find((o) => o.value === settings.scanFrequency)?.label ?? 'Custom';

  return (
    <SafeAreaView style={s.container} edges={['top', 'bottom']}>
      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} style={s.headerBack}>
          <Ionicons name="chevron-back" size={22} color={Colors.onSurface} />
        </TouchableOpacity>
        <Text style={s.headerTitle}>Settings</Text>
        <View style={{ width: 30 }} />
      </View>

      <ScrollView
        style={s.scroll}
        contentContainerStyle={s.content}
        showsVerticalScrollIndicator={false}
      >
        {/* Notifications */}
        <SectionTitle title="NOTIFICATIONS" />
        <SettingsCard>
          <SettingRow
            icon="notifications-outline"
            label="Push Notifications"
            sub="Alert when matches are found (requires dev build)"
            right={
              <Switch
                value={settings.notificationsEnabled}
                onValueChange={handleNotificationsToggle}
                trackColor={{ false: '#3A3A3A', true: Colors.primary + 'AA' }}
                thumbColor={settings.notificationsEnabled ? Colors.primary : '#888'}
              />
            }
          />
        </SettingsCard>

        {/* Background Scanning */}
        <SectionTitle title="SCANNING" />
        <SettingsCard>
          <SettingRow
            icon="search-outline"
            label="Background Scanning"
            sub="Scan for matches while app is closed (requires dev build)"
            right={
              <Switch
                value={settings.backgroundScanEnabled}
                onValueChange={handleBackgroundScanToggle}
                trackColor={{ false: '#3A3A3A', true: Colors.primary + 'AA' }}
                thumbColor={settings.backgroundScanEnabled ? Colors.primary : '#888'}
              />
            }
          />
          <Divider />
          <SettingRow
            icon="timer-outline"
            label="Scan Frequency"
            sub={freqLabel}
            onPress={settings.backgroundScanEnabled ? handleFrequencySelect : undefined}
            disabled={!settings.backgroundScanEnabled}
            right={
              <Ionicons
                name="chevron-forward"
                size={16}
                color={settings.backgroundScanEnabled ? Colors.textMuted : '#3A3A3A'}
              />
            }
          />
        </SettingsCard>

        {/* Wallet */}
        <SectionTitle title="WALLET" />
        <SettingsCard>
          <SettingRow
            icon="wallet-outline"
            label="Auto-Reconnect Wallet"
            sub="Restore wallet session on app open"
            right={
              <Switch
                value={settings.autoReconnectWallet}
                onValueChange={(val) => update({ autoReconnectWallet: val })}
                trackColor={{ false: '#3A3A3A', true: Colors.primary + 'AA' }}
                thumbColor={settings.autoReconnectWallet ? Colors.primary : '#888'}
              />
            }
          />
        </SettingsCard>

        {/* Privacy */}
        <SectionTitle title="PRIVACY" />
        <SettingsCard>
          <SettingRow
            icon="analytics-outline"
            label="Usage Analytics"
            sub="Anonymous crash & usage reporting (no PII)"
            right={
              <Switch
                value={settings.analyticsEnabled}
                onValueChange={(val) => update({ analyticsEnabled: val })}
                trackColor={{ false: '#3A3A3A', true: Colors.primary + 'AA' }}
                thumbColor={settings.analyticsEnabled ? Colors.primary : '#888'}
              />
            }
          />
        </SettingsCard>

        {/* Diagnostics */}
        <SectionTitle title="DIAGNOSTICS" />
        <SettingsCard>
          <SettingRow
            icon="bug-outline"
            label="Debug Diagnostics"
            sub="View scanner health and logs"
            onPress={() => router.push('/debug' as any)}
            right={<Ionicons name="chevron-forward" size={16} color={Colors.textMuted} />}
          />
          <Divider />
          <SettingRow
            icon="download-outline"
            label="Export Debug Logs"
            sub="Share recent log output"
            onPress={handleExportLogs}
            right={
              exporting ? (
                <ActivityIndicator size="small" color={Colors.textMuted} />
              ) : (
                <Ionicons name="share-outline" size={16} color={Colors.textMuted} />
              )
            }
          />
        </SettingsCard>

        {/* Data */}
        <SectionTitle title="DATA" />
        <SettingsCard>
          <SettingRow
            icon="trash-outline"
            label="Clear Cache"
            sub="Remove cached scan results and queue"
            onPress={handleClearCache}
            right={
              clearing ? (
                <ActivityIndicator size="small" color={Colors.textMuted} />
              ) : (
                <Ionicons name="chevron-forward" size={16} color={Colors.textMuted} />
              )
            }
          />
          <Divider />
          <SettingRow
            icon="nuclear-outline"
            label="Reset All App Data"
            sub="Delete all content, alerts, and settings"
            onPress={handleResetApp}
            danger
            right={<Ionicons name="chevron-forward" size={16} color="#EF4444" />}
          />
        </SettingsCard>

        <View style={s.version}>
          <Text style={s.versionText}>SIGIL v1.0.0-alpha · Polygon Mainnet</Text>
          <Text style={s.versionSub}>Contract: 0xf2bF...D80a</Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function SectionTitle({ title }: { title: string }) {
  return <Text style={s.sectionTitle}>{title}</Text>;
}

function SettingsCard({ children }: { children: React.ReactNode }) {
  return <View style={s.card}>{children}</View>;
}

function Divider() {
  return <View style={s.divider} />;
}

function SettingRow({
  icon,
  label,
  sub,
  onPress,
  right,
  danger,
  disabled,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  sub?: string;
  onPress?: () => void;
  right?: React.ReactNode;
  danger?: boolean;
  disabled?: boolean;
}) {
  const content = (
    <View style={[s.row, disabled && s.rowDisabled]}>
      <View style={[s.iconBox, danger && s.iconBoxDanger]}>
        <Ionicons name={icon} size={18} color={danger ? '#EF4444' : Colors.primary} />
      </View>
      <View style={s.rowInfo}>
        <Text style={[s.rowLabel, danger && s.rowLabelDanger]}>{label}</Text>
        {sub && <Text style={s.rowSub}>{sub}</Text>}
      </View>
      {right && <View style={s.rowRight}>{right}</View>}
    </View>
  );

  if (onPress && !disabled) {
    return (
      <TouchableOpacity onPress={onPress} activeOpacity={0.7}>
        {content}
      </TouchableOpacity>
    );
  }
  return content;
}

// ── Styles ────────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  headerBack: { padding: 4, width: 30 },
  headerTitle: {
    flex: 1,
    textAlign: 'center',
    fontSize: 17,
    fontWeight: '700',
    color: Colors.onSurface,
  },
  scroll: { flex: 1 },
  content: { padding: 16, paddingBottom: 48, gap: 4 },
  sectionTitle: {
    fontSize: 10,
    fontWeight: '800',
    color: Colors.textMuted,
    letterSpacing: 2,
    marginTop: 20,
    marginBottom: 8,
    paddingLeft: 4,
  },
  card: {
    backgroundColor: Colors.cardElevated,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.border,
    overflow: 'hidden',
  },
  divider: { height: 1, backgroundColor: Colors.border, marginLeft: 56 },
  row: { flexDirection: 'row', alignItems: 'center', padding: 14, gap: 12 },
  rowDisabled: { opacity: 0.4 },
  iconBox: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: Colors.overlayYellow,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  iconBoxDanger: { backgroundColor: '#EF444418' },
  rowInfo: { flex: 1, gap: 2 },
  rowLabel: { fontSize: 14, fontWeight: '600', color: Colors.onSurface },
  rowLabelDanger: { color: '#EF4444' },
  rowSub: { fontSize: 11, color: Colors.textMuted },
  rowRight: { flexShrink: 0 },
  version: { marginTop: 28, alignItems: 'center', gap: 4 },
  versionText: { fontSize: 12, color: Colors.textMuted },
  versionSub: { fontSize: 11, color: '#4B5563' },
});
