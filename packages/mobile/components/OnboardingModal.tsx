/**
 * SIGIL — Onboarding Modal
 * First-time use walkthrough: registration, scanning, licensing, evidence.
 */

import React, { useState, useRef } from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  Animated,
  Dimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../constants/colors';

const { width: SCREEN_W } = Dimensions.get('window');

interface Slide {
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
  title: string;
  body: string;
}

const SLIDES: Slide[] = [
  {
    icon: 'shield-checkmark',
    color: '#FACC15',
    title: 'Timestamp Your Claim',
    body: 'SIGIL registers a hash of your content on Polygon — creating a public, timestamped record that you can use as evidence of prior creation. Not a substitute for copyright registration.',
  },
  {
    icon: 'search',
    color: '#60A5FA',
    title: 'Automated Scanning',
    body: 'SIGIL continuously scans GitHub, Reddit, StackOverflow, HuggingFace, npm, and the web — alerting you when your watermark or content appears elsewhere online.',
  },
  {
    icon: 'cash',
    color: '#22C55E',
    title: 'License Terms',
    body: 'Set on-chain license terms for your work. Users who accept your terms pay directly to your wallet. Payments are tracked automatically from the smart contract.',
  },
  {
    icon: 'document-text',
    color: '#F97316',
    title: 'Evidence Reports',
    body: 'When a match is detected, generate a PDF evidence report with on-chain data, similarity scores, and a DMCA template. Always consult a qualified attorney before taking legal action.',
  },
  {
    icon: 'git-branch',
    color: '#A78BFA',
    title: 'Dispute System',
    body: 'Anyone can challenge a claim within 7 days of registration. Attach provenance evidence — GitHub commits, EXIF data, publication URLs — to support or dispute ownership claims.',
  },
];

interface Props {
  visible: boolean;
  onDismiss: () => void;
}

export default function OnboardingModal({ visible, onDismiss }: Props) {
  const [current, setCurrent] = useState(0);
  const flatRef = useRef<FlatList>(null);

  const goNext = () => {
    if (current < SLIDES.length - 1) {
      const next = current + 1;
      flatRef.current?.scrollToIndex({ index: next, animated: true });
      setCurrent(next);
    } else {
      onDismiss();
    }
  };

  const goPrev = () => {
    if (current > 0) {
      const prev = current - 1;
      flatRef.current?.scrollToIndex({ index: prev, animated: true });
      setCurrent(prev);
    }
  };

  const slide = SLIDES[current];

  return (
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent>
      <View style={s.overlay}>
        <View style={s.sheet}>
          {/* Skip */}
          <TouchableOpacity style={s.skipBtn} onPress={onDismiss} accessibilityLabel="Skip onboarding">
            <Text style={s.skipText}>Skip</Text>
          </TouchableOpacity>

          {/* Slides */}
          <FlatList
            ref={flatRef}
            data={SLIDES}
            horizontal
            pagingEnabled
            scrollEnabled={false}
            showsHorizontalScrollIndicator={false}
            keyExtractor={(_, i) => String(i)}
            style={{ flexGrow: 0 }}
            renderItem={({ item }) => (
              <View style={[s.slide, { width: SCREEN_W - 64 }]}>
                <View style={[s.iconWrap, { backgroundColor: item.color + '22', borderColor: item.color + '44' }]}>
                  <Ionicons name={item.icon} size={44} color={item.color} />
                </View>
                <Text style={s.slideTitle}>{item.title}</Text>
                <Text style={s.slideBody}>{item.body}</Text>
              </View>
            )}
          />

          {/* Dots */}
          <View style={s.dots}>
            {SLIDES.map((_, i) => (
              <View key={i} style={[s.dot, i === current && s.dotActive]} />
            ))}
          </View>

          {/* Navigation */}
          <View style={s.nav}>
            {current > 0 ? (
              <TouchableOpacity style={s.prevBtn} onPress={goPrev} accessibilityRole="button">
                <Ionicons name="chevron-back" size={20} color={Colors.textMuted} />
                <Text style={s.prevText}>Back</Text>
              </TouchableOpacity>
            ) : (
              <View />
            )}
            <TouchableOpacity
              style={s.nextBtn}
              onPress={goNext}
              accessibilityRole="button"
              accessibilityLabel={current === SLIDES.length - 1 ? 'Get started' : 'Next'}
            >
              <Text style={s.nextText}>
                {current === SLIDES.length - 1 ? "Let's Go" : 'Next'}
              </Text>
              <Ionicons
                name={current === SLIDES.length - 1 ? 'rocket' : 'chevron-forward'}
                size={16}
                color="#000"
              />
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.85)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  sheet: {
    backgroundColor: '#1C1C1C',
    borderRadius: 28,
    width: '100%',
    maxWidth: 440,
    padding: 24,
    borderWidth: 1,
    borderColor: '#2A2A2A',
    overflow: 'hidden',
  },
  skipBtn: { alignSelf: 'flex-end', paddingVertical: 4, paddingHorizontal: 8 },
  skipText: { fontSize: 13, color: Colors.textMuted },
  slide: { alignItems: 'center', paddingVertical: 12, paddingHorizontal: 8, gap: 16 },
  iconWrap: {
    width: 88,
    height: 88,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
  },
  slideTitle: { fontSize: 22, fontWeight: '800', color: Colors.textPrimary, textAlign: 'center' },
  slideBody: { fontSize: 14, color: Colors.textMuted, textAlign: 'center', lineHeight: 22 },
  dots: { flexDirection: 'row', justifyContent: 'center', gap: 6, marginVertical: 20 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#3A3A3A' },
  dotActive: { width: 20, backgroundColor: Colors.accent },
  nav: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  prevBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, padding: 8 },
  prevText: { fontSize: 14, color: Colors.textMuted },
  nextBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: Colors.accent,
    borderRadius: 99, paddingHorizontal: 20, paddingVertical: 12,
  },
  nextText: { fontSize: 15, fontWeight: '800', color: '#000' },
});
