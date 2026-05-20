/**
 * SIGIL — OfflineBanner
 * Shown at top of screen when no network is detected.
 * Dismissible via the × button.
 */

import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, Animated, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNetwork } from '../hooks/useNetwork';

export default function OfflineBanner() {
  const { isOnline } = useNetwork();
  const [dismissed, setDismissed] = useState(false);
  const slideAnim = useRef(new Animated.Value(-60)).current;

  // Re-show banner when connection drops again
  useEffect(() => {
    if (!isOnline) setDismissed(false);
  }, [isOnline]);

  const visible = !isOnline && !dismissed;

  useEffect(() => {
    Animated.spring(slideAnim, {
      toValue: visible ? 0 : -60,
      useNativeDriver: true,
      bounciness: 0,
    }).start();
  }, [visible]);

  return (
    <Animated.View style={[s.banner, { transform: [{ translateY: slideAnim }] }]}>
      <Ionicons name="cloud-offline-outline" size={14} color="#FFF" />
      <Text style={s.text}>No internet connection — actions will queue and retry</Text>
      <TouchableOpacity
        onPress={() => setDismissed(true)}
        hitSlop={10}
        style={s.closeBtn}
        accessibilityLabel="Dismiss"
      >
        <Ionicons name="close" size={16} color="#FFF" />
      </TouchableOpacity>
    </Animated.View>
  );
}

const s = StyleSheet.create({
  banner: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    backgroundColor: '#EF4444',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 8,
    zIndex: 9999,
  },
  text: { fontSize: 12, color: '#FFF', fontWeight: '600', flex: 1 },
  closeBtn: { padding: 2 },
});
