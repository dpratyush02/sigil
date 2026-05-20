import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../constants/colors';

interface WalletBadgeProps {
  address: string;
  isConnected: boolean;
}

export default function WalletBadge({ address, isConnected }: WalletBadgeProps) {
  const short = address ? `${address.slice(0, 6)}...${address.slice(-4)}` : 'Not connected';

  return (
    <View style={styles.badge}>
      <View style={[styles.dot, isConnected && styles.dotActive]} />
      <Text style={styles.address}>{short}</Text>
      <Ionicons name="chevron-down" size={12} color={Colors.textMuted} />
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: Colors.cardElevated,
    borderRadius: 99,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: 99,
    backgroundColor: Colors.textMuted,
  },
  dotActive: {
    backgroundColor: '#22C55E',
  },
  address: {
    fontSize: 12,
    fontFamily: 'monospace' as any,
    color: Colors.onSurfaceVariant,
    fontWeight: '600',
  },
});
