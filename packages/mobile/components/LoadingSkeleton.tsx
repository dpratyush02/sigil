/**
 * SIGIL — Loading Skeleton
 * Animated placeholder for list items and stat cards.
 */

import React, { useEffect, useRef } from 'react';
import { View, StyleSheet, Animated } from 'react-native';

interface SkeletonProps {
  width?: number | string;
  height?: number;
  borderRadius?: number;
  style?: any;
}

export function Skeleton({ width = '100%', height = 16, borderRadius = 8, style }: SkeletonProps) {
  const anim = useRef(new Animated.Value(0.4)).current;

  useEffect(() => {
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(anim, { toValue: 1, duration: 700, useNativeDriver: true }),
        Animated.timing(anim, { toValue: 0.4, duration: 700, useNativeDriver: true }),
      ])
    );
    pulse.start();
    return () => pulse.stop();
  }, []);

  return (
    <Animated.View
      style={[
        {
          width: width as any,
          height,
          borderRadius,
          backgroundColor: '#2A2A2A',
          opacity: anim,
        },
        style,
      ]}
    />
  );
}

export function AlertCardSkeleton() {
  return (
    <View style={s.card}>
      <View style={s.row}>
        <Skeleton width={40} height={40} borderRadius={12} />
        <View style={{ flex: 1, gap: 8 }}>
          <Skeleton width="70%" height={14} />
          <Skeleton width="45%" height={11} />
        </View>
        <Skeleton width={50} height={22} borderRadius={6} />
      </View>
      <Skeleton width="90%" height={12} />
      <Skeleton width={80} height={24} borderRadius={99} />
    </View>
  );
}

export function StatCardSkeleton() {
  return (
    <View style={s.statCard}>
      <Skeleton width={32} height={32} borderRadius={10} />
      <View style={{ flex: 1, gap: 6 }}>
        <Skeleton width="60%" height={12} />
        <Skeleton width="40%" height={24} />
      </View>
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
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  statCard: {
    backgroundColor: '#1E1E1E',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#2A2A2A',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 10,
  },
});
