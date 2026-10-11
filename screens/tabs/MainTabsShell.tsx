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
import { DesktopSidebar } from '../../components/web/DesktopSidebar';
import { useIsDesktop } from '../../lib/web/useIsDesktop';

export default function MainTabsScreen() {
  const pagerRef = useRef<PagerHandle>(null);
  const params = useLocalSearchParams<{ tab?: string }>();
  const router = useRouter();
  const initialIndex = clampTabIndex(params.tab);
  const [selectedIndex, setSelectedIndex] = useState(initialIndex);

  // Web: the URL mirrors the selected tab so reload/back/deep links land on the same tab.
  // Only user actions (tap, swipe) write ?tab=; URL changes (back/forward) only read it,
  // so the two directions never race.
  const writeTabToUrl = useCallback((index: number) => {
    if (Platform.OS !== 'web') return;
    if (clampTabIndex(params.tab) !== index) router.setParams({ tab: String(index) });
  }, [params.tab, router]);

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
    writeTabToUrl(index);
  }, [writeTabToUrl]);

  const handlePageSelected = useCallback((e: { nativeEvent: { position: number } }) => {
    setSelectedIndex(e.nativeEvent.position);
    writeTabToUrl(e.nativeEvent.position);
  }, [writeTabToUrl]);

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
      case 0: return <CalculatorScreen onRequestAddTrip={handleRequestAddTrip} keyboardActive={selectedIndex === 0} />;
      case 1: return <TransactionsScreen selectedIndex={selectedIndex} onSelectIndex={handleSelectIndex} />;
      case 2: return <AccountsScreen selectedIndex={selectedIndex} onSelectIndex={handleSelectIndex} />;
      case 4: return <TripsScreen selectedIndex={selectedIndex} onSelectIndex={handleSelectIndex} addTripRequestId={tripsAddRequestId} />;
      case 3: return <SettingsScreen selectedIndex={selectedIndex} onSelectIndex={handleSelectIndex} />;
      default: return <CalculatorScreen />;
    }
  };

  const isDesktop = useIsDesktop();
  // Desktop renders a section the first time it's opened, then keeps it mounted (hidden),
  // like the mobile pager which only lays out pages it has shown.
  const [visited, setVisited] = useState<Set<number>>(() => new Set([initialIndex]));
  useEffect(() => {
    setVisited((v) => (v.has(selectedIndex) ? v : new Set(v).add(selectedIndex)));
  }, [selectedIndex]);

  // Desktop: Option/Alt + 1–5 switches section (event.code, so it works with any layout).
  useEffect(() => {
    if (!isDesktop || typeof window === 'undefined') return;
    const onKey = (e: KeyboardEvent) => {
      if (!e.altKey || e.metaKey || e.ctrlKey) return;
      // Option+number types characters on macOS (¡ ™ £…): leave text fields alone, and don't
      // switch sections behind an open dialog.
      if (e.target instanceof Element && e.target.closest('input, textarea, [contenteditable="true"], [role="textbox"]')) return;
      if (document.querySelector('[aria-modal="true"]')) return;
      const m = /^Digit([1-9])$/.exec(e.code);
      if (!m) return;
      const index = Number(m[1]) - 1;
      if (index >= Tabs.length) return;
      e.preventDefault();
      handleSelectIndex(index);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isDesktop, handleSelectIndex]);

  if (isDesktop) {
    // Sidebar + one section at a time. Every section stays mounted (hidden), so filters,
    // scroll positions and half-typed amounts survive switching, like the mobile pager.
    return (
      <View style={styles.desktop} testID="desktop-shell">
        <DesktopSidebar selectedIndex={selectedIndex} onSelectIndex={handleSelectIndex} />
        <View style={styles.desktopMain}>
          {Tabs.map((tab, index) => (
            <View
              key={tab.key}
              style={[styles.desktopPage, index !== selectedIndex && styles.hidden]}
              aria-hidden={index !== selectedIndex}
              testID={index === selectedIndex ? 'pager-page-active' : undefined}
              nativeID={`desktop-panel-${index}`}
              role="tabpanel"
              aria-label={tab.label}
            >
              <View style={tab.key === 0 ? styles.desktopCalc : [styles.desktopContent, { maxWidth: DESKTOP_WIDTHS[tab.key] ?? 1080 }]}>
                {visited.has(index) ? renderScreen(tab.key) : null}
              </View>
            </View>
          ))}
        </View>
      </View>
    );
  }

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

/** Readable widths per section on desktop (accounts use a card grid, so they get more). */
const DESKTOP_WIDTHS: Record<number, number> = { 1: 960, 2: 1120, 4: 960, 3: 760 };

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
  desktop: { flex: 1, flexDirection: 'row', backgroundColor: Colors.background },
  desktopMain: { flex: 1 },
  desktopPage: { flex: 1 },
  hidden: { display: 'none' },
  // Readable column for lists and settings.
  desktopContent: { flex: 1, width: '100%', maxWidth: 1080, alignSelf: 'center', paddingHorizontal: 24 },
  // The calculator as a focused card in the middle of the window.
  desktopCalc: {
    width: 440, maxWidth: '100%', alignSelf: 'center', marginVertical: 28, flex: 1, maxHeight: 860,
    borderRadius: 28, overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)', backgroundColor: '#050505',
  },
});
