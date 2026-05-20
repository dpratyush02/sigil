import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Colors } from '../../constants/colors';
import { useWallet } from '../../hooks/useWallet';
import { getStoredContent, useBlockchain, RegisteredContent } from '../../hooks/useBlockchain';
import { ethers } from 'ethers';
import OfflineBanner from '../../components/OfflineBanner';
import ClaimStatusBadge from '../../components/ClaimStatusBadge';
import { getClaimStatus } from '../../services/dispute';
import type { ClaimStatus } from '../../services/dispute';

function getContentIcon(type: string): string {
  switch (type) {
    case 'image': return 'image-outline';
    case 'video': return 'videocam-outline';
    case 'music': return 'musical-notes-outline';
    case 'code': return 'code-slash-outline';
    default: return 'document-text-outline';
  }
}

function timeAgo(ts: number): string {
  const diff = (Date.now() - ts) / 1000;
  if (diff < 86400) return 'Today';
  if (diff < 86400 * 7) return `${Math.floor(diff / 86400)}d ago`;
  return new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

const TYPE_LABELS: Record<string, string> = {
  code: 'Code',
  image: 'Images',
  video: 'Videos',
  music: 'Music',
  text: 'Documents',
};

export default function ProfileScreen() {
  const router = useRouter();
  const { address, isConnected, isConnecting, connect, disconnect, needsReconnect } = useWallet();
  const { syncEarnings } = useBlockchain();
  const [content, setContent] = useState<RegisteredContent[]>([]);
  const [claimStatuses, setClaimStatuses] = useState<Record<string, ClaimStatus>>({});

  useEffect(() => {
    (async () => {
      const c = await getStoredContent();
      setContent(c);
      // Load claim statuses
      const statuses: Record<string, ClaimStatus> = {};
      await Promise.all(c.map(async (ci) => {
        try {
          statuses[ci.contentHash] = await getClaimStatus(ci.contentHash, ci.registeredAt);
        } catch {
          statuses[ci.contentHash] = 'newly_claimed';
        }
      }));
      setClaimStatuses(statuses);
      // sync chain earnings
      const synced = await syncEarnings().catch(() => c);
      setContent(synced);
    })();
  }, []);

  const shortAddr = address ? `${address.slice(0, 8)}...${address.slice(-6)}` : '0x7f3a9B2c...A9C';

  // earnings is wei string
  const totalEarningsPOL = content.reduce((sum, c) => {
    try { return sum + parseFloat(ethers.formatEther(BigInt(c.earnings || '0'))); }
    catch { return sum; }
  }, 0);
  const totalMatches = content.reduce((sum, c) => sum + c.matchCount, 0);

  // Group by type
  const grouped = content.reduce<Record<string, RegisteredContent[]>>((acc, item) => {
    const key = item.contentType;
    if (!acc[key]) acc[key] = [];
    acc[key].push(item);
    return acc;
  }, {});

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <OfflineBanner />
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scroll}
      >
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.title}>Profile</Text>
          <TouchableOpacity
            style={styles.settingsBtn}
            onPress={() => router.push('/settings' as any)}
            hitSlop={8}
          >
            <Ionicons name="settings-outline" size={20} color={Colors.onSurface} />
          </TouchableOpacity>
        </View>

        {/* Wallet card */}
        {isConnected && address ? (
          <View style={styles.walletCard}>
            <View style={styles.avatarWrap}>
              <Ionicons name="person" size={26} color={Colors.primary} />
            </View>
            <View style={styles.walletInfo}>
              <Text style={styles.walletLabel}>Connected Wallet</Text>
              <Text style={styles.walletAddress}>{shortAddr}</Text>
              <View style={styles.connectedPill}>
                <View style={styles.greenDot} />
                <Text style={styles.connectedText}>Protected · Polygon Mainnet</Text>
              </View>
            </View>
            <TouchableOpacity onPress={disconnect} style={styles.disconnectBtn}>
              <Ionicons name="log-out-outline" size={16} color={Colors.error} />
            </TouchableOpacity>
          </View>
        ) : needsReconnect ? (
          <TouchableOpacity
            style={[styles.connectCard, styles.reconnectCard]}
            onPress={() => connect()}
            disabled={isConnecting}
          >
            <View style={styles.avatarWrap}>
              <Ionicons name="refresh-circle-outline" size={26} color={Colors.primary} />
            </View>
            <View style={styles.walletInfo}>
              <Text style={styles.walletLabel}>Session Expired</Text>
              <Text style={styles.connectPrompt}>
                {isConnecting ? 'Reconnecting...' : 'Tap to reconnect wallet'}
              </Text>
            </View>
            {isConnecting
              ? <ActivityIndicator size="small" color={Colors.primary} />
              : <Ionicons name="chevron-forward" size={18} color={Colors.primary} />}
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            style={styles.connectCard}
            onPress={() => connect()}
            disabled={isConnecting}
          >
            <View style={styles.avatarWrap}>
              <Ionicons name="wallet-outline" size={26} color={Colors.textMuted} />
            </View>
            <View style={styles.walletInfo}>
              <Text style={styles.walletLabel}>No Wallet Connected</Text>
              <Text style={styles.connectPrompt}>
                {isConnecting ? 'Connecting...' : 'Tap to connect wallet'}
              </Text>
            </View>
            {isConnecting
              ? <ActivityIndicator size="small" color={Colors.primary} />
              : <Ionicons name="chevron-forward" size={18} color={Colors.primary} />}
          </TouchableOpacity>
        )}

        {/* Stats */}
        <View style={styles.statsGrid}>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>{content.length}</Text>
            <Text style={styles.statLabel}>Total Registered</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={[styles.statValue, styles.statValueAccent]}>{totalMatches}</Text>
            <Text style={styles.statLabel}>Total Detections</Text>
          </View>
          <View style={[styles.statCard, styles.statCardFull]}>
            <Text style={[styles.statValue, styles.statValueGold]}>{totalEarningsPOL.toFixed(4)} POL</Text>
            <Text style={styles.statLabel}>Total Earnings</Text>
          </View>
        </View>

        {/* Content by type */}
        {Object.entries(grouped).map(([type, items]) => (
          <View key={type} style={styles.group}>
            <View style={styles.groupHeader}>
              <View style={styles.groupIconWrap}>
                <Ionicons name={getContentIcon(type) as any} size={16} color={Colors.primary} />
              </View>
              <Text style={styles.groupTitle}>{TYPE_LABELS[type] || type}</Text>
              <View style={styles.groupCount}>
                <Text style={styles.groupCountText}>{items.length}</Text>
              </View>
            </View>

            {items.map((item) => (
              <View key={item.id} style={styles.contentItem}>
                <View style={styles.contentLeft}>
                  <Text style={styles.contentName}>{item.contentName}</Text>
                  <Text style={styles.contentMeta}>
                    Registered {timeAgo(item.registeredAt)}
                  </Text>
                  <Text style={styles.watermark}>{item.watermarkPattern}</Text>
                  <View style={{ marginTop: 4 }}>
                    <ClaimStatusBadge status={claimStatuses[item.contentHash] ?? 'newly_claimed'} compact />
                  </View>
                </View>
                <View style={styles.contentRight}>
                  {item.matchCount > 0 && (
                    <View style={styles.matchBadge}>
                      <Text style={styles.matchBadgeText}>{item.matchCount} match{item.matchCount !== 1 ? 'es' : ''}</Text>
                    </View>
                  )}
                  {BigInt(item.earnings || '0') > 0n && (
                    <Text style={styles.earnings}>
                      {parseFloat(ethers.formatEther(BigInt(item.earnings))).toFixed(4)} POL
                    </Text>
                  )}
                  <Ionicons name="chevron-forward" size={14} color={Colors.textMuted} />
                </View>
              </View>
            ))}
          </View>
        ))}

        {content.length === 0 && (
          <View style={styles.emptyState}>
            <Ionicons name="document-text-outline" size={40} color={Colors.textMuted} />
            <Text style={styles.emptyText}>No content registered yet</Text>
          </View>
        )}

        {/* Contract info */}
        <View style={styles.infoCard}>
          <Ionicons name="shield-checkmark-outline" size={16} color="#22C55E" />
          <Text style={styles.infoText}>
            Contract live on Polygon Mainnet · 0xf2bF...D80a · All registrations are permanent on-chain.
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  scroll: { paddingHorizontal: 20, paddingBottom: 40, gap: 16 },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 12,
  },
  title: { fontSize: 26, fontWeight: '700', color: Colors.onSurface },
  settingsBtn: {
    width: 38,
    height: 38,
    borderRadius: 99,
    backgroundColor: Colors.cardElevated,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: Colors.border,
  },
  walletCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    backgroundColor: Colors.cardElevated,
    borderRadius: 20,
    padding: 16,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  avatarWrap: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: Colors.overlayYellow,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: Colors.primary + '33',
  },
  avatarEmoji: { fontSize: 28 },
  walletInfo: { flex: 1, gap: 3 },
  walletLabel: { fontSize: 11, color: Colors.textMuted, letterSpacing: 0.5, textTransform: 'uppercase' },
  walletAddress: { fontSize: 15, fontWeight: '700', color: Colors.onSurface, fontFamily: 'monospace' },
  connectedPill: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 2 },
  greenDot: { width: 7, height: 7, borderRadius: 99, backgroundColor: '#22C55E' },
  connectedText: { fontSize: 11, color: '#22C55E', fontWeight: '600' },
  reconnectCard: { borderColor: Colors.primary + '55', backgroundColor: Colors.overlayYellow },
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  statCard: {
    flex: 1,
    backgroundColor: Colors.cardElevated,
    borderRadius: 16,
    padding: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.border,
    minWidth: '45%',
  },
  statCardFull: { flexBasis: '100%', flex: undefined },
  statValue: { fontSize: 28, fontWeight: '700', color: Colors.onSurface },
  statValueAccent: { color: Colors.error },
  statValueGold: { color: Colors.primary },
  statLabel: { fontSize: 11, color: Colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 2 },
  group: {
    backgroundColor: Colors.cardElevated,
    borderRadius: 20,
    padding: 16,
    gap: 12,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  groupHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  groupIconWrap: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: Colors.overlayYellow,
    alignItems: 'center',
    justifyContent: 'center',
  },
  groupTitle: { flex: 1, fontSize: 14, fontWeight: '700', color: Colors.onSurface },
  groupCount: {
    backgroundColor: Colors.surfaceContainerHighest,
    borderRadius: 99,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  groupCountText: { fontSize: 11, fontWeight: '700', color: Colors.textMuted },
  contentItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    gap: 8,
  },
  contentLeft: { flex: 1, gap: 3 },
  contentName: { fontSize: 14, fontWeight: '600', color: Colors.onSurface },
  contentMeta: { fontSize: 11, color: Colors.textMuted },
  watermark: { fontSize: 10, color: Colors.primary, fontFamily: 'monospace' },
  contentRight: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  matchBadge: {
    backgroundColor: Colors.errorContainer,
    borderRadius: 99,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  matchBadgeText: { fontSize: 10, fontWeight: '700', color: Colors.error },
  earnings: { fontSize: 13, fontWeight: '700', color: Colors.primary },
  emptyState: { alignItems: 'center', paddingVertical: 40, gap: 10 },
  emptyText: { fontSize: 14, color: Colors.textMuted },
  infoCard: {
    flexDirection: 'row',
    gap: 8,
    backgroundColor: Colors.cardElevated,
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  infoText: { flex: 1, fontSize: 11, color: Colors.textMuted, lineHeight: 16 },
  connectCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    backgroundColor: Colors.cardElevated,
    borderRadius: 20,
    padding: 16,
    borderWidth: 1,
    borderColor: Colors.primary + '44',
    borderStyle: 'dashed',
  },
  connectPrompt: { fontSize: 15, fontWeight: '600', color: Colors.primary },
  disconnectBtn: {
    width: 34,
    height: 34,
    borderRadius: 99,
    backgroundColor: Colors.errorContainer,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
