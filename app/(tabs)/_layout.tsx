/**
 * Tabs Layout - Simplified to just render the main screen
 * 
 * We use a custom pager-based navigation instead of expo-router tabs.
 */

import React from 'react';
import { Stack } from 'expo-router';

export default function TabLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
    </Stack>
  );
}
