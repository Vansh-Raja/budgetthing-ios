/**
 * The animated story pages of onboarding: the hook, AI agents, Apple Pay, and
 * "do it yourself". Each scene loops a short animation driven by one clock.
 */
import { Text } from '@/components/ui/LockedText';
import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Extrapolation, interpolate, useAnimatedStyle, type SharedValue } from 'react-native-reanimated';
import { Colors, Fonts } from '@/constants/theme';
import { AGENTS, AgentBadge, AnimatedView, DemoInboxCard, sceneStyles, useLoop, useOnce, type DemoItem } from './shared';

const clamp = Extrapolation.CLAMP;

/** Fade/slide in over [start, start+0.08] and out over [end, end+0.06] of the loop. */
function useWindow(t: SharedValue<number>, start: number, end: number, fromY = 16) {
  return useAnimatedStyle(() => {
    const inP = interpolate(t.value, [start, start + 0.08], [0, 1], clamp);
    const outP = interpolate(t.value, [end, end + 0.06], [0, 1], clamp);
    return { opacity: inP * (1 - outP), transform: [{ translateY: (1 - inP) * fromY }] };
  });
}

const HOOK_ITEMS: DemoItem[] = [
  { id: 'h1', emoji: '🍔', merchant: 'Swiggy', amountCents: 48600, via: 'your agent' },
  { id: 'h2', emoji: '🚕', merchant: 'Uber', amountCents: 21200, via: 'your agent' },
  { id: 'h3', emoji: '☕', merchant: 'Blue Tokai', amountCents: 24000, via: 'Apple Pay' },
];

function HookCard({ t, index, item, currencyCode }: { t: SharedValue<number>; index: number; item: DemoItem; currencyCode: string }) {
  const style = useWindow(t, 0.06 + index * 0.14, 0.88, -24);
  return (
    <AnimatedView style={[{ width: '100%', alignItems: 'center' }, style]}>
      <DemoInboxCard item={item} currencyCode={currencyCode} />
    </AnimatedView>
  );
}

export function HookScene({ currencyCode }: { currencyCode: string }) {
  const t = useLoop(6000, 0.7);
  return (
    <View style={sceneStyles.scene}>
      <View style={[sceneStyles.stage, { gap: 10 }]}>
        {HOOK_ITEMS.map((item, i) => <HookCard key={item.id} t={t} index={i} item={item} currencyCode={currencyCode} />)}
      </View>
      <Text style={sceneStyles.title}>Stop logging{'\n'}expenses.</Text>
      <Text style={sceneStyles.subtitle}>Let BudgetThing do it. Your expenses arrive on their own. You just approve them.</Text>
    </View>
  );
}

function BobbingBadge({ t, index }: { t: SharedValue<number>; index: number }) {
  const style = useAnimatedStyle(() => {
    const phase = (t.value + index / AGENTS.length) % 1;
    const active = interpolate(t.value, [index / AGENTS.length, index / AGENTS.length + 0.1, (index + 1) / AGENTS.length], [0, 1, 0], clamp);
    return { transform: [{ translateY: Math.sin(phase * Math.PI * 2) * 4 }, { scale: 1 + active * 0.14 }] };
  });
  return (
    <AnimatedView style={style}>
      <AgentBadge agent={AGENTS[index]} size={46} />
    </AnimatedView>
  );
}

export function AgentsScene({ currencyCode }: { currencyCode: string }) {
  const t = useLoop(5000, 0.75);
  const email = useWindow(t, 0.02, 0.4, 12);
  const flow = useAnimatedStyle(() => {
    const p = interpolate(t.value, [0.32, 0.55], [0, 1], clamp);
    return { opacity: p > 0 && p < 1 ? 1 : 0, transform: [{ translateY: p * 46 }] };
  });
  const card = useWindow(t, 0.52, 0.92, 18);
  return (
    <View style={sceneStyles.scene}>
      <View style={sceneStyles.stage}>
        <View style={styles.badgeRow}>
          {AGENTS.map((_, i) => <BobbingBadge key={i} t={t} index={i} />)}
        </View>
        <View style={styles.pipeline}>
          <AnimatedView style={[styles.email, email]}>
            <Ionicons name="mail" size={18} color={Colors.textSecondary} />
            <Text style={styles.emailText} numberOfLines={1}>Your Swiggy order is delivered · ₹486</Text>
          </AnimatedView>
          <AnimatedView style={[styles.spark, flow]}>
            <Ionicons name="sparkles" size={18} color={Colors.accent} />
          </AnimatedView>
          <AnimatedView style={[styles.cardSlot, card]}>
            <DemoInboxCard item={{ id: 'a1', emoji: '🍔', merchant: 'Swiggy', amountCents: 48600, via: 'your AI agent' }} currencyCode={currencyCode} />
          </AnimatedView>
        </View>
      </View>
      <Text style={sceneStyles.kicker}>AI agents</Text>
      <Text style={sceneStyles.title}>Your agent reads{'\n'}the receipts.</Text>
      <Text style={sceneStyles.subtitle}>
        Give your personal AI agent the BudgetThing skill. It spots charges in your email and bank alerts and sends them straight to your inbox.
      </Text>
      <Text style={sceneStyles.fine}>Works with Dots, Grok Bot, Muse, Hermes, OpenClaw and other agents. BudgetThing never reads your email.</Text>
    </View>
  );
}

function Ring({ t, delay }: { t: SharedValue<number>; delay: number }) {
  const style = useAnimatedStyle(() => {
    const p = interpolate(t.value, [0.25 + delay, 0.5 + delay], [0, 1], clamp);
    return { opacity: p > 0 && p < 1 ? 1 - p : 0, transform: [{ scale: 0.6 + p * 1.2 }] };
  });
  return <AnimatedView style={[styles.ring, style]} />;
}

