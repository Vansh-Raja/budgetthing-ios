/**
 * Desktop Accounts: one headline (what you have, net of card balances) and a clean list
 * of accounts. Rows scale from one account to many and read like a native desktop list.
 * Balances use the same rules as the mobile tiles and account detail header.
 */
import { CustomPopupProvider } from '@/components/ui/CustomPopupProvider';
import { Text } from '@/components/ui/LockedText';
import { Colors, Fonts } from '@/constants/theme';
import { useUserSettings } from '@/lib/hooks/useUserSettings';
import { computeAccountHeaderValueCents, getTransactionsForAccount, summarizeAccountFlows } from '@/lib/logic/accountBalance';
import { formatCents } from '@/lib/logic/currencyUtils';
import type { Account, Transaction } from '@/lib/logic/types';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { EditAccountScreen } from '../../screens/EditAccountScreen';
import { useDayKey } from '@/lib/web/useDayKey';

const KIND_LABEL: Record<string, string> = { cash: 'Cash', savings: 'Bank', card: 'Credit card' };

function HeaderButton({ icon, label, onPress, primary }: { icon: keyof typeof Ionicons.glyphMap; label: string; onPress: () => void; primary?: boolean }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={label} style={(s: any) => [styles.hBtn, primary && styles.hBtnPrimary, s.hovered && (primary ? styles.hBtnPrimaryHover : styles.hBtnHover)]}>
      <Ionicons name={icon} size={16} color={primary ? '#000' : Colors.textSecondary} />
      <Text style={[styles.hBtnText, primary && { color: '#000' }]}>{label}</Text>
    </Pressable>
  );
}

