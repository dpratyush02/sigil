/**
 * SIGIL — Admin Dispute Console
 *
 * Shows open/reviewing disputes from the backend.
 * Admin can:
 *  - View full dispute details (reason, evidence, wallet)
 *  - Mark as Reviewing (moves to review queue)
 *  - Uphold (infringement confirmed → triggers alert escalation)
 *  - Dismiss (false positive → clears alert)
 *
 * Access gated: pro plan + admin wallet list.
 * Non-admins see a locked state with upgrade prompt.
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, RefreshControl, Alert, TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Colors } from '../../constants/colors';
import { useWallet } from '../../hooks/useWallet';
import { canAccessAdmin } from '../../utils/planGating';
import { getStoredToken, submitDispute } from '../../services/scanClient';

const API_BASE = (
  typeof process !== 'undefined' ? process.env.EXPO_PUBLIC_SIGIL_API_URL : undefined
) ?? 'http://localhost:3750';

export type DisputeStatus = 'open' | 'reviewing' | 'upheld' | 'dismissed' | 'withdrawn';

export interface Dispute {
  id: string;
  walletAddress: string;
  alertId: string;
  contentHash: string;
  reason: string;
  evidence?: string;
  status: DisputeStatus;
  adminNotes?: string;
  createdAt: number;
  updatedAt: number;
  resolvedAt?: number;
  resolvedBy?: string;
}

const STATUS_COLORS: Record<DisputeStatus, string> = {
  open: '#F59E0B',
  reviewing: '#3B82F6',
  upheld: '#EF4444',
  dismissed: '#6B7280',
  withdrawn: '#374151',
};

const STATUS_LABELS: Record<DisputeStatus, string> = {
  open: 'Open',
  reviewing: 'Reviewing',
  upheld: 'Upheld',
  dismissed: 'Dismissed',
  withdrawn: 'Withdrawn',
};

async function fetchQueue(token: string): Promise<Dispute[]> {
  const res = await fetch(`${API_BASE}/api/disputes/queue`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  const data = await res.json() as { disputes: Dispute[] };
  return data.disputes;
}

async function resolveDispute(
  id: string,
  resolution: 'upheld' | 'dismissed' | 'reviewing',
  notes: string,
  token: string
): Promise<Dispute> {
  const res = await fetch(`${API_BASE}/api/disputes/${id}/resolve`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ resolution, notes }),
  });
  if (!res.ok) throw new Error(`Resolve failed: ${res.status}`);
  return res.json() as Promise<Dispute>;
}

export default function AdminDisputesScreen() {
  const router = useRouter();
  const { address } = useWallet();
  const [disputes, setDisputes] = useState<Dispute[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [hasAccess, setHasAccess] = useState<boolean | null>(null);
  const [accessReason, setAccessReason] = useState('');
  const [selected, setSelected] = useState<Dispute | null>(null);
  const [adminNote, setAdminNote] = useState('');
  const [resolving, setResolving] = useState(false);
  const [error, setError] = useState('');

  // ── Access check ────────────────────────────────────────────────────────────
  useEffect(() => {
    (async () => {
      if (!address) { setHasAccess(false); setAccessReason('Connect your wallet first.'); return; }
      const gate = await canAccessAdmin(address);
      setHasAccess(gate.allowed);
      setAccessReason(gate.upgradePrompt ?? gate.reason ?? '');
    })();
  }, [address]);

  // ── Load disputes ───────────────────────────────────────────────────────────
  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true); else setLoading(true);
    setError('');
    try {
      const token = await getStoredToken();
      if (!token) throw new Error('Not authenticated. Please sign in first.');
      const data = await fetchQueue(token);
      setDisputes(data);
    } catch (err: any) {
      setError(err?.message ?? 'Failed to load disputes');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    if (hasAccess) load();
  }, [hasAccess, load]);

  // ── Resolve action ──────────────────────────────────────────────────────────
  const handleResolve = useCallback(async (resolution: 'upheld' | 'dismissed' | 'reviewing') => {
    if (!selected) return;
    setResolving(true);
    try {
      const token = await getStoredToken();
      if (!token) throw new Error('Not authenticated');
      const updated = await resolveDispute(selected.id, resolution, adminNote, token);
      setDisputes((prev) => prev.map((d) => d.id === updated.id ? updated : d));
      setSelected(null);
      setAdminNote('');
    } catch (err: any) {
      Alert.alert('Error', err?.message ?? 'Failed to resolve dispute');
    } finally {
      setResolving(false);
    }
  }, [selected, adminNote]);

  // ── Access denied ────────────────────────────────────────────────────────────
  if (hasAccess === false) {
    return (
      <SafeAreaView style={s.screen}>
        <View style={s.header}>
          <TouchableOpacity onPress={() => router.back()} style={s.backBtn}>
            <Ionicons name="chevron-back" size={20} color={Colors.textPrimary} />
          </TouchableOpacity>
          <Text style={s.headerTitle}>Admin Console</Text>
        </View>
        <View style={s.lockedContainer}>
          <Ionicons name="lock-closed-outline" size={48} color="#6B7280" />
          <Text style={s.lockedTitle}>Access Restricted</Text>
          <Text style={s.lockedDesc}>{accessReason || 'Admin access required.'}</Text>
        </View>
      </SafeAreaView>
    );
  }

  // ── Dispute detail modal ───────────────────────────────────────────────────
  if (selected) {
    return (
      <SafeAreaView style={s.screen}>
        <View style={s.header}>
          <TouchableOpacity onPress={() => { setSelected(null); setAdminNote(''); }} style={s.backBtn}>
            <Ionicons name="chevron-back" size={20} color={Colors.textPrimary} />
          </TouchableOpacity>
          <Text style={s.headerTitle}>Review Dispute</Text>
        </View>

        <ScrollView style={s.scroll} contentContainerStyle={s.scrollContent}>
          {/* Status badge */}
          <View style={[s.statusBadge, { backgroundColor: STATUS_COLORS[selected.status] + '22', borderColor: STATUS_COLORS[selected.status] }]}>
            <Text style={[s.statusText, { color: STATUS_COLORS[selected.status] }]}>
              {STATUS_LABELS[selected.status]}
            </Text>
          </View>

          {/* Detail rows */}
          <View style={s.detailCard}>
            <DetailRow label="Dispute ID" value={selected.id.slice(0, 16) + '...'} mono />
            <DetailRow label="Alert ID" value={selected.alertId} mono />
            <DetailRow label="Content Hash" value={selected.contentHash.slice(0, 20) + '...'} mono />
            <DetailRow label="Wallet" value={selected.walletAddress.slice(0, 10) + '...' + selected.walletAddress.slice(-6)} mono />
            <DetailRow label="Submitted" value={new Date(selected.createdAt).toLocaleDateString()} />
          </View>

          <View style={s.reasonCard}>
            <Text style={s.sectionLabel}>Reason</Text>
            <Text style={s.reasonText} selectable>{selected.reason}</Text>
          </View>

          {selected.evidence && (
            <View style={s.reasonCard}>
              <Text style={s.sectionLabel}>Evidence</Text>
              <Text style={s.reasonText} selectable>{selected.evidence}</Text>
            </View>
          )}

          {selected.adminNotes && (
            <View style={s.reasonCard}>
              <Text style={s.sectionLabel}>Previous Admin Notes</Text>
              <Text style={s.reasonText} selectable>{selected.adminNotes}</Text>
            </View>
          )}

          {/* Admin notes input */}
          <View style={s.notesCard}>
            <Text style={s.sectionLabel}>Admin Notes</Text>
            <TextInput
              style={s.notesInput}
              placeholder="Add resolution notes..."
              placeholderTextColor="#6B7280"
              value={adminNote}
              onChangeText={setAdminNote}
              multiline
              numberOfLines={3}
            />
          </View>

          {/* Action buttons */}
          <View style={s.actionRow}>
            <TouchableOpacity
              style={[s.actionBtn, s.reviewBtn]}
              onPress={() => handleResolve('reviewing')}
              disabled={resolving}
            >
              {resolving ? <ActivityIndicator size="small" color="#3B82F6" /> : (
                <>
                  <Ionicons name="eye-outline" size={16} color="#3B82F6" />
                  <Text style={[s.actionText, { color: '#3B82F6' }]}>Mark Reviewing</Text>
                </>
              )}
            </TouchableOpacity>
            <TouchableOpacity
              style={[s.actionBtn, s.upholdBtn]}
              onPress={() => handleResolve('upheld')}
              disabled={resolving}
            >
              <Ionicons name="shield-checkmark-outline" size={16} color="#EF4444" />
              <Text style={[s.actionText, { color: '#EF4444' }]}>Uphold</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[s.actionBtn, s.dismissBtn]}
              onPress={() => handleResolve('dismissed')}
              disabled={resolving}
            >
              <Ionicons name="close-circle-outline" size={16} color="#6B7280" />
              <Text style={[s.actionText, { color: '#6B7280' }]}>Dismiss</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  // ── Main queue view ────────────────────────────────────────────────────────
  return (
    <SafeAreaView style={s.screen}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} style={s.backBtn}>
          <Ionicons name="chevron-back" size={20} color={Colors.textPrimary} />
        </TouchableOpacity>
        <Text style={s.headerTitle}>Admin — Disputes</Text>
        <TouchableOpacity onPress={() => load(true)} style={s.refreshBtn}>
          <Ionicons name="refresh-outline" size={20} color={Colors.textMuted} />
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={s.center}>
          <ActivityIndicator size="large" color={Colors.primary} />
          <Text style={s.loadingText}>Loading dispute queue...</Text>
        </View>
      ) : error ? (
        <View style={s.center}>
          <Ionicons name="alert-circle-outline" size={40} color="#EF4444" />
          <Text style={s.errorText}>{error}</Text>
          <TouchableOpacity style={s.retryBtn} onPress={() => load()}>
            <Text style={s.retryText}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <ScrollView
          style={s.scroll}
          contentContainerStyle={s.scrollContent}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={Colors.primary} />}
        >
          {/* Stats */}
          <View style={s.statsRow}>
            {(['open', 'reviewing'] as DisputeStatus[]).map((st) => {
              const count = disputes.filter((d) => d.status === st).length;
              return (
                <View key={st} style={[s.statCard, { borderColor: STATUS_COLORS[st] + '55' }]}>
                  <Text style={[s.statCount, { color: STATUS_COLORS[st] }]}>{count}</Text>
                  <Text style={s.statLabel}>{STATUS_LABELS[st]}</Text>
                </View>
              );
            })}
          </View>

          {disputes.length === 0 ? (
            <View style={s.emptyBox}>
              <Ionicons name="checkmark-circle-outline" size={40} color="#22C55E" />
              <Text style={s.emptyText}>No open disputes.</Text>
            </View>
          ) : (
            disputes.map((d) => (
              <TouchableOpacity key={d.id} style={s.disputeCard} onPress={() => setSelected(d)} activeOpacity={0.8}>
                <View style={s.disputeHeader}>
                  <View style={[s.statusDot, { backgroundColor: STATUS_COLORS[d.status] }]} />
                  <Text style={s.disputeId} numberOfLines={1}>
                    {d.alertId.slice(0, 24)}...
                  </Text>
                  <Text style={s.disputeDate}>{new Date(d.createdAt).toLocaleDateString()}</Text>
                </View>
                <Text style={s.disputeReason} numberOfLines={2}>{d.reason}</Text>
                <View style={s.disputeFooter}>
                  <Text style={s.walletChip}>{d.walletAddress.slice(0, 8)}...{d.walletAddress.slice(-4)}</Text>
                  <Ionicons name="chevron-forward" size={14} color={Colors.textMuted} />
                </View>
              </TouchableOpacity>
            ))
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

function DetailRow({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <View style={s.detailRow}>
      <Text style={s.detailLabel}>{label}</Text>
      <Text style={[s.detailValue, mono && s.mono]} selectable>{value}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Colors.background },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#1E1E1E' },
  backBtn: { padding: 4, marginRight: 8 },
  refreshBtn: { marginLeft: 'auto', padding: 4 },
  headerTitle: { fontSize: 16, fontWeight: '700', color: Colors.textPrimary, flex: 1 },
  scroll: { flex: 1 },
  scrollContent: { padding: 16, paddingBottom: 40 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  loadingText: { marginTop: 12, color: Colors.textMuted, fontSize: 14 },
  errorText: { color: '#EF4444', fontSize: 14, textAlign: 'center', marginTop: 10 },
  retryBtn: { marginTop: 12, backgroundColor: '#1E1E1E', borderRadius: 8, paddingHorizontal: 20, paddingVertical: 10 },
  retryText: { color: Colors.primary, fontWeight: '600' },
  statsRow: { flexDirection: 'row', gap: 12, marginBottom: 20 },
  statCard: { flex: 1, backgroundColor: '#1A1A1A', borderRadius: 12, borderWidth: 1, padding: 14, alignItems: 'center' },
  statCount: { fontSize: 28, fontWeight: '800' },
  statLabel: { fontSize: 11, color: Colors.textMuted, marginTop: 2 },
  disputeCard: { backgroundColor: '#1A1A1A', borderRadius: 12, borderWidth: 1, borderColor: '#2A2A2A', padding: 14, marginBottom: 10 },
  disputeHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  disputeId: { flex: 1, fontSize: 12, color: Colors.textMuted, fontFamily: 'monospace' },
  disputeDate: { fontSize: 11, color: '#6B7280' },
  disputeReason: { fontSize: 13, color: Colors.textPrimary, lineHeight: 18, marginBottom: 10 },
  disputeFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  walletChip: { fontSize: 11, color: '#9CA3AF', fontFamily: 'monospace', backgroundColor: '#262626', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  statusBadge: { alignSelf: 'flex-start', borderWidth: 1, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 5, marginBottom: 16 },
  statusText: { fontSize: 12, fontWeight: '700' },
  detailCard: { backgroundColor: '#1A1A1A', borderRadius: 12, borderWidth: 1, borderColor: '#2A2A2A', overflow: 'hidden', marginBottom: 12 },
  detailRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#2A2A2A' },
  detailLabel: { fontSize: 12, color: Colors.textMuted, flex: 1 },
  detailValue: { fontSize: 12, color: Colors.textPrimary, flex: 1.5, textAlign: 'right' },
  mono: { fontFamily: 'monospace', fontSize: 11 },
  reasonCard: { backgroundColor: '#1A1A1A', borderRadius: 12, borderWidth: 1, borderColor: '#2A2A2A', padding: 14, marginBottom: 12 },
  sectionLabel: { fontSize: 11, color: Colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 },
  reasonText: { fontSize: 13, color: Colors.textPrimary, lineHeight: 20 },
  notesCard: { backgroundColor: '#1A1A1A', borderRadius: 12, borderWidth: 1, borderColor: '#2A2A2A', padding: 14, marginBottom: 20 },
  notesInput: { color: Colors.textPrimary, fontSize: 13, minHeight: 70, textAlignVertical: 'top' },
  actionRow: { flexDirection: 'row', gap: 10 },
  actionBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 12, borderRadius: 10, borderWidth: 1 },
  reviewBtn: { borderColor: '#3B82F633', backgroundColor: '#3B82F611' },
  upholdBtn: { borderColor: '#EF444433', backgroundColor: '#EF444411' },
  dismissBtn: { borderColor: '#6B72801A', backgroundColor: '#6B72801A' },
  actionText: { fontSize: 12, fontWeight: '700' },
  emptyBox: { alignItems: 'center', paddingVertical: 40, gap: 12 },
  emptyText: { color: Colors.textMuted, fontSize: 14 },
  lockedContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 16 },
  lockedTitle: { fontSize: 20, fontWeight: '800', color: Colors.textPrimary },
  lockedDesc: { fontSize: 14, color: Colors.textMuted, textAlign: 'center', lineHeight: 20 },
});
