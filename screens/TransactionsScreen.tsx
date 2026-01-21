/**
 * TransactionsScreen - List of all transactions
 * 
 * Pixel-perfect port of TransactionsListView.swift
 */

import { CustomPopupProvider, useCustomPopup } from '@/components/ui/CustomPopupProvider';
import { Text } from '@/components/ui/LockedText';
import { Ionicons } from '@expo/vector-icons';
import { format, parseISO } from 'date-fns';
import { BlurView } from 'expo-blur';
import * as Haptics from 'expo-haptics';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AppState,
  AppStateStatus,
  Modal,
  ScrollView,
  SectionList,
  StatusBar,
  StyleSheet,
  TouchableOpacity,
  View
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useAuth } from '@clerk/clerk-expo';
import { TransactionsFilterSheet } from '../components/transactions/TransactionsFilterSheet';
import { FloatingTabSwitcher } from '../components/ui/FloatingTabSwitcher';
import { Colors, Tabs } from '../constants/theme';
import { TransactionRepository, TripExpenseRepository, TripSettlementRepository } from '../lib/db/repositories';
import { SharedTripRepository } from '../lib/db/sharedTripRepositories';
import { useAccounts, useCategories, useTransactions } from '../lib/hooks/useData';
import { useSharedTrips } from '../lib/hooks/useSharedTrips';
import { useTrips } from '../lib/hooks/useTrips';
import { useUserSettings } from '../lib/hooks/useUserSettings';
import { Actions } from '../lib/logic/actions';
import { formatCents } from '../lib/logic/currencyUtils';
import { TripSplitCalculator } from '../lib/logic/tripSplitCalculator';
import { Category, Transaction } from '../lib/logic/types';
import { useSyncStatus } from '../lib/sync/SyncProvider';
import {
  DEFAULT_TRANSACTIONS_FILTERS,
  isTransactionsFiltersActive,
  normalizeTransactionsFilters,
  shouldIncludeTransaction,
} from '../lib/ui/transactionFilters';
import {
  loadTransactionsFiltersFromSecureStore,
  saveTransactionsFiltersToSecureStore,
} from '../lib/ui/transactionFiltersStorage';
import {
  formatTripShareAmountInline,
  isSelectableInBulkMode,
  shouldCountInMonthlySpentTotals,
  shouldRenderInTransactions,
} from '../lib/ui/transactionRules';
import { TransactionDetailScreen } from './TransactionDetailScreen';

// ============================================================================
// Types & Props
// ============================================================================

interface TransactionsScreenProps {
  selectedIndex: number;
  onSelectIndex: (index: number) => void;
}

interface MonthSection {
  id: string; // "YYYY-MM"
  title: string; // "January 2026"
  totalCents: number;
  data: Transaction[];
}

// ============================================================================
// Helper Components
// ============================================================================

function MonthChip({ title, isSelected, onPress }: { title: string; isSelected: boolean; onPress: () => void }) {
  return (
    <TouchableOpacity
      onPress={onPress}
      style={[
        styles.monthChip,
        { backgroundColor: isSelected ? 'rgba(255, 255, 255, 0.18)' : 'rgba(255, 255, 255, 0.08)' }
      ]}
      activeOpacity={0.7}
    >
      <Text style={styles.monthChipText}>{title}</Text>
    </TouchableOpacity>
  );
}

