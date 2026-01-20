import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, StyleSheet, TouchableOpacity, StatusBar, Alert, Modal } from 'react-native';
import { Text } from '@/components/ui/LockedText';
import PagerView from 'react-native-pager-view';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useAuth } from '@clerk/clerk-expo';
import { useMutation, useQuery } from 'convex/react';
import { api } from '../convex/_generated/api';

import { Colors } from '../constants/theme';
import type { Trip } from '../lib/logic/types';
import { TripSummaryCalculator } from '../lib/logic/tripSummaryCalculator';
import { TripHeaderCard } from '../components/trip/TripHeaderCard';
import { ExpensesTab } from '../components/trip/ExpensesTab';
import { BalancesTab } from '../components/trip/BalancesTab';
import { SettleUpTab } from '../components/trip/SettleUpTab';
import { SharedTripRepository } from '../lib/db/sharedTripRepositories';
import { RecordSharedSettlementScreen } from './RecordSharedSettlementScreen';
import { EditSharedTripScreen } from './EditSharedTripScreen';
import { SharedTripMembersScreen } from './SharedTripMembersScreen';
import { TransactionDetailScreen } from './TransactionDetailScreen';
import { Events, GlobalEvents } from '../lib/events';
import { useSyncStatus } from '../lib/sync/SyncProvider';

interface SharedTripDetailScreenProps {
  tripId: string;
  onDismiss: () => void;
}

type TabType = 'expenses' | 'balances' | 'settleUp';

const TABS: { key: TabType; label: string; icon: any }[] = [
  { key: 'expenses', label: 'Expenses', icon: 'list-outline' },
  { key: 'balances', label: 'Balances', icon: 'pie-chart-outline' },
  { key: 'settleUp', label: 'Settle Up', icon: 'checkmark-circle-outline' },
];

