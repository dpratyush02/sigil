import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { SigilAlert } from '../services/scanner';
import { Colors } from '../constants/colors';

function timeAgo(ts: number): string {
  const diff = (Date.now() - ts) / 1000;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

function getContentIcon(type: string): keyof typeof Ionicons.glyphMap {
  switch (type) {
    case 'image': return 'image-outline';
    case 'video': return 'videocam-outline';
    case 'music': return 'musical-notes-outline';
    case 'code': return 'code-slash-outline';
    default: return 'document-text-outline';
  }
}

function getConfidenceColor(score: number): string {
  if (score >= 85) return '#EF4444';
  if (score >= 70) return '#F59E0B';
  return '#6B7280';
}

function getConfidenceLabel(score: number): string {
  if (score >= 85) return 'HIGH';
  if (score >= 70) return 'MEDIUM';
  return 'LOW';
}

interface DetectionCardProps {
  alert: SigilAlert;
  onMarkReviewed?: () => void;
  onArchive?: () => void;
}

export default function DetectionCard({ alert, onMarkReviewed, onArchive }: DetectionCardProps) {
  const router = useRouter();
  const score = Math.round(alert.confidence ?? alert.similarity);
  const color = getConfidenceColor(score);
  const label = getConfidenceLabel(score);
  const isReviewed = alert.reviewed === true;
  const isArchived = alert.archived === true;

  return (
    <View style={[s.card, isReviewed && s.cardReviewed, isArchived && s.cardArchived]}>
      <View style={s.row}>
        {/* Icon box */}
        <View style={[s.iconBox, isReviewed && s.iconBoxReviewed]}>
          <Ionicons name={getContentIcon(alert.contentType)} size={20} color={isReviewed ? '#22C55E' : '#9CA3AF'} />
        </View>

        {/* Content */}
        <View style={s.content}>
          <View style={s.nameRow}>
            <Text style={[s.name, isReviewed && s.nameReviewed]} numberOfLines={1}>{alert.contentName}</Text>
            {isReviewed && (
              <View style={s.reviewedBadge}>
                <Ionicons name="checkmark-circle" size={13} color="#22C55E" />
                <Text style={s.reviewedBadgeText}>Reviewed</Text>
              </View>
            )}
          </View>
          <Text style={s.meta}>
            {timeAgo(alert.detectedAt)} · {alert.source}
          </Text>
        </View>

        {/* Confidence badge */}
        <View style={[s.badge, { borderColor: color + '55', backgroundColor: color + '18' }]}>
          <Text style={[s.badgeText, { color }]}>{label}</Text>
        </View>
      </View>

      {/* Reason */}
      {alert.reason ? (
        <Text style={s.reason} numberOfLines={2}>{alert.reason}</Text>
      ) : null}

      {/* Bottom row */}
      <View style={s.bottomRow}>
        <View style={[s.matchPill, { borderColor: color + '44' }]}>
          <View style={[s.matchDot, { backgroundColor: color }]} />
          <Text style={[s.matchText, { color }]}>{score}% match</Text>
        </View>
        <TouchableOpacity
          style={s.detailsBtn}
          onPress={() => router.push(`/evidence/${alert.id}` as any)}
          activeOpacity={0.7}
        >
          <Text style={s.detailsText}>Details </Text>
          <Ionicons name="chevron-forward" size={13} color="#9CA3AF" />
        </TouchableOpacity>
      </View>

      {/* Layer pills */}
      {alert.layers && (
        <View style={s.layers}>
          {alert.layers.exact && (
            <View style={[s.layerPill, { backgroundColor: '#EF444422' }]}>
              <Text style={[s.layerText, { color: '#EF4444' }]}>Exact</Text>
            </View>
          )}
          <View style={s.layerPill}>
            <Text style={s.layerText}>Lev {alert.layers.levenshtein}%</Text>
          </View>
          <View style={s.layerPill}>
            <Text style={s.layerText}>Token {alert.layers.tokenOverlap}%</Text>
          </View>
          <View style={s.layerPill}>
            <Text style={s.layerText}>Cos {alert.layers.cosine}%</Text>
          </View>
        </View>
      )}

      {/* Action buttons (only if not archived/reviewed) */}
      {(onMarkReviewed || onArchive) && (
        <View style={s.actions}>
          {onMarkReviewed && (
            <TouchableOpacity style={s.actionBtn} onPress={onMarkReviewed} activeOpacity={0.7}>
              <Ionicons name="checkmark-circle-outline" size={14} color="#22C55E" />
              <Text style={[s.actionText, { color: '#22C55E' }]}>Mark Reviewed</Text>
            </TouchableOpacity>
          )}
          {onArchive && (
            <TouchableOpacity style={[s.actionBtn, s.actionBtnMuted]} onPress={onArchive} activeOpacity={0.7}>
              <Ionicons name="archive-outline" size={14} color="#6B7280" />
              <Text style={[s.actionText, { color: '#6B7280' }]}>Archive</Text>
            </TouchableOpacity>
          )}
        </View>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  card: {
    backgroundColor: '#1E1E1E',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#2A2A2A',
    gap: 10,
    marginBottom: 10,
  },
  cardReviewed: {
    borderColor: '#22C55E22',
    backgroundColor: '#22C55E08',
  },
  cardArchived: {
    opacity: 0.6,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  iconBox: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: '#2A2A2A',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  iconBoxReviewed: {
    backgroundColor: '#22C55E15',
  },
  content: { flex: 1 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  name: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FFFFFF',
    flexShrink: 1,
  },
  nameReviewed: { color: '#9CA3AF' },
  reviewedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: '#22C55E15',
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  reviewedBadgeText: { fontSize: 10, fontWeight: '700', color: '#22C55E' },
  meta: {
    fontSize: 11,
    color: '#9CA3AF',
    marginTop: 2,
  },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
  },
  badgeText: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  reason: {
    fontSize: 12,
    color: '#9CA3AF',
    lineHeight: 16,
    fontStyle: 'italic',
  },
  bottomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  matchPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#2A2A2A',
    borderRadius: 99,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderWidth: 1,
  },
  matchDot: { width: 6, height: 6, borderRadius: 3 },
  matchText: { fontSize: 12, fontWeight: '600' },
  detailsBtn: { flexDirection: 'row', alignItems: 'center' },
  detailsText: { fontSize: 13, color: '#9CA3AF', fontWeight: '500' },
  layers: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  layerPill: {
    backgroundColor: '#2A2A2A',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  layerText: { fontSize: 10, color: '#6B7280', fontWeight: '600' },
  actions: {
    flexDirection: 'row',
    gap: 8,
    paddingTop: 4,
    borderTopWidth: 1,
    borderTopColor: '#2A2A2A',
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: '#22C55E12',
    borderWidth: 1,
    borderColor: '#22C55E33',
  },
  actionBtnMuted: {
    backgroundColor: '#6B728012',
    borderColor: '#6B728033',
  },
  actionText: { fontSize: 12, fontWeight: '600' },
});
