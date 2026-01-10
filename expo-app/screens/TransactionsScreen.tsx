/**
 * TransactionsScreen - List of all transactions
 * 
 * Pixel-perfect port of TransactionsListView.swift
 */

import React, { useState, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  SectionList,
  StatusBar,
  ScrollView,
  Alert,
  Platform,
  Modal,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BlurView } from 'expo-blur';
import * as Haptics from 'expo-haptics';
import { format, parseISO } from 'date-fns';

import { Colors, Sizes, BorderRadius } from '../constants/theme';
import { formatCents } from '../lib/logic/currencyUtils';
import { Transaction, Category, Account } from '../lib/logic/types';
import { FloatingTabSwitcher } from '../components/ui/FloatingTabSwitcher';
import { useTransactions, useCategories } from '../lib/hooks/useData';
import { Actions } from '../lib/logic/actions';
import { TransactionRepository } from '../lib/db/repositories';
import { TransactionDetailScreen } from './TransactionDetailScreen';
import { useTrips } from '../lib/hooks/useTrips';
import { TripSplitCalculator } from '../lib/logic/tripSplitCalculator';

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
  const { trips, refresh: refreshTrips } = useTrips();

  // Map to find trip expense info for a transaction
  const tripExpenseMap = useMemo(() => {
    const map = new Map<string, { tripId: string; tripName: string; tripEmoji: string; paidByParticipantId?: string; splitType: string; computedSplits?: Record<string, number>; participants: any[] }>();
    trips.forEach(trip => {
      trip.expenses?.forEach(exp => {
        if (exp.transactionId) {
          map.set(exp.transactionId, {
            tripId: trip.id,
            tripName: trip.name,
            tripEmoji: trip.emoji,
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

  // Data processing
  const { monthSections, allMonths } = useMemo(() => {
    // Group by month
    const groups: Record<string, Transaction[]> = {};
    transactions.forEach(tx => {
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
        if (info.shouldHide || info.isIncome || tx.systemType === 'transfer') return sum;
        return sum + info.amount;
      }, 0);

      return { id: key, title, totalCents, data: txs };
    });

    // Month list for chips
    const months = sections.map(s => ({ id: s.id, title: s.title }));

    return { monthSections: sections, allMonths: months };
  }, [transactions]);

  const filteredSections = useMemo(() => {
    if (!selectedMonthKey) return monthSections;
    return monthSections.filter(s => s.id === selectedMonthKey);
  }, [monthSections, selectedMonthKey]);

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
    Alert.alert(
      `Delete ${selectedIds.size} item(s)?`,
      "This action cannot be undone.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
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
              console.error("Failed to delete transactions:", error);
              Alert.alert("Error", "Failed to delete some items");
            }
          }
        }
      ]
    );
  }, [selectedIds, refresh]);

  const handleMove = useCallback(() => {
    // TODO: Show move sheet
    Haptics.selectionAsync();
  }, []);

  const [editingTx, setEditingTx] = useState<Transaction | null>(null);
  const [showCategoryPicker, setShowCategoryPicker] = useState(false);

  const handleChangeCategory = useCallback(() => {
    Haptics.selectionAsync();
    setShowCategoryPicker(true);
  }, []);

  // Capability checks
  const canMove = selectedIds.size > 0; // Simplified for mock
  const canChangeCategory = selectedIds.size > 0; // Simplified for mock

  const renderItem = useCallback(({ item }: { item: Transaction }) => {
    const category = item.categoryId ? categoryMap[item.categoryId] : null;
    const displayInfo = getEffectiveDisplayInfo(item);

    // Hide transactions not relevant to current user
    if (displayInfo.shouldHide) return null;

    const isIncome = displayInfo.isIncome;
    const isSelected = selectedIds.has(item.id);

    // Format: "7 January 2026"
    const dateStr = format(item.date, 'd MMMM yyyy');
    const iconColor = isIncome ? '#34C759' : '#FFFFFF';

    // Check if this is a trip expense
    const tripInfo = tripExpenseMap.get(item.id);

    return (
      <TouchableOpacity
        onPress={() => {
          if (isSelecting) {
            toggleItemSelection(item.id);
          } else {
            Haptics.selectionAsync();
            setEditingTx(item);
          }
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
              </Text>
              {/* Date as Subtitle */}
              <Text style={styles.dateSubtitle}>
                {dateStr}{tripInfo ? ` · ${tripInfo.tripEmoji}` : ''}
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
  }, [isSelecting, selectedIds, toggleItemSelection, categoryMap, getEffectiveDisplayInfo, tripExpenseMap]);

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
        {allMonths.length > 0 && (
          <View style={styles.chipsContainer}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 24, gap: 10 }}>
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
          </View>
        )}

        {/* List */}
        <SectionList
          sections={filteredSections}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          renderSectionHeader={renderSectionHeader}
          contentContainerStyle={{ paddingBottom: 100, paddingHorizontal: 24 }}
          stickySectionHeadersEnabled={false}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Text style={styles.emptyTitle}>No transactions yet</Text>
              <Text style={styles.emptySubtitle}>
                Add an amount on the calculator and tap the checkmark to save.
              </Text>
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

      {/* Edit Modal (Detail View) */}
      <Modal
        visible={!!editingTx}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setEditingTx(null)}
      >
        {editingTx && (
          <TransactionDetailScreen
            transactionId={editingTx.id}
            onDismiss={() => setEditingTx(null)}
            onUpdate={() => { refresh(); refreshTrips(); }}
            onDelete={() => {
              setEditingTx(null);
              refresh();
              refreshTrips();
            }}
          />
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
                    Alert.alert("Error", "Failed to update categories");
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
    paddingTop: 100,
    gap: 12,
  },
  emptyTitle: {
    fontFamily: 'AvenirNextCondensed-Heavy',
    fontSize: 28,
    color: '#FFFFFF',
  },
  emptySubtitle: {
    fontSize: 16,
    color: 'rgba(255, 255, 255, 0.7)',
    textAlign: 'center',
    maxWidth: 240,
    lineHeight: 22,
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
