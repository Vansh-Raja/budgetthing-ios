/**
 * Interactive "you approve everything" page: a deck of demo imports the user swipes
 * exactly like the real inbox (right = confirm, left = edit). Buttons do the same for
 * anyone who can't or won't swipe. Finishing the deck fires confetti.
 */
import { Text } from '@/components/ui/LockedText';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import React, { useCallback, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { FadeInDown, LinearTransition, ZoomIn, interpolate, runOnJS, useAnimatedStyle, useSharedValue, withSpring, withTiming, Extrapolation } from 'react-native-reanimated';
import { Colors, Fonts } from '@/constants/theme';
import { AnimatedWords, Confetti, PressableScale, Rise } from './motion';
import { SceneScroll } from './StoryScenes';
import { AnimatedView, DemoInboxCard, sceneStyles, type DemoItem } from './shared';

const THRESHOLD = 80;
const FLY = 520;

const DEMO: DemoItem[] = [
  { id: 'd1', emoji: '🍔', merchant: 'Swiggy', amountCents: 48600, via: 'your AI agent' },
  { id: 'd2', emoji: '☕', merchant: 'Blue Tokai', amountCents: 24000, via: 'Apple Pay' },
  { id: 'd3', emoji: '🛍️', merchant: 'Amazon', amountCents: 129900, via: 'your AI agent' },
];

type Outcome = 'confirmed' | 'edited';

function TopCard({ item, currencyCode, onDone }: { item: DemoItem; currencyCode: string; onDone: (o: Outcome) => void }) {
  const x = useSharedValue(0);
  const gone = useSharedValue(0);
  const crossed = useSharedValue(0);

  const finish = useCallback((o: Outcome) => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    onDone(o);
  }, [onDone]);
  const tick = useCallback(() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {}); }, []);

  // Buttons (JS thread); the gesture below does the same on the UI thread.
  const fly = (o: Outcome) => {
    if (gone.value > 0) return; // already leaving
    x.value = withTiming(o === 'confirmed' ? FLY : -FLY, { duration: 260 });
    gone.value = withTiming(1, { duration: 240 }, (fin) => { if (fin) runOnJS(finish)(o); });
  };

  const pan = Gesture.Pan()
    .activeOffsetX([-6, 6])
    .failOffsetY([-18, 18])
    .onUpdate((e) => {
      x.value = e.translationX;
      const past = Math.abs(e.translationX) >= THRESHOLD ? 1 : 0;
      if (past !== crossed.value) {
        crossed.value = past;
        if (past) runOnJS(tick)();
      }
    })
    .onEnd((e) => {
      if (gone.value > 0) return;
      const o: Outcome | null =
        e.translationX >= THRESHOLD || e.velocityX > 800 ? 'confirmed' : e.translationX <= -THRESHOLD || e.velocityX < -800 ? 'edited' : null;
      if (!o) {
        x.value = withSpring(0, { damping: 14, stiffness: 220 });
        return;
      }
      x.value = withTiming(o === 'confirmed' ? FLY : -FLY, { duration: 260 });
      gone.value = withTiming(1, { duration: 240 }, (fin) => { if (fin) runOnJS(finish)(o); });
    });

  const cardStyle = useAnimatedStyle(() => ({
    opacity: 1 - gone.value,
    transform: [{ translateX: x.value }, { translateY: Math.abs(x.value) * 0.06 }, { rotate: `${x.value / 22}deg` }],
  }));
  const confirmStamp = useAnimatedStyle(() => {
    const p = interpolate(x.value, [10, THRESHOLD], [0, 1], Extrapolation.CLAMP);
    return { opacity: p, transform: [{ rotate: '-12deg' }, { scale: 0.7 + p * 0.3 }] };
  });
  const editStamp = useAnimatedStyle(() => {
    const p = interpolate(x.value, [-10, -THRESHOLD], [0, 1], Extrapolation.CLAMP);
    return { opacity: p, transform: [{ rotate: '12deg' }, { scale: 0.7 + p * 0.3 }] };
  });
  const glow = useAnimatedStyle(() => {
    const r = interpolate(x.value, [0, THRESHOLD], [0, 1], Extrapolation.CLAMP);
    const l = interpolate(x.value, [0, -THRESHOLD], [0, 1], Extrapolation.CLAMP);
    return { borderColor: r > l ? `rgba(52,199,89,${0.25 + r * 0.75})` : `rgba(255,149,0,${0.25 + l * 0.75})` };
  });

  return (
    <View style={styles.slot}>
      <GestureDetector gesture={pan}>
        <AnimatedView entering={ZoomIn.springify().damping(14)} style={[styles.topWrap, cardStyle]} testID="onboarding-swipe-card">
          <AnimatedView style={[styles.topCardFrame, glow]}>
            <DemoInboxCard item={item} currencyCode={currencyCode} style={styles.topCard} />
          </AnimatedView>
          <AnimatedView style={[styles.stamp, styles.stampConfirm, confirmStamp]} pointerEvents="none">
            <Text style={[styles.stampText, { color: Colors.success }]}>CONFIRM</Text>
          </AnimatedView>
          <AnimatedView style={[styles.stamp, styles.stampEdit, editStamp]} pointerEvents="none">
            <Text style={[styles.stampText, { color: Colors.accent }]}>EDIT</Text>
          </AnimatedView>
        </AnimatedView>
      </GestureDetector>
      <View style={styles.buttons}>
        <PressableScale accessibilityRole="button" accessibilityLabel={`Edit ${item.merchant}`} onPress={() => fly('edited')} style={[styles.btn, styles.btnGhost]}>
          <Ionicons name="arrow-back" size={16} color={Colors.textSecondary} />
          <Text style={styles.btnGhostText}>Edit</Text>
        </PressableScale>
        <PressableScale accessibilityRole="button" accessibilityLabel={`Confirm ${item.merchant}`} onPress={() => fly('confirmed')} style={[styles.btn, styles.btnSolid]}>
          <Text style={styles.btnSolidText}>Confirm</Text>
          <Ionicons name="arrow-forward" size={16} color="#000" />
        </PressableScale>
      </View>
    </View>
  );
}

