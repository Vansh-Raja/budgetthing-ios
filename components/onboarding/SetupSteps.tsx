/**
 * "Connect your helpers": create an AI-agent key, copy a setup message, Apple Pay
 * Shortcut steps, and a live "waiting for your first import" check.
 */
import { AppleSignInButton } from '@/components/auth';
import { Text } from '@/components/ui/LockedText';
import { useToast } from '@/components/ui/ToastProvider';
import { Colors, Fonts } from '@/constants/theme';
import { api } from '@/convex/_generated/api';
import { useAuthState } from '@/lib/auth/useAuthHooks';
import { ImportInboxRepository } from '@/lib/db/repositories';
import { Ionicons } from '@expo/vector-icons';
import { useMutation } from 'convex/react';
import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import Animated, { ZoomIn } from 'react-native-reanimated';
import { AnimatedWords, Rise } from './motion';
import { AGENTS, AgentBadge, sceneStyles } from './shared';

export const SKILL_URL = 'https://budgetthing.vanshraja.me/agents/budgetthing/SKILL.md';
// The import API lives on the same deployment as this build's Convex client (no hardcoded fallback).
const CONVEX_URL = process.env.EXPO_PUBLIC_CONVEX_URL;
const IMPORT_BASE = CONVEX_URL ? CONVEX_URL.replace(/\.convex\.cloud\/?$/, '.convex.site') + '/v1' : null;

function setupMessage(key: string) {
  return [
    'Set up BudgetThing for me.',
    `1. Install the BudgetThing skill: ${SKILL_URL}`,
    `2. Save this API key as BUDGETTHING_API_KEY (keep it secret): ${key}`,
    '3. Keep an eye on my email and bank/UPI alerts. For every new charge, send it to BudgetThing using the skill. Never send the raw email.',
  ].join('\n');
}

const SHORTCUT_STEPS = (key: string | null) => [
  'Open Shortcuts → Automation → New Automation → Transaction (Wallet).',
  'Pick your cards, choose Run Immediately, then New Blank Automation.',
  'Add "Calculate": Shortcut Input Amount × 100, then "Round Number".',
  `Add "Get Contents of URL": POST ${IMPORT_BASE ? `${IMPORT_BASE}/imports` : 'your BudgetThing import URL (see the SKILL.md linked in Settings › Agent Import API)'}`,
  `Headers: Authorization = Bearer ${key ? key.slice(0, 10) + '…' : '<your key>'}, Idempotency-Key = Current Date (ISO) + Merchant, Content-Type = application/json.`,
  'JSON body: source "apple-pay", items = [{ externalId: same as Idempotency-Key, type "expense", amountCents: Rounded Number, currencyCode: your currency, occurredAt: Current Date (ISO 8601), merchantName: Merchant }].',
];

