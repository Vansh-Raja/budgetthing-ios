/**
 * The optional "set me up" sub-flow and the finale:
 * - AskStep: set things up now, or later.
 * - CurrencyStep, SpendStep (categories), AccountsStep: each registers a commit that the
 *   screen runs before moving on, so nothing is written until the user continues.
 * - DoneStep: confetti and a summary of what was set up.
 */
import { Text, TextInput } from '@/components/ui/LockedText';
import { Colors, Fonts } from '@/constants/theme';
import { AccountRepository, CategoryRepository } from '@/lib/db/repositories';
import { useAccounts, useCategories } from '@/lib/hooks/useData';
import { useUserSettings } from '@/lib/hooks/useUserSettings';
import { CURRENCIES, formatCents } from '@/lib/logic/currencyUtils';
import type { AccountKind } from '@/lib/logic/types';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { FadeIn, FadeInDown, LinearTransition, ZoomIn } from 'react-native-reanimated';
import { AnimatedWords, Confetti, CYAN, PressableScale, Rise } from './motion';
import { SceneScroll } from './StoryScenes';
import { sceneStyles } from './shared';

/** A step registers what to save before the screen moves on (or null). */
export type BindNext = (commit: (() => Promise<void>) | null) => void;

export interface SetupSummary {
  currency?: string;
  categoriesAdded?: number;
  accountsAdded?: number;
}

// ---------------------------------------------------------------------------
// Ask
// ---------------------------------------------------------------------------

export function AskStep({ onChoose }: { onChoose: (setup: boolean) => void }) {
  return (
    <SceneScroll>
      <Rise><Text style={sceneStyles.kicker}>One more thing</Text></Rise>
      <AnimatedWords text={"Let's make it\nyours."} style={sceneStyles.title} delay={60} accentWords={['yours']} />
      <Rise delay={360}>
        <Text style={sceneStyles.subtitle}>Tell us what you spend on and where your money lives, and BudgetThing will be ready on day one.</Text>
      </Rise>
      <View style={styles.choices}>
        <Rise delay={480}>
          <PressableScale accessibilityRole="button" testID="onboarding-setup-yes" onPress={() => onChoose(true)} style={[styles.choice, styles.choiceMain]}>
            <Text style={styles.choiceEmoji}>✨</Text>
            <View style={{ flex: 1 }}>
              <Text style={styles.choiceTitle}>Set me up</Text>
              <Text style={styles.choiceBody}>Currency, categories and accounts · about a minute</Text>
            </View>
            <Ionicons name="arrow-forward" size={22} color="#000" />
          </PressableScale>
        </Rise>
        <Rise delay={580}>
          <PressableScale accessibilityRole="button" testID="onboarding-setup-later" onPress={() => onChoose(false)} style={styles.choice}>
            <Text style={styles.choiceEmoji}>⏭️</Text>
            <View style={{ flex: 1 }}>
              <Text style={[styles.choiceTitle, { color: Colors.textPrimary }]}>I'll do it later</Text>
              <Text style={[styles.choiceBody, { color: Colors.textTertiary }]}>Start with Cash and the basic categories</Text>
            </View>
          </PressableScale>
        </Rise>
      </View>
    </SceneScroll>
  );
}

// ---------------------------------------------------------------------------
// Currency
// ---------------------------------------------------------------------------

const POPULAR = [
  { code: 'INR', flag: '🇮🇳' }, { code: 'USD', flag: '🇺🇸' }, { code: 'EUR', flag: '🇪🇺' },
  { code: 'GBP', flag: '🇬🇧' }, { code: 'AED', flag: '🇦🇪' }, { code: 'SGD', flag: '🇸🇬' },
  { code: 'AUD', flag: '🇦🇺' }, { code: 'CAD', flag: '🇨🇦' }, { code: 'JPY', flag: '🇯🇵' },
];

