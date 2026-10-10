import { AppleSignInButton } from '@/components/auth';
import { useCustomPopup } from '@/components/ui/CustomPopupProvider';
import { Text, TextInput } from '@/components/ui/LockedText';
import { Colors, Fonts, BorderRadius, Spacing } from '@/constants/theme';
import { api } from '@/convex/_generated/api';
import { useAuthState } from '@/lib/auth/useAuthHooks';
import { Ionicons } from '@expo/vector-icons';
import { useMutation, useQuery } from 'convex/react';
import * as Haptics from 'expo-haptics';
import * as WebBrowser from 'expo-web-browser';
import { useRouter } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

type ExpiryChoice = '30d' | '6m' | '1y' | 'never';

const EXPIRY_OPTIONS: Array<{ label: string; value: ExpiryChoice }> = [
  { label: '30 days', value: '30d' },
  { label: '6 months', value: '6m' },
  { label: '1 year', value: '1y' },
  { label: 'No expiry', value: 'never' },
];

function formatDate(ms?: number | null) {
  if (!ms) return '—';
  return new Date(ms).toLocaleDateString();
}

export default function ApiImportSettingsScreen() {
  const router = useRouter();
  const { showPopup, showInfo } = useCustomPopup();
  const { isSignedIn, isLoaded } = useAuthState();
  const keys = useQuery(api.apiImportKeys.list, isSignedIn ? {} : 'skip');
  const createKey = useMutation(api.apiImportKeys.create);
  const revokeKey = useMutation(api.apiImportKeys.revoke);
  const [name, setName] = useState('My agent');
  const [expiresIn, setExpiresIn] = useState<ExpiryChoice>('1y');
  const [creating, setCreating] = useState(false);

  const activeKeys = useMemo(() => keys ?? [], [keys]);

  const handleCreate = async () => {
    if (creating) return;
    setCreating(true);
    Haptics.selectionAsync();
    try {
      const result = await createKey({ name, expiresIn });
      showInfo({
        title: 'API Key',
        copyableContent: result.rawKey,
        copyButtonText: 'Copy Key',
      });
      setName('My agent');
      setExpiresIn('1y');
    } catch (error: any) {
      showPopup({
        title: 'Could not create key',
        message: error?.message ?? 'Please try again.',
        buttons: [{ text: 'OK', style: 'default' }],
      });
    } finally {
      setCreating(false);
    }
  };

  const handleRevoke = (id: string, keyName: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    showPopup({
      title: 'Revoke key?',
      message: `${keyName} will stop working immediately.`,
      buttons: [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Revoke',
          style: 'destructive',
          onPress: () => {
            revokeKey({ id }).catch((error: any) => {
              showPopup({
                title: 'Could not revoke key',
                message: error?.message ?? 'Please try again.',
                buttons: [{ text: 'OK', style: 'default' }],
              });
            });
          },
        },
      ],
    });
  };

  const openDocsUrl = async (url: string) => {
    try {
      await WebBrowser.openBrowserAsync(url);
    } catch (error: any) {
      showPopup({
        title: 'Could not open link',
        message: error?.message ?? url,
        buttons: [{ text: 'OK', style: 'default' }],
      });
    }
  };

  if (!isLoaded) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.center}><ActivityIndicator color={Colors.accent} /></View>
      </SafeAreaView>
    );
  }

  if (!isSignedIn) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton} activeOpacity={0.75}>
            <Ionicons name="chevron-back" size={22} color={Colors.textPrimary} />
          </TouchableOpacity>
          <Text style={styles.title}>Agent Import API</Text>
        </View>
        <View style={styles.center}>
          <Text style={styles.emptyTitle}>Sign in required</Text>
          <Text style={styles.emptySubtitle}>API keys are tied to your synced BudgetThing account.</Text>
          <View style={styles.signInWrap}>
            <AppleSignInButton />
          </View>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton} activeOpacity={0.75}>
            <Ionicons name="chevron-back" size={22} color={Colors.textPrimary} />
          </TouchableOpacity>
          <Text style={styles.title}>Agent Import API</Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Create Key</Text>
          <TextInput
            value={name}
            onChangeText={setName}
            style={styles.input}
            placeholder="Key name"
            placeholderTextColor={Colors.textMuted}
          />

          <View style={styles.expiryGrid}>
            {EXPIRY_OPTIONS.map((option) => (
              <TouchableOpacity
                key={option.value}
                style={[styles.expiryButton, expiresIn === option.value && styles.expiryButtonActive]}
                onPress={() => {
                  Haptics.selectionAsync();
                  setExpiresIn(option.value);
                }}
                activeOpacity={0.75}
              >
                <Text style={[styles.expiryText, expiresIn === option.value && styles.expiryTextActive]}>
                  {option.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <TouchableOpacity style={styles.primaryButton} onPress={handleCreate} disabled={creating} activeOpacity={0.82}>
            {creating ? <ActivityIndicator color="#000" /> : <Ionicons name="key-outline" size={18} color="#000" />}
            <Text style={styles.primaryButtonText}>{creating ? 'Creating' : 'Create API Key'}</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Docs</Text>
          <TouchableOpacity
            style={styles.linkRow}
            onPress={() => {
              void openDocsUrl('https://budgetthing.vanshraja.me/agents/budgetthing/SKILL.md');
            }}
            activeOpacity={0.75}
          >
            <Text style={styles.linkText}>SKILL.md</Text>
            <Ionicons name="open-outline" size={16} color={Colors.textMuted} />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.linkRow}
            onPress={() => {
              void openDocsUrl('https://budgetthing.vanshraja.me/agents/budgetthing/openapi.json');
            }}
            activeOpacity={0.75}
          >
            <Text style={styles.linkText}>OpenAPI schema</Text>
            <Ionicons name="open-outline" size={16} color={Colors.textMuted} />
          </TouchableOpacity>
          <Text style={styles.hint}>Set the copied key as BUDGETTHING_API_KEY in your agent or script.</Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Keys</Text>
          {keys === undefined ? (
            <ActivityIndicator color={Colors.accent} />
          ) : activeKeys.length === 0 ? (
            <Text style={styles.hint}>No keys yet.</Text>
          ) : (
            activeKeys.map((key: any) => {
              const revoked = key.revokedAtMs != null;
              const expired = key.expiresAtMs != null && key.expiresAtMs <= Date.now();
              return (
                <View key={key.id} style={styles.keyCard}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.keyName}>{key.name}</Text>
                    <Text style={styles.keyMeta}>Created {formatDate(key.createdAtMs)} · Expires {formatDate(key.expiresAtMs)}</Text>
                    <Text style={styles.keyMeta}>Last used {formatDate(key.lastUsedAtMs)}</Text>
                    {revoked || expired ? (
                      <Text style={styles.keyStatus}>{revoked ? 'Revoked' : 'Expired'}</Text>
                    ) : null}
                  </View>
                  {!revoked ? (
                    <TouchableOpacity
                      style={styles.revokeButton}
                      onPress={() => handleRevoke(key.id, key.name)}
                      activeOpacity={0.75}
                    >
                      <Text style={styles.revokeText}>Revoke</Text>
                    </TouchableOpacity>
                  ) : null}
                </View>
              );
            })
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  content: {
    paddingHorizontal: 24,
    paddingBottom: 48,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    marginBottom: 18,
  },
  backButton: {
    width: 36,
    height: 36,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.pillBackground,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    flex: 1,
    fontFamily: Fonts.heavy,
    color: Colors.textPrimary,
    fontSize: 34,
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontFamily: Fonts.demiBold,
    color: Colors.textTertiary,
    fontSize: 14,
    marginBottom: 10,
    textTransform: 'uppercase',
  },
  input: {
    minHeight: 48,
    borderRadius: BorderRadius.sm,
    backgroundColor: Colors.cardBackground,
    borderWidth: 1,
    borderColor: Colors.pillBorder,
    color: Colors.textPrimary,
    fontFamily: Fonts.medium,
    fontSize: 17,
    paddingHorizontal: 14,
    marginBottom: 12,
  },
  expiryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
    marginBottom: 14,
  },
  expiryButton: {
    paddingHorizontal: 13,
    paddingVertical: 9,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.pillBackground,
    borderWidth: 1,
    borderColor: Colors.pillBorder,
  },
  expiryButtonActive: {
    backgroundColor: Colors.accent,
    borderColor: Colors.accent,
  },
  expiryText: {
    fontFamily: Fonts.demiBold,
    color: Colors.textSecondary,
    fontSize: 14,
  },
  expiryTextActive: {
    color: '#000',
  },
  primaryButton: {
    height: 48,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.accent,
    flexDirection: 'row',
    gap: Spacing.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButtonText: {
    fontFamily: Fonts.demiBold,
    color: '#000',
    fontSize: 17,
  },
  linkRow: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.divider,
  },
  linkText: {
    flex: 1,
    fontFamily: Fonts.medium,
    color: Colors.textPrimary,
    fontSize: 16,
  },
  hint: {
    marginTop: 10,
    fontFamily: Fonts.medium,
    color: Colors.textTertiary,
    fontSize: 14,
    lineHeight: 19,
  },
  keyCard: {
    flexDirection: 'row',
    gap: Spacing.md,
    alignItems: 'center',
    padding: 14,
    borderRadius: BorderRadius.sm,
    backgroundColor: Colors.cardBackground,
    borderWidth: 1,
    borderColor: Colors.pillBorder,
    marginBottom: 10,
  },
  keyName: {
    fontFamily: Fonts.demiBold,
    color: Colors.textPrimary,
    fontSize: 18,
  },
  keyMeta: {
    marginTop: 2,
    fontFamily: Fonts.medium,
    color: Colors.textTertiary,
    fontSize: 12,
  },
  keyStatus: {
    marginTop: 4,
    fontFamily: Fonts.demiBold,
    color: Colors.accentRed,
    fontSize: 12,
  },
  revokeButton: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: BorderRadius.full,
    backgroundColor: 'rgba(255,59,48,0.12)',
  },
  revokeText: {
    fontFamily: Fonts.demiBold,
    color: Colors.accentRed,
    fontSize: 13,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 28,
  },
  emptyTitle: {
    fontFamily: Fonts.heavy,
    color: Colors.textPrimary,
    fontSize: 30,
  },
  emptySubtitle: {
    marginTop: 6,
    textAlign: 'center',
    fontFamily: Fonts.medium,
    color: Colors.textTertiary,
    fontSize: 15,
  },
  signInWrap: {
    marginTop: 18,
    alignSelf: 'stretch',
  },
});
