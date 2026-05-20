import React, { useEffect, useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  RefreshControl,

  AccessibilityInfo,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import StatCard from '../../components/StatCard';
import DetectionCard from '../../components/DetectionCard';
import OfflineBanner from '../../components/OfflineBanner';
import ClaimStatusBadge from '../../components/ClaimStatusBadge';
import { formatChallengeWindow, getClaimStatus } from '../../services/dispute';
import type { ClaimStatus } from '../../services/dispute';
import { StatCardSkeleton, AlertCardSkeleton } from '../../components/LoadingSkeleton';
import { useWallet } from '../../hooks/useWallet';
import { useScanner } from '../../hooks/useScanner';
import { getStoredContent, useBlockchain, RegisteredContent } from '../../hooks/useBlockchain';
import { IS_MOCK_MODE } from '../../constants/contract';
import { ethers } from 'ethers';
import type { SigilAlert } from '../../services/scanner';

// ── Mini bar chart ────────────────────────────────────────────────────────────
function MiniBarChart({ data, color }: { data: number[]; color: string }) {
  const max = Math.max(...data, 1);
  return (
    <View style={ch.container}>
      {data.map((v, i) => (
        <View key={i} style={ch.barWrap}>
          <View
            style={[ch.bar, { height: `${Math.round((v / max) * 100)}%`, backgroundColor: color }]}
          />
        </View>
      ))}
    </View>
  );
}

const ch = StyleSheet.create({
  container: { flexDirection: 'row', alignItems: 'flex-end', gap: 3, height: 40, flex: 1 },
  barWrap: { flex: 1, alignItems: 'center', justifyContent: 'flex-end', height: '100%' },
  bar: { width: '100%', borderRadius: 3, minHeight: 2 },
});

// ── Source breakdown pill ─────────────────────────────────────────────────────
function SourcePill({ source, count, total }: { source: string; count: number; total: number }) {
  const pct = total > 0 ? Math.round((count / total) * 100) : 0;
  return (
    <View style={sp.pill}>
      <Text style={sp.source} numberOfLines={1}>{source}</Text>
      <View style={sp.track}>
        <View style={[sp.fill, { width: `${pct}%` }]} />
      </View>
      <Text style={sp.pct}>{count}</Text>
    </View>
  );
}

const sp = StyleSheet.create({
  pill: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 },
  source: { fontSize: 12, color: '#9CA3AF', width: 90, flexShrink: 0 },
  track: { flex: 1, height: 4, backgroundColor: '#2A2A2A', borderRadius: 99, overflow: 'hidden' },
  fill: { height: 4, backgroundColor: '#FACC15', borderRadius: 99 },
  pct: { fontSize: 12, color: '#6B7280', width: 24, textAlign: 'right' },
});

function contentTypeIcon(type: string): string {
  switch (type) {
    case 'image': return 'image-outline';
    case 'video': return 'videocam-outline';
    case 'music': return 'musical-notes-outline';
    case 'code': return 'code-slash-outline';
    default: return 'document-text-outline';
  }
}

// ── Build last-7-days detection counts ────────────────────────────────────────
function buildDailyChart(alerts: SigilAlert[]): number[] {
  const now = Date.now();
  const buckets = Array(7).fill(0);
  for (const a of alerts) {
    const dayIdx = Math.floor((now - a.detectedAt) / 86_400_000);
    if (dayIdx >= 0 && dayIdx < 7) buckets[6 - dayIdx]++;
  }
  return buckets;
}

// ── Source breakdown ──────────────────────────────────────────────────────────
function buildSourceBreakdown(alerts: SigilAlert[]): Array<{ source: string; count: number }> {
  const map: Record<string, number> = {};
  for (const a of alerts) {
    map[a.source] = (map[a.source] ?? 0) + 1;
  }
  return Object.entries(map)
    .sort((a, b) => b[1] - a[1])
    .map(([source, count]) => ({ source, count }));
}

