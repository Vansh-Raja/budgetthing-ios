/**
 * Desktop: the quiet pane beside the calculator. One headline (spent this month) and the
 * entries you've logged, newest first, so typing an amount and pressing Enter visibly
 * lands somewhere. Same rules as the Transactions list (effective trip shares, hidden
 * rows), via lib/ui/effectiveDisplay.
 */
import { Text } from '@/components/ui/LockedText';
import { CustomPopupProvider } from '@/components/ui/CustomPopupProvider';
import { Colors, Fonts } from '@/constants/theme';
import { ImportInboxRepository } from '@/lib/db/repositories';
import { Events, GlobalEvents } from '@/lib/events';
import { useAccounts, useCategories, useTransactions } from '@/lib/hooks/useData';
import { useTrips } from '@/lib/hooks/useTrips';
import { useUserSettings } from '@/lib/hooks/useUserSettings';
import { formatCents } from '@/lib/logic/currencyUtils';
import type { Transaction } from '@/lib/logic/types';
import { buildTripExpenseMap, getEffectiveDisplayInfo } from '@/lib/ui/effectiveDisplay';
import { shouldCountInMonthlySpentTotals, shouldRenderInTransactions } from '@/lib/ui/transactionRules';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import Animated, { FadeInDown, LinearTransition } from 'react-native-reanimated';
import { TransactionDetailScreen } from '../../screens/TransactionDetailScreen';
import { useDayKey } from '@/lib/web/useDayKey';

const RECENT_LIMIT = 14;

function dayLabel(ms: number, now: Date): string {
  const d = new Date(ms);
  const start = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = Math.round((start(now) - start(d)) / 86_400_000);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Yesterday';
  if (diff < 7) return d.toLocaleDateString(undefined, { weekday: 'long' });
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'long' });
}

