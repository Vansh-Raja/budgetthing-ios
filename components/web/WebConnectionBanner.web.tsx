/**
 * Online-only truthfulness: when the browser is offline or the Convex socket is
 * down, say so and offer a retry. Data on screen may be stale; no edits are
 * queued locally.
 */
import React from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useConvexConnectionState } from 'convex/react';
import { Text } from '@/components/ui/LockedText';
import { Colors, Fonts } from '@/constants/theme';
import { useOnlineStatus } from '@/lib/web/runtime';

export function WebConnectionBanner() {
  const online = useOnlineStatus();
  const state = useConvexConnectionState();
  const insets = useSafeAreaInsets();
  // navigator.onLine is unreliable (iOS Safari can report false while the socket is live),
  // so a connected Convex socket always wins; "offline" needs both signals to agree.
  const offline = !online && !state.isWebSocketConnected;
  const disconnected = state.hasEverConnected && !state.isWebSocketConnected;
  if (!offline && !disconnected) return null;

  const message = offline ? 'You are offline. Changes are not saved until you reconnect.' : 'Reconnecting to the server…';
  return (
    <View style={[styles.banner, { paddingTop: insets.top + 8 }]} testID="web-connection-banner" accessibilityRole="alert">
      <Text style={styles.text}>{message}</Text>
      <TouchableOpacity onPress={() => (typeof window !== 'undefined' ? window.location.reload() : undefined)} style={styles.button} accessibilityRole="button" accessibilityLabel="Retry connection">
        <Text style={styles.buttonText}>Retry</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: { backgroundColor: '#3A1D00', paddingHorizontal: 16, paddingBottom: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  text: { color: Colors.textPrimary, fontFamily: Fonts.demiBold, fontSize: 14, flexShrink: 1 },
  button: { backgroundColor: Colors.accent, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 6 },
  buttonText: { color: '#000', fontFamily: Fonts.demiBold, fontSize: 14 },
});