export function SharedTripDetailScreen({ tripId, onDismiss }: SharedTripDetailScreenProps) {
  const insets = useSafeAreaInsets();
  const pagerRef = useRef<PagerView>(null);
  const { userId } = useAuth();
  const { syncNow } = useSyncStatus();

  const deleteTripMutation = useMutation(api.sharedTrips.deleteTrip);
  const rotateInviteMutation = useMutation(api.sharedTripInvites.rotate);
  const activeInvite = useQuery(api.sharedTripInvites.getActiveForTrip, userId ? { tripId } : "skip");

  const [trip, setTrip] = useState<Trip | null>(null);
  const [selectedTab, setSelectedTab] = useState<TabType>('expenses');
  const [showEditTrip, setShowEditTrip] = useState(false);
  const [showMembers, setShowMembers] = useState(false);
  const [selectedExpenseId, setSelectedExpenseId] = useState<string | null>(null);
  const [selectedExpenseEditMode, setSelectedExpenseEditMode] = useState(false);

  const [settlementModal, setSettlementModal] = useState<{
    visible: boolean;
    payerId: string;
    receiverId: string;
    amountCents: number;
  }>({ visible: false, payerId: '', receiverId: '', amountCents: 0 });

  const refresh = useCallback(async () => {
    if (!userId) return;
    const t = await SharedTripRepository.getHydratedTripForUser(userId, tripId);
    setTrip(t);
  }, [tripId, userId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    const unsub = GlobalEvents.on(Events.tripsChanged, refresh);
    return () => unsub();
  }, [refresh]);

  const summary = useMemo(() => {
    if (!trip) return null;
    return TripSummaryCalculator.calculate(trip, trip.expenses ?? []);
  }, [trip]);

  const handleTabPress = (tab: TabType, index: number) => {
    Haptics.selectionAsync();
    setSelectedTab(tab);
    pagerRef.current?.setPage(index);
  };

  const handlePageSelected = (e: { nativeEvent: { position: number } }) => {
    const index = e.nativeEvent.position;
    if (index >= 0 && index < TABS.length) {
      setSelectedTab(TABS[index].key);
    }
  };

  const handleMenu = useCallback(() => {
    Haptics.selectionAsync();

    const code = activeInvite?.code;

    const actions: Array<any> = [];

    if (code) {
      actions.push({
        text: 'Show Join Code',
        onPress: () => {
          Alert.alert('Join Code', code);
        },
      });
    }

    actions.push({
      text: 'Members',
      onPress: () => {
        setShowMembers(true);
      },
    });

    actions.push({
      text: 'Edit Trip',
      onPress: () => {
        setShowEditTrip(true);
      },
    });

    actions.push({
      text: code ? 'Regenerate Join Code' : 'Generate Join Code',
      onPress: async () => {
        try {
           const next = await rotateInviteMutation({ tripId });
           const newCode = next?.code;
           Alert.alert('Join Code', String(newCode));
        } catch (e: any) {
          Alert.alert('Error', e?.message ?? 'Failed to generate join code');
        }
      },
    });

    actions.push({
      text: 'Delete Trip',
      style: 'destructive',
      onPress: () => {
        Alert.alert(
          'Delete Trip?',
          'This deletes the trip for everyone.',
          [
            { text: 'Cancel', style: 'cancel' },
            {
              text: 'Delete',
              style: 'destructive',
              onPress: async () => {
                try {
                  await deleteTripMutation({ tripId });
                  await syncNow('delete_shared_trip');
                  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                  onDismiss();
                } catch (e: any) {
                  Alert.alert('Error', e?.message ?? 'Failed to delete trip');
                }
              },
            },
          ]
        );
      },
    });

    actions.push({ text: 'Cancel', style: 'cancel' });

    Alert.alert('Trip Options', undefined, actions);
  }, [activeInvite, deleteTripMutation, onDismiss, rotateInviteMutation, syncNow, tripId]);

  if (!trip || !summary) {
    return (
      <View style={styles.container}>
        <StatusBar barStyle="light-content" />
        <View style={[styles.navBar, { paddingTop: insets.top }]}>
          <TouchableOpacity onPress={onDismiss} style={styles.navButton}>
            <Ionicons name="chevron-back" size={24} color="#FFFFFF" />
          </TouchableOpacity>
          <View style={styles.titleContainer}>
            <Text style={styles.titleEmoji}>✈️</Text>
            <Text style={styles.titleText}>Loading…</Text>
          </View>
          <View style={styles.navButton} />
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" />

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
        <View style={styles.headerContainer}>
          <TripHeaderCard trip={trip} summary={summary} currencyCode="INR" />
        </View>

        <View style={styles.tabsContainer}>
          {TABS.map((tab, index) => (
            <TouchableOpacity
              key={tab.key}
              onPress={() => handleTabPress(tab.key, index)}
              style={[styles.tabPill, selectedTab === tab.key && styles.tabPillActive]}
              activeOpacity={0.7}
            >
              <Ionicons
                name={tab.icon}
                size={12}
                color={selectedTab === tab.key ? '#FFFFFF' : 'rgba(255, 255, 255, 0.5)'}
              />
              <Text style={[styles.tabText, selectedTab === tab.key && styles.tabTextActive]}>
                {tab.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <PagerView
          ref={pagerRef}
          style={styles.pager}
          initialPage={0}
          onPageSelected={handlePageSelected}
        >
          <View key="expenses" style={styles.page}>
            <ExpensesTab
              trip={trip}
              currencyCode="INR"
              onSelectExpense={(expense) => {
                setSelectedExpenseId(expense.id);
                setSelectedExpenseEditMode(false);
              }}
            />
          </View>
          <View key="balances" style={styles.page}>
            <BalancesTab trip={trip} currencyCode="INR" />
          </View>
          <View key="settleUp" style={styles.page}>
            <SettleUpTab
              trip={trip}
              currencyCode="INR"
              onRecordSettlement={(settlement) => {
                const payerId = settlement?.fromParticipant.id ?? '';
                const receiverId = settlement?.toParticipant.id ?? '';
                const amountCents = settlement?.amountCents ?? 0;

                setSettlementModal({
                  visible: true,
                  payerId,
                  receiverId,
                  amountCents,
                });
              }}
            />
          </View>
        </PagerView>
      </View>

      <Modal
        visible={showMembers}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowMembers(false)}
      >
        <SharedTripMembersScreen
          trip={trip}
          participants={trip.participants ?? []}
          onDismiss={() => setShowMembers(false)}
          onChanged={() => {
            refresh();
          }}
        />
      </Modal>

      <Modal
        visible={showEditTrip}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowEditTrip(false)}
      >
        <EditSharedTripScreen
          trip={trip}
          onDismiss={() => setShowEditTrip(false)}
          onSaved={() => {
            refresh();
          }}
        />
      </Modal>

      <Modal
        visible={selectedExpenseId !== null}
        animationType="slide"
        presentationStyle="fullScreen"
        onRequestClose={() => setSelectedExpenseId(null)}
      >
        {selectedExpenseId && (
          <TransactionDetailScreen
            sharedTripExpense={{ tripId: trip.id, expenseId: selectedExpenseId }}
            initialEditMode={selectedExpenseEditMode}
            onDismiss={() => {
              setSelectedExpenseId(null);
              setSelectedExpenseEditMode(false);
              refresh();
            }}
          />
        )}
      </Modal>

      <Modal
        visible={settlementModal.visible}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setSettlementModal((s) => ({ ...s, visible: false }))}
      >
        <RecordSharedSettlementScreen
          trip={trip}
          participants={trip.participants ?? []}
          initialPayerId={settlementModal.payerId}
          initialReceiverId={settlementModal.receiverId}
          initialAmountCents={settlementModal.amountCents}
          onDismiss={() => setSettlementModal((s) => ({ ...s, visible: false }))}
          onRecorded={() => {
            refresh();
          }}
        />
      </Modal>

    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
  navBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingBottom: 8,
  },
  navButton: {
    width: 44,
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },
  titleContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 8,
  },
  titleEmoji: {
    fontSize: 18,
  },
  titleText: {
    fontFamily: 'AvenirNextCondensed-Heavy',
    fontSize: 20,
    color: '#FFFFFF',
    flex: 1,
  },
  content: {
    flex: 1,
  },
  headerContainer: {
    paddingHorizontal: 20,
    paddingTop: 8,
  },
  tabsContainer: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 20,
    paddingTop: 14,
    paddingBottom: 10,
  },
  tabPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
  },
  tabPillActive: {
    backgroundColor: Colors.accent,
  },
  tabText: {
    fontFamily: 'AvenirNextCondensed-DemiBold',
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.6)',
  },
  tabTextActive: {
    color: '#FFFFFF',
  },
  pager: {
    flex: 1,
  },
  page: {
    flex: 1,
  },
});
