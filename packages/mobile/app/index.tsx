import React, { useState, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Dimensions,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useWallet } from '../hooks/useWallet';

const { width: W } = Dimensions.get('window');

const slides = [
  {
    id: '1',
    title: 'Your work.\nYour timestamp.',
    subtitle: 'Register your content on blockchain.\nCreate a verifiable, timestamped record of your claim.',
  },
  {
    id: '2',
    title: 'Monitor.\nAct.',
    subtitle: 'SIGIL scans GitHub, Reddit & StackOverflow 24/7.\nGet alerted when your watermark appears online.',
  },
  {
    id: '3',
    title: 'Evidence.\nOn demand.',
    subtitle: 'Export court-ready PDF reports with on-chain proof.\nDispute unauthorized use with verifiable data.',
  },
];

export default function OnboardingScreen() {
  const router = useRouter();
  const { isConnecting } = useWallet();
  const [current, setCurrent] = useState(0);
  const scrollRef = useRef<ScrollView>(null);

  const go = () => {
    if (current < slides.length - 1) {
      const next = current + 1;
      scrollRef.current?.scrollTo({ x: W * next, animated: true });
      setCurrent(next);
    } else {
      router.replace('/(tabs)/dashboard');
    }
  };

  const skip = () => {
    router.replace('/(tabs)/dashboard');
  };

  return (
    <SafeAreaView style={s.root} edges={['top', 'bottom', 'left', 'right']}>

      {/* Brand header */}
      <View style={s.header}>
        <Text style={s.brand}>SIGIL</Text>
      </View>

      {/* Paged slides */}
      <ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled
        scrollEnabled={false}
        showsHorizontalScrollIndicator={false}
        style={{ flex: 1 }}
      >
        {slides.map((slide) => (
          <View key={slide.id} style={[s.slide, { width: W }]}>

            {/* Illustration card */}
            <View style={s.card}>
              {/* Floating badges — corners */}
              <View style={[s.badge, s.badgeTR, s.badgeYellow]}>
                <Ionicons name="lock-closed" size={18} color="#1A1A1A" />
              </View>
              <View style={[s.badge, s.badgeTL]}>
                <Ionicons name="document-text-outline" size={18} color="#FACC15" />
              </View>
              <View style={[s.badge, s.badgeBR]}>
                <Ionicons name="shield-checkmark-outline" size={18} color="#FACC15" />
              </View>
              <View style={[s.badge, s.badgeBL]}>
                <Ionicons name="mail-outline" size={18} color="#FACC15" />
              </View>

              {/* Center illustration */}
              <View style={s.centerIllustration}>
                <View style={s.monitorBase}>
                  <Ionicons name="desktop-outline" size={72} color="#FACC15" />
                </View>
                <View style={s.personRow}>
                  <Ionicons name="person" size={36} color="#9CA3AF" />
                </View>
              </View>
            </View>

            {/* Text content */}
            <Text style={s.title}>{slide.title}</Text>
            <Text style={s.subtitle}>{slide.subtitle}</Text>

            {/* CTA */}
            <TouchableOpacity
              style={s.getStarted}
              onPress={go}
              activeOpacity={0.85}
              disabled={isConnecting}
            >
              {isConnecting ? (
                <ActivityIndicator color="#1A1A1A" />
              ) : (
                <Text style={s.getStartedText}>Get started</Text>
              )}
            </TouchableOpacity>
          </View>
        ))}
      </ScrollView>

      {/* Bottom nav bar */}
      <View style={s.bottomBar}>
        <TouchableOpacity onPress={skip} style={s.skipBtn} hitSlop={12}>
          <Text style={s.skipText}>Skip</Text>
        </TouchableOpacity>

        <View style={s.dots}>
          {slides.map((_, i) => (
            <View key={i} style={[s.dot, i === current && s.dotActive]} />
          ))}
        </View>

        <TouchableOpacity style={s.nextBtn} onPress={go} activeOpacity={0.85}>
          <Text style={s.nextText}>Next</Text>
          <Ionicons name="arrow-forward" size={14} color="#1A1A1A" />
        </TouchableOpacity>
      </View>

    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#1A1A1A',
  },

  // Header
  header: {
    alignItems: 'center',
    paddingTop: 12,
    paddingBottom: 4,
  },
  brand: {
    fontSize: 16,
    fontWeight: '800',
    color: '#FACC15',
    letterSpacing: 5,
  },

  // Slide
  slide: {
    paddingHorizontal: 24,
    paddingTop: 16,
    alignItems: 'center',
  },

  // Illustration card
  card: {
    width: '100%',
    height: W * 0.62,
    backgroundColor: '#252525',
    borderRadius: 24,
    marginBottom: 32,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  badge: {
    position: 'absolute',
    width: 42,
    height: 42,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#2E2E2E',
    borderWidth: 1,
    borderColor: '#3A3A3A',
  },
  badgeYellow: {
    backgroundColor: '#FACC15',
    borderColor: '#FACC15',
  },
  badgeTR: { top: 20, right: 20 },
  badgeTL: { top: 20, left: 20 },
  badgeBR: { bottom: 20, right: 20 },
  badgeBL: { bottom: 20, left: 20 },

  centerIllustration: {
    alignItems: 'center',
    gap: 0,
  },
  monitorBase: {
    alignItems: 'center',
  },
  personRow: {
    marginTop: -4,
  },

  // Text
  title: {
    fontSize: 30,
    fontWeight: '800',
    color: '#FFFFFF',
    textAlign: 'center',
    lineHeight: 38,
    marginBottom: 12,
  },
  subtitle: {
    fontSize: 14,
    color: '#9CA3AF',
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 28,
    paddingHorizontal: 4,
  },

  // Get started button
  getStarted: {
    width: '100%',
    backgroundColor: '#FACC15',
    borderRadius: 99,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  getStartedText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1A1A1A',
  },

  // Bottom bar
  bottomBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 24,
    paddingTop: 16,
    paddingBottom: 20,
  },
  skipBtn: {
    width: 52,
  },
  skipText: {
    fontSize: 14,
    color: '#9CA3AF',
    fontWeight: '500',
  },
  dots: {
    flexDirection: 'row',
    gap: 7,
    alignItems: 'center',
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 99,
    backgroundColor: '#3A3A3A',
  },
  dotActive: {
    width: 24,
    backgroundColor: '#FACC15',
  },
  nextBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#FACC15',
    borderRadius: 99,
    paddingHorizontal: 18,
    paddingVertical: 10,
  },
  nextText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1A1A1A',
  },
});
