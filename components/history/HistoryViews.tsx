/**
 * Version history UI (audit trail): a list of recorded versions for one record, with
 * "Restore this version" / "Undo" actions, and a recent-changes feed.
 *
 * Restores are data-forward: the server writes a new version (also recorded), so history
 * is never rewritten. Currently mounted on web only (the native app follows later; see
 * docs/native-followups.md).
 */
import React, { useMemo, useState } from 'react';
import { ActivityIndicator, Modal, ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useMutation, useQuery } from 'convex/react';
import { api } from '@/convex/_generated/api';
import { Text } from '@/components/ui/LockedText';
import { Colors, Fonts } from '@/constants/theme';
import { formatCents } from '@/lib/logic/currencyUtils';
import { useCustomPopup } from '@/components/ui/CustomPopupProvider';
import { useToast } from '@/components/ui/ToastProvider';

export type HistoryEntry = {
  auditId: string;
  entityTable: string;
  entityId: string;
  action: string;
  source: string;
  reason: string | null;
  changedFields: string[];
  before: Record<string, any> | null;
  after: Record<string, any> | null;
  atMs: number;
  restorable: boolean;
};

const TABLE_LABEL: Record<string, string> = {
  transactions: 'Transaction',
  accounts: 'Account',
  categories: 'Category',
  trips: 'Trip',
  tripParticipants: 'Trip participant',
  tripExpenses: 'Trip expense',
  tripSettlements: 'Trip settlement',
  userSettings: 'Settings',
  importInboxItems: 'Import',
  derivedAccountOverrides: 'Trip payment account',
  apiImportKeys: 'API key',
  sharedTrips: 'Shared trip',
  sharedTripMembers: 'Shared trip member',
  sharedTripParticipants: 'Shared trip participant',
  sharedTripExpenses: 'Shared trip expense',
  sharedTripSettlements: 'Shared trip settlement',
  sharedTripInvites: 'Shared trip invite',
};

const ACTION_LABEL: Record<string, string> = {
  create: 'Created',
  update: 'Edited',
  delete: 'Deleted',
  restore: 'Restored',
  purge: 'Permanently removed',
};

const SOURCE_LABEL: Record<string, string> = {
  web: 'Web app',
  native_sync: 'Phone app',
  import_api: 'Agent import',
  app: 'App',
  system: 'Automatic',
};

const FIELD_LABEL: Record<string, string> = {
  amountCents: 'Amount',
  openingBalanceCents: 'Opening balance',
  limitAmountCents: 'Credit limit',
  monthlyBudgetCents: 'Monthly budget',
  budgetCents: 'Budget',
  date: 'Date',
  dateMs: 'Date',
  startDate: 'Start',
  endDate: 'End',
  note: 'Note',
  name: 'Name',
  emoji: 'Emoji',
  type: 'Type',
  accountId: 'Account',
  categoryId: 'Category',
  deletedAtMs: 'Deleted',
  status: 'Status',
  splitType: 'Split',
  defaultAccountId: 'Default account',
  currencyCode: 'Currency',
};

function formatValue(field: string, value: any, currencyCode?: string): string {
  if (value === undefined || value === null || value === '') return '—';
  if (/Cents$/.test(field) && typeof value === 'number') return formatCents(value, currencyCode);
  if (/(^date$|Ms$|^startDate$|^endDate$)/.test(field) && typeof value === 'number') {
    return new Date(value).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
  }
  if (typeof value === 'string' && value.length > 40) return `${value.slice(0, 37)}…`;
  if (typeof value === 'object') return JSON.stringify(value).slice(0, 40);
  return String(value);
}

function entryTitle(entry: HistoryEntry): string {
  return `${ACTION_LABEL[entry.action] ?? entry.action} · ${SOURCE_LABEL[entry.source] ?? entry.source}`;
}

