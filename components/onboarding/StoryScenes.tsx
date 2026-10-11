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
import { AnimatedWords, CYAN, Rise, useLoop, useOnce } from './motion';
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
            <Text style={styles.receiptText}>Swiggy · {formatCents(48600, currencyCode)}</Text>
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
// 5. Do it yourself: each tile plays one short demo of its own feature, once.
// ---------------------------------------------------------------------------

/** Visible only while the clock is inside [a, b) (with short cross-fades). */
function useFrame(t: SharedValue<number>, a: number, b: number) {
  return useAnimatedStyle(() => ({
    opacity: interpolate(t.value, [a - 0.04, a, b - 0.001, b + 0.04], [0, 1, 1, b >= 1 ? 1 : 0], clamp),
  }));
}

function Frame({ t, a, b, children, style }: { t: SharedValue<number>; a: number; b: number; children: React.ReactNode; style?: any }) {
  const s = useFrame(t, a, b);
  return <AnimatedView style={[StyleSheet.absoluteFill, styles.demoCenter, style, s]}>{children}</AnimatedView>;
}

/** Two-tap entry: an amount is typed digit by digit, then a category is picked and it's saved. */
function TypeDemo({ t, currencyCode }: { t: SharedValue<number>; currencyCode: string }) {
  const steps = [2, 24, 240];
  const saved = useAnimatedStyle(() => ({ transform: [{ scale: interpolate(t.value, [0.72, 0.8, 0.86], [0, 1.15, 1], clamp) }] }));
  return (
    <View style={styles.demo}>
      {steps.map((v, i) => (
        <Frame key={v} t={t} a={0.1 + i * 0.18} b={i < steps.length - 1 ? 0.28 + i * 0.18 : 1}>
          <Text style={styles.demoAmount}>{formatCents(v * 100, currencyCode).replace(/\.00$/, '')}</Text>
        </Frame>
      ))}
      <AnimatedView style={[styles.demoTag, saved]}>
        <Ionicons name="cafe" size={12} color="#000" />
        <Ionicons name="checkmark" size={12} color="#000" />
      </AnimatedView>
    </View>
  );
}

/** Accounts: money moves from Bank to Cash and both balances update. */
function TransferDemo({ t, currencyCode }: { t: SharedValue<number>; currencyCode: string }) {
  const f = (c: number) => formatCents(c, currencyCode).replace(/\.00$/, '');
  const chip = useAnimatedStyle(() => {
    const p = interpolate(t.value, [0.25, 0.6], [0, 1], clamp);
    return { opacity: interpolate(t.value, [0.2, 0.25, 0.6, 0.66], [0, 1, 1, 0], clamp), transform: [{ translateY: p * 26 }] };
  });
  return (
    <View style={styles.demo}>
      <View style={styles.acctRow}>
        <Ionicons name="business-outline" size={13} color={Colors.textTertiary} />
        <View style={styles.acctVal}>
          <Frame t={t} a={0} b={0.62} style={styles.right}><Text style={styles.demoSmall}>{f(500000)}</Text></Frame>
          <Frame t={t} a={0.62} b={1} style={styles.right}><Text style={styles.demoSmall}>{f(400000)}</Text></Frame>
        </View>
      </View>
      <View style={[styles.acctRow, { marginTop: 14 }]}>
        <Ionicons name="cash-outline" size={13} color={Colors.textTertiary} />
        <View style={styles.acctVal}>
          <Frame t={t} a={0} b={0.62} style={styles.right}><Text style={styles.demoSmall}>{f(50000)}</Text></Frame>
          <Frame t={t} a={0.62} b={1} style={styles.right}><Text style={[styles.demoSmall, { color: Colors.success }]}>{f(150000)}</Text></Frame>
        </View>
      </View>
      <AnimatedView style={[styles.moveChip, chip]}><Text style={styles.moveText}>{f(100000)}</Text></AnimatedView>
    </View>
  );
}

/** Trips: one bill splits into three equal shares. */
function SplitShare({ t, i, label }: { t: SharedValue<number>; i: number; label: string }) {
  const s = useAnimatedStyle(() => {
    const p = interpolate(t.value, [0.35, 0.7], [0, 1], clamp);
    return { opacity: p, transform: [{ translateX: (i - 1) * 38 * p }, { translateY: 18 * p }] };
  });
  return (
    <AnimatedView style={[styles.share, s]}>
      <View style={[styles.avatar, { backgroundColor: [Colors.accent, CYAN, '#BF5AF2'][i] }]} />
      <Text style={styles.shareText}>{label}</Text>
    </AnimatedView>
  );
}

function SplitDemo({ t, currencyCode }: { t: SharedValue<number>; currencyCode: string }) {
  const f = (c: number) => formatCents(c, currencyCode).replace(/\.00$/, '');
  const bill = useAnimatedStyle(() => ({ opacity: interpolate(t.value, [0.05, 0.15, 0.35, 0.5], [0, 1, 1, 0.35], clamp), transform: [{ translateY: interpolate(t.value, [0.35, 0.6], [0, -8], clamp) }] }));
  return (
    <View style={styles.demo}>
      <AnimatedView style={[styles.bill, bill]}><Text style={styles.demoSmall}>{f(90000)}</Text></AnimatedView>
      {[0, 1, 2].map((i) => <SplitShare key={i} t={t} i={i} label={f(30000)} />)}
    </View>
  );
}

