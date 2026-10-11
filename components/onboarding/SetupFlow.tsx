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
import Animated, { FadeIn, FadeInDown, FadeOut, LinearTransition, ZoomIn } from 'react-native-reanimated';
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

export function SpendStep({ bindNext, onSummary }: { bindNext: BindNext; onSummary: (s: Partial<SetupSummary>) => void }) {
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
      // Existing categories the user turned off are removed (soft delete, undoable in History).
      for (const [key, c] of have) if (!picked.has(key) && !created.current.has(`deleted:${key}`)) {
        await CategoryRepository.delete(c.id);
        created.current.add(`deleted:${key}`);
      }
      onSummary({ categoriesAdded: added });
    });
    return () => bindNext(null);
  }, [bindNext, live, onSummary, options, picked]);

  const existingKeys = useMemo(() => new Set(live.map((c) => c.name.toLowerCase())), [live]);
  const removedCount = picked ? [...existingKeys].filter((k) => !picked.has(k)).length : 0;

  const toggle = (name: string) => {
    if (!picked) return; // wait until the existing categories are part of the selection
    const key = name.toLowerCase();
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
          const key = o.name.toLowerCase();
          const on = picked?.has(key) ?? false;
          const removing = !on && existingKeys.has(key);
          return (
            // Chips fade in once, quickly; toggling never changes a chip's size, so nothing reflows.
            <Animated.View key={o.name} entering={FadeIn.delay(220 + i * 14).duration(220)}>
              <PressableScale
                accessibilityRole="button"
                accessibilityLabel={`Category ${o.name}`}
                accessibilityState={{ selected: on }}
                accessibilityHint={removing ? 'Will be removed' : undefined}
                onPress={() => toggle(o.name)}
                disabled={!picked}
                style={[styles.chip, on && styles.chipOn, removing && styles.chipRemoving, !picked && { opacity: 0.5 }]}
              >
                <Text style={styles.chipEmoji}>{o.emoji}</Text>
                <Text style={[styles.chipText, on && styles.chipTextOn, removing && styles.chipTextRemoving]}>{o.name}</Text>
                <Ionicons
                  name={on ? 'checkmark-circle' : removing ? 'remove-circle' : 'add-circle-outline'}
                  size={18}
                  color={on ? '#000' : removing ? Colors.error : Colors.textMuted}
                />
              </PressableScale>
            </Animated.View>
          );
        })}
      </View>
      <Text style={styles.counter}>
        {picked?.size ?? 0} selected{removedCount ? ` · ${removedCount} will be removed` : ''}
      </Text>
    </SceneScroll>
  );
}

// ---------------------------------------------------------------------------
// Accounts
// ---------------------------------------------------------------------------

type AccountType = 'bank' | 'card' | 'cash' | 'upi' | 'savings';

const ACCOUNT_TYPES: Record<AccountType, { label: string; emoji: string; icon: keyof typeof Ionicons.glyphMap; kind: AccountKind; placeholder: string }> = {
  bank: { label: 'Bank account', emoji: '🏦', icon: 'business-outline', kind: 'savings', placeholder: 'e.g. HDFC Savings' },
  card: { label: 'Credit card', emoji: '💳', icon: 'card-outline', kind: 'card', placeholder: 'e.g. Amex Platinum' },
  cash: { label: 'Cash', emoji: '💵', icon: 'cash-outline', kind: 'cash', placeholder: 'e.g. Wallet cash' },
  upi: { label: 'UPI / wallet', emoji: '📱', icon: 'phone-portrait-outline', kind: 'cash', placeholder: 'e.g. Paytm' },
  savings: { label: 'Savings pot', emoji: '🐷', icon: 'trending-up-outline', kind: 'savings', placeholder: 'e.g. Emergency fund' },
};
const TYPE_ORDER: AccountType[] = ['bank', 'card', 'cash', 'upi', 'savings'];