function SelectionActionsPill({
  selectedCount,
  onDelete,
  onMove,
  onChangeCategory,
  canMove,
  canChangeCategory
}: {
  selectedCount: number;
  onDelete: () => void;
  onMove: () => void;
  onChangeCategory: () => void;
  canMove: boolean;
  canChangeCategory: boolean;
}) {
  return (
    <View style={styles.selectionPillContainer}>
      <BlurView intensity={80} tint="dark" style={StyleSheet.absoluteFill} />
      <View style={styles.selectionPillContent}>
        {/* Count */}
        <View style={styles.countBadge}>
          <Text style={styles.countText}>{selectedCount}</Text>
        </View>

        <View style={{ flex: 1 }} />

        {/* Actions */}
        <TouchableOpacity
          onPress={onMove}
          disabled={selectedCount === 0 || !canMove}
          style={[styles.actionButton, { opacity: (selectedCount === 0 || !canMove) ? 0.35 : 1 }]}
        >
          <Ionicons name="swap-horizontal" size={16} color="#FFFFFF" />
        </TouchableOpacity>

        <TouchableOpacity
          onPress={onChangeCategory}
          disabled={selectedCount === 0 || !canChangeCategory}
          style={[styles.actionButton, { opacity: (selectedCount === 0 || !canChangeCategory) ? 0.35 : 1 }]}
        >
          <Ionicons name="pricetag" size={16} color="#FFFFFF" />
        </TouchableOpacity>

        <TouchableOpacity
          onPress={onDelete}
          disabled={selectedCount === 0}
          style={[styles.actionButton, { opacity: selectedCount === 0 ? 0.5 : 1 }]}
        >
          <Ionicons name="trash" size={16} color="#FF3B30" />
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ============================================================================
// Helper Components
// ============================================================================

export function TransactionsScreen({ selectedIndex, onSelectIndex }: TransactionsScreenProps) {
  const insets = useSafeAreaInsets();

  const { data: transactions, refresh } = useTransactions();
  const { data: categories } = useCategories();
  const { data: accounts } = useAccounts();
  const { trips, refresh: refreshTrips } = useTrips();
  const { trips: sharedTrips } = useSharedTrips();
  const { syncNow } = useSyncStatus();
  const { isSignedIn, userId } = useAuth();
  const { settings, updateSettings } = useUserSettings();
  const { showPopup } = useCustomPopup();

  const [isRefreshing, setIsRefreshing] = useState(false);

  const [filters, setFilters] = useState(DEFAULT_TRANSACTIONS_FILTERS);
  const [showFilters, setShowFilters] = useState(false);

  const filtersActive = useMemo(() => isTransactionsFiltersActive(filters), [filters]);

  const resetFiltersOnReopen = settings?.resetTransactionFiltersOnReopen ?? false;
  const syncFiltersEnabled = settings?.syncTransactionFilters ?? false;

  const handleRefresh = useCallback(() => {
    setIsRefreshing(true);
    syncNow('manual_refresh')
      .then(() => Promise.all([refresh(), refreshTrips()]))
      .catch((error) => {
        console.error('[Transactions] Refresh failed:', error);
      })
      .finally(() => {
        setIsRefreshing(false);
      });
  }, [syncNow, refresh, refreshTrips]);

  // Load filters from SecureStore + optional synced userSettings.
  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      const local = await loadTransactionsFiltersFromSecureStore(isSignedIn ? userId : null);
      if (cancelled) return;

      // If reset-on-reopen is enabled, we do not use synced filters.
      if (!isSignedIn || !userId || !syncFiltersEnabled || resetFiltersOnReopen) {
        setFilters(normalizeTransactionsFilters(local.filters));
        return;
      }

      let remoteUpdatedAtMs = settings?.transactionsFiltersUpdatedAtMs ?? 0;
      if (!Number.isFinite(remoteUpdatedAtMs as any)) remoteUpdatedAtMs = 0;

      let remoteFilters = null as any;
      if (settings?.transactionsFiltersJson) {
        try {
          remoteFilters = normalizeTransactionsFilters(JSON.parse(settings.transactionsFiltersJson));
        } catch {
          remoteFilters = null;
        }
      }

      const localUpdatedAtMs = local.updatedAtMs ?? 0;
      const shouldUseRemote = !!remoteFilters && remoteUpdatedAtMs > localUpdatedAtMs;
      const chosenFilters = shouldUseRemote ? remoteFilters : normalizeTransactionsFilters(local.filters);
      const chosenUpdatedAtMs = shouldUseRemote ? remoteUpdatedAtMs : localUpdatedAtMs;

      setFilters(chosenFilters);

      if (shouldUseRemote) {
        await saveTransactionsFiltersToSecureStore(userId, { filters: chosenFilters, updatedAtMs: chosenUpdatedAtMs });
      }
    };

    run().catch((e) => {
      console.warn('[Transactions] Failed to load filters:', e);
      if (!cancelled) setFilters(DEFAULT_TRANSACTIONS_FILTERS);
    });

    return () => {
      cancelled = true;
    };
  }, [isSignedIn, userId, syncFiltersEnabled, resetFiltersOnReopen, settings?.transactionsFiltersJson, settings?.transactionsFiltersUpdatedAtMs]);

  const persistFilters = useCallback(async (nextFiltersRaw: any) => {
    const nextFilters = normalizeTransactionsFilters(nextFiltersRaw);
    const now = Date.now();

    setFilters(nextFilters);
    setIsSelecting(false);
    setSelectedIds(new Set());

    try {
      await saveTransactionsFiltersToSecureStore(isSignedIn ? userId : null, { filters: nextFilters, updatedAtMs: now });
    } catch (e) {
      console.warn('[Transactions] Failed to persist filters to SecureStore:', e);
    }

    if (!isSignedIn || !userId) return;
    if (resetFiltersOnReopen) return;
    if (!syncFiltersEnabled) return;

    try {
      await updateSettings({
        transactionsFiltersJson: JSON.stringify(nextFilters),
        transactionsFiltersUpdatedAtMs: now,
      });
    } catch (e) {
      console.warn('[Transactions] Failed to persist synced filters:', e);
    }
  }, [isSignedIn, userId, syncFiltersEnabled, resetFiltersOnReopen, updateSettings]);

  // Reset-on-reopen behavior (Transactions tab only).
  const lastAppStateRef = React.useRef<AppStateStatus>(AppState.currentState ?? 'active');
  useEffect(() => {
    const sub = AppState.addEventListener('change', (next) => {
      const prev = lastAppStateRef.current;
      lastAppStateRef.current = next;
      if (next !== 'active') return;
      if (prev === 'active') return;
      if (!resetFiltersOnReopen) return;

      persistFilters(DEFAULT_TRANSACTIONS_FILTERS);
    });
    return () => {
      sub.remove();
    };
  }, [resetFiltersOnReopen, persistFilters]);

  // Map to find trip expense info for a transaction
  const tripExpenseMap = useMemo(() => {
    const map = new Map<string, { tripId: string; tripName: string; tripEmoji: string; isGroup: boolean; paidByParticipantId?: string; splitType: string; computedSplits?: Record<string, number>; participants: any[] }>();
    trips.forEach(trip => {
      trip.expenses?.forEach(exp => {
        if (exp.transactionId) {
          map.set(exp.transactionId, {
            tripId: trip.id,
            tripName: trip.name,
            tripEmoji: trip.emoji,
            isGroup: trip.isGroup,
            paidByParticipantId: exp.paidByParticipantId,
            splitType: exp.splitType,
            computedSplits: exp.computedSplits,
            participants: trip.participants || []
          });
        }
      });
    });
    return map;
  }, [trips]);

  // Helper to calculate effective display info for personal budget
  const getEffectiveDisplayInfo = useCallback((tx: Transaction) => {
    // Income: always show full amount as income
    if (tx.type === 'income') {
      return { amount: Math.abs(tx.amountCents), isIncome: true, shouldHide: false };
    }

    // Transfers and adjustments: show full amount
    if (tx.systemType === 'transfer' || tx.systemType === 'adjustment') {
      return { amount: Math.abs(tx.amountCents), isIncome: false, shouldHide: false };
    }

    // Check if this is a trip expense
    const tripInfo = tripExpenseMap.get(tx.id);
    if (tripInfo?.isGroup) {
      // Local group trip expense rows are ledger-only; derived rows handle display.
      return { amount: 0, isIncome: false, shouldHide: true };
    }
    if (!tripInfo) {
      // Regular expense: show full amount
      return { amount: Math.abs(tx.amountCents), isIncome: false, shouldHide: false };
    }

    // Find current user in trip participants
    const currentUser = tripInfo.participants.find((p: any) => p.isCurrentUser);
    if (!currentUser) {
      return { amount: Math.abs(tx.amountCents), isIncome: false, shouldHide: false };
    }

    // Get computed splits (use stored or calculate)
    const splits = tripInfo.computedSplits || TripSplitCalculator.calculateSplits(
      Math.abs(tx.amountCents),
      tripInfo.splitType as any,
      tripInfo.participants,
      undefined
    );

    const totalAmount = Math.abs(tx.amountCents);
    const myShare = splits[currentUser.id] ?? 0;
    const iPaid = tripInfo.paidByParticipantId === currentUser.id;
    const payer = tripInfo.participants.find((p: any) => p.id === tripInfo.paidByParticipantId);
    const payerName = payer?.name || 'them';

    if (myShare <= 0) {
      if (iPaid) {
        // I paid but not included in split - effectively income (getting all money back)
        return {
          amount: totalAmount,
          isIncome: true,
          shouldHide: false,
          netInfo: { text: `You get back ${formatCents(totalAmount)}`, color: Colors.success }
        };
      } else {
        // Someone else paid and I'm not included - hide
        return { amount: 0, isIncome: false, shouldHide: true };
      }
    } else {
      // I have a share
      if (iPaid) {
        // I paid, so I get back (total - myShare)
        const netBack = totalAmount - myShare;
        if (netBack <= 0) {
          // No net change or I owe more (shouldn't happen normally)
          return {
            amount: myShare,
            isIncome: false,
            shouldHide: false,
            netInfo: { text: 'Settled', color: 'rgba(255, 255, 255, 0.4)' }
          };
        }
        return {
          amount: myShare,
          isIncome: false,
          shouldHide: false,
          netInfo: { text: `You get back ${formatCents(netBack)}`, color: Colors.success }
        };
      } else {
        // Someone else paid, I owe them my share
        return {
          amount: myShare,
          isIncome: false,
          shouldHide: false,
          netInfo: { text: `You owe ${payerName} ${formatCents(myShare)}`, color: Colors.accent }
        };
      }
    }
  }, [tripExpenseMap]);

  // Create category map for lookup
  const categoryMap = useMemo(() => {
    const map: Record<string, Category> = {};
    categories.forEach(c => map[c.id] = c);
    return map;
  }, [categories]);

  // State
  const [isSelecting, setIsSelecting] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [selectedMonthKey, setSelectedMonthKey] = useState<string | null>(null);

  const [sharedExpenseMeta, setSharedExpenseMeta] = useState<Record<string, { tripId: string; tripEmoji: string; categoryEmoji: string | null; categoryName: string | null; amountCents: number }>>({});
  const [sharedSettlementMeta, setSharedSettlementMeta] = useState<Record<string, { tripId: string; tripEmoji: string }>>({});
  const [localExpenseMeta, setLocalExpenseMeta] = useState<Record<string, { tripId: string; tripEmoji: string; categoryEmoji: string | null; categoryName: string | null; amountCents: number }>>({});
  const [localSettlementMeta, setLocalSettlementMeta] = useState<Record<string, { tripId: string; tripEmoji: string }>>({});

  // Data processing
  const resolveTripIdForTransaction = useCallback((tx: Transaction): string | null => {
    if (tx.systemType === 'trip_share' && tx.sourceTripExpenseId) {
      const meta = sharedExpenseMeta[tx.sourceTripExpenseId] ?? localExpenseMeta[tx.sourceTripExpenseId];
      return meta?.tripId ?? null;
    }
    if (tx.systemType === 'trip_settlement' && tx.sourceTripSettlementId) {
      const meta = sharedSettlementMeta[tx.sourceTripSettlementId] ?? localSettlementMeta[tx.sourceTripSettlementId];
      return meta?.tripId ?? null;
    }

    const tripInfo = tripExpenseMap.get(tx.id);
    return tripInfo?.tripId ?? null;
  }, [sharedExpenseMeta, localExpenseMeta, sharedSettlementMeta, localSettlementMeta, tripExpenseMap]);

  const categorySignatureToId = useMemo(() => {
    const map = new Map<string, string>();
    const byName = new Map<string, string>();
    for (const c of categories) {
      const name = (c?.name ?? '').trim();
      const emoji = (c?.emoji ?? '').trim();
      if (!name || !emoji) continue;
      const sig = `${emoji}::${name}`;
      if (!map.has(sig)) map.set(sig, c.id);

      const nameKey = name.toLowerCase();
      if (!byName.has(nameKey)) byName.set(nameKey, c.id);
    }
    return { bySig: map, byName };
  }, [categories]);

  const resolveEffectiveCategoryIdForTransaction = useCallback((tx: Transaction): string | null => {
    if (tx.categoryId) return tx.categoryId;

    if (tx.systemType === 'trip_share' && tx.sourceTripExpenseId) {
      const meta = sharedExpenseMeta[tx.sourceTripExpenseId] ?? localExpenseMeta[tx.sourceTripExpenseId];
      const emoji = (meta?.categoryEmoji ?? '').trim();
      const name = (meta?.categoryName ?? '').trim();
      if (emoji && name) {
        const sig = `${emoji}::${name}`;
        return categorySignatureToId.bySig.get(sig) ?? categorySignatureToId.byName.get(name.toLowerCase()) ?? null;
      }

      if (name) {
        return categorySignatureToId.byName.get(name.toLowerCase()) ?? null;
      }
    }

    return null;
  }, [sharedExpenseMeta, localExpenseMeta, categorySignatureToId]);

  const visibleTransactions = useMemo(() => {
    return transactions.filter((tx) => {
      // Base visibility rules (derived cashflow hidden, excluded shares hidden, etc.)
      if (!shouldRenderInTransactions(tx)) return false;
      const info = getEffectiveDisplayInfo(tx);
      if (info.shouldHide) return false;

      return shouldIncludeTransaction({
        tx,
        filters,
        resolveTripId: resolveTripIdForTransaction,
        resolveCategoryId: resolveEffectiveCategoryIdForTransaction,
      });
    });
  }, [transactions, filters, getEffectiveDisplayInfo, resolveTripIdForTransaction, resolveEffectiveCategoryIdForTransaction]);

  const baseVisibleTransactions = useMemo(() => {
    // Used to differentiate true empty state vs filtered-empty state.
    return transactions.filter((tx) => {
      if (!shouldRenderInTransactions(tx)) return false;
      const info = getEffectiveDisplayInfo(tx);
      return !info.shouldHide;
    });
  }, [transactions, getEffectiveDisplayInfo]);

  const showFilteredEmptyState = filtersActive && visibleTransactions.length === 0;
  const hasAnyBaseTransactions = baseVisibleTransactions.length > 0;

  const { monthSections, allMonths } = useMemo(() => {
    // Group by month
    const groups: Record<string, Transaction[]> = {};
    visibleTransactions.forEach(tx => {
      const date = new Date(tx.date);
      const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      if (!groups[key]) groups[key] = [];
      groups[key].push(tx);
    });

    // Create sections
    const sections: MonthSection[] = Object.keys(groups).sort().reverse().map(key => {
      const txs = groups[key].sort((a, b) => b.date - a.date);
      const date = parseISO(key + '-01');
      const title = format(date, 'MMMM yyyy');

      const totalCents = txs.reduce((sum, tx) => {
        // Use effective amount (user's share for trip expenses)
        const info = getEffectiveDisplayInfo(tx);
        if (info.shouldHide || info.isIncome || !shouldCountInMonthlySpentTotals(tx)) return sum;
        return sum + info.amount;
      }, 0);

      return { id: key, title, totalCents, data: txs };
    });

    // Month list for chips
    const months = sections.map(s => ({ id: s.id, title: s.title }));

    return { monthSections: sections, allMonths: months };
  }, [visibleTransactions, getEffectiveDisplayInfo]);

  const filteredSections = useMemo(() => {
    if (!selectedMonthKey) return monthSections;
    return monthSections.filter(s => s.id === selectedMonthKey);
  }, [monthSections, selectedMonthKey]);

  // If month selection is now invalid (e.g. filters changed), reset to All.
  useEffect(() => {
    if (!selectedMonthKey) return;
    if (allMonths.some((m) => m.id === selectedMonthKey)) return;
    setSelectedMonthKey(null);
  }, [selectedMonthKey, allMonths]);

  // Handlers
  const toggleSelectionMode = useCallback(() => {
    setIsSelecting(prev => {
      if (prev) setSelectedIds(new Set()); // Clear on cancel
      return !prev;
    });
    Haptics.selectionAsync();
  }, []);

  const toggleItemSelection = useCallback((id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    Haptics.selectionAsync();
  }, []);

  const handleDelete = useCallback(() => {
    showPopup({
      title: `Delete ${selectedIds.size} item(s)?`,
      message: 'This action cannot be undone.',
      buttons: [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              // Delete all selected transactions
              for (const id of selectedIds) {
                await Actions.deleteTransaction(id);
              }

              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
              setIsSelecting(false);
              setSelectedIds(new Set());
              refresh();
              refreshTrips();
            } catch (error) {
              console.error('Failed to delete transactions:', error);
              showPopup({
                title: 'Error',
                message: 'Failed to delete some items',
                buttons: [{ text: 'OK', style: 'default' }],
              });
            }
          }
        }
      ],
    });
  }, [selectedIds, refresh, refreshTrips, showPopup]);

  const handleMove = useCallback(() => {
    // TODO: Show move sheet
    Haptics.selectionAsync();
  }, []);

  const [editingTx, setEditingTx] = useState<Transaction | null>(null);
  const [tripShareTxId, setTripShareTxId] = useState<string | null>(null);
  const [tripShareEditTarget, setTripShareEditTarget] = useState<{ tripId: string; expenseId: string } | null>(null);
  const [showCategoryPicker, setShowCategoryPicker] = useState(false);

  const handleChangeCategory = useCallback(() => {
    Haptics.selectionAsync();
    setShowCategoryPicker(true);
  }, []);

  // Capability checks
  const canMove = selectedIds.size > 0;
  const canChangeCategory = selectedIds.size > 0;

  useEffect(() => {
    const expenseIds = transactions
      .filter((t) => t.systemType === 'trip_share' && t.sourceTripExpenseId)
      .map((t) => t.sourceTripExpenseId!)
      .filter(Boolean);

    const settlementIds = transactions
      .filter((t) => t.systemType === 'trip_settlement' && t.sourceTripSettlementId)
      .map((t) => t.sourceTripSettlementId!)
      .filter(Boolean);

    let cancelled = false;

    SharedTripRepository.getExpenseMetaByIds(expenseIds)
      .then((map) => {
        if (!cancelled) setSharedExpenseMeta(map);
      })
      .catch(() => {
        if (!cancelled) setSharedExpenseMeta({});
      });

    SharedTripRepository.getSettlementMetaByIds(settlementIds)
      .then((map: Record<string, { tripId: string; tripEmoji: string }>) => {
        if (!cancelled) setSharedSettlementMeta(map);
      })
      .catch(() => {
        if (!cancelled) setSharedSettlementMeta({});
      });

    TripExpenseRepository.getExpenseMetaByIds(expenseIds)
      .then((map) => {
        if (!cancelled) setLocalExpenseMeta(map);
      })
      .catch(() => {
        if (!cancelled) setLocalExpenseMeta({});
      });

    TripSettlementRepository.getSettlementMetaByIds(settlementIds)
      .then((map) => {
        if (!cancelled) setLocalSettlementMeta(map);
      })
      .catch(() => {
        if (!cancelled) setLocalSettlementMeta({});
      });

    return () => {
      cancelled = true;
    };
  }, [transactions]);

  const renderItem = useCallback(({ item }: { item: Transaction }) => {
    const category = item.categoryId ? categoryMap[item.categoryId] : null;
    const displayInfo = getEffectiveDisplayInfo(item);

    // Hide rows not intended for the Transactions tab (e.g. payer cashflow).
    if (!shouldRenderInTransactions(item)) return null;

    // Hide transactions not relevant to current user
    if (displayInfo.shouldHide) return null;

    const isIncome = displayInfo.isIncome;
    const isSelected = selectedIds.has(item.id);

    // Format: "7 January 2026"
    const dateStr = format(item.date, 'd MMMM yyyy');
    const iconColor = isIncome ? '#34C759' : '#FFFFFF';

    // Check if this is a local trip expense
    const tripInfo = tripExpenseMap.get(item.id);
    const sharedMeta = item.systemType === 'trip_share' && item.sourceTripExpenseId
      ? (sharedExpenseMeta[item.sourceTripExpenseId] ?? localExpenseMeta[item.sourceTripExpenseId])
      : undefined;

    const settlementMeta = item.systemType === 'trip_settlement' && item.sourceTripSettlementId
      ? (sharedSettlementMeta[item.sourceTripSettlementId] ?? localSettlementMeta[item.sourceTripSettlementId])
      : undefined;

    return (
      <TouchableOpacity
        onPress={() => {
          if (isSelecting) {
            // Derived rows are local-only views; skip bulk actions on them.
            if (!isSelectableInBulkMode(item)) {
              Haptics.selectionAsync();
              return;
            }
            toggleItemSelection(item.id);
            return;
          }

          Haptics.selectionAsync();

          if (item.systemType === 'trip_share') {
            setTripShareTxId(item.id);
            return;
          }

          setEditingTx(item);
        }}
        activeOpacity={0.7}
      >
        <View style={styles.rowContainer}>
          <View style={styles.rowContent}>
            {/* Selection Indicator */}
            {isSelecting && (
              <View style={styles.selectionIndicator}>
                <View style={[
                  styles.selectionRing,
                  isSelected && styles.selectionRingActive
                ]}>
                  {isSelected && <View style={styles.selectionDot} />}
                </View>
              </View>
            )}

            {/* Icon (Left, Raw Emoji/Icon) */}
            <View style={styles.iconContainer}>
              {item.systemType === 'transfer' ? (
                <Text style={{ fontSize: 24, color: '#FFFFFF' }}>⇅</Text>
              ) : item.systemType === 'adjustment' ? (
                <Text style={{ fontSize: 24, color: '#FFFFFF' }}>🛠</Text>
              ) : item.systemType === 'trip_share' ? (
                <Text style={{ fontSize: 24 }}>{sharedMeta?.categoryEmoji ?? '🧾'}</Text>
              ) : item.systemType === 'trip_settlement' ? (
                <Ionicons name="swap-horizontal" size={22} color="rgba(255,255,255,0.75)" />
              ) : isIncome ? (
                <Ionicons name="arrow-down-circle" size={24} color={iconColor} />
              ) : category ? (
                <Text style={{ fontSize: 24 }}>{category.emoji}</Text>
              ) : (
                <View style={styles.uncategorizedDot} />
              )}
            </View>

            {/* Text Content (Center) */}
            <View style={styles.textContainer}>
              {/* Amount as Main Title - show effective amount for trip expenses */}
              <Text style={[styles.amountTitle, isIncome && styles.incomeText]}>
                {isIncome ? '+' : ''}{formatCents(displayInfo.amount)}
                {item.systemType === 'trip_share' && sharedMeta?.amountCents ? (
                  (() => {
                    const fmt = formatTripShareAmountInline({
                      shareText: formatCents(displayInfo.amount),
                      totalText: formatCents(Math.abs(sharedMeta.amountCents)),
                    });
                    return (
                      <>
                        <Text style={styles.tripShareDot}>{fmt.dotText}</Text>
                        <Text style={styles.tripShareTotalInline}>{fmt.secondaryText}</Text>
                      </>
                    );
                  })()
                ) : null}
              </Text>
              {/* Date as Subtitle */}
              <Text style={styles.dateSubtitle}>
                {dateStr}{tripInfo ? ` · ${tripInfo.tripEmoji}` : (sharedMeta?.tripEmoji ? ` · ${sharedMeta.tripEmoji}` : (settlementMeta?.tripEmoji ? ` · ${settlementMeta.tripEmoji}` : ''))}
              </Text>
            </View>

            {/* Chevron (Right) */}
            {!isSelecting && (
              <Ionicons name="chevron-forward" size={16} color="rgba(255, 255, 255, 0.25)" />
            )}
          </View>

          {/* Separator Line */}
          <View style={styles.separator} />
        </View>
      </TouchableOpacity>
    );
  }, [isSelecting, selectedIds, toggleItemSelection, categoryMap, getEffectiveDisplayInfo, tripExpenseMap, sharedExpenseMeta]);

  // Render Header
  const renderSectionHeader = useCallback(({ section: { title, totalCents } }: { section: MonthSection }) => (
    <View style={styles.sectionHeader}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <View style={{ flex: 1 }} />
      <Text style={styles.sectionTotal}>{formatCents(totalCents)}</Text>
    </View>
  ), []);

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" />

      {/* Main Content */}
      <View style={[styles.content, { paddingTop: insets.top + 20 }]}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Transactions</Text>
          <View style={{ flex: 1 }} />
          <TouchableOpacity
            onPress={toggleSelectionMode}
            style={[
              styles.selectButton,
              isSelecting && styles.selectButtonActive
            ]}
          >
            <Text style={styles.selectButtonText}>
              {isSelecting ? "Cancel" : "Select"}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Month Chips */}
        {(allMonths.length > 0 || filtersActive) && (
          <View style={styles.chipsContainer}>
            <View style={styles.chipsRow}>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                style={{ flex: 1 }}
                contentContainerStyle={{ paddingLeft: 24, paddingRight: 12, gap: 10 }}
              >
                <MonthChip
                  title="All"
                  isSelected={selectedMonthKey === null}
                  onPress={() => { setSelectedMonthKey(null); Haptics.selectionAsync(); }}
                />
                {allMonths.map(m => (
                  <MonthChip
                    key={m.id}
                    title={m.title}
                    isSelected={selectedMonthKey === m.id}
                    onPress={() => { setSelectedMonthKey(m.id); Haptics.selectionAsync(); }}
                  />
                ))}
              </ScrollView>

              <TouchableOpacity
                onPress={() => {
                  Haptics.selectionAsync();
                  setShowFilters(true);
                }}
                disabled={isSelecting}
                activeOpacity={0.7}
                style={[styles.filterButton, { opacity: isSelecting ? 0.4 : 1 }]}
              >
                <Ionicons name="funnel" size={16} color="#FFFFFF" />
                {filtersActive ? <View style={styles.filterDot} /> : null}
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* List */}
        <SectionList
          sections={filteredSections}
          keyExtractor={(item) => item.id}
          onRefresh={handleRefresh}
          refreshing={isRefreshing}
          renderItem={renderItem}
          renderSectionHeader={renderSectionHeader}
          contentContainerStyle={{ paddingBottom: 100, paddingHorizontal: 24 }}
          stickySectionHeadersEnabled={false}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              {showFilteredEmptyState ? (
                <View style={styles.filteredEmptyIcon}>
                  <Ionicons name="funnel" size={18} color="rgba(255, 255, 255, 0.75)" />
                </View>
              ) : null}

              <Text style={styles.emptyTitle}>
                {!showFilteredEmptyState
                  ? 'No transactions yet'
                  : hasAnyBaseTransactions
                    ? 'No transactions match your filters'
                    : 'No transactions yet'}
              </Text>

              <Text style={styles.emptySubtitle}>
                {showFilteredEmptyState
                  ? (hasAnyBaseTransactions
                    ? 'Try changing or clearing your filters.'
                    : 'Filters are active. Clear filters or add a transaction.')
                  : `Add an amount on the calculator and tap the checkmark to save.${!isSignedIn ? ' Or sign in to restore your synced data.' : ''}`}
              </Text>

              {showFilteredEmptyState ? (
                <View style={styles.emptyActionsRow}>
                  <TouchableOpacity
                    style={styles.emptyActionButton}
                    onPress={() => {
                      Haptics.selectionAsync();
                      setShowFilters(true);
                    }}
                    activeOpacity={0.7}
                  >
                    <Ionicons name="funnel" size={14} color={Colors.accent} />
                    <Text style={styles.emptyActionText}>Edit filters</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.emptyActionButton}
                    onPress={() => {
                      Haptics.selectionAsync();
                      setSelectedMonthKey(null);
                      persistFilters(DEFAULT_TRANSACTIONS_FILTERS);
                    }}
                    activeOpacity={0.7}
                  >
                    <Ionicons name="close" size={14} color={Colors.accent} />
                    <Text style={styles.emptyActionText}>Clear</Text>
                  </TouchableOpacity>
                </View>
              ) : null}

              {!isSignedIn && !showFilteredEmptyState && (
                <TouchableOpacity
                  style={styles.signInCta}
                  onPress={() => {
                    Haptics.selectionAsync();
                    const settingsIndex = Tabs.findIndex((t) => t.key === 3);
                    if (settingsIndex >= 0) onSelectIndex(settingsIndex);
                  }}
                  activeOpacity={0.7}
                >
                  <Text style={styles.signInCtaText}>Sign in to restore synced data</Text>
                  <Ionicons name="chevron-forward" size={14} color={Colors.accent} />
                </TouchableOpacity>
              )}
            </View>
          }
        />
      </View>

      {/* Bottom Controls */}
      {isSelecting ? (
        <View style={[styles.bottomOverlay, { paddingBottom: 18 }]}>
          <SelectionActionsPill
            selectedCount={selectedIds.size}
            onDelete={handleDelete}
            onMove={handleMove}
            onChangeCategory={handleChangeCategory}
            canMove={canMove}
            canChangeCategory={canChangeCategory}
          />
        </View>
      ) : (
        <FloatingTabSwitcher
          selectedIndex={selectedIndex}
          onSelectIndex={onSelectIndex}
        />
      )}

      {/* Trip share detail (derived personal view) */}
      <Modal
        visible={tripShareTxId !== null}
        animationType="slide"
        presentationStyle="fullScreen"
        onRequestClose={() => setTripShareTxId(null)}
      >
        {tripShareTxId && (
          <CustomPopupProvider>
            <TransactionDetailScreen
              transactionId={tripShareTxId}
              readOnly
              onDismiss={() => setTripShareTxId(null)}
              onEditInTrip={(tripId, expenseId) => {
                setTripShareTxId(null);
                setTripShareEditTarget({ tripId, expenseId });
              }}
            />
          </CustomPopupProvider>
        )}
      </Modal>

      <Modal
        visible={tripShareEditTarget !== null}
        animationType="slide"
        presentationStyle="fullScreen"
        onRequestClose={() => setTripShareEditTarget(null)}
      >
        {tripShareEditTarget && (
          <CustomPopupProvider>
            <TransactionDetailScreen
              sharedTripExpense={{ tripId: tripShareEditTarget.tripId, expenseId: tripShareEditTarget.expenseId }}
              initialEditMode
              onDismiss={() => setTripShareEditTarget(null)}
            />
          </CustomPopupProvider>
        )}
      </Modal>

      <Modal
        visible={editingTx !== null}
        animationType="slide"
        presentationStyle="fullScreen"
        onRequestClose={() => setEditingTx(null)}
      >
        {editingTx && (
          <CustomPopupProvider>
            <TransactionDetailScreen
              transactionId={editingTx.id}
              onDismiss={() => setEditingTx(null)}
              onDelete={() => {
                setEditingTx(null);
                refresh();
              }}
            />
          </CustomPopupProvider>
        )}
      </Modal>


      {/* Bulk Category Picker Modal */}
      <Modal
        visible={showCategoryPicker}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowCategoryPicker(false)}
      >
        <View style={{ flex: 1, backgroundColor: '#1C1C1E', paddingTop: 20 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', padding: 16 }}>
            <TouchableOpacity onPress={() => setShowCategoryPicker(false)}>
              <Text style={{ color: Colors.accent, fontSize: 18, fontFamily: 'AvenirNextCondensed-Medium' }}>Cancel</Text>
            </TouchableOpacity>
            <Text style={{ color: '#FFF', fontSize: 18, fontFamily: 'AvenirNextCondensed-DemiBold' }}>Select Category</Text>
            <View style={{ width: 40 }} />
          </View>
          <ScrollView>
            {categories.map(cat => (
              <TouchableOpacity
                key={cat.id}
                style={{ flexDirection: 'row', padding: 16, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.05)', alignItems: 'center' }}
                onPress={async () => {
                  Haptics.selectionAsync();
                  // Update all selected
                  setIsSelecting(false); // Exit selection mode
                  setShowCategoryPicker(false);

                  const ids = Array.from(selectedIds);
                  setSelectedIds(new Set()); // Clear selection

                  try {
                    await Promise.all(ids.map(id => TransactionRepository.update(id, { categoryId: cat.id })));
                    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                    refresh();
                    refreshTrips();
                  } catch (e) {
                    showPopup({
                      title: 'Error',
                      message: 'Failed to update categories',
                      buttons: [{ text: 'OK', style: 'default' }],
                    });
                  }
                }}
              >
                <Text style={{ fontSize: 24, marginRight: 12 }}>{cat.emoji}</Text>
                <Text style={{ color: '#FFF', fontSize: 18, fontFamily: 'AvenirNextCondensed-Medium' }}>{cat.name}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      </Modal>

      <TransactionsFilterSheet
        visible={showFilters}
        initialFilters={filters}
        categories={categories}
        accounts={accounts}
        localTrips={trips}
        sharedTrips={sharedTrips}
        onCancel={() => setShowFilters(false)}
        onApply={(next) => {
          setShowFilters(false);
          persistFilters(next);
        }}
      />
    </View>
  );
}

// ============================================================================
// Styles
// ============================================================================

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
  content: {
    flex: 1,
  },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 24,
    marginBottom: 12,
  },
  headerTitle: {
    fontFamily: 'AvenirNextCondensed-Heavy',
    fontSize: 36,
    color: '#FFFFFF',
  },
  selectButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: 'rgba(255, 255, 255, 0.10)',
    borderRadius: 9999,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.15)',
  },
  selectButtonActive: {
    backgroundColor: 'rgba(255, 255, 255, 0.20)',
  },
  selectButtonText: {
    fontFamily: 'AvenirNextCondensed-DemiBold',
    fontSize: 18,
    color: 'rgba(255, 255, 255, 0.9)',
  },

  // Month Chips
  chipsContainer: {
    marginBottom: 12,
    height: 34, // Chip height + padding
  },
  chipsRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  monthChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 9999,
  },
  monthChipText: {
    fontFamily: 'AvenirNextCondensed-DemiBold',
    fontSize: 16,
    color: '#FFFFFF',
  },

  filterButton: {
    marginRight: 24,
    width: 34,
    height: 34,
    borderRadius: 9999,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
  },
  filterDot: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: Colors.accent,
  },

  // Section Header
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    marginTop: 8,
    marginBottom: 0,
  },
  sectionTitle: {
    fontFamily: 'AvenirNextCondensed-DemiBold',
    fontSize: 18,
    color: '#FFFFFF',
  },
  sectionTotal: {
    fontFamily: 'AvenirNextCondensed-DemiBold',
    fontSize: 16,
    color: 'rgba(255, 255, 255, 0.8)',
  },

  // Row
  rowContainer: {
    // No padding, manual separator
  },
  rowContent: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 52, // Compact height
    paddingVertical: 8,
  },
  separator: {
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.08)',
    marginLeft: 52, // Indent (40 width + 12 margin)
  },

  // Selection
  selectionIndicator: {
    width: 24,
    alignItems: 'center',
    marginRight: 10,
  },
  selectionRing: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.3)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  selectionRingActive: {
    borderColor: '#FF9500',
    backgroundColor: 'rgba(255, 149, 0, 0.2)',
  },
  selectionDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#FF9500',
  },

  // Icon
  iconContainer: {
    width: 40,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12, // Tighter spacing
  },
  uncategorizedDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.3)',
  },

  // Text
  textContainer: {
    flex: 1,
    justifyContent: 'center',
    gap: 1, // Tighter
  },
  amountTitle: {
    color: '#FFFFFF',
    fontSize: 19, // Compact size
    fontFamily: 'AvenirNextCondensed-DemiBold',
    marginBottom: 0,
  },
  tripShareTotalInline: {
    fontSize: 17,
    color: 'rgba(10, 132, 255, 0.55)',
    fontFamily: 'AvenirNextCondensed-Medium',
  },
  tripShareDot: {
    fontSize: 17,
    color: 'rgba(255,255,255,0.35)',
    fontFamily: 'AvenirNextCondensed-Medium',
  },
  incomeText: {
    color: '#34C759',
  },
  dateSubtitle: {
    color: 'rgba(255, 255, 255, 0.5)',
    fontSize: 14, // Compact size
    fontFamily: 'System',
  },

  // Empty State
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 92,
    gap: 10,
  },
  filteredEmptyIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
    marginBottom: 6,
  },
  emptyTitle: {
    fontFamily: 'AvenirNextCondensed-Heavy',
    fontSize: 26,
    color: '#FFFFFF',
    textAlign: 'center',
    maxWidth: 280,
    lineHeight: 32,
  },
  emptySubtitle: {
    fontSize: 13,
    color: 'rgba(255, 255, 255, 0.55)',
    textAlign: 'center',
    marginTop: 6,
    maxWidth: 280,
    lineHeight: 18,
  },
  emptyActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    flexWrap: 'wrap',
    gap: 10,
    marginTop: 10,
  },
  emptyActionButton: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 9999,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.15)',
  },
  emptyActionText: {
    fontFamily: 'AvenirNextCondensed-DemiBold',
    fontSize: 16,
    color: Colors.accent,
  },
  signInCta: {
    marginTop: 18,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 9999,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.15)',
  },
  signInCtaText: {
    fontFamily: 'AvenirNextCondensed-DemiBold',
    fontSize: 16,
    color: Colors.accent,
  },

  clearFiltersCta: {
    marginTop: 18,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 9999,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.15)',
  },
  clearFiltersCtaText: {
    fontFamily: 'AvenirNextCondensed-DemiBold',
    fontSize: 16,
    color: Colors.accent,
  },

  // Bottom Overlay
  bottomOverlay: {
    position: 'absolute',
    bottom: 40,
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 1000,
  },
  selectionPillContainer: {
    borderRadius: 9999,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.15)',
    backgroundColor: 'rgba(0, 0, 0, 0.55)', // Fallback if blur fails
  },
  selectionPillContent: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    width: 220,
  },
  countBadge: {
    height: 34,
    minWidth: 34,
    paddingHorizontal: 10,
    borderRadius: 9999,
    backgroundColor: 'rgba(255, 255, 255, 0.10)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.15)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  countText: {
    fontFamily: 'AvenirNextCondensed-DemiBold',
    fontSize: 18,
    color: '#FFFFFF',
  },
  actionButton: {
    width: 34,
    height: 34,
    borderRadius: 9999,
    backgroundColor: 'rgba(255, 255, 255, 0.10)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.15)',
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 14,
  },
});