export function DesktopLedgerPane() {
  const router = useRouter();
  const { settings } = useUserSettings();
  const currency = settings?.currencyCode ?? 'INR';
  const { data: transactions } = useTransactions();
  const { data: categories } = useCategories();
  const { data: accounts } = useAccounts();
  const { trips } = useTrips();
  const [pending, setPending] = useState(0);
  const [openTx, setOpenTx] = useState<Transaction | null>(null);
  const dayKey = useDayKey(); // "this month" and Today/Yesterday labels roll over at midnight

  useEffect(() => {
    let alive = true;
    const load = () => { ImportInboxRepository.countPending().then((n) => { if (alive) setPending(n); }).catch(() => {}); };
    load();
    const off = GlobalEvents.on(Events.importInboxChanged, load);
    return () => { alive = false; off(); };
  }, []);

  const tripMap = useMemo(() => buildTripExpenseMap(trips), [trips]);
  const catById = useMemo(() => new Map(categories.map((c) => [c.id, c])), [categories]);
  const acctById = useMemo(() => new Map(accounts.map((a) => [a.id, a])), [accounts]);

  const { spent, monthName, recent } = useMemo(() => {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
    const visible = transactions
      .filter((tx) => !tx.deletedAtMs && shouldRenderInTransactions(tx))
      .map((tx) => ({ tx, info: getEffectiveDisplayInfo(tx, tripMap) }))
      .filter((r) => !r.info.shouldHide)
      .sort((a, b) => b.tx.date - a.tx.date);
    let total = 0;
    for (const r of visible) {
      if (r.tx.date >= monthStart && !r.info.isIncome && shouldCountInMonthlySpentTotals(r.tx)) total += r.info.amount;
    }
    return { spent: total, monthName: now.toLocaleDateString(undefined, { month: 'long' }), recent: visible.slice(0, RECENT_LIMIT) };
  }, [transactions, tripMap, dayKey]);

  const now = new Date();
  let lastLabel = '';

  return (
    <View style={styles.pane} testID="desktop-ledger-pane">
      <Text style={styles.kicker}>Spent in {monthName}</Text>
      <Text style={styles.headline} numberOfLines={1}>{formatCents(spent, currency)}</Text>

      {pending > 0 ? (
        <Pressable onPress={() => router.push('/import-inbox')} accessibilityRole="button" style={(s: any) => [styles.inbox, s.hovered && styles.inboxHover]}>
          <View style={styles.dot} />
          <Text style={styles.inboxText}>{pending} {pending === 1 ? 'import is' : 'imports are'} waiting for review</Text>
          <Ionicons name="chevron-forward" size={16} color={Colors.textTertiary} />
        </Pressable>
      ) : null}

      <ScrollView style={styles.list} contentContainerStyle={{ paddingBottom: 24 }} showsVerticalScrollIndicator={false}>
        {recent.length === 0 ? (
          <Text style={styles.empty}>Nothing logged yet. Type an amount and press Enter.</Text>
        ) : recent.map(({ tx, info }) => {
          const label = dayLabel(tx.date, now);
          const showLabel = label !== lastLabel;
          lastLabel = label;
          const cat = tx.categoryId ? catById.get(tx.categoryId) : undefined;
          const acct = tx.accountId ? acctById.get(tx.accountId) : undefined;
          const isTransfer = tx.systemType === 'transfer';
          const title = tx.note || (isTransfer ? 'Transfer' : cat?.name) || (info.isIncome ? 'Income' : 'Expense');
          const emoji = isTransfer ? null : cat?.emoji;
          const time = new Date(tx.date).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
          return (
            <Animated.View key={tx.id} entering={FadeInDown.duration(220)} layout={LinearTransition.duration(200)}>
              {showLabel ? <Text style={styles.day}>{label}</Text> : null}
              <Pressable
                onPress={() => setOpenTx(tx)}
                accessibilityRole="button"
                accessibilityLabel={`${title}, ${formatCents(info.amount, currency)}`}
                style={(s: any) => [styles.row, s.hovered && styles.rowHover]}
              >
                <View style={styles.icon}>
                  {emoji ? <Text style={styles.emoji}>{emoji}</Text> : <Ionicons name={isTransfer ? 'swap-horizontal' : info.isIncome ? 'arrow-down' : 'receipt-outline'} size={16} color={Colors.textSecondary} />}
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.title} numberOfLines={1}>{title}</Text>
                  <Text style={styles.meta} numberOfLines={1}>{[acct ? `${acct.emoji} ${acct.name}` : null, time].filter(Boolean).join(' · ')}</Text>
                </View>
                <Text style={[styles.amount, info.isIncome && { color: Colors.success }]}>
                  {info.isIncome ? '+' : ''}{formatCents(info.amount, currency)}
                </Text>
              </Pressable>
            </Animated.View>
          );
        })}
      </ScrollView>

      <Modal visible={openTx !== null} animationType="fade" presentationStyle="fullScreen" onRequestClose={() => setOpenTx(null)}>
        {openTx ? (
          <CustomPopupProvider>
            <TransactionDetailScreen
              transactionId={openTx.id}
              readOnly={!!openTx.systemType && openTx.systemType.startsWith('trip_')}
              onDismiss={() => setOpenTx(null)}
              onDelete={() => setOpenTx(null)}
            />
          </CustomPopupProvider>
        ) : null}
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  pane: { flex: 1, paddingTop: 44, paddingHorizontal: 48, maxWidth: 760 },
  kicker: { fontFamily: Fonts.demiBold, fontSize: 15, color: Colors.textTertiary },
  headline: { fontFamily: Fonts.heavy, fontSize: 64, lineHeight: 70, color: Colors.textPrimary, marginTop: 2 },
  inbox: { flexDirection: 'row', alignItems: 'center', gap: 10, alignSelf: 'flex-start', marginTop: 16, paddingHorizontal: 14, height: 36, borderRadius: 18, backgroundColor: 'rgba(255,149,0,0.1)' },
  inboxHover: { backgroundColor: 'rgba(255,149,0,0.18)' },
  dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: Colors.accent },
  inboxText: { fontFamily: Fonts.demiBold, fontSize: 15, color: Colors.textPrimary },
  list: { flex: 1, marginTop: 28 },
  empty: { fontFamily: Fonts.medium, fontSize: 16, color: Colors.textTertiary, marginTop: 8 },
  day: { fontFamily: Fonts.demiBold, fontSize: 13, letterSpacing: 1.1, textTransform: 'uppercase', color: Colors.textMuted, marginTop: 18, marginBottom: 6, paddingHorizontal: 12 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 12, height: 56, borderRadius: 12 },
  rowHover: { backgroundColor: 'rgba(255,255,255,0.05)' },
  icon: { width: 34, height: 34, borderRadius: 10, backgroundColor: 'rgba(255,255,255,0.06)', alignItems: 'center', justifyContent: 'center' },
  emoji: { fontSize: 18 },
  title: { fontFamily: Fonts.demiBold, fontSize: 17, color: Colors.textPrimary },
  meta: { fontFamily: Fonts.medium, fontSize: 13, color: Colors.textTertiary, marginTop: 1 },
  amount: { fontFamily: Fonts.heavy, fontSize: 18, color: Colors.textPrimary },
});
