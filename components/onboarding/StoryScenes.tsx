/**
 * The animated story pages: the hook, AI agents, Apple Pay, and "do it yourself".
 * Each scene loops one clock and derives every keyframe from it.
 */
import { Text } from '@/components/ui/LockedText';
import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { Image, ScrollView, StyleSheet, View } from 'react-native';
import { Extrapolation, interpolate, useAnimatedStyle, type SharedValue } from 'react-native-reanimated';
import { Colors, Fonts } from '@/constants/theme';
import { formatCents } from '@/lib/logic/currencyUtils';
import { AnimatedWords, CYAN, Rise, useLoop } from './motion';
import { AGENTS, AgentBadge, AnimatedView, DemoInboxCard, sceneStyles, type DemoItem } from './shared';

const clamp = Extrapolation.CLAMP;
const LOGO = require('../../assets/images/onboarding-logo.png');

/** Scrolls only if the device is too short; otherwise centred. */
export function SceneScroll({ children }: { children: React.ReactNode }) {
  return (
    <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false} bounces={false}>
      {children}
    </ScrollView>
  );
}

/** Spring-like pop: 0 → overshoot → settle, between `a` and `b` of the loop. */
function pop(t: number, a: number, b: number) {
  'worklet';
  return interpolate(t, [a, a + (b - a) * 0.6, b], [0, 1.12, 1], clamp);
}

// ---------------------------------------------------------------------------
// 1. Hook
// ---------------------------------------------------------------------------

const HOOK_ITEMS: DemoItem[] = [
  { id: 'h1', emoji: '🍔', merchant: 'Swiggy', amountCents: 48600, via: 'your AI agent' },
  { id: 'h2', emoji: '🚕', merchant: 'Uber', amountCents: 21200, via: 'your AI agent' },
  { id: 'h3', emoji: '☕', merchant: 'Blue Tokai', amountCents: 24000, via: 'Apple Pay' },
];

function HookCard({ t, index, item, currencyCode }: { t: SharedValue<number>; index: number; item: DemoItem; currencyCode: string }) {
  const start = 0.04 + index * 0.13;
  const card = useAnimatedStyle(() => {
    const p = interpolate(t.value, [start, start + 0.1, start + 0.14], [0, 1.04, 1], clamp);
    const out = interpolate(t.value, [0.9, 0.97], [0, 1], clamp);
    return {
      opacity: Math.min(1, p) * (1 - out),
      transform: [
        { translateY: (1 - p) * -70 + out * 30 },
        { rotate: `${(1 - Math.min(1, p)) * (index % 2 ? 7 : -7)}deg` },
        { scale: 0.9 + 0.1 * p },
      ],
    };
  });
  const check = useAnimatedStyle(() => ({ transform: [{ scale: pop(t.value, start + 0.2, start + 0.27) }] }));
  return (
    <AnimatedView style={[{ width: '100%', alignItems: 'center' }, card]}>
      <DemoInboxCard
        item={item}
        currencyCode={currencyCode}
        badge={
          <AnimatedView style={[styles.check, check]}>
            <Ionicons name="checkmark" size={14} color="#000" />
          </AnimatedView>
        }
      />
    </AnimatedView>
  );
}

export function HookScene({ currencyCode }: { currencyCode: string }) {
  const t = useLoop(7000, 0.8);
  return (
    <SceneScroll>
      <View style={[sceneStyles.stage, { gap: 10 }]}>
        {HOOK_ITEMS.map((item, i) => <HookCard key={item.id} t={t} index={i} item={item} currencyCode={currencyCode} />)}
      </View>
      <AnimatedWords text={'Stop logging\nexpenses.'} style={[sceneStyles.title, styles.hero]} delay={120} accentWords={['expenses']} />
      <Rise delay={520}>
        <Text style={sceneStyles.subtitle}>Let BudgetThing do it. Your expenses arrive on their own. You just approve them.</Text>
      </Rise>
    </SceneScroll>
  );
}

