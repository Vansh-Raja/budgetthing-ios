/**
 * Onboarding: "Stop logging expenses."
 *
 * Story (AI agents and Apple Pay fill the inbox, you swipe to approve, or do it yourself)
 * → "set me up?" → optional currency / categories / accounts → connect helpers → finale.
 * Shared by web and native; also reachable from Settings › View Tutorial.
 */
import { Text } from '@/components/ui/LockedText';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, StatusBar, StyleSheet, View } from 'react-native';
import Animated from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Aurora, PressableScale, ProgressBar, pageEntering, pageExiting } from '@/components/onboarding/motion';
import { AccountsStep, AskStep, CurrencyStep, DoneStep, SpendStep, type SetupSummary } from '@/components/onboarding/SetupFlow';
import { ConnectStep } from '@/components/onboarding/SetupSteps';
import { AgentsScene, ApplePayScene, DiyScene, HookScene } from '@/components/onboarding/StoryScenes';
import { SwipeDemoScene } from '@/components/onboarding/SwipeDemo';
import { Colors, Fonts } from '../constants/theme';
import { useUserSettings } from '../lib/hooks/useUserSettings';

type Step = 'hook' | 'agents' | 'applepay' | 'swipe' | 'diy' | 'ask' | 'currency' | 'spend' | 'accounts' | 'connect' | 'done';
const STORY: Step[] = ['hook', 'agents', 'applepay', 'swipe', 'diy', 'ask'];
const SETUP: Step[] = ['currency', 'spend', 'accounts'];
const END: Step[] = ['connect', 'done'];