// ── Main Dashboard ────────────────────────────────────────────────────────────
type ListItem =
  | { type: 'header' }
  | { type: 'mock_banner' }
  | { type: 'stats'; content: RegisteredContent[]; syncingEarnings: boolean; totalEarningsPOL: number }
  | { type: 'analytics'; alerts: SigilAlert[] }
  | { type: 'section_header'; title: string; action?: { label: string; route: any } }
  | { type: 'alert'; alert: SigilAlert }
  | { type: 'alert_empty'; hasContent: boolean }
  | { type: 'content_item'; item: RegisteredContent }
  | { type: 'content_empty' }
  | { type: 'skeleton_stats' }
  | { type: 'skeleton_alerts' };

export default function DashboardScreen() {
  const router = useRouter();
  const { address, isConnected } = useWallet();
  const { alerts, loadAlerts, markReviewed, archiveAlert } = useScanner();
  const { syncEarnings } = useBlockchain();
  const [content, setContent] = useState<RegisteredContent[]>([]);
  const [claimStatuses, setClaimStatuses] = useState<Record<string, ClaimStatus>>({});
  const [refreshing, setRefreshing] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [syncingEarnings, setSyncingEarnings] = useState(false);
  const loadData = useCallback(async () => {
    await loadAlerts();
    const c = await getStoredContent();
    setContent(c);
    setLoaded(true);
    // Load claim statuses for all content
    const statuses: Record<string, ClaimStatus> = {};
    await Promise.all(c.map(async (ci) => {
      try {
        statuses[ci.contentHash] = await getClaimStatus(ci.contentHash, ci.registeredAt);
      } catch {
        statuses[ci.contentHash] = 'newly_claimed';
      }
    }));
    setClaimStatuses(statuses);
    setSyncingEarnings(true);
    const synced = await syncEarnings().catch(() => c);
    setContent(synced);
    setSyncingEarnings(false);
  }, [loadAlerts, syncEarnings]);

  useEffect(() => {
    loadData();
  }, []);



  const onRefresh = async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  };

  const totalEarningsPOL = content.reduce((sum, c) => {
    try { return sum + parseFloat(ethers.formatEther(BigInt(c.earnings || '0'))); }
    catch { return sum; }
  }, 0);

  const shortAddr = address ? `${address.slice(0, 6)}...${address.slice(-4)}` : null;
  const hasContent = content.length > 0;
  const hasAlerts = alerts.filter((a) => !a.archived).length > 0;
  const activeAlerts = alerts.filter((a) => !a.archived).slice(0, 3);

  // Build FlatList data
  const listData = useMemo<ListItem[]>(() => {
    const items: ListItem[] = [{ type: 'header' }];
    if (IS_MOCK_MODE) items.push({ type: 'mock_banner' });

    if (!loaded) {
      items.push({ type: 'skeleton_stats' });
      items.push({ type: 'skeleton_alerts' });
      return items;
    }

    items.push({ type: 'stats', content, syncingEarnings, totalEarningsPOL });

    // Analytics section — only if there's data
    if (alerts.length > 0) {
      items.push({ type: 'analytics', alerts });
    }

    // Recent detections
    items.push({
      type: 'section_header',
      title: 'Recent Detections',
      action: hasAlerts ? { label: 'View All', route: '/(tabs)/alerts' } : undefined,
    });

    if (hasAlerts) {
      for (const a of activeAlerts) {
        items.push({ type: 'alert', alert: a });
      }
    } else {
      items.push({ type: 'alert_empty', hasContent });
    }

    // Protected works
    if (hasContent) {
      items.push({ type: 'section_header', title: 'Your Registered Claims' });
      for (const item of content) {
        items.push({ type: 'content_item', item });
      }
    }

    return items;
  }, [loaded, content, alerts, syncingEarnings, totalEarningsPOL, hasContent, hasAlerts, activeAlerts]);

  const renderItem = useCallback(({ item }: { item: ListItem }) => {
    switch (item.type) {
      case 'header':
        return (
          <View style={s.header}>
            <Text style={s.brand} accessibilityRole="header">SIGIL</Text>
            {shortAddr ? (
              <View style={s.walletBadge} accessibilityLabel={`Wallet: ${shortAddr}`}>
                <View style={s.walletDot} />
                <Text style={s.walletText}>{shortAddr}</Text>
              </View>
            ) : (
              <TouchableOpacity
                style={s.connectBtn}
                onPress={() => router.push('/(tabs)/profile' as any)}
                accessibilityLabel="Connect Wallet"
                accessibilityRole="button"
              >
                <Text style={s.connectBtnText}>Connect Wallet</Text>
              </TouchableOpacity>
            )}
          </View>
        );

      case 'mock_banner':
        return (
          <View style={s.mockBanner}>
            <Ionicons name="information-circle-outline" size={14} color="#FACC15" />
            <Text style={s.mockText}>Demo mode — contract deployed at 0xf2bF...D80a</Text>
          </View>
        );

      case 'skeleton_stats':
        return (
          <>
            <StatCardSkeleton />
            <StatCardSkeleton />
            <StatCardSkeleton />
          </>
        );

      case 'skeleton_alerts':
        return (
          <>
            <AlertCardSkeleton />
            <AlertCardSkeleton />
          </>
        );

      case 'stats': {
        const { content: c, syncingEarnings: syncing, totalEarningsPOL: earn } = item;
        return (
          <>
            <StatCard label="Registered Claims" value={c.length} icon="shield-checkmark-outline" />
            <StatCard
              label="Active Detections"
              value={alerts.filter((a) => !a.archived).length}
              icon="warning-outline"
              accent={alerts.filter((a) => !a.archived).length > 0}
            />
            <StatCard
              label="Revenue Earned"
              value={syncing ? '…' : `${earn.toFixed(4)} POL`}
              icon="wallet-outline"
            />
          </>
        );
      }

      case 'analytics': {
        const dailyData = buildDailyChart(item.alerts);
        const sourceData = buildSourceBreakdown(item.alerts);
        const avgConf = item.alerts.length > 0
          ? Math.round(item.alerts.reduce((s, a) => s + (a.confidence ?? 0), 0) / item.alerts.length)
          : 0;
        const highCount = item.alerts.filter((a) => (a.confidence ?? 0) >= 85).length;

        return (
          <View style={s.analyticsCard}>
            <Text style={s.analyticTitle}>DETECTION ANALYTICS</Text>
            <View style={s.analyticsGrid}>
              {/* Chart */}
              <View style={s.chartBox}>
                <Text style={s.chartLabel}>DETECTIONS — LAST 7 DAYS</Text>
                <MiniBarChart data={dailyData} color="#FACC15" />
                <View style={s.chartDays}>
                  {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d, i) => (
                    <Text key={i} style={s.dayLabel}>{d}</Text>
                  ))}
                </View>
              </View>
              {/* Stats */}
              <View style={s.miniStats}>
                <View style={s.miniStat}>
                  <Text style={s.miniStatVal}>{item.alerts.length}</Text>
                  <Text style={s.miniStatLabel}>Total</Text>
                </View>
                <View style={s.miniStat}>
                  <Text style={[s.miniStatVal, { color: '#EF4444' }]}>{highCount}</Text>
                  <Text style={s.miniStatLabel}>High Risk</Text>
                </View>
                <View style={s.miniStat}>
                  <Text style={s.miniStatVal}>{avgConf}%</Text>
                  <Text style={s.miniStatLabel}>Avg Score</Text>
                </View>
              </View>
            </View>
            {/* Source breakdown */}
            <Text style={s.chartLabel}>SOURCE BREAKDOWN</Text>
            {sourceData.slice(0, 4).map((d) => (
              <SourcePill key={d.source} source={d.source} count={d.count} total={item.alerts.length} />
            ))}
          </View>
        );
      }

      case 'section_header':
        return (
          <View style={s.sectionHeader}>
            <Text style={s.sectionTitle}>{item.title}</Text>
            {item.action && (
              <TouchableOpacity onPress={() => router.push(item.action!.route)}>
                <Text style={s.viewAll}>{item.action.label}</Text>
              </TouchableOpacity>
            )}
          </View>
        );

      case 'alert':
        return (
          <DetectionCard
            alert={item.alert}
            onMarkReviewed={() => markReviewed(item.alert.id)}
            onArchive={() => archiveAlert(item.alert.id)}
          />
        );

      case 'alert_empty':
        return (
          <View style={s.emptyCard}>
            <Ionicons name="shield-checkmark-outline" size={32} color="#FACC15" />
            <Text style={s.emptyTitle}>
              {item.hasContent ? 'No matches detected' : 'Nothing registered yet'}
            </Text>
            <Text style={s.emptyMeta}>
              {item.hasContent
                ? 'Pull down to scan. SIGIL checks for your watermark and content patterns across GitHub, Reddit, and more.'
                : 'Register your first work to create a timestamped claim and start monitoring.'}
            </Text>
            {!item.hasContent && (
              <TouchableOpacity
                style={s.emptyBtn}
                onPress={() => router.push('/(tabs)/register' as any)}
                accessibilityLabel="Register Content"
                accessibilityRole="button"
              >
                <Text style={s.emptyBtnText}>Register Content</Text>
              </TouchableOpacity>
            )}
          </View>
        );

      case 'content_item': {
        const { item: ci } = item;
        const registeredAt = ci.registeredAt ? new Date(ci.registeredAt).getTime() : Date.now();
        const claimStatus = claimStatuses[ci.contentHash] ?? 'newly_claimed';
        return (
          <View style={s.contentCard} accessibilityLabel={`Protected: ${ci.contentName}`}>
            <View style={s.contentIcon}>
              <Ionicons name={contentTypeIcon(ci.contentType) as any} size={20} color="#FACC15" />
            </View>
            <View style={s.contentInfo}>
              <Text style={s.contentName}>{ci.contentName}</Text>
              <Text style={s.contentMeta}>
                {ci.contentType} · {new Date(registeredAt).toLocaleDateString()}
              </Text>
              <Text style={s.contentHash} numberOfLines={1}>
                {ci.contentHash.slice(0, 20)}...
              </Text>
              <View style={{ marginTop: 4 }}>
                <ClaimStatusBadge status={claimStatus} compact />
              </View>
            </View>
            <View style={s.contentBadge}>
              <Text style={s.contentBadgeText}>{ci.matchCount} match{ci.matchCount !== 1 ? 'es' : ''}</Text>
            </View>
          </View>
        );
      }

      default:
        return null;
    }
  }, [alerts, shortAddr, router, markReviewed, archiveAlert, claimStatuses]);

  return (
    <SafeAreaView style={s.root} edges={['top', 'left', 'right']}>
      <OfflineBanner />
      <FlatList
        data={listData}
        keyExtractor={(item, i) => {
          if (item.type === 'alert') return `alert_${item.alert.id}`;
          if (item.type === 'content_item') return `ci_${item.item.id}`;
          return `${item.type}_${i}`;
        }}
        renderItem={renderItem}
        contentContainerStyle={s.scroll}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#FACC15" />
        }
        // Performance
        removeClippedSubviews
        initialNumToRender={8}
        maxToRenderPerBatch={6}
        windowSize={5}
        ListFooterComponent={<View style={{ height: 120 }} />}
        accessibilityLabel="Dashboard"
      />

    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#131313' },
  scroll: { paddingHorizontal: 16, paddingTop: 4 },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 16,
  },
  brand: { fontSize: 20, fontWeight: '800', color: '#FFFFFF', letterSpacing: 3 },
  walletBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#1E1E1E',
    borderRadius: 99,
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderWidth: 1,
    borderColor: '#2A2A2A',
  },
  walletDot: { width: 7, height: 7, borderRadius: 99, backgroundColor: '#22C55E' },
  walletText: { fontSize: 12, color: '#D1D5DB', fontWeight: '500' },
  connectBtn: {
    backgroundColor: '#FACC15',
    borderRadius: 99,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  connectBtnText: { fontSize: 12, fontWeight: '700', color: '#1A1A1A' },
  mockBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#FACC1511',
    borderRadius: 10,
    padding: 10,
    borderWidth: 1,
    borderColor: '#FACC1533',
    marginBottom: 12,
  },
  mockText: { flex: 1, fontSize: 11, color: '#FACC15', lineHeight: 16 },
  analyticsCard: {
    backgroundColor: '#1E1E1E',
    borderRadius: 20,
    padding: 16,
    borderWidth: 1,
    borderColor: '#2A2A2A',
    marginBottom: 12,
    gap: 10,
  },
  analyticTitle: { fontSize: 10, fontWeight: '800', color: '#FACC15', letterSpacing: 2 },
  analyticsGrid: { flexDirection: 'row', gap: 12, alignItems: 'flex-end' },
  chartBox: { flex: 1, gap: 6 },
  chartLabel: { fontSize: 9, fontWeight: '700', color: '#6B7280', letterSpacing: 1.5 },
  chartDays: { flexDirection: 'row', justifyContent: 'space-around' },
  dayLabel: { fontSize: 9, color: '#4B5563' },
  miniStats: { gap: 8 },
  miniStat: { alignItems: 'center' },
  miniStatVal: { fontSize: 18, fontWeight: '900', color: '#FACC15' },
  miniStatLabel: { fontSize: 9, color: '#6B7280', letterSpacing: 0.5 },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 20,
    marginBottom: 12,
  },
  sectionTitle: { fontSize: 17, fontWeight: '700', color: '#FFFFFF' },
  viewAll: { fontSize: 13, color: '#9CA3AF', fontWeight: '500' },
  emptyCard: {
    backgroundColor: '#1E1E1E',
    borderRadius: 20,
    padding: 32,
    alignItems: 'center',
    gap: 10,
    borderWidth: 1,
    borderColor: '#2A2A2A',
    marginBottom: 12,
  },
  emptyTitle: { fontSize: 16, fontWeight: '700', color: '#FFFFFF', textAlign: 'center' },
  emptyMeta: { fontSize: 13, color: '#9CA3AF', textAlign: 'center', lineHeight: 20 },
  emptyBtn: {
    marginTop: 8,
    backgroundColor: '#FACC15',
    borderRadius: 99,
    paddingHorizontal: 24,
    paddingVertical: 12,
  },
  emptyBtnText: { fontSize: 14, fontWeight: '700', color: '#1A1A1A' },
  contentCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#1E1E1E',
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: '#2A2A2A',
    marginBottom: 10,
  },
  contentIcon: {
    width: 42,
    height: 42,
    borderRadius: 12,
    backgroundColor: '#FACC1511',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#FACC1533',
  },
  contentInfo: { flex: 1, gap: 2 },
  contentName: { fontSize: 14, fontWeight: '700', color: '#FFFFFF' },
  contentMeta: { fontSize: 11, color: '#9CA3AF' },
  contentHash: { fontSize: 10, color: '#4B5563', fontFamily: 'monospace' },
  challengeLabel: { fontSize: 10, color: '#F97316', marginTop: 2 },
  contentBadge: {
    backgroundColor: '#1A1A1A',
    borderRadius: 99,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: '#2A2A2A',
  },
  contentBadgeText: { fontSize: 11, color: '#9CA3AF', fontWeight: '600' },

});