function entrySubject(entry: HistoryEntry): string {
  const doc = entry.after ?? entry.before ?? {};
  const label = TABLE_LABEL[entry.entityTable] ?? entry.entityTable;
  const name = doc.name ?? doc.note ?? doc.merchantName;
  if (typeof doc.amountCents === 'number') return `${label} · ${formatCents(doc.amountCents)}${name ? ` · ${name}` : ''}`;
  return name ? `${label} · ${name}` : label;
}

function EntryRow({ entry, showSubject, onRestore, onOpen }: {
  entry: HistoryEntry;
  showSubject?: boolean;
  onRestore?: (entry: HistoryEntry, version: 'after' | 'before') => void;
  onOpen?: (entry: HistoryEntry) => void;
}) {
  const fields = entry.action === 'create' ? [] : entry.changedFields.filter((f) => f !== 'deletedAtMs').slice(0, 6);
  const canRestoreAfter = entry.restorable && entry.after && entry.action !== 'delete' && entry.action !== 'purge';
  const canUndo = entry.restorable && entry.before && (entry.action === 'delete' || entry.action === 'update');
  return (
    <TouchableOpacity activeOpacity={onOpen ? 0.7 : 1} disabled={!onOpen} onPress={() => onOpen?.(entry)} style={styles.entry} testID="history-entry">
      <View style={styles.entryHeader}>
        <Text style={styles.entryTitle}>{entryTitle(entry)}</Text>
        <Text style={styles.entryTime}>{new Date(entry.atMs).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}</Text>
      </View>
      {showSubject ? <Text style={styles.entrySubject}>{entrySubject(entry)}</Text> : null}
      {entry.reason ? <Text style={styles.entryReason}>{entry.reason}</Text> : null}
      {fields.map((f) => (
        <Text key={f} style={styles.diff} numberOfLines={1}>
          {FIELD_LABEL[f] ?? f}: {formatValue(f, entry.before?.[f])} → {formatValue(f, entry.after?.[f])}
        </Text>
      ))}
      {onRestore && (canRestoreAfter || canUndo) ? (
        <View style={styles.actions}>
          {canUndo ? (
            <TouchableOpacity onPress={() => onRestore(entry, 'before')} style={styles.actionButton} accessibilityRole="button" accessibilityLabel="Undo this change">
              <Ionicons name="arrow-undo" size={14} color={Colors.accent} />
              <Text style={styles.actionText}>{entry.action === 'delete' ? 'Undo delete' : 'Undo'}</Text>
            </TouchableOpacity>
          ) : null}
          {canRestoreAfter ? (
            <TouchableOpacity onPress={() => onRestore(entry, 'after')} style={styles.actionButton} accessibilityRole="button" accessibilityLabel="Restore this version">
              <Ionicons name="time-outline" size={14} color={Colors.accent} />
              <Text style={styles.actionText}>Restore this version</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      ) : null}
    </TouchableOpacity>
  );
}

function useRestore() {
  const restore = useMutation(api.history.restore);
  const { showPopup } = useCustomPopup();
  const toast = useToast();
  return (entry: HistoryEntry, version: 'after' | 'before') => {
    const isUndo = version === 'before';
    showPopup({
      title: isUndo ? (entry.action === 'delete' ? 'Undo delete?' : 'Undo this change?') : 'Restore this version?',
      message: 'This saves a new version. Nothing in the history is erased, so you can always go back.',
      buttons: [
        { text: 'Cancel', style: 'cancel' },
        {
          text: isUndo ? 'Undo' : 'Restore',
          style: 'default',
          onPress: async () => {
            try {
              await restore({ auditId: entry.auditId as any, version });
              toast.show(isUndo ? 'Change undone' : 'Version restored');
            } catch (e: any) {
              showPopup({ title: 'Could not restore', message: e?.data?.message ?? e?.message ?? 'Please try again.', buttons: [{ text: 'OK', style: 'default' }] });
            }
          },
        },
      ],
    });
  };
}

/** Full-screen sheet with every recorded version of one record. */
export function HistorySheet({ visible, onClose, entityTable, entityId, title }: {
  visible: boolean;
  onClose: () => void;
  entityTable: string;
  entityId: string;
  title?: string;
}) {
  const insets = useSafeAreaInsets();
  const entries = useQuery(api.history.forEntity, visible ? { entityTable, entityId } : 'skip') as HistoryEntry[] | undefined;
  const onRestore = useRestore();
  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={[styles.sheet, { paddingTop: insets.top + 8 }]} testID="history-sheet">
        <View style={styles.sheetHeader}>
          <Text style={styles.sheetTitle}>{title ?? 'History'}</Text>
          <TouchableOpacity onPress={onClose} accessibilityRole="button" accessibilityLabel="Close history">
            <Text style={styles.close}>Done</Text>
          </TouchableOpacity>
        </View>
        {entries === undefined ? (
          <ActivityIndicator color={Colors.accent} style={{ marginTop: 40 }} />
        ) : entries.length === 0 ? (
          <Text style={styles.empty}>No history recorded yet.</Text>
        ) : (
          <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 40 }}>
            {entries.map((e) => (
              <EntryRow key={e.auditId} entry={e} onRestore={onRestore} />
            ))}
          </ScrollView>
        )}
      </View>
    </Modal>
  );
}

