import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Colors } from '../constants/colors';

interface SimilarityBarProps {
  score: number;
  showLabel?: boolean;
  compact?: boolean;
}

function getBarColor(score: number): string {
  if (score >= 90) return '#FF4444';
  if (score >= 75) return Colors.primary;
  if (score >= 50) return Colors.warning;
  return Colors.textMuted;
}

export default function SimilarityBar({ score, showLabel = true, compact = false }: SimilarityBarProps) {
  const color = getBarColor(score);

  return (
    <View style={styles.container}>
      {showLabel && (
        <View style={styles.labelRow}>
          <Text style={styles.label}>Similarity Match</Text>
          <Text style={[styles.score, { color }]}>{score}%</Text>
        </View>
      )}
      <View style={[styles.track, compact && styles.trackCompact]}>
        <View style={[styles.fill, { width: `${score}%` as any, backgroundColor: color }]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
  },
  labelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  label: {
    fontSize: 12,
    color: Colors.textMuted,
  },
  score: {
    fontSize: 12,
    fontWeight: '700',
  },
  track: {
    height: 6,
    backgroundColor: Colors.border,
    borderRadius: 3,
    overflow: 'hidden',
  },
  trackCompact: {
    height: 4,
  },
  fill: {
    height: '100%',
    borderRadius: 3,
  },
});