export function DesktopAccounts({ accounts, transactions, getAccountDisplay }: {
  accounts: Account[];
  transactions: Transaction[];
  getAccountDisplay: (a: Account) => { displayValueCents: number | null; spentThisWindow: number };
}) {
  const router = useRouter();
  const { settings } = useUserSettings();
  const currency = settings?.currencyCode ?? 'INR';
  const [adding, setAdding] = useState(false);
  const dayKey = useDayKey(); // spending windows (month / billing cycle) roll over at midnight

  const rows = useMemo(() => accounts.map((acc) => {
    const txs = getTransactionsForAccount(transactions, acc.id);
    const { spentThisWindow } = getAccountDisplay(acc);
    const isCard = acc.kind === 'card';
    const flows = summarizeAccountFlows(acc, txs);
    // Signed: positive = owed on the card, negative = the card is in credit (refund/overpayment).
    const owed = isCard ? flows.expensesCents - flows.incomesCents : 0;
    const value = computeAccountHeaderValueCents(acc, txs) ?? 0;
    const cycle = isCard && acc.billingCycleDay && acc.billingCycleDay >= 1 && acc.billingCycleDay <= 28;
    return { acc, isCard, owed, value, spent: spentThisWindow, windowLabel: cycle ? 'this cycle' : 'this month' };
  }), [accounts, transactions, getAccountDisplay, dayKey]);

  const { have, owedTotal } = useMemo(() => ({
    have: rows.filter((r) => !r.isCard).reduce((s, r) => s + r.value, 0),
    // Net card position: credits count in your favour.
    owedTotal: rows.filter((r) => r.isCard).reduce((s, r) => s + r.owed, 0),
  }), [rows]);

  return (
    <View style={styles.page} testID="desktop-accounts">
      <View style={styles.header}>
        <Text style={styles.title}>Accounts</Text>
        <View style={{ flex: 1 }} />
        <HeaderButton icon="swap-horizontal" label="Transfer" onPress={() => router.push('/transfer')} />
        <HeaderButton icon="options-outline" label="Manage" onPress={() => router.push('/settings/accounts')} />
        <HeaderButton icon="add" label="Add account" primary onPress={() => setAdding(true)} />
      </View>

      <Text style={styles.kicker}>{owedTotal !== 0 ? 'Net of card balances' : 'Across your accounts'}</Text>
      <Text style={[styles.headline, have - owedTotal < 0 && { color: Colors.error }]} numberOfLines={1}>{formatCents(have - owedTotal, currency)}</Text>
      <Text style={styles.sub}>
        {accounts.length} {accounts.length === 1 ? 'account' : 'accounts'}
        {owedTotal > 0 ? ` · ${formatCents(have, currency)} in hand · ${formatCents(owedTotal, currency)} owed on cards` : ''}
        {owedTotal < 0 ? ` · ${formatCents(have, currency)} in hand · ${formatCents(-owedTotal, currency)} credit on cards` : ''}
      </Text>

      <ScrollView style={styles.list} contentContainerStyle={{ paddingBottom: 32 }} showsVerticalScrollIndicator={false}>
        <View style={styles.colHead}>
          <Text style={[styles.colText, { flex: 1 }]}>Account</Text>
          <Text style={[styles.colText, styles.colSpent]}>Spent</Text>
          <Text style={[styles.colText, styles.colBalance]}>Balance</Text>
        </View>
        {rows.map(({ acc, isCard, owed, value, spent, windowLabel }) => (
          <Pressable
            key={acc.id}
            onPress={() => router.push(`/account/${acc.id}`)}
            accessibilityRole="button"
            accessibilityLabel={acc.name}
            style={(s: any) => [styles.row, s.hovered && styles.rowHover]}
          >
            <View style={styles.icon}><Text style={styles.emoji}>{acc.emoji || '🧾'}</Text></View>
            <View style={{ flex: 1 }}>
              <Text style={styles.name} numberOfLines={1}>{acc.name}</Text>
              <Text style={styles.kind}>{KIND_LABEL[acc.kind] ?? acc.kind}</Text>
            </View>
            <View style={styles.colSpent}>
              <Text style={styles.spent}>{formatCents(spent, currency)}</Text>
              <Text style={styles.kind}>{windowLabel}</Text>
            </View>
            <View style={styles.colBalance}>
              <Text style={[styles.balance, value < 0 && { color: Colors.error }]}>{formatCents(isCard && acc.limitAmountCents == null ? Math.abs(owed) : value, currency)}</Text>
              {isCard ? <Text style={styles.kind}>{acc.limitAmountCents != null ? 'available' : owed < 0 ? 'credit' : 'owed'}</Text> : null}
            </View>
            <Ionicons name="chevron-forward" size={16} color={Colors.textMuted} />
          </Pressable>
        ))}
        <Pressable onPress={() => setAdding(true)} accessibilityRole="button" style={(s: any) => [styles.row, styles.addRow, s.hovered && styles.rowHover]}>
          <View style={[styles.icon, styles.addIcon]}><Ionicons name="add" size={18} color={Colors.accent} /></View>
          <Text style={styles.addText}>Add an account</Text>
        </Pressable>
      </ScrollView>

      <Modal visible={adding} animationType="fade" presentationStyle="pageSheet" onRequestClose={() => setAdding(false)}>
        <CustomPopupProvider>
          <EditAccountScreen onDismiss={() => setAdding(false)} onSave={() => setAdding(false)} />
        </CustomPopupProvider>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, paddingTop: 40 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 28 },
  title: { fontFamily: Fonts.heavy, fontSize: 34, color: Colors.textPrimary },
  hBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, height: 36, paddingHorizontal: 14, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.07)' },
  hBtnHover: { backgroundColor: 'rgba(255,255,255,0.12)' },
  hBtnPrimary: { backgroundColor: Colors.accent },
  hBtnPrimaryHover: { backgroundColor: '#FFA526' },
  hBtnText: { fontFamily: Fonts.demiBold, fontSize: 15, color: Colors.textSecondary },
  kicker: { fontFamily: Fonts.demiBold, fontSize: 15, color: Colors.textTertiary },
  headline: { fontFamily: Fonts.heavy, fontSize: 64, lineHeight: 70, color: Colors.textPrimary },
  sub: { fontFamily: Fonts.medium, fontSize: 15, color: Colors.textTertiary },
  list: { flex: 1, marginTop: 32 },
  colHead: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingLeft: 60, paddingRight: 40, height: 28, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.07)', marginBottom: 6 },
  colText: { fontFamily: Fonts.demiBold, fontSize: 12, letterSpacing: 1.1, textTransform: 'uppercase', color: Colors.textMuted },
  colSpent: { width: 160, alignItems: 'flex-end', textAlign: 'right' } as any,
  colBalance: { width: 180, alignItems: 'flex-end', textAlign: 'right' } as any,
  row: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 12, height: 64, borderRadius: 12 },
  rowHover: { backgroundColor: 'rgba(255,255,255,0.05)' },
  icon: { width: 36, height: 36, borderRadius: 10, backgroundColor: 'rgba(255,255,255,0.06)', alignItems: 'center', justifyContent: 'center' },
  emoji: { fontSize: 19 },
  name: { fontFamily: Fonts.demiBold, fontSize: 18, color: Colors.textPrimary },
  kind: { fontFamily: Fonts.medium, fontSize: 13, color: Colors.textTertiary },
  spent: { fontFamily: Fonts.demiBold, fontSize: 16, color: Colors.textSecondary },
  balance: { fontFamily: Fonts.heavy, fontSize: 20, color: Colors.textPrimary },
  addRow: { marginTop: 4 },
  addIcon: { backgroundColor: 'rgba(255,149,0,0.1)' },
  addText: { fontFamily: Fonts.demiBold, fontSize: 16, color: Colors.accent },
});
