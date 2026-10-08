import React from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text } from '@/components/ui/LockedText';
import { Colors, Fonts, Spacing } from '@/constants/theme';

/** Full-screen dark frame around Clerk's prebuilt auth UI. */
export function WebAuthScreen({ children, testID }: { children: React.ReactNode; testID: string }) {
  const insets = useSafeAreaInsets();
  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={[styles.content, { paddingTop: insets.top + Spacing.xxl, paddingBottom: insets.bottom + Spacing.xxl }]}
      keyboardShouldPersistTaps="handled"
      testID={testID}
    >
      <Text style={styles.wordmark}>BudgetThing</Text>
      <Text style={styles.tagline}>Sign in to use your ledger on the web.</Text>
      <View style={styles.clerk}>{children}</View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: Colors.background },
  content: { alignItems: 'center', paddingHorizontal: Spacing.xl },
  wordmark: { color: Colors.textPrimary, fontFamily: Fonts.heavy, fontSize: 40, marginBottom: Spacing.xs },
  tagline: { color: Colors.textSecondary, fontFamily: Fonts.medium, fontSize: 16, marginBottom: Spacing.xxl },
  clerk: { width: '100%', maxWidth: 420, alignItems: 'center' },
});
