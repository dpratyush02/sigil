/**
 * SIGIL — ClaimStatusBadge
 * Displays the current status of an ownership claim.
 */

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { ClaimStatus } from '../services/dispute';

interface Props {
  status: ClaimStatus;
  compact?: boolean;
}

interface BadgeConfig {
  label: string;
  color: string;
  bg: string;
  icon: string;
}

function getConfig(status: ClaimStatus): BadgeConfig {
  switch (status) {
    case 'newly_claimed':
      return {
        label: 'Newly Claimed',
        color: '#60A5FA',
        bg: '#60A5FA18',
        icon: 'time-outline',
      };
    case 'challenge_active':
      return {
        label: 'Challenge Active',
        color: '#F97316',
        bg: '#F9731618',
        icon: 'warning-outline',
      };
    case 'uncontested':
      return {
        label: 'Uncontested',
        color: '#22C55E',
        bg: '#22C55E18',
        icon: 'shield-checkmark-outline',
      };
    case 'disputed':
      return {
        label: 'Disputed',
        color: '#EF4444',
        bg: '#EF444418',
        icon: 'close-circle-outline',
      };
  }
}

export default function ClaimStatusBadge({ status, compact = false }: Props) {
  const cfg = getConfig(status);

  return (
    <View
      style={[
        s.badge,
        { backgroundColor: cfg.bg, borderColor: cfg.color + '44' },
        compact && s.compact,
      ]}
      accessibilityLabel={`Claim status: ${cfg.label}`}
    >
      <Ionicons name={cfg.icon as any} size={compact ? 11 : 13} color={cfg.color} />
      {!compact && (
        <Text style={[s.label, { color: cfg.color }]}>{cfg.label}</Text>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderRadius: 99,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderWidth: 1,
    alignSelf: 'flex-start',
  },
  compact: {
    paddingHorizontal: 6,
    paddingVertical: 4,
  },
  label: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
});
