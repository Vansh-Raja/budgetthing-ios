/**
 * TripDetailScreen - Detailed view of a trip
 * 
 * Pixel-perfect port of TripDetailView.swift
 */

import React, { useState, useMemo, useRef, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, StatusBar, Alert, Modal } from 'react-native';
import PagerView from 'react-native-pager-view';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';

import { Colors } from '../constants/theme';
import { Trip } from '../lib/logic/types';
import { TripSummaryCalculator } from '../lib/logic/tripSummaryCalculator';
import { TripHeaderCard } from '../components/trip/TripHeaderCard';
import { ExpensesTab } from '../components/trip/ExpensesTab';
import { BalancesTab } from '../components/trip/BalancesTab';
import { SettleUpTab } from '../components/trip/SettleUpTab';
import { AddExpenseScreen } from './AddExpenseScreen';
import { RecordSettlementScreen } from './RecordSettlementScreen';

import { EditTripScreen } from './EditTripScreen';
import { TripRepository } from '../lib/db/repositories';
import { TransactionDetailScreen } from './TransactionDetailScreen';

interface TripDetailScreenProps {
  trip: Trip;
  onDismiss: () => void;
  onTripUpdate?: () => void;
}

type TabType = 'expenses' | 'balances' | 'settleUp';

const TABS: { key: TabType; label: string; icon: any }[] = [
  { key: 'expenses', label: 'Expenses', icon: 'list-outline' },
  { key: 'balances', label: 'Balances', icon: 'pie-chart-outline' },
  { key: 'settleUp', label: 'Settle Up', icon: 'checkmark-circle-outline' },
];