/** Recent changes across everything, newest first; tap a row to see that record's history. */
export function RecentChanges() {
  const entries = useQuery(api.history.recent, { limit: 100 }) as HistoryEntry[] | undefined;
  const [open, setOpen] = useState<HistoryEntry | null>(null);
  const onRestore = useRestore();
  const list = useMemo(() => entries ?? [], [entries]);
  if (entries === undefined) return <ActivityIndicator color={Colors.accent} style={{ marginTop: 40 }} />;
  return (
    <>
      {list.length === 0 ? <Text style={styles.empty}>No changes yet.</Text> : null}
      {list.map((e) => (
        <EntryRow key={e.auditId} entry={e} showSubject onRestore={onRestore} onOpen={setOpen} />
      ))}
      {open ? (
        <HistorySheet
          visible
          onClose={() => setOpen(null)}
          entityTable={open.entityTable}
          entityId={open.entityId}
          title={`${TABLE_LABEL[open.entityTable] ?? 'Record'} history`}
        />
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  sheet: { flex: 1, backgroundColor: Colors.background, paddingHorizontal: 20 },
  sheetHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  sheetTitle: { color: Colors.textPrimary, fontFamily: Fonts.heavy, fontSize: 28 },
  close: { color: Colors.accent, fontFamily: Fonts.demiBold, fontSize: 17 },
  empty: { color: Colors.textSecondary, fontFamily: Fonts.medium, fontSize: 15, textAlign: 'center', marginTop: 40 },
  entry: { backgroundColor: '#111111', borderRadius: 14, padding: 14, marginBottom: 10 },
  entryHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 },
  entryTitle: { color: Colors.textPrimary, fontFamily: Fonts.demiBold, fontSize: 15, flexShrink: 1 },
  entryTime: { color: Colors.textSecondary, fontFamily: Fonts.medium, fontSize: 12 },
  entrySubject: { color: Colors.textPrimary, fontFamily: Fonts.medium, fontSize: 14, marginTop: 4 },
  entryReason: { color: Colors.textSecondary, fontFamily: Fonts.medium, fontSize: 12, marginTop: 4 },
  diff: { color: 'rgba(255,255,255,0.75)', fontFamily: Fonts.medium, fontSize: 13, marginTop: 4 },
  actions: { flexDirection: 'row', gap: 10, marginTop: 10, flexWrap: 'wrap' },
  actionButton: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999, borderWidth: 1, borderColor: 'rgba(255,149,0,0.4)' },
  actionText: { color: Colors.accent, fontFamily: Fonts.demiBold, fontSize: 13 },
});
