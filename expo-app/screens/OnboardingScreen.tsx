/**
 * Onboarding Screen - Welcome & Tutorial
 * 
 * Displayed on first launch.
 */

import React, { useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Dimensions,
  Image,
  StatusBar,
} from 'react-native';
import PagerView from 'react-native-pager-view';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';

import { Colors } from '../constants/theme';
import { useUserSettings } from '../lib/hooks/useUserSettings';

const SCREEN_WIDTH = Dimensions.get('window').width;

const PAGES = [
  {
    emoji: '👋',
    title: 'Welcome to\nBudgetThing',
    subtitle: 'The easiest way to track expenses and share costs with friends.',
    icon: null,
  },
  {
    emoji: '💸',
    title: 'Track Every\nPenny',
    subtitle: 'Log your daily spending, organize by category, and stay on budget.',
    icon: 'wallet-outline',
  },
  {
    emoji: '✈️',
    title: 'Perfect for\nGroup Trips',
    subtitle: 'Create trips, split costs automatically, and settle up instantly.',
    icon: 'airplane-outline',
  },
  {
    emoji: '🔒',
    title: 'Privacy\nFirst',
    subtitle: 'Your data stays on your device. Sync securely when you sign in.',
    icon: 'lock-closed-outline',
  },
];

export function OnboardingScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const pagerRef = useRef<PagerView>(null);
  const [activeIndex, setActiveIndex] = React.useState(0);
  const { updateSettings } = useUserSettings();

  const handleNext = async () => {
    Haptics.selectionAsync();
    if (activeIndex < PAGES.length - 1) {
      pagerRef.current?.setPage(activeIndex + 1);
    } else {
      // Finish
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      await updateSettings({ hasSeenOnboarding: true });
      router.replace('/(tabs)');
    }
  };

  const handlePageSelected = (e: { nativeEvent: { position: number } }) => {
    setActiveIndex(e.nativeEvent.position);
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" />

      <PagerView
        ref={pagerRef}
        style={styles.pager}
        initialPage={0}
        onPageSelected={handlePageSelected}
      >
        {PAGES.map((page, index) => (
          <View key={index} style={styles.page}>
            <View style={styles.contentContainer}>
              <Text style={styles.emoji}>{page.emoji}</Text>

              {page.icon && (
                <View style={styles.iconContainer}>
                  <Ionicons name={page.icon as any} size={48} color={Colors.accent} />
                </View>
              )}

              <Text style={styles.title}>{page.title}</Text>
              <Text style={styles.subtitle}>{page.subtitle}</Text>
            </View>
          </View>
        ))}
      </PagerView>

      {/* Footer */}
      <View style={[styles.footer, { paddingBottom: insets.bottom + 20 }]}>
        {/* Indicators */}
        <View style={styles.indicators}>
          {PAGES.map((_, i) => (
            <View
              key={i}
              style={[
                styles.indicator,
                i === activeIndex && styles.indicatorActive
              ]}
            />
          ))}
        </View>

        <TouchableOpacity
          style={styles.button}
          onPress={handleNext}
          activeOpacity={0.8}
        >
          <Text style={styles.buttonText}>
            {activeIndex === PAGES.length - 1 ? "Get Started" : "Next"}
          </Text>
          <Ionicons
            name={activeIndex === PAGES.length - 1 ? "rocket" : "arrow-forward"}
            size={20}
            color="#FFFFFF"
          />
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
  pager: {
    flex: 1,
  },
  page: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  contentContainer: {
    alignItems: 'center',
    gap: 24,
  },
  emoji: {
    fontSize: 80,
    marginBottom: 20,
  },
  iconContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(255, 149, 0, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 10,
  },
  title: {
    fontFamily: 'AvenirNextCondensed-Heavy',
    fontSize: 48,
    color: '#FFFFFF',
    textAlign: 'center',
    lineHeight: 52,
  },
  subtitle: {
    fontFamily: 'AvenirNextCondensed-Medium',
    fontSize: 20,
    color: 'rgba(255, 255, 255, 0.6)',
    textAlign: 'center',
    lineHeight: 28,
    maxWidth: 300,
  },
  footer: {
    paddingHorizontal: 32,
    gap: 32,
  },
  indicators: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
  },
  indicator: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
  },
  indicatorActive: {
    backgroundColor: Colors.accent,
    width: 24,
  },
  button: {
    backgroundColor: Colors.accent,
    height: 56,
    borderRadius: 28,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 12,
    shadowColor: '#FF9500',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
  },
  buttonText: {
    fontFamily: 'AvenirNextCondensed-Bold',
    fontSize: 20,
    color: '#FFFFFF',
    letterSpacing: 0.5,
  },
});
