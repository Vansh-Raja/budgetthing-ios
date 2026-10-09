/**
 * Online-only runtime status for the web shell: identity, Convex connection,
 * a live authenticated read, and sign-out. Used to prove the Phase 1 vertical
 * slice; later phases reuse the connection/error states.
 */
import React from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';
import { useAuth, useUser } from '@clerk/clerk-expo';
import { useConvexConnectionState, useQuery } from 'convex/react';
import { api } from '@/convex/_generated/api';
import { Text } from '@/components/ui/LockedText';
import { Colors, Fonts, Spacing, BorderRadius } from '@/constants/theme';
import { useEffectiveOffline } from '@/lib/web/runtime';

export function WebRuntimeStatus() {
  const { signOut } = useAuth();
  const { user } = useUser();
  const connection = useConvexConnectionState();
  const whoami = useQuery(api.sync.whoami);
  const latestSeq = useQuery(api.sync.latestSeq);

  const email = user?.primaryEmailAddress?.emailAddress ?? user?.id ?? '…';
  const serverSubject = whoami === undefined ? 'loading' : whoami === null ? 'unauthenticated' : whoami.subject;
  // Verified offline (navigator.onLine alone can be wrong on iOS Safari).
  const offline = useEffectiveOffline(connection.isWebSocketConnected);
  const connectionLabel = connection.isWebSocketConnected
    ? 'Connected'
    : offline
      ? 'Offline — connection required'
      : connection.hasEverConnected
        ? 'Reconnecting…'
        : 'Connecting…';

  return (
    <View style={styles.card} testID="web-runtime-status">
      <Row label="Signed in as" value={email} testID="web-identity" />
      <Row label="Server identity" value={serverSubject} testID="web-server-subject" />
      <Row label="Connection" value={connectionLabel} testID="web-connection" warn={offline} />
      <Row
        label="Sync sequence"
        value={latestSeq === undefined ? 'loading' : String(latestSeq ?? 0)}
        testID="web-sync-seq"
      />
      <TouchableOpacity onPress={() => signOut()} style={styles.button} testID="web-sign-out">
        <Text style={styles.buttonText}>Sign out</Text>
      </TouchableOpacity>
    </View>
  );
}

function Row({ label, value, testID, warn }: { label: string; value: string; testID: string; warn?: boolean }) {
  return (
    <View style={styles.row}>
      <Text style={styles.label}>{label}</Text>
      <Text style={[styles.value, warn && styles.warn]} testID={testID} numberOfLines={1}>
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.cardBackground,
    borderRadius: BorderRadius.lg,
    padding: Spacing.lg,
    gap: Spacing.sm,
  },
  row: { flexDirection: 'row', justifyContent: 'space-between', gap: Spacing.md },
  label: { color: Colors.textTertiary, fontFamily: Fonts.medium, fontSize: 14 },
  value: { color: Colors.textPrimary, fontFamily: Fonts.demiBold, fontSize: 14, flexShrink: 1 },
  warn: { color: Colors.accentRed },
  button: {
    marginTop: Spacing.sm,
    alignSelf: 'flex-start',
    backgroundColor: Colors.pillBackground,
    borderRadius: BorderRadius.full,
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.sm,
  },
  buttonText: { color: Colors.accent, fontFamily: Fonts.demiBold, fontSize: 16 },
});