// ---------------------------------------------------------------------------
// 2. AI agents: badges orbit the app in 3D; a receipt flies into the centre.
// ---------------------------------------------------------------------------

const RX = 136;
const RY = 58;

function OrbitBadge({ t, index }: { t: SharedValue<number>; index: number }) {
  const style = useAnimatedStyle(() => {
    const a = (t.value + index / AGENTS.length) * Math.PI * 2;
    const depth = (Math.sin(a) + 1) / 2; // 0 = back, 1 = front
    return {
      zIndex: depth > 0.5 ? 3 : 1,
      opacity: 0.45 + depth * 0.55,
      transform: [{ translateX: Math.cos(a) * RX }, { translateY: Math.sin(a) * RY }, { scale: 0.72 + depth * 0.38 }],
    };
  });
  return (
    <AnimatedView style={[styles.orbitItem, style]}>
      <AgentBadge agent={AGENTS[index]} size={48} showName={false} />
    </AnimatedView>
  );
}

export function AgentsScene({ currencyCode }: { currencyCode: string }) {
  const orbit = useLoop(16000, 0.15);
  const beat = useLoop(3200, 0.85);
  const receipt = useAnimatedStyle(() => {
    const p = interpolate(beat.value, [0.05, 0.42], [0, 1], clamp);
    return {
      opacity: interpolate(beat.value, [0.05, 0.12, 0.36, 0.44], [0, 1, 1, 0], clamp),
      transform: [{ translateX: (1 - p) * -120 }, { translateY: (1 - p) * -96 + Math.sin(p * Math.PI) * -18 }, { scale: 1 - p * 0.55 }],
    };
  });
  const logo = useAnimatedStyle(() => ({
    transform: [{ scale: interpolate(beat.value, [0.4, 0.47, 0.6], [1, 1.14, 1], clamp) }],
  }));
  const ring = useAnimatedStyle(() => {
    const p = interpolate(beat.value, [0.42, 0.8], [0, 1], clamp);
    return { opacity: p > 0 && p < 1 ? 0.8 * (1 - p) : 0, transform: [{ scale: 1 + p * 1.4 }] };
  });
  const card = useAnimatedStyle(() => {
    const p = interpolate(beat.value, [0.5, 0.64, 0.7], [0, 1.05, 1], clamp);
    const out = interpolate(beat.value, [0.92, 0.99], [0, 1], clamp);
    return { opacity: Math.min(1, p) * (1 - out), transform: [{ translateY: (1 - Math.min(1, p)) * -30 }, { scale: 0.85 + 0.15 * p }] };
  });
  return (
    <SceneScroll>
      <View style={[sceneStyles.stage, { height: 250 }]}>
        <View style={styles.orbit}>
          {AGENTS.map((_, i) => <OrbitBadge key={i} t={orbit} index={i} />)}
          <AnimatedView style={[styles.pulseRing, ring]} />
          <AnimatedView style={[styles.logoWrap, logo]}>
            <Image source={LOGO} style={styles.logo} accessibilityIgnoresInvertColors />
          </AnimatedView>
          <AnimatedView style={[styles.receipt, receipt]}>
            <Ionicons name="mail" size={14} color="#000" />
            <Text style={styles.receiptText}>Swiggy · ₹486</Text>
          </AnimatedView>
        </View>
        <AnimatedView style={[styles.agentCard, card]}>
          <DemoInboxCard item={{ id: 'a1', emoji: '🍔', merchant: 'Swiggy', amountCents: 48600, via: 'your AI agent' }} currencyCode={currencyCode} />
        </AnimatedView>
      </View>
      <Rise><Text style={sceneStyles.kicker}>AI agents</Text></Rise>
      <AnimatedWords text={'Your agent reads\nthe receipts.'} style={sceneStyles.title} delay={80} accentWords={['receipts']} />
      <Rise delay={420}>
        <Text style={sceneStyles.subtitle}>
          Give your personal AI agent the BudgetThing skill. It spots charges in your email and bank alerts and sends them straight to your inbox.
        </Text>
      </Rise>
      <Rise delay={560}>
        <Text style={sceneStyles.fine}>Works with Dots, Grok Bot, Muse, Hermes, OpenClaw and other agents. BudgetThing never reads your email.</Text>
      </Rise>
    </SceneScroll>
  );
}