export function SwipeDemoScene({ currencyCode }: { currencyCode: string }) {
  const [index, setIndex] = useState(0);
  const [burst, setBurst] = useState(0);
  const [log, setLog] = useState<Array<{ item: DemoItem; outcome: Outcome }>>([]);

  const onDone = useCallback((outcome: Outcome) => {
    setLog((l) => [{ item: DEMO[index], outcome }, ...l]);
    const next = index + 1;
    setIndex(next);
    if (next >= DEMO.length) setBurst((b) => b + 1);
  }, [index]);

  const done = index >= DEMO.length;
  return (
    <SceneScroll>
      <Rise><Text style={sceneStyles.kicker}>You stay in charge</Text></Rise>
      <AnimatedWords text="Swipe to approve." style={sceneStyles.title} delay={60} accentWords={['approve']} />
      <Rise delay={380}>
        <Text style={sceneStyles.subtitle}>
          Nothing touches your books until you say so. Swipe right to confirm, left to fix the amount, account or category. Try it.
        </Text>
      </Rise>
      <View style={styles.deck}>
        {done ? (
          <Animated.View entering={ZoomIn.springify().damping(12)} style={styles.doneBox}>
            <Text style={styles.doneEmoji}>🎉</Text>
            <Text style={styles.doneTitle}>That's the whole job.</Text>
            <PressableScale onPress={() => { setIndex(0); setLog([]); }} accessibilityRole="button">
              <Text style={styles.replay}>Try again</Text>
            </PressableScale>
          </Animated.View>
        ) : (
          <>
            {DEMO.slice(index + 1, index + 3).map((it, k) => (
              <Animated.View key={it.id} layout={LinearTransition.springify().damping(16)} style={[styles.behind, { top: 10 + k * 10, transform: [{ scale: 0.94 - k * 0.05 }], opacity: 0.5 - k * 0.2 }]} pointerEvents="none">
                <DemoInboxCard item={it} currencyCode={currencyCode} />
              </Animated.View>
            )).reverse()}
            <TopCard key={DEMO[index].id} item={DEMO[index]} currencyCode={currencyCode} onDone={onDone} />
          </>
        )}
        <Confetti burst={burst} />
      </View>
      <View style={styles.log}>
        {log.slice(0, 3).map(({ item, outcome }) => (
          <Animated.Text key={item.id} entering={FadeInDown.springify()} layout={LinearTransition} style={styles.logRow}>
            {outcome === 'confirmed' ? '✓ ' : '✎ '}
            {item.merchant}: {outcome === 'confirmed' ? 'added to your books' : 'opened in the editor'}
          </Animated.Text>
        ))}
      </View>
    </SceneScroll>
  );
}

const styles = StyleSheet.create({
  deck: { width: '100%', maxWidth: 360, height: 160, marginTop: 26, alignItems: 'center' },
  slot: { width: '100%', alignItems: 'center' },
  topWrap: { width: '100%', alignItems: 'center', zIndex: 5 },
  topCardFrame: { width: '100%', maxWidth: 334, borderRadius: 20, borderWidth: 2 },
  topCard: { maxWidth: undefined, borderWidth: 0, backgroundColor: '#1C1C1E' },
  behind: { position: 'absolute', width: '100%', alignItems: 'center' },
  stamp: { position: 'absolute', top: 14, paddingHorizontal: 10, paddingVertical: 2, borderRadius: 8, borderWidth: 3, backgroundColor: 'rgba(0,0,0,0.75)' },
  stampConfirm: { left: 30, borderColor: Colors.success },
  stampEdit: { right: 30, borderColor: Colors.accent },
  stampText: { fontFamily: Fonts.heavy, fontSize: 22, letterSpacing: 2 },
  buttons: { flexDirection: 'row', gap: 12, marginTop: 20 },
  btn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 20, height: 42, borderRadius: 21 },
  btnGhost: { borderWidth: 1, borderColor: 'rgba(255,255,255,0.22)', backgroundColor: 'rgba(0,0,0,0.4)' },
  btnGhostText: { fontFamily: Fonts.demiBold, fontSize: 15, color: Colors.textSecondary },
  btnSolid: { backgroundColor: Colors.success },
  btnSolidText: { fontFamily: Fonts.demiBold, fontSize: 15, color: '#000' },
  doneBox: { alignItems: 'center', gap: 6, marginTop: 6 },
  doneEmoji: { fontSize: 46 },
  doneTitle: { fontFamily: Fonts.heavy, fontSize: 26, color: Colors.textPrimary },
  replay: { fontFamily: Fonts.demiBold, fontSize: 15, color: Colors.accent, marginTop: 6 },
  log: { minHeight: 70, gap: 4, alignItems: 'center', marginTop: 8 },
  logRow: { fontFamily: Fonts.medium, fontSize: 14, color: Colors.textTertiary },
});