export function ConnectStep({ onFirstImport, onKeyCreated }: { onFirstImport: () => void; onKeyCreated: () => void }) {
  const { isSignedIn } = useAuthState();
  const createKey = useMutation(api.apiImportKeys.create);
  const toast = useToast();
  const [key, setKey] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [copied, setCopied] = useState(false);
  const [showShortcut, setShowShortcut] = useState(false);
  const [arrived, setArrived] = useState(false);
  const baseline = useRef<number | null>(null);

  // After a key exists, watch for the first import to land in the inbox.
  useEffect(() => {
    if (!key || arrived) return;
    let stop = false;
    const check = async () => {
      try {
        const n = await ImportInboxRepository.countPending();
        if (stop) return;
        if (baseline.current === null) baseline.current = n;
        else if (n > baseline.current) {
          setArrived(true);
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
          onFirstImport();
        }
      } catch {}
    };
    void check();
    const id = setInterval(check, 3000);
    return () => { stop = true; clearInterval(id); };
  }, [key, arrived, onFirstImport]);

  const create = async () => {
    if (creating) return;
    setCreating(true);
    try {
      // Baseline before the key exists, so even an import that lands instantly counts as new.
      // If that read fails, the first successful poll sets the baseline instead (never assume 0).
      baseline.current = await ImportInboxRepository.countPending().catch(() => null);
      const r = await createKey({ name: 'My AI agent', expiresIn: '1y' });
      setKey(r.rawKey);
      onKeyCreated();
    } catch (e: any) {
      toast.show(e?.message ?? 'Could not create a key', { kind: 'error' });
    } finally {
      setCreating(false);
    }
  };

  const copy = async () => {
    if (!key) return;
    await Clipboard.setStringAsync(setupMessage(key));
    setCopied(true);
    Haptics.selectionAsync().catch(() => {});
  };

  return (
    <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
      <Rise><Text style={sceneStyles.kicker}>Optional · 2 minutes</Text></Rise>
      <AnimatedWords text={'Connect your\nhelpers.'} style={sceneStyles.title} delay={60} accentWords={['helpers']} />
      <Rise delay={320}><Text style={[sceneStyles.subtitle, { marginBottom: 18 }]}>Set up automatic imports now, or later from Settings › Agent Import API.</Text></Rise>

      <Rise delay={440} style={{ alignSelf: 'stretch' }}>
      {!isSignedIn ? (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Sign in to connect</Text>
          <Text style={styles.cardBody}>Agents and Shortcuts send expenses to your BudgetThing account, so they need you signed in. You can also keep going as a guest.</Text>
          <View style={{ marginTop: 12 }}><AppleSignInButton /></View>
        </View>
      ) : (
        <>
          <View style={styles.card}>
            <View style={styles.badgeRow}>
              {AGENTS.map((a) => <AgentBadge key={a.name} agent={a} size={34} />)}
            </View>
            <Text style={styles.cardTitle}>🤖 Your AI agent</Text>
            <Text style={styles.cardBody}>
              Create a key, then paste the setup message into Dots, Grok Bot, Muse, Hermes, OpenClaw or any agent that can call an API. The key can only add items to your inbox; it can't read or change your money.
            </Text>
            {key ? (
              <>
                <View style={styles.keyBox}>
                  <Text style={styles.keyText} numberOfLines={4} selectable>{setupMessage(key)}</Text>
                </View>
                <TouchableOpacity accessibilityRole="button" onPress={copy} style={styles.primary}>
                  <Ionicons name={copied ? 'checkmark' : 'copy-outline'} size={18} color="#000" />
                  <Text style={styles.primaryText}>{copied ? 'Copied: paste it to your agent' : 'Copy setup message'}</Text>
                </TouchableOpacity>
              </>
            ) : (
              <TouchableOpacity accessibilityRole="button" onPress={create} style={styles.primary} disabled={creating}>
                {creating ? <ActivityIndicator color="#000" /> : <Ionicons name="key-outline" size={18} color="#000" />}
                <Text style={styles.primaryText}>Create my agent key</Text>
              </TouchableOpacity>
            )}
          </View>

          <View style={styles.card}>
            <Text style={styles.cardTitle}>Apple Pay Shortcut</Text>
            <Text style={styles.cardBody}>Log every tap-to-pay automatically with a Shortcuts automation{key ? ' using the key above.' : '. Create a key first.'}</Text>
            <TouchableOpacity accessibilityRole="button" onPress={() => setShowShortcut((s) => !s)} style={styles.linkRow}>
              <Text style={styles.link}>{showShortcut ? 'Hide steps' : 'Show setup steps'}</Text>
              <Ionicons name={showShortcut ? 'chevron-up' : 'chevron-down'} size={16} color={Colors.accent} />
            </TouchableOpacity>
            {showShortcut ? SHORTCUT_STEPS(key).map((s, i) => (
              <Text key={i} style={styles.step}>{i + 1}. {s}</Text>
            )) : null}
          </View>

          {key ? (
            <Animated.View key={arrived ? 'arrived' : 'waiting'} entering={ZoomIn.springify().damping(14)} style={[styles.card, arrived && styles.cardSuccess]} testID="onboarding-first-import">
              {arrived ? (
                <>
                  <Text style={styles.cardTitle}>🎉 Your first import arrived</Text>
                  <Text style={styles.cardBody}>It's waiting in your Inbox. Finish to go swipe it in.</Text>
                </>
              ) : (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <ActivityIndicator color={Colors.accent} />
                  <Text style={styles.cardBody}>Waiting for your first import… Ask your agent to send one, or pay with Apple Pay.</Text>
                </View>
              )}
            </Animated.View>
          ) : null}
        </>
      )}
      </Rise>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { paddingHorizontal: 24, paddingTop: 24, paddingBottom: 32, alignItems: 'center', maxWidth: 520, width: '100%', alignSelf: 'center' },
  label: { alignSelf: 'stretch', fontFamily: Fonts.demiBold, fontSize: 14, letterSpacing: 1.2, textTransform: 'uppercase', color: Colors.textTertiary, marginTop: 26, marginBottom: 10 },
  hint: { alignSelf: 'stretch', fontFamily: Fonts.medium, fontSize: 14, color: Colors.textTertiary, marginTop: 10, marginBottom: 10 },
  chips: { alignSelf: 'stretch', flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, height: 38, borderRadius: 19, borderWidth: 1, borderColor: 'rgba(255,255,255,0.18)' },
  chipActive: { backgroundColor: Colors.accent, borderColor: Colors.accent },
  chipOwned: { backgroundColor: 'rgba(255,255,255,0.1)', borderColor: 'transparent' },
  chipAdd: { borderStyle: 'dashed', borderColor: 'rgba(255,149,0,0.6)' },
  chipText: { fontFamily: Fonts.demiBold, fontSize: 15, color: Colors.textSecondary },
  chipTextActive: { fontFamily: Fonts.demiBold, fontSize: 15, color: '#fff' },
  card: { alignSelf: 'stretch', borderRadius: 18, padding: 16, backgroundColor: '#111', borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)', marginBottom: 12 },
  cardSuccess: { borderColor: Colors.success },
  badgeRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12 },
  cardTitle: { fontFamily: Fonts.heavy, fontSize: 20, color: Colors.textPrimary, marginBottom: 6 },
  cardBody: { flexShrink: 1, fontFamily: Fonts.medium, fontSize: 15, lineHeight: 21, color: Colors.textSecondary },
  keyBox: { marginTop: 12, borderRadius: 12, padding: 12, backgroundColor: '#000', borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)' },
  keyText: { fontFamily: 'SpaceMono', fontSize: 12, lineHeight: 17, color: Colors.textSecondary },
  primary: { marginTop: 12, height: 46, borderRadius: 23, backgroundColor: Colors.accent, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  primaryText: { fontFamily: Fonts.demiBold, fontSize: 16, color: '#000' },
  linkRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 10 },
  link: { fontFamily: Fonts.demiBold, fontSize: 15, color: Colors.accent },
  step: { fontFamily: Fonts.medium, fontSize: 14, lineHeight: 20, color: Colors.textSecondary, marginTop: 8 },
});