// ---------------------------------------------------------------------------
// 3. Apple Pay: the phone taps the reader, Face ID confirms, the charge flies in.
// ---------------------------------------------------------------------------

function NfcRing({ t, delay }: { t: SharedValue<number>; delay: number }) {
  const style = useAnimatedStyle(() => {
    const p = interpolate(t.value, [0.24 + delay, 0.52 + delay], [0, 1], clamp);
    return { opacity: p > 0 && p < 1 ? 1 - p : 0, transform: [{ scale: 0.5 + p * 1.4 }] };
  });
  return <AnimatedView style={[styles.nfc, style]} />;
}

export function ApplePayScene({ currencyCode }: { currencyCode: string }) {
  const t = useLoop(5200, 0.8);
  const phone = useAnimatedStyle(() => ({
    transform: [
      { translateX: interpolate(t.value, [0, 0.2, 0.24, 0.6, 0.9, 1], [-74, -6, -12, -12, -74, -74], clamp) },
      { rotate: `${interpolate(t.value, [0, 0.2, 0.6, 0.9], [-8, 0, 0, -8], clamp)}deg` },
    ],
  }));
  const card = useAnimatedStyle(() => ({ opacity: interpolate(t.value, [0.36, 0.42], [1, 0], clamp) }));
  const done = useAnimatedStyle(() => ({
    opacity: interpolate(t.value, [0.38, 0.44, 0.86, 0.92], [0, 1, 1, 0], clamp),
    transform: [{ scale: pop(t.value, 0.38, 0.48) }],
  }));
  const inbox = useAnimatedStyle(() => {
    const p = interpolate(t.value, [0.5, 0.62, 0.67], [0, 1.06, 1], clamp);
    const out = interpolate(t.value, [0.9, 0.98], [0, 1], clamp);
    return { opacity: Math.min(1, p) * (1 - out), transform: [{ translateY: (1 - Math.min(1, p)) * -60 }, { scale: 0.8 + 0.2 * p }] };
  });
  const amount = useAnimatedStyle(() => ({ opacity: interpolate(t.value, [0.62, 0.7, 0.88, 0.94], [0, 1, 1, 0], clamp) }));
  return (
    <SceneScroll>
      <View style={[sceneStyles.stage, { height: 290 }]}>
        <View style={styles.payRow}>
          <AnimatedView style={phone}>
            <View style={styles.phone}>
              <View style={styles.notch} />
              <AnimatedView style={[styles.walletCard, card]}>
                <Text style={styles.walletBank}>BANK</Text>
                <Text style={styles.walletDigits}>•••• 4321</Text>
              </AnimatedView>
              <AnimatedView style={[styles.doneWrap, done]}>
                <Ionicons name="checkmark-circle" size={40} color={Colors.success} />
                <Text style={styles.doneText}>Done</Text>
              </AnimatedView>
            </View>
          </AnimatedView>
          <View style={styles.reader}>
            <NfcRing t={t} delay={0} />
            <NfcRing t={t} delay={0.07} />
            <NfcRing t={t} delay={0.14} />
            <Ionicons name="wifi" size={26} color={Colors.textSecondary} style={{ transform: [{ rotate: '90deg' }] }} />
          </View>
        </View>
        <AnimatedView style={[styles.payCard, inbox]}>
          <DemoInboxCard item={{ id: 'p1', emoji: '☕', merchant: 'Blue Tokai', amountCents: 24000, via: 'Apple Pay' }} currencyCode={currencyCode} />
        </AnimatedView>
        <AnimatedView style={[styles.loggedChip, amount]}>
          <Text style={styles.loggedText}>Logged {formatCents(24000, currencyCode)} in 0.4s</Text>
        </AnimatedView>
      </View>
      <Rise><Text style={sceneStyles.kicker}>Apple Pay + Shortcuts</Text></Rise>
      <AnimatedWords text={"Tap to pay.\nIt's already logged."} style={sceneStyles.title} delay={80} accentWords={['logged']} />
      <Rise delay={420}>
        <Text style={sceneStyles.subtitle}>
          An Apple Shortcut runs when you pay with your iPhone and drops the charge into BudgetThing before you've put your phone away.
        </Text>
      </Rise>
      <Rise delay={540}><Text style={sceneStyles.fine}>Uses the Shortcuts Wallet automation with supported cards.</Text></Rise>
    </SceneScroll>
  );
}

