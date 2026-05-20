/**
 * SIGIL — ConfidenceScore component
 * Visual display for ownership confidence scoring.
 */

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { ConfidenceResult } from '../utils/confidenceScore';
import { levelColor, levelIcon } from '../utils/confidenceScore';

interface Props {
  result: ConfidenceResult;
  /** Show breakdown of individual signals */
  showBreakdown?: boolean;
  compact?: boolean;
}

function ProgressBar({ value, color }: { value: number; color: string }) {
  return (
    <View style={pb.track}>
      <View
        style={[pb.fill, { width: `${value}%`, backgroundColor: color }]}
      />
    </View>
  );
}

const pb = StyleSheet.create({
  track: {
    height: 6,
    backgroundColor: '#2A2A2A',
    borderRadius: 99,
    overflow: 'hidden',
    flex: 1,
  },
  fill: {
    height: 6,
    borderRadius: 99,
  },
});

const SIGNAL_LABELS: Record<string, string> = {
  chain_timestamp: 'On-chain timestamp',
  ipfs_pinned: 'IPFS metadata',
  content_hash: 'Content hash',
  github_commit: 'GitHub commit',
  exif: 'EXIF data',
  provenance_sources: 'Provenance sources',
};

const SIGNAL_MAX: Record<string, number> = {
  chain_timestamp: 30,
  ipfs_pinned: 20,
  content_hash: 20,
  github_commit: 15,
  exif: 10,
  provenance_sources: 5,
};

export default function ConfidenceScore({ result, showBreakdown = false, compact = false }: Props) {
  const color = levelColor(result.level);
  const icon = levelIcon(result.level);

  if (compact) {
    return (
      <View style={[s.compactRow]}>
        <Ionicons name={icon as any} size={13} color={color} />
        <Text style={[s.compactLabel, { color }]}>{result.label}</Text>
      </View>
    );
  }

  return (
    <View style={s.card}>
      {/* Header */}
      <View style={s.header}>
        <View style={s.iconWrap}>
          <Ionicons name={icon as any} size={22} color={color} />
        </View>
        <View style={s.headerText}>
          <Text style={s.title}>Ownership Confidence</Text>
          <Text style={[s.levelLabel, { color }]}>{result.label}</Text>
        </View>
        <Text style={[s.scoreLarge, { color }]}>{result.score}%</Text>
      </View>

      {/* Progress */}
      <View style={s.progressRow}>
        <ProgressBar value={result.score} color={color} />
      </View>

      {/* Disclaimer */}
      <Text style={s.disclaimer}>
        This score reflects verifiable evidence signals only. It is not a legal determination of ownership.
      </Text>

      {/* Breakdown */}
      {showBreakdown && Object.keys(SIGNAL_LABELS).length > 0 && (
        <View style={s.breakdown}>
          <Text style={s.breakdownTitle}>SIGNAL BREAKDOWN</Text>
          {Object.entries(SIGNAL_LABELS).map(([key, label]) => {
            const pts = result.breakdown[key] ?? 0;
            const max = SIGNAL_MAX[key] ?? 10;
            const pct = Math.round((pts / max) * 100);
            return (
              <View key={key} style={s.signalRow}>
                <Text style={s.signalLabel}>{label}</Text>
                <View style={s.signalRight}>
                  <ProgressBar value={pct} color={pts > 0 ? color : '#3A3A3A'} />
                  <Text style={s.signalPts}>{pts}/{max}</Text>
                </View>
              </View>
            );
          })}
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
    gap: 12,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  iconWrap: {
    width: 42,
    height: 42,
    borderRadius: 12,
    backgroundColor: '#252525',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerText: {
    flex: 1,
  },
  title: {
    fontSize: 13,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  levelLabel: {
    fontSize: 11,
    fontWeight: '600',
    marginTop: 2,
  },
  scoreLarge: {
    fontSize: 28,
    fontWeight: '900',
  },
  progressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  disclaimer: {
    fontSize: 11,
    color: '#6B7280',
    lineHeight: 16,
    fontStyle: 'italic',
  },
  breakdown: {
    gap: 8,
    borderTopWidth: 1,
    borderTopColor: '#2A2A2A',
    paddingTop: 12,
  },
  breakdownTitle: {
    fontSize: 9,
    fontWeight: '800',
    color: '#6B7280',
    letterSpacing: 1.5,
    marginBottom: 4,
  },
  signalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  signalLabel: {
    fontSize: 11,
    color: '#9CA3AF',
    width: 130,
    flexShrink: 0,
  },
  signalRight: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  signalPts: {
    fontSize: 10,
    color: '#6B7280',
    width: 36,
    textAlign: 'right',
  },
  // Compact
  compactRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  compactLabel: {
    fontSize: 11,
    fontWeight: '700',
  },
});