export function TripDetailScreen({ trip, onDismiss, onTripUpdate }: TripDetailScreenProps) {
  const insets = useSafeAreaInsets();
  const pagerRef = useRef<PagerView>(null);

  // State
  const [selectedTab, setSelectedTab] = useState<TabType>('expenses');
  const [showAddExpense, setShowAddExpense] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [selectedTransactionId, setSelectedTransactionId] = useState<string | null>(null);

  // Settle Up Modal State
  const [settlementModal, setSettlementModal] = useState<{
    visible: boolean;
    payerId: string;
    receiverId: string;
    amount: number;
  }>({ visible: false, payerId: '', receiverId: '', amount: 0 });

  // Logic
  const summary = useMemo(() => {
    return TripSummaryCalculator.calculate(trip, trip.expenses ?? []);
  }, [trip]);

  const availableTabs = useMemo(() => {
    return trip.isGroup ? TABS : [TABS[0]];
  }, [trip.isGroup]);

  // Handlers
  const handleTabPress = (tab: TabType, index: number) => {
    Haptics.selectionAsync();
    setSelectedTab(tab);
    pagerRef.current?.setPage(index);
  };

  const handlePageSelected = (e: { nativeEvent: { position: number } }) => {
    const index = e.nativeEvent.position;
    if (index >= 0 && index < availableTabs.length) {
      setSelectedTab(availableTabs[index].key);
    }
  };

  const handleMenu = () => {
    Haptics.selectionAsync();
    Alert.alert(
      "Trip Options",
      undefined,
      [
        {
          text: "Edit Trip",
          onPress: () => {
            setEditMode(true);
          }
        },
        {
          text: trip.isArchived ? "Unarchive" : "Archive",
          onPress: async () => {
            try {
              await TripRepository.update(trip.id, { isArchived: !trip.isArchived });
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
              if (onTripUpdate) onTripUpdate();
            } catch (e) {
              Alert.alert("Error", "Failed to update trip");
            }
          }
        },
        {
          text: "Delete Trip",
          style: "destructive",
          onPress: () => {
            Alert.alert(
              "Delete Trip?",
              "This cannot be undone. All expenses will be deleted.",
              [
                { text: "Cancel", style: "cancel" },
                {
                  text: "Delete",
                  style: "destructive",
                  onPress: async () => {
                    try {
                      await TripRepository.delete(trip.id);
                      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                      onDismiss(); // Close detail
                      if (onTripUpdate) onTripUpdate();
                    } catch (e) {
                      Alert.alert("Error", "Failed to delete trip");
                    }
                  }
                }
              ]
            );
          }
        },
        { text: "Cancel", style: "cancel" }
      ]
    );
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" />

      {/* Navigation Bar */}
      <View style={[styles.navBar, { paddingTop: insets.top }]}>
        <TouchableOpacity onPress={onDismiss} style={styles.navButton}>
          <Ionicons name="chevron-back" size={24} color="#FFFFFF" />
        </TouchableOpacity>

        <View style={styles.titleContainer}>
          <Text style={styles.titleEmoji}>{trip.emoji}</Text>
          <Text style={styles.titleText} numberOfLines={1}>{trip.name}</Text>
        </View>

        <TouchableOpacity onPress={handleMenu} style={styles.navButton}>
          <Ionicons name="ellipsis-horizontal-circle" size={24} color="#FFFFFF" />
        </TouchableOpacity>
      </View>

      <View style={styles.content}>
        {/* Header Card */}
        <View style={styles.headerContainer}>
          <TripHeaderCard trip={trip} summary={summary} />
        </View>

        {/* Tab Pills */}
        {trip.isGroup && (
          <View style={styles.tabsContainer}>
            {availableTabs.map((tab, index) => (
              <TouchableOpacity
                key={tab.key}
                onPress={() => handleTabPress(tab.key, index)}
                style={[
                  styles.tabPill,
                  selectedTab === tab.key && styles.tabPillActive
                ]}
                activeOpacity={0.7}
              >
                <Ionicons
                  name={tab.icon}
                  size={12}
                  color={selectedTab === tab.key ? '#FFFFFF' : 'rgba(255, 255, 255, 0.5)'}
                />
                <Text style={[
                  styles.tabText,
                  selectedTab === tab.key && styles.tabTextActive
                ]}>
                  {tab.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {/* Pager */}
        <PagerView
          ref={pagerRef}
          style={styles.pager}
          initialPage={0}
          onPageSelected={handlePageSelected}
        >
          {availableTabs.map(tab => (
            <View key={tab.key} style={styles.page}>
              {tab.key === 'expenses' && (
                <ExpensesTab
                  trip={trip}
                  onSelectExpense={(expense) => {
                    if (expense.transactionId) {
                      setSelectedTransactionId(expense.transactionId);
                    }
                  }}
                />
              )}

              {tab.key === 'balances' && (
                <BalancesTab
                  trip={trip}
                />
              )}

              {tab.key === 'settleUp' && (
                <SettleUpTab
                  trip={trip}
                  onRecordSettlement={(settlement) => {
                    setSettlementModal({
                      visible: true,
                      payerId: settlement?.fromParticipant.id ?? '',
                      receiverId: settlement?.toParticipant.id ?? '',
                      amount: settlement?.amountCents ?? 0
                    });
                  }}
                />
              )}
            </View>
          ))}
        </PagerView>
      </View>

      {/* Add Expense Modal */}
      <Modal
        visible={showAddExpense}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowAddExpense(false)}
      >
        <AddExpenseScreen
          tripId={trip.id}
          onDismiss={() => {
            setShowAddExpense(false);
            if (onTripUpdate) onTripUpdate();
          }}
        />
      </Modal>

      {/* Edit Trip Modal */}
      <Modal
        visible={editMode}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setEditMode(false)}
      >
        <EditTripScreen
          trip={trip}
          onDismiss={() => setEditMode(false)}
          onSave={() => {
            if (onTripUpdate) onTripUpdate();
          }}
        />
      </Modal>

      {/* Record Settlement Modal */}
      <Modal
        visible={settlementModal.visible}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setSettlementModal(prev => ({ ...prev, visible: false }))}
      >
        {settlementModal.visible && (
          <RecordSettlementScreen
            trip={trip}
            participants={trip.participants || []}
            initialPayerId={settlementModal.payerId}
            initialReceiverId={settlementModal.receiverId}
            initialAmountCents={settlementModal.amount}
            onDismiss={() => setSettlementModal(prev => ({ ...prev, visible: false }))}
            onRecorded={() => {
              if (onTripUpdate) onTripUpdate();
            }}
          />
        )}
      </Modal>

      {/* Transaction Detail Modal */}
      <Modal
        visible={!!selectedTransactionId}
        animationType="slide"
        presentationStyle="fullScreen"
        onRequestClose={() => setSelectedTransactionId(null)}
      >
        {selectedTransactionId && (
          <TransactionDetailScreen
            transactionId={selectedTransactionId}
            onDismiss={() => setSelectedTransactionId(null)}
            onUpdate={() => {
              if (onTripUpdate) onTripUpdate();
            }}
          />
        )}
      </Modal>

    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },

  // NavBar
  navBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 12,
    backgroundColor: '#000000',
    zIndex: 10,
  },
  navButton: {
    padding: 8,
  },
  titleContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  titleEmoji: {
    fontSize: 18,
  },
  titleText: {
    fontFamily: 'AvenirNextCondensed-Heavy',
    fontSize: 20,
    color: '#FFFFFF',
  },

  // Content
  content: {
    flex: 1,
  },
  headerContainer: {
    paddingHorizontal: 20,
    paddingTop: 8,
    marginBottom: 12,
  },

  // Tabs
  tabsContainer: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    marginBottom: 12,
    gap: 8,
  },
  tabPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderRadius: 9999,
  },
  tabPillActive: {
    backgroundColor: Colors.accent,
  },
  tabText: {
    fontFamily: 'AvenirNextCondensed-DemiBold',
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.5)',
  },
  tabTextActive: {
    color: '#FFFFFF',
  },

  // Pager
  pager: {
    flex: 1,
  },
  page: {
    flex: 1,
  },

  // FAB
  fab: {
    position: 'absolute',
    bottom: 32,
    right: 24,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: Colors.accent,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 8,
  },
});
