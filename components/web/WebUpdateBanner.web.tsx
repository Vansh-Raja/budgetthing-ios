/**
 * Shown when a new build is installed and waiting. Reload is always the user's choice,
 * so an update never discards an edit in progress.
 */
import React from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text } from '@/components/ui/LockedText';
import { Colors, Fonts } from '@/constants/theme';
import { useServiceWorkerUpdate } from '@/lib/web/serviceWorker';

export function WebUpdateBanner() {
  const { updateReady, applyUpdate } = useServiceWorkerUpdate();
  const insets = useSafeAreaInsets();
  if (!updateReady) return null;
  return (
    <View style={[styles.banner, { paddingTop: insets.top + 8 }]} testID="web-update-banner" accessibilityRole="alert">
      <Text style={styles.text}>A new version of BudgetThing is available.</Text>
      <TouchableOpacity onPress={applyUpdate} style={styles.button} accessibilityRole="button" accessibilityLabel="Reload to update">
        <Text style={styles.buttonText}>Reload</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: { backgroundColor: '#10233A', paddingHorizontal: 16, paddingBottom: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  text: { color: Colors.textPrimary, fontFamily: Fonts.demiBold, fontSize: 14, flexShrink: 1 },
  button: { backgroundColor: Colors.accent, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 6 },
  buttonText: { color: '#000', fontFamily: Fonts.demiBold, fontSize: 14 },
});