// ---------------------------------------------------------------------------
// 5. Do it yourself: four tiles, each with its own little loop.
// ---------------------------------------------------------------------------

function CalcIcon() {
  const t = useLoop(2400, 1);
  const a = useAnimatedStyle(() => ({ opacity: interpolate(t.value, [0, 0.1, 0.45, 0.55], [0, 1, 1, 0], clamp) }));
  const b = useAnimatedStyle(() => ({ opacity: interpolate(t.value, [0.5, 0.6, 0.9, 1], [0, 1, 1, 0], clamp) }));
  return (
    <View style={styles.tileIcon}>
      <AnimatedView style={[StyleSheet.absoluteFill, styles.center, a]}><Text style={styles.calcText}>₹240</Text></AnimatedView>
      <AnimatedView style={[StyleSheet.absoluteFill, styles.center, b]}><Text style={styles.calcText}>☕ ✓</Text></AnimatedView>
    </View>
  );
}

function Bar({ t, i }: { t: SharedValue<number>; i: number }) {
  const s = useAnimatedStyle(() => ({ height: 8 + Math.abs(Math.sin((t.value + i * 0.21) * Math.PI)) * 22 }));
  return <AnimatedView style={[styles.bar, s, i === 1 && { backgroundColor: CYAN }]} />;
}

function BarsIcon() {
  const t = useLoop(2600, 0.4);
  return <View style={[styles.tileIcon, styles.bars]}>{[0, 1, 2].map((i) => <Bar key={i} t={t} i={i} />)}</View>;
}

function PlaneIcon() {
  const t = useLoop(2800, 0.5);
  const s = useAnimatedStyle(() => ({ transform: [{ translateX: interpolate(t.value, [0, 1], [-16, 16]) }, { translateY: Math.sin(t.value * Math.PI * 2) * 4 }] }));
  return <View style={styles.tileIcon}><AnimatedView style={s}><Text style={{ fontSize: 24 }}>✈️</Text></AnimatedView></View>;
}

function UndoIcon() {
  const t = useLoop(3000, 1);
  const s = useAnimatedStyle(() => ({ transform: [{ rotate: `${interpolate(t.value, [0.6, 0.85], [0, -360], clamp)}deg` }] }));
  return <View style={styles.tileIcon}><AnimatedView style={s}><Ionicons name="arrow-undo" size={24} color={Colors.accent} /></AnimatedView></View>;
}

const DIY = [
  { icon: <CalcIcon />, title: 'Two-tap entry', body: 'Type the amount, pick an emoji. Done.' },
  { icon: <BarsIcon />, title: 'Accounts that add up', body: 'Cash, bank and cards, with transfers.' },
  { icon: <PlaneIcon />, title: 'Trips with friends', body: 'Split any way, settle up in one tap.' },
  { icon: <UndoIcon />, title: 'Undo anything', body: 'Every change is kept. Nothing is lost.' },
];

export function DiyScene() {
  return (
    <SceneScroll>
      <Rise><Text style={sceneStyles.kicker}>And when you want to</Text></Rise>
      <AnimatedWords text={'Do it yourself,\nfast.'} style={[sceneStyles.title, { marginBottom: 22 }]} delay={60} accentWords={['fast']} />
      <View style={styles.grid}>
        {DIY.map((tile, i) => (
          <Rise key={tile.title} delay={260 + i * 90} style={styles.tileWrap}>
            <View style={styles.tile}>
              {tile.icon}
              <Text style={styles.tileTitle}>{tile.title}</Text>
              <Text style={styles.tileBody}>{tile.body}</Text>
            </View>
          </Rise>
        ))}
      </View>
    </SceneScroll>
  );
}

