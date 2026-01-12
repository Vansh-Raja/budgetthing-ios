/**
 * Main App Entry - Custom pager-based navigation
 * 
 * Uses react-native-pager-view for swipeable tabs, matching the SwiftUI app.
 */

import React, { useRef, useState, useCallback } from 'react';
import { View, StyleSheet, StatusBar } from 'react-native';
import PagerView from 'react-native-pager-view';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { CalculatorScreen } from '../../screens/CalculatorScreen';
import { TransactionsScreen } from '../../screens/TransactionsScreen';
import { AccountsScreen } from '../../screens/AccountsScreen';
import { TripsScreen } from '../../screens/TripsScreen';
import { SettingsScreen } from '../../screens/SettingsScreen';
import { Colors, Tabs } from '../../constants/theme';

export default function MainTabsScreen() {
  const pagerRef = useRef<PagerView>(null);
  const [selectedIndex, setSelectedIndex] = useState(0);
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
        initialPage={0}
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