export function OnboardingScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const params = useLocalSearchParams<{ fromSettings?: string }>();
  const fromSettings = params.fromSettings === 'true';
  const { settings, updateSettings } = useUserSettings();
  const currencyCode = settings?.currencyCode ?? 'INR';
  // Captured once: whether this is the real first run (replays never delete anything).
  const firstRun = useRef(!fromSettings && settings?.hasSeenOnboarding === false).current;

  const [wantsSetup, setWantsSetup] = useState<boolean | null>(null);
  const steps = useMemo<Step[]>(() => [...STORY, ...(wantsSetup ? SETUP : []), ...END], [wantsSetup]);
  const [index, setIndex] = useState(0);
  const [direction, setDirection] = useState<1 | -1>(1);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [firstImport, setFirstImport] = useState(false);
  const [agentConnected, setAgentConnected] = useState(false);
  const [summary, setSummary] = useState<SetupSummary>({});
  // Save actions per step: a page that is still animating out can't overwrite the next page's.
  const commits = useRef<Partial<Record<Step, () => Promise<void>>>>({});

  const step = steps[index];
  const bindSpend = useCallback((fn: (() => Promise<void>) | null) => { commits.current.spend = fn ?? undefined; }, []);
  const bindAccounts = useCallback((fn: (() => Promise<void>) | null) => { commits.current.accounts = fn ?? undefined; }, []);
  const onSummary = useCallback((s: Partial<SetupSummary>) => setSummary((p) => ({ ...p, ...s })), []);
  const onFirstImport = useCallback(() => setFirstImport(true), []);
  const onKeyCreated = useCallback(() => setAgentConnected(true), []);

  const goTo = useCallback((next: number, list: Step[] = steps) => {
    setDirection(next >= index ? 1 : -1);
    setError(null);
    setIndex(Math.max(0, Math.min(list.length - 1, next)));
  }, [index, steps]);

  const finish = useCallback(async () => {
    setBusy(true);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    try {
      if (!settings?.hasSeenOnboarding) await updateSettings({ hasSeenOnboarding: true });
    } catch (e) {
      // Don't leave without saving: the first-run gate would just bring the user back.
      console.warn('[Onboarding] could not save completion', e);
      setBusy(false);
      setError("Couldn't save your setup. Check your connection and try again.");
      return;
    }
    if (fromSettings && router.canGoBack()) {
      router.back();
      if (firstImport) router.push('/import-inbox');
      return;
    }
    router.replace('/(tabs)');
    if (firstImport) router.push('/import-inbox');
  }, [settings?.hasSeenOnboarding, updateSettings, fromSettings, router, firstImport]);

  const next = useCallback(async () => {
    if (busy) return;
    if (step === 'done') return finish();
    const save = commits.current[step];
    if (save) {
      setBusy(true);
      try {
        await save();
      } catch (e: any) {
        setBusy(false);
        setError(e?.message ?? "Couldn't save that. Try again.");
        return;
      }
      setBusy(false);
    }
    goTo(index + 1);
  }, [busy, finish, goTo, index, step]);

  const chooseSetup = useCallback((yes: boolean) => {
    setWantsSetup(yes);
    const list = [...STORY, ...(yes ? SETUP : []), ...END];
    setDirection(1);
    setIndex(list.indexOf(yes ? 'currency' : 'connect'));
  }, []);

  const skipToAsk = () => goTo(STORY.indexOf('ask'));

  const inStory = STORY.indexOf(step) >= 0 && step !== 'ask';
  const label =
    step === 'hook' ? 'Show me how'
    : step === 'done' ? (firstImport ? 'Open my Inbox' : 'Open BudgetThing')
    : step === 'connect' ? (agentConnected ? 'Continue' : 'Skip for now')
    : step === 'accounts' ? 'Save and continue'
    : 'Next';
  const scene = Math.max(0, index);

  return (
    <View style={[styles.container, { paddingTop: insets.top }]} testID="onboarding">
      <StatusBar barStyle="light-content" />
      <Aurora scene={scene} />

      <View style={styles.topBar}>
        {index > 0 && step !== 'done' ? (
          <PressableScale accessibilityRole="button" accessibilityLabel="Back" onPress={() => goTo(index - 1)} style={styles.iconBtn}>
            <Ionicons name="chevron-back" size={22} color={Colors.textSecondary} />
          </PressableScale>
        ) : fromSettings && step !== 'done' ? (
          <PressableScale accessibilityRole="button" accessibilityLabel="Close" onPress={() => router.back()} style={styles.iconBtn}>
            <Ionicons name="close" size={22} color={Colors.textSecondary} />
          </PressableScale>
        ) : <View style={styles.iconBtn} />}
        <View style={styles.progress} accessibilityLabel={`Step ${index + 1} of ${steps.length}`}>
          <ProgressBar value={(index + 1) / steps.length} />
        </View>
        {inStory ? (
          <PressableScale accessibilityRole="button" onPress={skipToAsk} style={styles.skip}>
            <Text style={styles.skipText}>Skip</Text>
          </PressableScale>
        ) : <View style={styles.skip} />}
      </View>

      <View style={styles.body}>
        <Animated.View key={step} entering={pageEntering(direction)} exiting={pageExiting(direction)} style={StyleSheet.absoluteFill}>
          {step === 'hook' && <HookScene currencyCode={currencyCode} />}
          {step === 'agents' && <AgentsScene currencyCode={currencyCode} />}
          {step === 'applepay' && <ApplePayScene currencyCode={currencyCode} />}
          {step === 'swipe' && <SwipeDemoScene currencyCode={currencyCode} />}
          {step === 'diy' && <DiyScene />}
          {step === 'ask' && <AskStep onChoose={chooseSetup} />}
          {step === 'currency' && <CurrencyStep />}
          {step === 'spend' && <SpendStep bindNext={bindSpend} firstRun={firstRun} onSummary={onSummary} />}
          {step === 'accounts' && <AccountsStep bindNext={bindAccounts} onSummary={onSummary} />}
          {step === 'connect' && <ConnectStep onFirstImport={onFirstImport} onKeyCreated={onKeyCreated} />}
          {step === 'done' && <DoneStep summary={summary} agentConnected={agentConnected} firstImport={firstImport} />}
        </Animated.View>
      </View>

      {step !== 'ask' ? (
        <View style={[styles.footer, { paddingBottom: insets.bottom + 18 }]}>
          {error ? <Text style={styles.error} accessibilityRole="alert">{error}</Text> : null}
          <PressableScale
            accessibilityRole="button"
            testID="onboarding-primary"
            onPress={next}
            disabled={busy}
            style={[styles.button, busy && { opacity: 0.7 }]}
          >
            {busy ? <ActivityIndicator color="#000" /> : null}
            <Text style={styles.buttonText}>{label}</Text>
            {!busy ? <Ionicons name={step === 'done' ? 'sparkles' : 'arrow-forward'} size={20} color="#000" /> : null}
          </PressableScale>
        </View>
      ) : <View style={{ height: insets.bottom + 18 }} />}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000', overflow: 'hidden' },
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12, height: 52, width: '100%', maxWidth: 560, alignSelf: 'center', gap: 8 },
  iconBtn: { width: 44, height: 40, justifyContent: 'center', paddingLeft: 4 },
  progress: { flex: 1, flexDirection: 'row', paddingHorizontal: 8 },
  skip: { width: 52, height: 40, alignItems: 'flex-end', justifyContent: 'center', paddingRight: 6 },
  skipText: { fontFamily: Fonts.demiBold, fontSize: 16, color: Colors.textTertiary },
  body: { flex: 1, width: '100%', maxWidth: 560, alignSelf: 'center' },
  footer: { paddingHorizontal: 24, paddingTop: 10, width: '100%', maxWidth: 520, alignSelf: 'center' },
  button: { height: 58, borderRadius: 29, backgroundColor: Colors.accent, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 },
  buttonText: { fontFamily: Fonts.heavy, fontSize: 21, color: '#000' },
  error: { fontFamily: Fonts.medium, fontSize: 14, color: Colors.error, textAlign: 'center', marginBottom: 10 },
});