export function CurrencyStep({ bindNext }: { bindNext: BindNext }) {
  const router = useRouter();
  const { settings, updateSettings } = useUserSettings();
  const current = settings?.currencyCode ?? 'INR';
  const [selected, setSelected] = useState(current);
  // "Another currency…" saves through the full picker; follow it when it changes.
  useEffect(() => setSelected(current), [current]);

  // Saved only on Continue, so Back or Close leaves the setting untouched.
  useEffect(() => {
    bindNext(async () => {
      if (selected !== current) await updateSettings({ currencyCode: selected });
    });
    return () => bindNext(null);
  }, [bindNext, current, selected, updateSettings]);

  const choose = (code: string) => setSelected(code);
  const listed = POPULAR.some((p) => p.code === selected);
  return (
    <SceneScroll>
      <Rise><Text style={sceneStyles.kicker}>Step 1 of 3</Text></Rise>
      <AnimatedWords text="Your currency." style={sceneStyles.title} delay={60} />
      <Animated.View key={selected} entering={ZoomIn.springify().damping(12)} style={styles.preview}>
        <Text style={styles.previewText}>{formatCents(123450, selected)}</Text>
      </Animated.View>
      <View style={styles.currencyGrid}>
        {POPULAR.map((p, i) => {
          const c = CURRENCIES.find((x) => x.code === p.code);
          const active = selected === p.code;
          return (
            <Animated.View key={p.code} entering={FadeInDown.delay(200 + i * 40).springify()} style={styles.currencyCell}>
              <PressableScale
                accessibilityRole="button"
                accessibilityLabel={`Currency ${p.code}`}
                accessibilityState={{ selected: active }}
                onPress={() => choose(p.code)}
                style={[styles.currency, active && styles.currencyActive]}
              >
                <Text style={styles.flag}>{p.flag}</Text>
                <Text style={[styles.currencyCode, active && { color: '#000' }]}>{p.code}</Text>
                <Text style={[styles.currencySym, active && { color: 'rgba(0,0,0,0.6)' }]}>{c?.symbol}</Text>
              </PressableScale>
            </Animated.View>
          );
        })}
      </View>
      <Rise delay={600}>
        <PressableScale accessibilityRole="button" onPress={() => router.push('/settings/currency')} style={styles.moreBtn}>
          <Text style={styles.moreText}>{listed ? 'Another currency…' : `${selected} · change…`}</Text>
        </PressableScale>
      </Rise>
    </SceneScroll>
  );
}

// ---------------------------------------------------------------------------
// Spending categories
// ---------------------------------------------------------------------------

const SUGGESTED = [
  { emoji: '🍔', name: 'Food' }, { emoji: '🛒', name: 'Groceries' }, { emoji: '🚕', name: 'Transport' },
  { emoji: '🏠', name: 'Rent' }, { emoji: '🎉', name: 'Fun' }, { emoji: '☕', name: 'Coffee' },
  { emoji: '🛍️', name: 'Shopping' }, { emoji: '💡', name: 'Bills' }, { emoji: '📺', name: 'Subscriptions' },
  { emoji: '⛽', name: 'Fuel' }, { emoji: '💊', name: 'Health' }, { emoji: '🏋️', name: 'Fitness' },
  { emoji: '✈️', name: 'Travel' }, { emoji: '📚', name: 'Education' }, { emoji: '🎁', name: 'Gifts' },
  { emoji: '💇', name: 'Personal care' }, { emoji: '🐶', name: 'Pets' }, { emoji: '👨‍👩‍👧', name: 'Family' },
];

