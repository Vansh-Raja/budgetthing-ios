/**
 * Settings › History & undo: every change across the ledger, newest first, with undo and
 * restore. Backed by the server's append-only audit trail (convex/history.ts).
 */
import React from 'react';
import { Platform, ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text } from '@/components/ui/LockedText';
import { Colors, Fonts } from '@/constants/theme';
import { RecentChanges } from '@/components/history/HistoryViews';

export default function HistoryScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.container, { paddingTop: insets.top + 8 }]} testID="history-screen">
      <Stack.Screen options={{ headerShown: false }} />
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.back} accessibilityRole="button" accessibilityLabel="Back">
          <Ionicons name="chevron-back" size={24} color="#FFFFFF" />
        </TouchableOpacity>
        <Text style={styles.title}>History & undo</Text>
      </View>
      <Text style={styles.subtitle}>
        Every change is recorded, from the web, the phone app or agent imports. Restoring or undoing saves a new
        version, so nothing is ever lost.
      </Text>
      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 40 }}>
        {Platform.OS === 'web' ? <RecentChanges /> : <Text style={styles.subtitle}>History is available in the web app.</Text>}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background, paddingHorizontal: 20 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  back: { padding: 4, marginLeft: -6 },
  title: { color: Colors.textPrimary, fontFamily: Fonts.heavy, fontSize: 28 },
  subtitle: { color: Colors.textSecondary, fontFamily: Fonts.medium, fontSize: 13, lineHeight: 18, marginBottom: 14 },
});