/** Undo: an amount is changed by mistake, then restored. */
function UndoDemo({ t, currencyCode }: { t: SharedValue<number>; currencyCode: string }) {
  const f = (c: number) => formatCents(c, currencyCode).replace(/\.00$/, '');
  const tap = useAnimatedStyle(() => ({ opacity: interpolate(t.value, [0.45, 0.5, 0.62, 0.68], [0, 1, 1, 0], clamp), transform: [{ scale: interpolate(t.value, [0.5, 0.56, 0.62], [1, 0.8, 1], clamp) }] }));
  return (
    <View style={styles.demo}>
      <Frame t={t} a={0} b={0.25}><Text style={styles.demoAmount}>{f(24000)}</Text></Frame>
      <Frame t={t} a={0.25} b={0.62}><Text style={[styles.demoAmount, { color: Colors.error }]}>{f(42000)}</Text></Frame>
      <Frame t={t} a={0.62} b={1}><View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}><Text style={styles.demoAmount}>{f(24000)}</Text><Ionicons name="checkmark-circle" size={16} color={Colors.success} /></View></Frame>
      <AnimatedView style={[styles.undoBtn, tap]}><Ionicons name="arrow-undo" size={14} color="#000" /></AnimatedView>
    </View>
  );
}

const DIY: Array<{ icon: keyof typeof Ionicons.glyphMap; title: string; body: string; Demo: React.ComponentType<{ t: SharedValue<number>; currencyCode: string }> }> = [
  { icon: 'calculator-outline', title: 'Two-tap entry', body: 'Type the amount, pick a category.', Demo: TypeDemo },
  { icon: 'wallet-outline', title: 'Accounts', body: 'Balances stay right, transfers too.', Demo: TransferDemo },
  { icon: 'airplane-outline', title: 'Trips', body: 'Split with friends, settle in a tap.', Demo: SplitDemo },
  { icon: 'arrow-undo-outline', title: 'Undo anything', body: 'Every change is kept.', Demo: UndoDemo },
];

const DEMO_MS = 1400;

function DiyTile({ index, currencyCode }: { index: number; currencyCode: string }) {
  // Strictly one after another: each demo starts when the previous one has finished, then rests.
  const t = useOnce(DEMO_MS, 650 + index * DEMO_MS);
  const { icon, title, body, Demo } = DIY[index];
  return (
    <Rise delay={200 + index * 90} style={styles.tileWrap}>
      <View style={styles.tile}>
        <Demo t={t} currencyCode={currencyCode} />
        <View style={styles.tileHead}>
          <Ionicons name={icon} size={16} color={Colors.accent} />
          <Text style={styles.tileTitle} numberOfLines={1}>{title}</Text>
        </View>
        <Text style={styles.tileBody} numberOfLines={2}>{body}</Text>
      </View>
    </Rise>
  );
}

export function DiyScene({ currencyCode }: { currencyCode: string }) {
  return (
    <SceneScroll>
      <Rise><Text style={sceneStyles.kicker}>And when you want to</Text></Rise>
      <AnimatedWords text={'Do it yourself,\nfast.'} style={sceneStyles.title} delay={60} accentWords={['fast']} />
      <View style={{ height: 22 }} />
      <View style={styles.grid}>
        {DIY.map((d, i) => <DiyTile key={d.title} index={i} currencyCode={currencyCode} />)}
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
  tile: { height: 172, borderRadius: 20, padding: 12, backgroundColor: 'rgba(22,22,24,0.92)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)' },
  demo: { height: 82, borderRadius: 14, backgroundColor: 'rgba(0,0,0,0.45)', marginBottom: 10, overflow: 'hidden', justifyContent: 'center' },
  demoCenter: { alignItems: 'center', justifyContent: 'center' },
  right: { alignItems: 'flex-end' },
  demoAmount: { fontFamily: Fonts.heavy, fontSize: 24, color: Colors.textPrimary },
  demoSmall: { fontFamily: Fonts.heavy, fontSize: 14, color: Colors.textPrimary },
  demoTag: { position: 'absolute', right: 8, bottom: 8, flexDirection: 'row', gap: 2, paddingHorizontal: 6, height: 20, borderRadius: 10, backgroundColor: Colors.success, alignItems: 'center' },
  acctRow: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10 },
  acctVal: { flex: 1, height: 18 },
  moveChip: { position: 'absolute', left: '50%', top: 18, marginLeft: -26, width: 52, height: 18, borderRadius: 9, backgroundColor: Colors.accent, alignItems: 'center', justifyContent: 'center' },
  moveText: { fontFamily: Fonts.heavy, fontSize: 11, color: '#000' },
  bill: { alignSelf: 'center', paddingHorizontal: 10, height: 24, borderRadius: 8, backgroundColor: 'rgba(255,255,255,0.1)', justifyContent: 'center', marginTop: -26 },
  share: { position: 'absolute', left: '50%', top: 30, marginLeft: -18, width: 36, alignItems: 'center', gap: 2 },
  avatar: { width: 14, height: 14, borderRadius: 7 },
  shareText: { fontFamily: Fonts.heavy, fontSize: 10, color: Colors.textSecondary },
  undoBtn: { position: 'absolute', right: 8, bottom: 8, width: 24, height: 24, borderRadius: 12, backgroundColor: Colors.accent, alignItems: 'center', justifyContent: 'center' },
  tileHead: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 2 },
  tileTitle: { flex: 1, fontFamily: Fonts.heavy, fontSize: 18, color: Colors.textPrimary },
  tileBody: { fontFamily: Fonts.medium, fontSize: 13, lineHeight: 17, color: Colors.textTertiary },
});