const styles = StyleSheet.create({
  scroll: { flexGrow: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 26, paddingVertical: 12 },
  hero: { fontSize: 54, lineHeight: 56 },
  center: { alignItems: 'center', justifyContent: 'center' },
  check: { position: 'absolute', right: -6, top: -6, width: 22, height: 22, borderRadius: 11, backgroundColor: Colors.success, alignItems: 'center', justifyContent: 'center' },
  orbit: { width: 320, height: 170, alignItems: 'center', justifyContent: 'center' },
  orbitItem: { position: 'absolute' },
  logoWrap: { zIndex: 2, width: 78, height: 78, borderRadius: 20, overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(61,224,245,0.5)' },
  logo: { width: 78, height: 78 },
  pulseRing: { position: 'absolute', zIndex: 2, width: 84, height: 84, borderRadius: 24, borderWidth: 2, borderColor: CYAN },
  receipt: {
    position: 'absolute', zIndex: 4, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, height: 28, borderRadius: 14,
    backgroundColor: '#fff',
  },
  receiptText: { fontFamily: Fonts.demiBold, fontSize: 13, color: '#000' },
  agentCard: { width: '100%', alignItems: 'center', marginTop: 4 },
  payRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', height: 160 },
  phone: {
    width: 84, height: 156, borderRadius: 22, borderWidth: 2, borderColor: 'rgba(255,255,255,0.45)', backgroundColor: '#070707',
    alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
  },
  notch: { position: 'absolute', top: 7, width: 28, height: 7, borderRadius: 4, backgroundColor: '#222' },
  walletCard: { width: 66, height: 42, borderRadius: 7, backgroundColor: '#1E4ED8', padding: 6, justifyContent: 'space-between' },
  walletBank: { fontFamily: Fonts.heavy, fontSize: 9, color: '#fff', letterSpacing: 1 },
  walletDigits: { fontFamily: Fonts.demiBold, fontSize: 9, color: 'rgba(255,255,255,0.85)' },
  doneWrap: { position: 'absolute', alignItems: 'center', gap: 2 },
  doneText: { fontFamily: Fonts.demiBold, fontSize: 13, color: '#fff' },
  reader: {
    width: 96, height: 96, borderRadius: 22, backgroundColor: '#141414', borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center', justifyContent: 'center', marginLeft: 8,
  },
  nfc: { position: 'absolute', width: 70, height: 70, borderRadius: 35, borderWidth: 2, borderColor: Colors.accent },
  payCard: { width: '100%', alignItems: 'center', marginTop: 20 },
  loggedChip: { marginTop: 10, paddingHorizontal: 12, height: 26, borderRadius: 13, backgroundColor: 'rgba(52,199,89,0.16)', justifyContent: 'center' },
  loggedText: { fontFamily: Fonts.demiBold, fontSize: 13, color: Colors.success },
  grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 12, width: '100%', maxWidth: 360 },
  tileWrap: { width: '48.3%' },
  tile: { minHeight: 150, borderRadius: 20, padding: 14, backgroundColor: 'rgba(22,22,24,0.9)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)' },
  tileIcon: { height: 40, marginBottom: 10, justifyContent: 'center' },
  calcText: { fontFamily: Fonts.heavy, fontSize: 22, color: Colors.textPrimary, alignSelf: 'flex-start' },
  bars: { flexDirection: 'row', alignItems: 'flex-end', gap: 5 },
  bar: { width: 9, borderRadius: 3, backgroundColor: Colors.accent },
  tileTitle: { fontFamily: Fonts.heavy, fontSize: 19, color: Colors.textPrimary, marginBottom: 4 },
  tileBody: { fontFamily: Fonts.medium, fontSize: 14, lineHeight: 19, color: Colors.textTertiary },
});
