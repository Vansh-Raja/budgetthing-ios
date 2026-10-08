/**
 * Main App Entry - Custom pager-based navigation
 * 
 * Uses react-native-pager-view for swipeable tabs, matching the SwiftUI app.
 */

import React, { useRef, useState, useCallback, useEffect } from 'react';
import { View, StyleSheet, StatusBar, Platform } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Pager as PagerView, type PagerHandle } from '@/components/ui/Pager';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { CalculatorScreen } from '../CalculatorScreen';
import { TransactionsScreen } from '../TransactionsScreen';
import { AccountsScreen } from '../AccountsScreen';
import { TripsScreen } from '../TripsScreen';
import { SettingsScreen } from '../SettingsScreen';
import { Colors, Tabs } from '../../constants/theme';

export default function MainTabsScreen() {
  const pagerRef = useRef<PagerHandle>(null);
  const params = useLocalSearchParams<{ tab?: string }>();
  const router = useRouter();
  const initialIndex = clampTabIndex(params.tab);
  const [selectedIndex, setSelectedIndex] = useState(initialIndex);

  // Web: keep the selected tab in the URL so reload/back/deep links land on the same tab.
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const current = clampTabIndex(params.tab);
    if (current !== selectedIndex) router.setParams({ tab: String(selectedIndex) });
  }, [selectedIndex, params.tab, router]);

  // Web: respond to browser back/forward changing ?tab=.
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const next = clampTabIndex(params.tab);
    if (next !== selectedIndex) {
      setSelectedIndex(next);
      pagerRef.current?.setPage(next);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.tab]);
  const [tripsAddRequestId, setTripsAddRequestId] = useState(0);
  const insets = useSafeAreaInsets();

  const handleSelectIndex = useCallback((index: number) => {
    setSelectedIndex(index);
    pagerRef.current?.setPage(index);
  }, []);

  const handlePageSelected = useCallback((e: { nativeEvent: { position: number } }) => {
    setSelectedIndex(e.nativeEvent.position);
  }, []);

  const handleRequestAddTrip = useCallback(() => {
    const tripsIndex = Tabs.findIndex((tab) => tab.key === 4);
    if (tripsIndex < 0) return;

    handleSelectIndex(tripsIndex);

    // Ensure the pager updates before opening the add sheet.
    setTimeout(() => {
      setTripsAddRequestId((id) => id + 1);
    }, 0);
  }, [handleSelectIndex]);

  // Render screen based on tab key (not index, since order is weird)
  const renderScreen = (tabKey: number) => {
    switch (tabKey) {
      case 0: return <CalculatorScreen onRequestAddTrip={handleRequestAddTrip} />;
      case 1: return <TransactionsScreen selectedIndex={selectedIndex} onSelectIndex={handleSelectIndex} />;
      case 2: return <AccountsScreen selectedIndex={selectedIndex} onSelectIndex={handleSelectIndex} />;
      case 4: return <TripsScreen selectedIndex={selectedIndex} onSelectIndex={handleSelectIndex} addTripRequestId={tripsAddRequestId} />;
      case 3: return <SettingsScreen selectedIndex={selectedIndex} onSelectIndex={handleSelectIndex} />;
      default: return <CalculatorScreen />;
    }
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={Colors.background} />
      
      <PagerView
        ref={pagerRef}
        style={styles.pager}
        initialPage={initialIndex}
        onPageSelected={handlePageSelected}
        overdrag={true}
      >
        {Tabs.map((tab, index) => (
          <View key={tab.key} style={styles.page} collapsable={false}>
            {renderScreen(tab.key)}
          </View>
        ))}
      </PagerView>
    </View>
  );
}

function clampTabIndex(raw: string | string[] | undefined): number {
  const value = Array.isArray(raw) ? raw[0] : raw;
  const n = Number.parseInt(value ?? '', 10);
  if (!Number.isFinite(n) || n < 0 || n >= Tabs.length) return 0;
  return n;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  pager: {
    flex: 1,
  },
  page: {
    flex: 1,
  },
});
