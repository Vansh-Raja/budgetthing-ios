/**
 * Interactive "you approve everything" page: a stack of demo imports the user can
 * swipe exactly like the real inbox (right = confirm, left = edit). Buttons do the
 * same for anyone who can't or won't swipe.
 */
import { Text } from '@/components/ui/LockedText';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import React, { useCallback, useState } from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { runOnJS, useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';
import { Colors, Fonts } from '@/constants/theme';
import { AnimatedView, DemoInboxCard, sceneStyles, type DemoItem } from './shared';

const THRESHOLD = 72;
const FLY = 480;

const DEMO: DemoItem[] = [
  { id: 'd1', emoji: '🍔', merchant: 'Swiggy', amountCents: 48600, via: 'your AI agent' },
  { id: 'd2', emoji: '☕', merchant: 'Blue Tokai', amountCents: 24000, via: 'Apple Pay' },
  { id: 'd3', emoji: '🛍️', merchant: 'Amazon', amountCents: 129900, via: 'your AI agent' },
];

type Outcome = 'confirmed' | 'edited';

function TopCard({ item, currencyCode, onDone }: { item: DemoItem; currencyCode: string; onDone: (o: Outcome) => void }) {
  const x = useSharedValue(0);
  const opacity = useSharedValue(1);

  const finish = useCallback((o: Outcome) => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    onDone(o);
  }, [onDone]);

  // Buttons (JS thread); the gesture below does the same on the UI thread.
  const fly = (o: Outcome) => {
    x.value = withTiming(o === 'confirmed' ? FLY : -FLY, { duration: 240 });
    opacity.value = withTiming(0, { duration: 220 }, (fin) => { if (fin) runOnJS(finish)(o); });
  };

  const pan = Gesture.Pan()
    .activeOffsetX([-6, 6])
    .failOffsetY([-18, 18])
    .onUpdate((e) => { x.value = e.translationX; })
    .onEnd((e) => {
      const o: Outcome | null =
        e.translationX >= THRESHOLD || e.velocityX > 800 ? 'confirmed' : e.translationX <= -THRESHOLD || e.velocityX < -800 ? 'edited' : null;
      if (!o) {
        x.value = withSpring(0, { damping: 20, stiffness: 300 });
        return;
      }
      x.value = withTiming(o === 'confirmed' ? FLY : -FLY, { duration: 240 });
      opacity.value = withTiming(0, { duration: 220 }, (fin) => { if (fin) runOnJS(finish)(o); });
    });

  const cardStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateX: x.value }, { rotate: `${x.value / 30}deg` }],
  }));
  const confirmStyle = useAnimatedStyle(() => ({ opacity: Math.min(1, Math.max(0, x.value / THRESHOLD)) }));
  const editStyle = useAnimatedStyle(() => ({ opacity: Math.min(1, Math.max(0, -x.value / THRESHOLD)) }));

  return (
    <View style={styles.slot}>
      <AnimatedView style={[styles.reveal, styles.revealConfirm, confirmStyle]}>
        <Ionicons name="checkmark" size={22} color="#000" />
        <Text style={styles.revealText}>Confirm</Text>
      </AnimatedView>
      <AnimatedView style={[styles.reveal, styles.revealEdit, editStyle]}>
        <Text style={[styles.revealText, { color: '#fff' }]}>Edit</Text>
        <Ionicons name="create-outline" size={20} color="#fff" />
      </AnimatedView>
      <GestureDetector gesture={pan}>
        <AnimatedView style={[{ width: '100%', alignItems: 'center' }, cardStyle]} testID="onboarding-swipe-card">
          <DemoInboxCard item={item} currencyCode={currencyCode} style={styles.topCard} />
        </AnimatedView>
      </GestureDetector>
      <View style={styles.buttons}>
        <TouchableOpacity accessibilityRole="button" accessibilityLabel={`Edit ${item.merchant}`} onPress={() => fly('edited')} style={[styles.btn, styles.btnGhost]}>
          <Ionicons name="arrow-back" size={16} color={Colors.textSecondary} />
          <Text style={styles.btnGhostText}>Edit</Text>
        </TouchableOpacity>
        <TouchableOpacity accessibilityRole="button" accessibilityLabel={`Confirm ${item.merchant}`} onPress={() => fly('confirmed')} style={[styles.btn, styles.btnSolid]}>
          <Text style={styles.btnSolidText}>Confirm</Text>
          <Ionicons name="arrow-forward" size={16} color="#000" />
        </TouchableOpacity>
      </View>
    </View>
  );
}

