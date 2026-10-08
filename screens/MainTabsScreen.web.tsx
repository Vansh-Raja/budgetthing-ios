/**
 * Web main screen: the shared pager-based tab shell (Pager.web provides the
 * browser pager), wrapped with a stable test id for browser automation.
 */
import React from 'react';
import { View } from 'react-native';
import MainTabsShell from './tabs/MainTabsShell';

export default function MainTabsWebScreen() {
  return (
    <View style={{ flex: 1 }} testID="web-shell">
      <MainTabsShell />
    </View>
  );
}