export function SpendStep({ bindNext, firstRun, onSummary }: { bindNext: BindNext; firstRun: boolean; onSummary: (s: Partial<SetupSummary>) => void }) {
  const { data: categories, loading } = useCategories();
  const live = useMemo(() => categories.filter((c) => !c.deletedAtMs && !c.isSystem), [categories]);
  const [picked, setPicked] = useState<Set<string> | null>(null);
  // Names created by earlier attempts, so a retry after a partial failure never duplicates.
  const created = useRef(new Set<string>());

  // Initial selection: what the user already has.
  useEffect(() => {
    if (picked || loading) return;
    setPicked(new Set(live.map((c) => c.name.toLowerCase())));
  }, [live, loading, picked]);

  const options = useMemo(() => {
    const extra = live.filter((c) => !SUGGESTED.some((s) => s.name.toLowerCase() === c.name.toLowerCase())).map((c) => ({ emoji: c.emoji, name: c.name }));
    return [...SUGGESTED, ...extra];
  }, [live]);

  useEffect(() => {
    if (!picked) return;
    bindNext(async () => {
      const have = new Map(live.map((c) => [c.name.toLowerCase(), c]));
      let added = 0;
      for (const o of options) {
        const key = o.name.toLowerCase();
        if (picked.has(key) && !have.has(key) && !created.current.has(key)) {
          await CategoryRepository.create({ name: o.name, emoji: o.emoji, isSystem: false });
          created.current.add(key);
          added++;
        }
      }
      // Only on first run: drop default categories the user turned off (soft delete, undoable).
      if (firstRun) {
        for (const [key, c] of have) if (!picked.has(key) && !created.current.has(`deleted:${key}`)) {
          await CategoryRepository.delete(c.id);
          created.current.add(`deleted:${key}`);
        }
      }
      onSummary({ categoriesAdded: added });
    });
    return () => bindNext(null);
  }, [bindNext, firstRun, live, onSummary, options, picked]);

  const toggle = (name: string) => {
    if (!picked) return; // wait until the existing categories are part of the selection
    const key = name.toLowerCase();
    const isExisting = live.some((c) => c.name.toLowerCase() === key);
    if (isExisting && !firstRun) return; // replay: never remove existing categories here
    setPicked((p) => {
      const next = new Set(p ?? []);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  return (
    <SceneScroll>
      <Rise><Text style={sceneStyles.kicker}>Step 2 of 3</Text></Rise>
      <AnimatedWords text={'What do you usually\nspend on?'} style={sceneStyles.title} delay={60} accentWords={['spend']} />
      <Rise delay={320}><Text style={[sceneStyles.subtitle, { marginBottom: 18 }]}>Pick everything that fits. These become your categories.</Text></Rise>
      <View style={styles.chips}>
        {options.map((o, i) => {
          const on = picked?.has(o.name.toLowerCase()) ?? false;
          return (
            <Animated.View key={o.name} entering={ZoomIn.delay(260 + i * 28).springify().damping(13)}>
              <PressableScale
                accessibilityRole="button"
                accessibilityLabel={`Category ${o.name}`}
                accessibilityState={{ selected: on }}
                onPress={() => toggle(o.name)}
                disabled={!picked}
                style={[styles.chip, on && styles.chipOn, !picked && { opacity: 0.5 }]}
              >
                <Text style={styles.chipEmoji}>{o.emoji}</Text>
                <Text style={[styles.chipText, on && styles.chipTextOn]}>{o.name}</Text>
                {on ? <Animated.View entering={ZoomIn.springify().damping(10)}><Ionicons name="checkmark-circle" size={18} color="#000" /></Animated.View> : null}
              </PressableScale>
            </Animated.View>
          );
        })}
      </View>
      <Animated.Text key={picked?.size ?? 0} entering={FadeIn} style={styles.counter}>
        {picked?.size ?? 0} selected
      </Animated.Text>
    </SceneScroll>
  );
}

// ---------------------------------------------------------------------------
// Accounts
// ---------------------------------------------------------------------------

const ACCOUNT_OPTIONS: Array<{ key: string; emoji: string; label: string; kind: AccountKind; placeholder: string; amountLabel: string }> = [
  { key: 'bank', emoji: '🏦', label: 'Bank account', kind: 'savings', placeholder: 'e.g. HDFC Savings', amountLabel: 'Current balance' },
  { key: 'card', emoji: '💳', label: 'Credit card', kind: 'card', placeholder: 'e.g. Amex Platinum', amountLabel: 'Credit limit' },
  { key: 'upi', emoji: '📱', label: 'UPI / wallet', kind: 'cash', placeholder: 'e.g. Paytm', amountLabel: 'Current balance' },
  { key: 'savings', emoji: '🐷', label: 'Savings pot', kind: 'savings', placeholder: 'e.g. Emergency fund', amountLabel: 'Current balance' },
];

/** Empty → undefined; otherwise a signed decimal (thousands separators allowed) or an error. */
function toCents(s: string, label: string): number | undefined {
  const clean = s.replace(/[\s,]/g, '');
  if (!clean) return undefined;
  if (!/^-?(\d+\.?\d*|\.\d+)$/.test(clean)) throw new Error(`${label} isn't a valid amount.`);
  return Math.round(parseFloat(clean) * 100);
}

type Draft = { on: boolean; name: string; amount: string };

export function AccountsStep({ bindNext, onSummary }: { bindNext: BindNext; onSummary: (s: Partial<SetupSummary>) => void }) {
  const { settings } = useUserSettings();
  const currency = settings?.currencyCode ?? 'INR';
  const symbol = CURRENCIES.find((c) => c.code === currency)?.symbol ?? '';
  const { data: accounts } = useAccounts();
  const live = useMemo(() => accounts.filter((a) => !a.deletedAtMs), [accounts]);
  const cash = live.find((a) => a.kind === 'cash' && a.name.toLowerCase() === 'cash');
  const [cashAmount, setCashAmount] = useState('');
  const created = useRef(new Set<string>());
  const [drafts, setDrafts] = useState<Record<string, Draft>>(() =>
    Object.fromEntries(ACCOUNT_OPTIONS.map((o) => [o.key, { on: false, name: '', amount: '' }]))
  );

  useEffect(() => {
    bindNext(async () => {
      // Validate every amount on the page before writing anything.
      const cashCents = toCents(cashAmount, 'Cash in hand');
      const plan = ACCOUNT_OPTIONS.filter((o) => drafts[o.key].on && !created.current.has(o.key)).map((o) => {
        const cents = toCents(drafts[o.key].amount, `${o.label} ${o.amountLabel.toLowerCase()}`);
        if (o.kind === 'card' && cents !== undefined && cents < 0) throw new Error('A credit limit can\'t be negative.');
        return { o, cents };
      });
      let added = 0;
      for (const { o, cents } of plan) {
        await AccountRepository.create({
          name: drafts[o.key].name.trim() || o.label,
          emoji: o.emoji,
          kind: o.kind,
          ...(o.kind === 'card' ? { limitAmountCents: cents } : { openingBalanceCents: cents }),
        });
        created.current.add(o.key);
        added++;
      }
      if (cash && cashCents !== undefined) await AccountRepository.update(cash.id, { openingBalanceCents: cashCents });
      onSummary({ accountsAdded: added });
    });
    return () => bindNext(null);
  }, [bindNext, cash, cashAmount, drafts, onSummary]);

  const set = (key: string, patch: Partial<Draft>) => setDrafts((d) => ({ ...d, [key]: { ...d[key], ...patch } }));

  return (
    <SceneScroll>
      <Rise><Text style={sceneStyles.kicker}>Step 3 of 3</Text></Rise>
      <AnimatedWords text={'Where does your\nmoney live?'} style={sceneStyles.title} delay={60} accentWords={['money']} />
      <Rise delay={320}><Text style={[sceneStyles.subtitle, { marginBottom: 18 }]}>Add the accounts you use. Balances are optional; you can change everything later.</Text></Rise>

      <View style={styles.accounts}>
        {cash ? (
          <Rise delay={380}>
            <View style={[styles.acct, styles.acctOn]}>
              <View style={styles.acctHead}>
                <Text style={styles.acctEmoji}>💵</Text>
                <Text style={styles.acctLabel}>Cash</Text>
                <Text style={styles.already}>Ready</Text>
              </View>
              <View style={styles.fieldRow}>
                <Text style={styles.fieldLabel}>Cash in hand</Text>
                <View style={styles.amountBox}>
                  <Text style={styles.sym}>{symbol}</Text>
                  <TextInput value={cashAmount} onChangeText={setCashAmount} placeholder="0" placeholderTextColor={Colors.textMuted} keyboardType="decimal-pad" style={styles.amountInput} accessibilityLabel="Cash in hand" />
                </View>
              </View>
            </View>
          </Rise>
        ) : null}
        {ACCOUNT_OPTIONS.map((o, i) => {
          const d = drafts[o.key];
          return (
            <Animated.View key={o.key} entering={FadeInDown.delay(440 + i * 70).springify()} layout={LinearTransition.springify().damping(18)}>
              <View style={[styles.acct, d.on && styles.acctOn]}>
                <PressableScale accessibilityRole="button" accessibilityLabel={`Add ${o.label}`} accessibilityState={{ selected: d.on }} onPress={() => set(o.key, { on: !d.on })} style={styles.acctHead}>
                  <Text style={styles.acctEmoji}>{o.emoji}</Text>
                  <Text style={styles.acctLabel}>{o.label}</Text>
                  <View style={[styles.toggle, d.on && styles.toggleOn]}>
                    <Ionicons name={d.on ? 'checkmark' : 'add'} size={18} color={d.on ? '#000' : Colors.textSecondary} />
                  </View>
                </PressableScale>
                {d.on ? (
                  <Animated.View entering={FadeInDown.springify().damping(16)} style={{ gap: 10, marginTop: 12 }}>
                    <TextInput value={d.name} onChangeText={(name) => set(o.key, { name })} placeholder={o.placeholder} placeholderTextColor={Colors.textMuted} style={styles.nameInput} accessibilityLabel={`${o.label} name`} />
                    <View style={styles.fieldRow}>
                      <Text style={styles.fieldLabel}>{o.amountLabel}</Text>
                      <View style={styles.amountBox}>
                        <Text style={styles.sym}>{symbol}</Text>
                        <TextInput value={d.amount} onChangeText={(amount) => set(o.key, { amount })} placeholder="0" placeholderTextColor={Colors.textMuted} keyboardType="decimal-pad" style={styles.amountInput} accessibilityLabel={`${o.label} ${o.amountLabel}`} />
                      </View>
                    </View>
                  </Animated.View>
                ) : null}
              </View>
            </Animated.View>
          );
        })}
      </View>
    </SceneScroll>
  );
}

// ---------------------------------------------------------------------------
// Done
// ---------------------------------------------------------------------------

export function DoneStep({ summary, agentConnected, firstImport }: { summary: SetupSummary; agentConnected: boolean; firstImport: boolean }) {
  const { settings } = useUserSettings();
  const { data: accounts } = useAccounts();
  const { data: categories } = useCategories();
  const [burst, setBurst] = useState(0);
  useEffect(() => { const id = setTimeout(() => setBurst(1), 250); return () => clearTimeout(id); }, []);
  const rows = [
    { icon: '💱', text: `Currency: ${settings?.currencyCode ?? 'INR'}` },
    { icon: '🗂️', text: `${categories.filter((c) => !c.deletedAtMs && !c.isSystem).length} categories ready` },
    { icon: '🏦', text: `${accounts.filter((a) => !a.deletedAtMs).length} account${accounts.filter((a) => !a.deletedAtMs).length === 1 ? '' : 's'} ready` },
    agentConnected ? { icon: '🤖', text: firstImport ? 'Agent connected, first import waiting' : 'Agent key created' } : { icon: '🤖', text: 'Connect an agent any time in Settings' },
  ];
  return (
    <SceneScroll>
      <Animated.View entering={ZoomIn.springify().damping(10)} style={styles.trophy}>
        <Text style={{ fontSize: 56 }}>🎉</Text>
      </Animated.View>
      <AnimatedWords text={"You're all set."} style={[sceneStyles.title, { fontSize: 48, lineHeight: 52 }]} delay={180} accentWords={['set']} />
      <Rise delay={420}><Text style={sceneStyles.subtitle}>Your expenses can start arriving on their own. Welcome to BudgetThing.</Text></Rise>
      <View style={styles.summary}>
        {rows.map((r, i) => (
          <Rise key={r.text} delay={600 + i * 110}>
            <View style={styles.summaryRow}>
              <Text style={styles.summaryIcon}>{r.icon}</Text>
              <Text style={styles.summaryText}>{r.text}</Text>
              <Ionicons name="checkmark-circle" size={20} color={Colors.success} />
            </View>
          </Rise>
        ))}
      </View>
      <Confetti burst={burst} count={56} />
    </SceneScroll>
  );
}

const styles = StyleSheet.create({
  choices: { width: '100%', maxWidth: 380, gap: 12, marginTop: 28 },
  choice: {
    flexDirection: 'row', alignItems: 'center', gap: 14, padding: 18, borderRadius: 22,
    backgroundColor: 'rgba(28,28,30,0.9)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)',
  },
  choiceMain: { backgroundColor: Colors.accent, borderColor: Colors.accent },
  choiceEmoji: { fontSize: 28 },
  choiceTitle: { fontFamily: Fonts.heavy, fontSize: 22, color: '#000' },
  choiceBody: { fontFamily: Fonts.medium, fontSize: 14, color: 'rgba(0,0,0,0.65)', marginTop: 2 },
  preview: { marginTop: 16, marginBottom: 20, paddingHorizontal: 18, paddingVertical: 8, borderRadius: 16, backgroundColor: 'rgba(61,224,245,0.1)', borderWidth: 1, borderColor: 'rgba(61,224,245,0.35)' },
  previewText: { fontFamily: Fonts.heavy, fontSize: 34, color: CYAN },
  currencyGrid: { width: '100%', maxWidth: 360, flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 10 },
  currencyCell: { width: '31.5%' },
  currency: { alignItems: 'center', paddingVertical: 12, borderRadius: 18, backgroundColor: 'rgba(28,28,30,0.9)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' },
  currencyActive: { backgroundColor: Colors.accent, borderColor: Colors.accent },
  flag: { fontSize: 26 },
  currencyCode: { fontFamily: Fonts.heavy, fontSize: 17, color: Colors.textPrimary, marginTop: 4 },
  currencySym: { fontFamily: Fonts.medium, fontSize: 13, color: Colors.textTertiary },
  moreBtn: { marginTop: 16, paddingHorizontal: 16, height: 38, borderRadius: 19, borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)', justifyContent: 'center' },
  moreText: { fontFamily: Fonts.demiBold, fontSize: 15, color: Colors.textSecondary },
  chips: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 8, maxWidth: 400 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, height: 42, borderRadius: 21, backgroundColor: 'rgba(28,28,30,0.9)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)' },
  chipOn: { backgroundColor: Colors.accent, borderColor: Colors.accent },
  chipEmoji: { fontSize: 18 },
  chipText: { fontFamily: Fonts.demiBold, fontSize: 16, color: Colors.textSecondary },
  chipTextOn: { color: '#000' },
  counter: { fontFamily: Fonts.demiBold, fontSize: 14, color: Colors.textTertiary, marginTop: 16 },
  accounts: { width: '100%', maxWidth: 400, gap: 10 },
  acct: { borderRadius: 20, padding: 14, backgroundColor: 'rgba(28,28,30,0.9)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' },
  acctOn: { borderColor: 'rgba(255,149,0,0.6)' },
  acctHead: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  acctEmoji: { fontSize: 26 },
  acctLabel: { flex: 1, fontFamily: Fonts.heavy, fontSize: 19, color: Colors.textPrimary },
  already: { fontFamily: Fonts.demiBold, fontSize: 13, color: Colors.success },
  toggle: { width: 32, height: 32, borderRadius: 16, borderWidth: 1, borderColor: 'rgba(255,255,255,0.25)', alignItems: 'center', justifyContent: 'center' },
  toggleOn: { backgroundColor: Colors.accent, borderColor: Colors.accent },
  nameInput: { height: 44, borderRadius: 12, paddingHorizontal: 12, backgroundColor: 'rgba(0,0,0,0.5)', color: Colors.textPrimary, fontFamily: Fonts.demiBold, fontSize: 16 },
  fieldRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  fieldLabel: { flexShrink: 0, fontFamily: Fonts.medium, fontSize: 15, color: Colors.textSecondary },
  amountBox: { flex: 1, maxWidth: 200, flexDirection: 'row', alignItems: 'center', height: 44, borderRadius: 12, paddingHorizontal: 12, backgroundColor: 'rgba(0,0,0,0.5)' },
  sym: { fontFamily: Fonts.heavy, fontSize: 18, color: Colors.textTertiary, marginRight: 4 },
  amountInput: { flex: 1, color: Colors.textPrimary, fontFamily: Fonts.heavy, fontSize: 18, textAlign: 'right', minWidth: 80 },
  trophy: { width: 110, height: 110, borderRadius: 55, backgroundColor: 'rgba(255,149,0,0.12)', borderWidth: 1, borderColor: 'rgba(255,149,0,0.4)', alignItems: 'center', justifyContent: 'center', marginBottom: 18 },
  summary: { width: '100%', maxWidth: 380, gap: 10, marginTop: 24 },
  summaryRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, height: 52, borderRadius: 16, backgroundColor: 'rgba(28,28,30,0.9)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)' },
  summaryIcon: { fontSize: 20 },
  summaryText: { flex: 1, fontFamily: Fonts.demiBold, fontSize: 16, color: Colors.textPrimary },
});
