/**
 * Placeholder for routes that are not yet ported to the web runtime.
 * Keeps the native screen (and its SQLite imports) out of the web bundle.
 */
import React from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text } from '@/components/ui/LockedText';
import { Colors, Fonts, Spacing, BorderRadius } from '@/constants/theme';

interface Props {
  title: string;
  phase: string;
}

export function WebPlaceholderScreen({ title, phase }: Props) {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const goBack = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/');
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top + Spacing.xl }]} testID="web-placeholder">
      <Stack.Screen options={{ headerShown: false }} />
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.body}>This screen is not available in the web app yet.</Text>
      <Text style={styles.meta}>Planned for {phase}.</Text>
      <TouchableOpacity onPress={goBack} style={styles.button} testID="web-placeholder-back">
        <Text style={styles.buttonText}>Back</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background, paddingHorizontal: Spacing.xl },
  title: { color: Colors.textPrimary, fontFamily: Fonts.heavy, fontSize: 32, marginBottom: Spacing.md },
  body: { color: Colors.textSecondary, fontFamily: Fonts.medium, fontSize: 16, marginBottom: Spacing.xs },
  meta: { color: Colors.textTertiary, fontFamily: Fonts.medium, fontSize: 14, marginBottom: Spacing.xxl },
  button: {
    alignSelf: 'flex-start',
    backgroundColor: Colors.pillBackground,
    borderRadius: BorderRadius.full,
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.sm,
  },
  buttonText: { color: Colors.accent, fontFamily: Fonts.demiBold, fontSize: 16 },
});