/** Empty → undefined; otherwise a signed decimal (thousands separators allowed) or an error. */
function toCents(s: string, label: string): number | undefined {
  const clean = s.replace(/[\s,]/g, '');
  if (!clean) return undefined;
  if (!/^-?(\d+\.?\d*|\.\d+)$/.test(clean)) throw new Error(`${label} isn't a valid amount.`);
  return Math.round(parseFloat(clean) * 100);
}

function toDay(s: string, label: string): number | undefined {
  const clean = s.trim();
  if (!clean) return undefined;
  const n = Number(clean);
  if (!Number.isInteger(n) || n < 1 || n > 31) throw new Error(`${label}: the statement day must be 1–31.`);
  return n;
}

const centsText = (c?: number) => (c === undefined || c === null ? '' : String(c / 100));

/** One editable account row; `existingId` marks rows that already exist. */
interface Row { id: string; type: AccountType; name: string; amount: string; day: string; existingId?: string; original?: { name: string; amount: string; day: string } }

function typeOf(a: { kind: AccountKind; emoji: string }): AccountType {
  if (a.kind === 'card') return 'card';
  if (a.kind === 'savings') return a.emoji === '🐷' ? 'savings' : 'bank';
  return a.emoji === '📱' ? 'upi' : 'cash';
}

let rowSeq = 0;
const newRowId = () => `row-${Date.now().toString(36)}-${rowSeq++}`;