export function SwipeDemoScene({ currencyCode }: { currencyCode: string }) {
  const [index, setIndex] = useState(0);
  const [log, setLog] = useState<Array<{ item: DemoItem; outcome: Outcome }>>([]);

  const onDone = useCallback((outcome: Outcome) => {
    setLog((l) => [{ item: DEMO[index], outcome }, ...l]);
    setIndex(index + 1);
  }, [index]);

  const done = index >= DEMO.length;
  return (
    <View style={sceneStyles.scene}>
      <Text style={sceneStyles.kicker}>You stay in charge</Text>
      <Text style={sceneStyles.title}>Swipe to approve.</Text>
      <Text style={sceneStyles.subtitle}>
        Nothing touches your books until you say so. Swipe right to confirm, left to fix the amount, account or category. Try it.
      </Text>
      <View style={[sceneStyles.stage, { height: 150, marginTop: 26, marginBottom: 0, justifyContent: 'flex-start' }]}>
        {done ? (
          <View style={styles.doneBox}>
            <Text style={styles.doneEmoji}>🎉</Text>
            <Text style={styles.doneTitle}>That's the whole job.</Text>
            <TouchableOpacity onPress={() => { setIndex(0); setLog([]); }} accessibilityRole="button">
              <Text style={styles.replay}>Try again</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <>
            {DEMO[index + 1] ? (
              <View style={styles.behind} pointerEvents="none">
                <DemoInboxCard item={DEMO[index + 1]} currencyCode={currencyCode} />
              </View>
            ) : null}
            <TopCard key={DEMO[index].id} item={DEMO[index]} currencyCode={currencyCode} onDone={onDone} />
          </>
        )}
      </View>
      <View style={styles.log}>
        {log.slice(0, 3).map(({ item, outcome }) => (
          <Text key={item.id} style={styles.logRow}>
            {outcome === 'confirmed' ? '✓ ' : '✎ '}
            {item.merchant}: {outcome === 'confirmed' ? 'added to your books' : 'opened in the editor'}
          </Text>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  slot: { width: '100%', alignItems: 'center', justifyContent: 'center' },
  topCard: { borderColor: 'rgba(255,149,0,0.45)' },
  behind: { position: 'absolute', top: 12, width: '100%', alignItems: 'center', opacity: 0.35, transform: [{ scale: 0.94 }] },
  reveal: { position: 'absolute', top: 0, height: 68, width: '100%', maxWidth: 330, borderRadius: 16, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 18 },
  revealConfirm: { backgroundColor: Colors.success, justifyContent: 'flex-start' },
  revealEdit: { backgroundColor: '#3A3A3C', justifyContent: 'flex-end' },
  revealText: { fontFamily: Fonts.demiBold, fontSize: 16, color: '#000' },
  buttons: { flexDirection: 'row', gap: 12, marginTop: 18 },
  btn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 18, height: 40, borderRadius: 20 },
  btnGhost: { borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)' },
  btnGhostText: { fontFamily: Fonts.demiBold, fontSize: 15, color: Colors.textSecondary },
  btnSolid: { backgroundColor: Colors.success },
  btnSolidText: { fontFamily: Fonts.demiBold, fontSize: 15, color: '#000' },
  doneBox: { alignItems: 'center', gap: 6 },
  doneEmoji: { fontSize: 44 },
  doneTitle: { fontFamily: Fonts.heavy, fontSize: 24, color: Colors.textPrimary },
  replay: { fontFamily: Fonts.demiBold, fontSize: 15, color: Colors.accent, marginTop: 6 },
  log: { minHeight: 66, gap: 4, alignItems: 'center' },
  logRow: { fontFamily: Fonts.medium, fontSize: 14, color: Colors.textTertiary },
});
