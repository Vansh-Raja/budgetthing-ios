import React, { useEffect, useMemo, useState } from 'react';
import {
  Modal,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';

import { Text } from '@/components/ui/LockedText';
import { Colors } from '@/constants/theme';
import type { Account, Category, Trip } from '@/lib/logic/types';
import type { SharedTripSummary } from '@/lib/db/sharedTripRepositories';
import type { TransactionsFilterState, TripFilterMode } from '@/lib/ui/transactionFilters';
import {
  DEFAULT_TRANSACTIONS_FILTERS,
  normalizeTransactionsFilters,
} from '@/lib/ui/transactionFilters';

type TripChoice = {
  id: string;
  emoji: string;
  name: string;
  kind: 'local' | 'shared';
};

const SYSTEM_TYPE_OPTIONS: Array<{ id: string; label: string }> = [
  { id: 'transfer', label: 'Transfers' },
  { id: 'adjustment', label: 'Adjustments' },
  { id: 'trip_share', label: 'Trip shares' },
  { id: 'trip_settlement', label: 'Trip settlements' },
];

function PillButton({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.7}
      style={[
        styles.pill,
        { backgroundColor: active ? 'rgba(255, 255, 255, 0.18)' : 'rgba(255, 255, 255, 0.08)' },
      ]}
    >
      <Text style={styles.pillText}>{label}</Text>
    </TouchableOpacity>
  );
}

function CheckRow({
  left,
  right,
  checked,
  onPress,
}: {
  left: React.ReactNode;
  right?: React.ReactNode;
  checked: boolean;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.7} style={styles.row}>
      <View style={styles.rowLeft}>{left}</View>
      {right ? <View style={styles.rowRight}>{right}</View> : null}
      <Ionicons
        name={checked ? 'checkmark-circle' : 'ellipse-outline'}
        size={20}
        color={checked ? Colors.accent : 'rgba(255, 255, 255, 0.25)'}
      />
    </TouchableOpacity>
  );
}

