/**
 * Onboarding: "Stop logging expenses."
 *
 * Story first (AI agents and Apple Pay fill the inbox, you swipe to approve, or do it
 * yourself), then setup (currency, accounts) and an optional "connect your helpers"
 * page that creates an agent key and waits live for the first import.
 * Shared by web and native; also reachable from Settings › View Tutorial.
 */
import { Text } from '@/components/ui/LockedText';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { StatusBar, StyleSheet, TouchableOpacity, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ConnectStep, SetupStep } from '@/components/onboarding/SetupSteps';
import { AgentsScene, ApplePayScene, DiyScene, HookScene } from '@/components/onboarding/StoryScenes';
import { SwipeDemoScene } from '@/components/onboarding/SwipeDemo';
import { Colors, Fonts } from '../constants/theme';
import { useUserSettings } from '../lib/hooks/useUserSettings';

const STEPS = ['hook', 'agents', 'applepay', 'swipe', 'diy', 'setup', 'connect'] as const;
type Step = (typeof STEPS)[number];
const SETUP_INDEX = STEPS.indexOf('setup');

export function OnboardingScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const params = useLocalSearchParams<{ fromSettings?: string }>();
  const fromSettings = params.fromSettings === 'true';
  const { settings, updateSettings } = useUserSettings();
  const currencyCode = settings?.currencyCode ?? 'INR';

  const [index, setIndex] = useState(0);
  const [firstImport, setFirstImport] = useState(false);
  const [finishing, setFinishing] = useState(false);
  const step: Step = STEPS[index];
  const last = index === STEPS.length - 1;

  const go = useCallback((next: number) => {
    Haptics.selectionAsync().catch(() => {});
    setIndex(Math.max(0, Math.min(STEPS.length - 1, next)));
  }, []);

  const finish = useCallback(async () => {
    if (finishing) return;
    setFinishing(true);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    try {
      if (!settings?.hasSeenOnboarding) await updateSettings({ hasSeenOnboarding: true });
    } catch (e) {
      console.warn('[Onboarding] could not save completion', e);
    }
    if (fromSettings && router.canGoBack()) {
      router.back();
      if (firstImport) router.push('/import-inbox');
      return;
    }
    router.replace('/(tabs)');
    if (firstImport) router.push('/import-inbox');
  }, [finishing, settings?.hasSeenOnboarding, updateSettings, fromSettings, router, firstImport]);

  const onFirstImport = useCallback(() => setFirstImport(true), []);

  const primaryLabel = last ? (firstImport ? 'Open my Inbox' : 'Start using BudgetThing') : step === 'hook' ? 'Show me how' : 'Next';

  return (
    <View style={[styles.container, { paddingTop: insets.top }]} testID="onboarding">
      <StatusBar barStyle="light-content" />
      <View style={styles.topBar}>
        {index > 0 ? (
          <TouchableOpacity accessibilityRole="button" accessibilityLabel="Back" onPress={() => go(index - 1)} style={styles.iconBtn}>
            <Ionicons name="chevron-back" size={22} color={Colors.textSecondary} />
          </TouchableOpacity>
        ) : fromSettings ? (
          <TouchableOpacity accessibilityRole="button" accessibilityLabel="Close" onPress={() => router.back()} style={styles.iconBtn}>
            <Ionicons name="close" size={22} color={Colors.textSecondary} />
          </TouchableOpacity>
        ) : <View style={styles.iconBtn} />}
        <View style={styles.dots} accessibilityLabel={`Step ${index + 1} of ${STEPS.length}`}>
          {STEPS.map((s, i) => <View key={s} style={[styles.dot, i === index && styles.dotActive, i < index && styles.dotDone]} />)}
        </View>
        {index < SETUP_INDEX ? (
          <TouchableOpacity accessibilityRole="button" onPress={() => go(SETUP_INDEX)} style={styles.skip}>
            <Text style={styles.skipText}>Skip</Text>
          </TouchableOpacity>
        ) : <View style={styles.skip} />}
      </View>

      <Animated.View key={step} entering={FadeIn.duration(260)} style={styles.body}>
        {step === 'hook' && <HookScene currencyCode={currencyCode} />}
        {step === 'agents' && <AgentsScene currencyCode={currencyCode} />}
        {step === 'applepay' && <ApplePayScene currencyCode={currencyCode} />}
        {step === 'swipe' && <SwipeDemoScene currencyCode={currencyCode} />}
        {step === 'diy' && <DiyScene />}
        {step === 'setup' && <SetupStep />}
        {step === 'connect' && <ConnectStep onFirstImport={onFirstImport} />}
      </Animated.View>

      <View style={[styles.footer, { paddingBottom: insets.bottom + 18 }]}>
        <TouchableOpacity
          accessibilityRole="button"
          testID="onboarding-primary"
          onPress={() => (last ? finish() : go(index + 1))}
          style={[styles.button, finishing && { opacity: 0.6 }]}
          activeOpacity={0.85}
          disabled={finishing}
        >
          <Text style={styles.buttonText}>{primaryLabel}</Text>
          <Ionicons name={last ? 'checkmark' : 'arrow-forward'} size={20} color="#000" />
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12, height: 52, width: '100%', maxWidth: 560, alignSelf: 'center' },
  iconBtn: { width: 64, height: 40, justifyContent: 'center', paddingLeft: 4 },
  skip: { width: 64, height: 40, alignItems: 'flex-end', justifyContent: 'center', paddingRight: 8 },
  skipText: { fontFamily: Fonts.demiBold, fontSize: 16, color: Colors.textTertiary },
  dots: { flexDirection: 'row', gap: 6 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.2)' },
  dotDone: { backgroundColor: 'rgba(255,149,0,0.5)' },
  dotActive: { width: 20, backgroundColor: Colors.accent },
  body: { flex: 1, width: '100%', maxWidth: 560, alignSelf: 'center' },
  footer: { paddingHorizontal: 24, paddingTop: 10, width: '100%', maxWidth: 520, alignSelf: 'center' },
  button: { height: 56, borderRadius: 28, backgroundColor: Colors.accent, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 },
  buttonText: { fontFamily: Fonts.heavy, fontSize: 20, color: '#000' },
});