export function ApplePayScene({ currencyCode }: { currencyCode: string }) {
  const t = useLoop(4600, 0.8);
  const phone = useAnimatedStyle(() => ({
    transform: [{ translateX: interpolate(t.value, [0, 0.25, 0.5, 0.95, 1], [-70, -18, -18, -70, -70], clamp) }],
  }));
  const done = useAnimatedStyle(() => ({ opacity: interpolate(t.value, [0.42, 0.48, 0.9, 0.96], [0, 1, 1, 0], clamp) }));
  const card = useWindow(t, 0.5, 0.9, 24);
  return (
    <View style={sceneStyles.scene}>
      <View style={sceneStyles.stage}>
        <View style={styles.payRow}>
          <AnimatedView style={phone}>
            <View style={styles.phone}>
              <Ionicons name="logo-apple" size={22} color="#fff" />
              <Text style={styles.phoneText}>Pay</Text>
              <AnimatedView style={done}>
                <Ionicons name="checkmark-circle" size={26} color={Colors.success} />
              </AnimatedView>
            </View>
          </AnimatedView>
          <View style={styles.reader}>
            <Ring t={t} delay={0} />
            <Ring t={t} delay={0.08} />
            <Ionicons name="wifi" size={26} color={Colors.textSecondary} style={{ transform: [{ rotate: '90deg' }] }} />
          </View>
        </View>
        <AnimatedView style={[styles.payCard, card]}>
          <DemoInboxCard item={{ id: 'p1', emoji: '☕', merchant: 'Blue Tokai', amountCents: 24000, via: 'Apple Pay' }} currencyCode={currencyCode} />
        </AnimatedView>
      </View>
      <Text style={sceneStyles.kicker}>Apple Pay + Shortcuts</Text>
      <Text style={sceneStyles.title}>Tap to pay.{'\n'}It's already logged.</Text>
      <Text style={sceneStyles.subtitle}>
        An Apple Shortcut runs when you pay with your iPhone and drops the charge into BudgetThing before you've put your phone away.
      </Text>
      <Text style={sceneStyles.fine}>Uses the Shortcuts Wallet automation with supported cards.</Text>
    </View>
  );
}

const DIY = [
  { emoji: '🧮', title: 'Two-tap entry', body: 'Type the amount, pick an emoji. Done.' },
  { emoji: '🏦', title: 'Accounts that add up', body: 'Cash, bank and cards, with transfers.' },
  { emoji: '✈️', title: 'Trips with friends', body: 'Split any way, settle up in one tap.' },
  { emoji: '↩️', title: 'Undo anything', body: 'Every change is kept. Nothing is lost.' },
];

function DiyTile({ t, index }: { t: SharedValue<number>; index: number }) {
  const style = useAnimatedStyle(() => {
    const p = interpolate(t.value, [index * 0.18, index * 0.18 + 0.46], [0, 1], clamp);
    return { opacity: p, transform: [{ translateY: (1 - p) * 14 }] };
  });
  const tile = DIY[index];
  return (
    <AnimatedView style={[styles.tile, style]}>
      <Text style={styles.tileEmoji}>{tile.emoji}</Text>
      <Text style={styles.tileTitle}>{tile.title}</Text>
      <Text style={styles.tileBody}>{tile.body}</Text>
    </AnimatedView>
  );
}

export function DiyScene() {
  const t = useOnce(900);
  return (
    <View style={sceneStyles.scene}>
      <Text style={sceneStyles.kicker}>And when you want to</Text>
      <Text style={[sceneStyles.title, { marginBottom: 22 }]}>Do it yourself,{'\n'}fast.</Text>
      <View style={styles.grid}>
        {DIY.map((_, i) => <DiyTile key={i} t={t} index={i} />)}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  badgeRow: { flexDirection: 'row', justifyContent: 'center', gap: 4, marginBottom: 18 },
  pipeline: { width: '100%', alignItems: 'center', height: 150 },
  email: {
    position: 'absolute', top: 0, flexDirection: 'row', alignItems: 'center', gap: 8, maxWidth: 330,
    paddingHorizontal: 14, paddingVertical: 10, borderRadius: 12, backgroundColor: '#0E0E0E', borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)',
  },
  emailText: { fontFamily: Fonts.medium, fontSize: 14, color: Colors.textSecondary },
  spark: { position: 'absolute', top: 40 },
  cardSlot: { position: 'absolute', top: 84, width: '100%', alignItems: 'center' },
  payCard: { width: '100%', alignItems: 'center', marginTop: 22 },
  payRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 0, height: 140 },
  phone: {
    width: 74, height: 132, borderRadius: 18, borderWidth: 2, borderColor: 'rgba(255,255,255,0.4)', backgroundColor: '#0A0A0A',
    alignItems: 'center', justifyContent: 'center', gap: 2,
  },
  phoneText: { fontFamily: Fonts.demiBold, fontSize: 15, color: '#fff' },
  reader: {
    width: 92, height: 92, borderRadius: 20, backgroundColor: '#141414', borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center', justifyContent: 'center', marginLeft: 10,
  },
  ring: { position: 'absolute', width: 70, height: 70, borderRadius: 35, borderWidth: 2, borderColor: Colors.accent },
  grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 12, width: '100%', maxWidth: 360 },
  tile: { width: '48.3%', minHeight: 124, borderRadius: 18, padding: 14, backgroundColor: '#121212', borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)' },
  tileEmoji: { fontSize: 28, marginBottom: 8 },
  tileTitle: { fontFamily: Fonts.heavy, fontSize: 19, color: Colors.textPrimary, marginBottom: 4 },
  tileBody: { fontFamily: Fonts.medium, fontSize: 14, lineHeight: 19, color: Colors.textTertiary },
});