export function TransactionsFilterSheet(props: {
  visible: boolean;
  initialFilters: TransactionsFilterState;
  categories: Category[];
  accounts: Account[];
  localTrips: Trip[];
  sharedTrips: SharedTripSummary[];
  onCancel: () => void;
  onApply: (filters: TransactionsFilterState) => void;
}) {
  const [draft, setDraft] = useState<TransactionsFilterState>(
    normalizeTransactionsFilters(props.initialFilters)
  );

  useEffect(() => {
    if (!props.visible) return;
    setDraft(normalizeTransactionsFilters(props.initialFilters));
  }, [props.visible, props.initialFilters]);

  const nonSystemCategories = useMemo(
    () => props.categories.filter((c) => !c.isSystem),
    [props.categories]
  );

  const tripChoices: TripChoice[] = useMemo(() => {
    const local: TripChoice[] = props.localTrips.map((t) => ({
      id: t.id,
      emoji: t.emoji,
      name: t.name,
      kind: 'local',
    }));
    const shared: TripChoice[] = props.sharedTrips.map((t) => ({
      id: t.id,
      emoji: t.emoji,
      name: t.name,
      kind: 'shared',
    }));
    return [...local, ...shared].sort((a, b) => a.name.localeCompare(b.name));
  }, [props.localTrips, props.sharedTrips]);

  const setTripMode = (mode: TripFilterMode) => {
    Haptics.selectionAsync();
    setDraft((prev) => {
      const next = { ...prev, tripMode: mode };
      // If user picks non-trip-only, tripIds become irrelevant.
      if (mode === 'onlyNonTrip') {
        next.tripIds = [];
      }
      return normalizeTransactionsFilters(next);
    });
  };

  const toggleHiddenSystemType = (systemType: string) => {
    Haptics.selectionAsync();
    setDraft((prev) => {
      const next = new Set(prev.hiddenSystemTypes);
      if (next.has(systemType)) next.delete(systemType);
      else next.add(systemType);
      return normalizeTransactionsFilters({ ...prev, hiddenSystemTypes: Array.from(next) });
    });
  };

  const toggleCategory = (categoryId: string) => {
    Haptics.selectionAsync();
    setDraft((prev) => {
      const next = new Set(prev.categoryIds);
      if (next.has(categoryId)) next.delete(categoryId);
      else next.add(categoryId);
      return normalizeTransactionsFilters({ ...prev, categoryIds: Array.from(next) });
    });
  };

  const toggleAccount = (accountId: string) => {
    Haptics.selectionAsync();
    setDraft((prev) => {
      const next = new Set(prev.accountIds);
      if (next.has(accountId)) next.delete(accountId);
      else next.add(accountId);
      return normalizeTransactionsFilters({ ...prev, accountIds: Array.from(next) });
    });
  };

  const toggleTrip = (tripId: string) => {
    Haptics.selectionAsync();
    setDraft((prev) => {
      const next = new Set(prev.tripIds);
      if (next.has(tripId)) next.delete(tripId);
      else next.add(tripId);
      return normalizeTransactionsFilters({ ...prev, tripIds: Array.from(next) });
    });
  };

  const toggleUncategorized = () => {
    Haptics.selectionAsync();
    setDraft((prev) => normalizeTransactionsFilters({ ...prev, includeUncategorized: !prev.includeUncategorized }));
  };

  const clearAll = () => {
    Haptics.selectionAsync();
    setDraft(DEFAULT_TRANSACTIONS_FILTERS);
  };

  return (
    <Modal
      visible={props.visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={props.onCancel}
    >
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={props.onCancel} activeOpacity={0.7}>
            <Text style={styles.headerAction}>Cancel</Text>
          </TouchableOpacity>

          <Text style={styles.headerTitle}>Filters</Text>

          <View style={styles.headerRight}>
            <TouchableOpacity
              onPress={() => {
                Haptics.selectionAsync();
                clearAll();
              }}
              activeOpacity={0.7}
            >
              <Text style={styles.headerAction}>Clear</Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => {
                Haptics.selectionAsync();
                props.onApply(normalizeTransactionsFilters(draft));
              }}
              activeOpacity={0.7}
            >
              <Text style={styles.headerAction}>Done</Text>
            </TouchableOpacity>
          </View>
        </View>

        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <View style={styles.section}>
            <View style={styles.pillsRow}>
              <PillButton label="All" active={draft.tripMode === 'all'} onPress={() => setTripMode('all')} />
              <PillButton label="Trips" active={draft.tripMode === 'onlyTrip'} onPress={() => setTripMode('onlyTrip')} />
              <PillButton
                label="Non-trip"
                active={draft.tripMode === 'onlyNonTrip'}
                onPress={() => setTripMode('onlyNonTrip')}
              />
            </View>

            {draft.tripMode !== 'onlyNonTrip' && tripChoices.length > 0 ? (
              <View style={styles.listCard}>
                {tripChoices.map((t) => (
                  <CheckRow
                    key={t.id}
                    checked={draft.tripIds.includes(t.id)}
                    onPress={() => toggleTrip(t.id)}
                    left={
                      <View style={styles.inlineRow}>
                        <Text style={styles.emoji}>{t.emoji}</Text>
                        <Text style={styles.rowLabel}>{t.name}</Text>
                      </View>
                    }
                    right={
                      t.kind === 'shared' ? (
                        <Text style={styles.mutedTag}>Shared</Text>
                      ) : (
                        <Text style={styles.mutedTag}>Local</Text>
                      )
                    }
                  />
                ))}
              </View>
            ) : null}
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionHeader}>System</Text>
            <View style={styles.listCard}>
              {SYSTEM_TYPE_OPTIONS.map((opt) => (
                <CheckRow
                  key={opt.id}
                  checked={!draft.hiddenSystemTypes.includes(opt.id)}
                  onPress={() => toggleHiddenSystemType(opt.id)}
                  left={<Text style={styles.rowLabel}>{opt.label}</Text>}
                  right={<Text style={styles.mutedTag}>{draft.hiddenSystemTypes.includes(opt.id) ? 'Hidden' : 'Shown'}</Text>}
                />
              ))}
            </View>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionHeader}>Categories</Text>
            <View style={styles.listCard}>
              <CheckRow
                checked={draft.includeUncategorized}
                onPress={toggleUncategorized}
                left={<Text style={styles.rowLabel}>Uncategorized</Text>}
              />
              {nonSystemCategories.map((c) => (
                <CheckRow
                  key={c.id}
                  checked={draft.categoryIds.includes(c.id)}
                  onPress={() => toggleCategory(c.id)}
                  left={
                    <View style={styles.inlineRow}>
                      <Text style={styles.emoji}>{c.emoji}</Text>
                      <Text style={styles.rowLabel}>{c.name}</Text>
                    </View>
                  }
                />
              ))}
            </View>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionHeader}>Accounts</Text>
            <View style={styles.listCard}>
              {props.accounts.map((a) => (
                <CheckRow
                  key={a.id}
                  checked={draft.accountIds.includes(a.id)}
                  onPress={() => toggleAccount(a.id)}
                  left={
                    <View style={styles.inlineRow}>
                      <Text style={styles.emoji}>{a.emoji}</Text>
                      <Text style={styles.rowLabel}>{a.name}</Text>
                    </View>
                  }
                />
              ))}
            </View>
          </View>
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.08)',
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  headerTitle: {
    fontFamily: 'AvenirNextCondensed-DemiBold',
    fontSize: 18,
    color: '#FFFFFF',
  },
  headerAction: {
    fontFamily: 'AvenirNextCondensed-Medium',
    fontSize: 18,
    color: Colors.accent,
  },
  content: {
    paddingHorizontal: 16,
    paddingBottom: 40,
    paddingTop: 14,
    gap: 16,
  },
  section: {
    gap: 10,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
  },
  sectionHeader: {
    fontFamily: 'AvenirNextCondensed-DemiBold',
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.6)',
  },
  clearText: {
    fontFamily: 'AvenirNextCondensed-Medium',
    fontSize: 14,
    color: Colors.accent,
  },
  pillsRow: {
    flexDirection: 'row',
    gap: 10,
  },
  pill: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 9999,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
  },
  pillText: {
    fontFamily: 'AvenirNextCondensed-DemiBold',
    fontSize: 16,
    color: '#FFFFFF',
  },
  listCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.10)',
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.06)',
  },
  rowLeft: {
    flex: 1,
  },
  rowRight: {
    marginRight: 10,
  },
  inlineRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  emoji: {
    fontSize: 20,
  },
  rowLabel: {
    fontFamily: 'AvenirNextCondensed-Medium',
    fontSize: 18,
    color: '#FFFFFF',
  },
  mutedTag: {
    fontFamily: 'AvenirNextCondensed-Medium',
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.45)',
  },
});