export function AccountsStep({ bindNext, onSummary }: { bindNext: BindNext; onSummary: (s: Partial<SetupSummary>) => void }) {
  const { settings } = useUserSettings();
  const currency = settings?.currencyCode ?? 'INR';
  const symbol = CURRENCIES.find((c) => c.code === currency)?.symbol ?? '';
  const { data: accounts, loading } = useAccounts();
  const [rows, setRows] = useState<Row[] | null>(null);
  const created = useRef(new Set<string>());

  // Start from the accounts the user already has (editable), once they've loaded.
  useEffect(() => {
    if (rows || loading) return;
    setRows(accounts.filter((a) => !a.deletedAtMs).map((a) => {
      const type = typeOf(a);
      const amount = centsText(a.kind === 'card' ? a.limitAmountCents : a.openingBalanceCents);
      const day = a.billingCycleDay ? String(a.billingCycleDay) : '';
      return { id: a.id, type, name: a.name, amount, day, existingId: a.id, original: { name: a.name, amount, day } };
    }));
  }, [accounts, loading, rows]);

  useEffect(() => {
    if (!rows) return;
    bindNext(async () => {
      // Validate the whole page first, then write: a bad entry never leaves a partial save.
      const counts: Partial<Record<AccountType, number>> = {};
      const plan = rows.map((r) => {
        const t = ACCOUNT_TYPES[r.type];
        counts[r.type] = (counts[r.type] ?? 0) + 1;
        const name = r.name.trim() || (counts[r.type]! > 1 ? `${t.label} ${counts[r.type]}` : t.label);
        const label = r.name.trim() || t.label;
        const cents = toCents(r.amount, `${label} ${r.type === 'card' ? 'credit limit' : 'balance'}`);
        if (r.type === 'card' && cents !== undefined && cents < 0) throw new Error(`${label}: a credit limit can't be negative.`);
        const day = r.type === 'card' ? toDay(r.day, label) : undefined;
        return { r, t, name, cents, day };
      });
      let added = 0;
      for (const { r, t, name, cents, day } of plan) {
        const money = r.type === 'card' ? { limitAmountCents: cents, billingCycleDay: day } : { openingBalanceCents: cents };
        if (r.existingId) {
          const o = r.original!;
          if (o.name === r.name && o.amount === r.amount && o.day === r.day) continue;
          // Explicit nulls so clearing a balance, limit or bill day really clears it (native skips undefined).
          const cleared: any = r.type === 'card'
            ? { limitAmountCents: cents ?? null, billingCycleDay: day ?? null }
            : { openingBalanceCents: cents ?? null };
          await AccountRepository.update(r.existingId, { name, ...cleared });
          r.original = { name: r.name, amount: r.amount, day: r.day };
        } else if (!created.current.has(r.id)) {
          await AccountRepository.create({ name, emoji: t.emoji, kind: t.kind, ...money });
          created.current.add(r.id);
          added++;
        }
      }
      onSummary({ accountsAdded: added });
    });
    return () => bindNext(null);
  }, [bindNext, onSummary, rows]);

  const add = (type: AccountType) => setRows((rs) => [...(rs ?? []), { id: newRowId(), type, name: '', amount: '', day: '' }]);
  const update = (id: string, patch: Partial<Row>) => setRows((rs) => (rs ?? []).map((r) => (r.id === id ? { ...r, ...patch } : r)));
  const remove = (id: string) => setRows((rs) => (rs ?? []).filter((r) => r.id !== id || r.existingId || created.current.has(r.id)));

  return (
    <SceneScroll>
      <Rise><Text style={sceneStyles.kicker}>Step 3 of 3</Text></Rise>
      <AnimatedWords text={'Where does your\nmoney live?'} style={sceneStyles.title} delay={60} accentWords={['money']} />
      <Rise delay={300}><Text style={[sceneStyles.subtitle, { marginBottom: 18 }]}>Add every account you use, as many of each as you need. Balances and limits are optional.</Text></Rise>

      <View style={styles.accounts}>
        {(rows ?? []).map((r) => {
          const t = ACCOUNT_TYPES[r.type];
          const isNew = !r.existingId;
          return (
            <Animated.View key={r.id} entering={FadeInDown.duration(220)} exiting={FadeOut.duration(150)} layout={LinearTransition.duration(200)} style={styles.acct}>
              <View style={styles.acctHead}>
                <View style={styles.acctIcon}><Ionicons name={t.icon} size={18} color={Colors.accent} /></View>
                <TextInput
                  value={r.name}
                  onChangeText={(name) => update(r.id, { name })}
                  placeholder={t.placeholder}
                  placeholderTextColor={Colors.textMuted}
                  style={styles.nameInput}
                  accessibilityLabel={`${t.label} name`}
                />
                {isNew && !created.current.has(r.id) ? (
                  <PressableScale accessibilityRole="button" accessibilityLabel={`Remove ${r.name || t.label}`} onPress={() => remove(r.id)} style={styles.removeBtn}>
                    <Ionicons name="close" size={16} color={Colors.textSecondary} />
                  </PressableScale>
                ) : <Text style={styles.typeTag}>{t.label}</Text>}
              </View>
              <View style={styles.fields}>
                <View style={[styles.amountBox, { flex: 1 }]}>
                  <Text style={styles.fieldLabel}>{r.type === 'card' ? 'Limit' : 'Balance'}</Text>
                  <Text style={styles.sym}>{symbol}</Text>
                  <TextInput value={r.amount} onChangeText={(amount) => update(r.id, { amount })} placeholder="0" placeholderTextColor={Colors.textMuted} keyboardType="decimal-pad" style={styles.amountInput} accessibilityLabel={`${r.name || t.label} ${r.type === 'card' ? 'credit limit' : 'balance'}`} />
                </View>
                {r.type === 'card' ? (
                  <View style={[styles.amountBox, { width: 118 }]}>
                    <Text style={styles.fieldLabel}>Bill day</Text>
                    <TextInput value={r.day} onChangeText={(day) => update(r.id, { day: day.replace(/[^0-9]/g, '').slice(0, 2) })} placeholder="–" placeholderTextColor={Colors.textMuted} keyboardType="number-pad" style={styles.amountInput} accessibilityLabel={`${r.name || t.label} statement day`} />
                  </View>
                ) : null}
              </View>
            </Animated.View>
          );
        })}
      </View>

      <Rise delay={420} style={{ width: '100%', maxWidth: 400 }}>
        <Text style={styles.addLabel}>Add an account</Text>
        <View style={styles.addRow}>
          {TYPE_ORDER.map((type) => (
            <PressableScale key={type} accessibilityRole="button" accessibilityLabel={`Add ${ACCOUNT_TYPES[type].label}`} onPress={() => add(type)} disabled={!rows} style={styles.addChip}>
              <Ionicons name="add" size={16} color={Colors.accent} />
              <Text style={styles.addText}>{ACCOUNT_TYPES[type].label}</Text>
            </PressableScale>
          ))}
        </View>
      </Rise>
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
  chipRemoving: { borderColor: 'rgba(255,59,48,0.6)', borderStyle: 'dashed' },
  chipTextRemoving: { color: Colors.textTertiary, textDecorationLine: 'line-through' },
  counter: { fontFamily: Fonts.demiBold, fontSize: 14, color: Colors.textTertiary, marginTop: 16 },
  accounts: { width: '100%', maxWidth: 400, gap: 10 },
  acctIcon: { width: 34, height: 34, borderRadius: 10, backgroundColor: 'rgba(255,149,0,0.12)', alignItems: 'center', justifyContent: 'center' },
  removeBtn: { width: 32, height: 32, borderRadius: 16, backgroundColor: 'rgba(255,255,255,0.08)', alignItems: 'center', justifyContent: 'center' },
  typeTag: { fontFamily: Fonts.demiBold, fontSize: 12, color: Colors.textTertiary },
  fields: { flexDirection: 'row', gap: 8, marginTop: 10 },
  addLabel: { fontFamily: Fonts.demiBold, fontSize: 13, letterSpacing: 1.2, textTransform: 'uppercase', color: Colors.textTertiary, marginTop: 18, marginBottom: 10 },
  addRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  addChip: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 12, height: 38, borderRadius: 19, borderWidth: 1, borderStyle: 'dashed', borderColor: 'rgba(255,149,0,0.55)' },
  addText: { fontFamily: Fonts.demiBold, fontSize: 15, color: Colors.textSecondary },
  acct: { borderRadius: 18, padding: 12, backgroundColor: 'rgba(28,28,30,0.92)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' },
  acctHead: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  nameInput: { flex: 1, height: 40, borderRadius: 10, paddingHorizontal: 10, backgroundColor: 'rgba(0,0,0,0.45)', color: Colors.textPrimary, fontFamily: Fonts.demiBold, fontSize: 16 },
  fieldLabel: { fontFamily: Fonts.medium, fontSize: 13, color: Colors.textTertiary, marginRight: 6 },
  amountBox: { flexDirection: 'row', alignItems: 'center', height: 40, borderRadius: 10, paddingHorizontal: 10, backgroundColor: 'rgba(0,0,0,0.45)' },
  sym: { fontFamily: Fonts.heavy, fontSize: 18, color: Colors.textTertiary, marginRight: 4 },
  amountInput: { flex: 1, minWidth: 30, color: Colors.textPrimary, fontFamily: Fonts.heavy, fontSize: 17, textAlign: 'right' },
  trophy: { width: 110, height: 110, borderRadius: 55, backgroundColor: 'rgba(255,149,0,0.12)', borderWidth: 1, borderColor: 'rgba(255,149,0,0.4)', alignItems: 'center', justifyContent: 'center', marginBottom: 18 },
  summary: { width: '100%', maxWidth: 380, gap: 10, marginTop: 24 },
  summaryRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, height: 52, borderRadius: 16, backgroundColor: 'rgba(28,28,30,0.9)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)' },
  summaryIcon: { fontSize: 20 },
  summaryText: { flex: 1, fontFamily: Fonts.demiBold, fontSize: 16, color: Colors.textPrimary },
});
