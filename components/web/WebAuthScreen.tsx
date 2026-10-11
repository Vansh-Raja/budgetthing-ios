import React from 'react';
import { Image, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Text } from '@/components/ui/LockedText';
import { Colors, Fonts, Spacing } from '@/constants/theme';
import { AGENTS } from '@/components/onboarding/shared';
import { useIsDesktop } from '@/lib/web/useIsDesktop';

const LOGO = require('../../assets/images/onboarding-logo.png');

const POINTS: Array<{ icon: keyof typeof Ionicons.glyphMap; title: string; body: string }> = [
  { icon: 'sparkles-outline', title: 'Expenses arrive on their own', body: 'Your AI agent and Apple Pay send charges to your inbox.' },
  { icon: 'checkmark-done-outline', title: 'You approve everything', body: 'Swipe to confirm. Nothing touches your books without you.' },
  { icon: 'calculator-outline', title: 'Or type it in seconds', body: 'A calculator that takes your keyboard. Enter saves.' },
];

/** Desktop: the pitch beside the sign-in card. */
function Pitch() {
  return (
    <View style={styles.pitch}>
      <View style={styles.brandRow}>
        <Image source={LOGO} style={styles.logo} accessibilityIgnoresInvertColors />
        <Text style={styles.brand}>BudgetThing</Text>
      </View>
      <Text style={styles.hero}>Stop logging{'\n'}<Text style={[styles.hero, { color: Colors.accent }]}>expenses.</Text></Text>
      <View style={styles.points}>
        {POINTS.map((p) => (
          <View key={p.title} style={styles.point}>
            <View style={styles.pointIcon}><Ionicons name={p.icon} size={18} color={Colors.accent} /></View>
            <View style={{ flex: 1 }}>
              <Text style={styles.pointTitle}>{p.title}</Text>
              <Text style={styles.pointBody}>{p.body}</Text>
            </View>
          </View>
        ))}
      </View>
      <View style={styles.agents}>
        <Text style={styles.agentsLabel}>Works with</Text>
        {AGENTS.map((a) => <Image key={a.name} source={a.logo} style={styles.agentLogo} accessibilityLabel={a.name} />)}
      </View>
    </View>
  );
}

/** Full-screen dark frame around Clerk's prebuilt auth UI (two columns on desktop). */
export function WebAuthScreen({ children, testID }: { children: React.ReactNode; testID: string }) {
  const insets = useSafeAreaInsets();
  const isDesktop = useIsDesktop();
  if (isDesktop) {
    return (
      <ScrollView style={styles.scroll} contentContainerStyle={styles.desktop} keyboardShouldPersistTaps="handled" testID={testID}>
        <View style={styles.desktopRow}>
          <Pitch />
          <View style={styles.desktopCard}>
            <Text style={styles.cardTitle}>Sign in to use your ledger on the web.</Text>
            <View style={styles.clerk}>{children}</View>
          </View>
        </View>
      </ScrollView>
    );
  }
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
  desktop: { flexGrow: 1, alignItems: 'center', justifyContent: 'center', padding: 48 },
  desktopRow: { flexDirection: 'row', alignItems: 'center', gap: 72, width: '100%', maxWidth: 1080 },
  desktopCard: { width: 440, alignItems: 'center' },
  cardTitle: { color: Colors.textSecondary, fontFamily: Fonts.medium, fontSize: 16, marginBottom: 16, textAlign: 'center' },
  pitch: { flex: 1 },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 28 },
  logo: { width: 40, height: 40, borderRadius: 10 },
  brand: { fontFamily: Fonts.heavy, fontSize: 26, color: Colors.textPrimary },
  hero: { fontFamily: Fonts.heavy, fontSize: 64, lineHeight: 66, color: Colors.textPrimary },
  points: { gap: 18, marginTop: 32, maxWidth: 460 },
  point: { flexDirection: 'row', gap: 14, alignItems: 'flex-start' },
  pointIcon: { width: 36, height: 36, borderRadius: 10, backgroundColor: 'rgba(255,149,0,0.12)', alignItems: 'center', justifyContent: 'center' },
  pointTitle: { fontFamily: Fonts.heavy, fontSize: 19, color: Colors.textPrimary },
  pointBody: { fontFamily: Fonts.medium, fontSize: 15, lineHeight: 21, color: Colors.textTertiary, marginTop: 2 },
  agents: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 36 },
  agentsLabel: { fontFamily: Fonts.demiBold, fontSize: 13, letterSpacing: 1.2, textTransform: 'uppercase', color: Colors.textMuted, marginRight: 4 },
  agentLogo: { width: 30, height: 30, borderRadius: 15, borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)' },
});
