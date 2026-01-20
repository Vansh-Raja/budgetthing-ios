/**
 * Settings Screen - App settings and preferences
 * 
 * Pixel-perfect port of SettingsView.swift
 * Now includes Account section with Sign In / Sign Out functionality
 */

import { Text } from '@/components/ui/LockedText';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Linking,
  ScrollView,
  StatusBar,
  StyleSheet,
  Switch,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useAuth } from '@clerk/clerk-expo';
import { useMutation } from 'convex/react';
import {
  AppleSignInButton,
  DeleteAccountDialog,
  SignOutDialog,
  UserProfileCard,
} from '../components/auth';
import { FloatingTabSwitcher } from '../components/ui/FloatingTabSwitcher';
import { api } from '../convex/_generated/api';
import { useAuthState } from '../lib/auth/useAuthHooks';
import { clearAllData } from '../lib/db/database';
import { useUserSettings } from '../lib/hooks/useUserSettings';
import { useSyncStatus } from '../lib/sync/SyncProvider';
import { clearSyncStateForUser } from '../lib/sync/syncEngine';
import { setLocalDbOwner } from '../lib/sync/localDbOwner';

// ============================================================================
// Types & Props
// ============================================================================

interface SettingsScreenProps {
  selectedIndex: number;
  onSelectIndex: (index: number) => void;
}

// ============================================================================
// Components
// ============================================================================

function SectionHeader({ title }: { title: string }) {
  return (
    <Text style={styles.sectionHeader}>{title}</Text>
  );
}

function SettingsItem({
  label,
  onPress,
  rightElement
}: {
  label: string;
  onPress?: () => void;
  rightElement?: React.ReactNode;
}) {
  const Content = (
    <View style={styles.itemContainer}>
      <Text style={styles.itemLabel}>{label}</Text>
      <View style={{ flex: 1 }} />
      {rightElement}
    </View>
  );

  if (onPress) {
    return (
      <TouchableOpacity onPress={onPress} activeOpacity={0.7}>
        {Content}
      </TouchableOpacity>
    );
  }
  return Content;
}

function Chevron() {
  return (
    <Ionicons
      name="chevron-forward"
      size={16}
      color="rgba(255, 255, 255, 0.25)"
    />
  );
}

function ExternalLinkIcon() {
  return (
    <Ionicons
      name="arrow-redo-outline"
      size={16}
      color="rgba(255, 255, 255, 0.25)"
    />
  );
}

// ============================================================================
// Main Component
// ============================================================================

import { useRouter } from 'expo-router';

export function SettingsScreen({ selectedIndex, onSelectIndex }: SettingsScreenProps) {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  // Auth state
  const { isSignedIn, isLoaded, user, signOut } = useAuthState();
  const { userId: clerkUserId } = useAuth();
  const { syncNow, isSyncing, lastSyncAtMs, lastSyncError, isBootstrapping } = useSyncStatus();

  const { settings, updateSettings } = useUserSettings();

  const hapticsEnabled = settings?.hapticsEnabled ?? true;
  const currency = settings?.currencyCode ?? 'INR';

  const isSyncBusy = isSyncing || isBootstrapping;
  const lastSyncLabel = lastSyncAtMs ? new Date(lastSyncAtMs).toLocaleString() : '—';
  const syncStatusLabel = !isSignedIn
    ? 'Guest (local only)'
    : isBootstrapping
      ? 'Setting up…'
      : isSyncing
        ? 'Syncing…'
        : lastSyncError
          ? 'Sync error'
          : 'Up to date';

  // UI State
  const [showSignOutDialog, setShowSignOutDialog] = useState(false);
  const [showDeleteAccountDialog, setShowDeleteAccountDialog] = useState(false);

  // Convex mutation for deleting account
  const deleteMyAccountMutation = useMutation(api.deleteMyAccount.deleteMyAccount);

  // Handlers
  const toggleHaptics = useCallback(async (value: boolean) => {
    try {
      if (value) Haptics.selectionAsync();
      await updateSettings({ hapticsEnabled: value });
    } catch (error) {
      console.error('[Settings] Failed to update haptics:', error);
      Alert.alert('Error', 'Failed to update setting.');
    }
  }, [updateSettings]);

  const handleSyncNow = useCallback(() => {
    if (isSyncBusy) return;
    Haptics.selectionAsync();

    syncNow('manual_settings').catch((error) => {
      console.error('[Settings] Manual sync failed:', error);
      Alert.alert('Sync Failed', 'Please try again.');
    });
  }, [isSyncBusy, syncNow]);

  const openLink = async (url: string) => {
    Haptics.selectionAsync();
    const supported = await Linking.canOpenURL(url);
    if (supported) {
      await Linking.openURL(url);
    }
  };

  const handleSignOut = useCallback(async (removeData: boolean) => {
    try {
      if (removeData) {
        // Clear all local data
        await clearAllData();

        // Mark device as guest-owned after wipe.
        await setLocalDbOwner('guest');

        // Reset per-user sync cursor so a reinstall doesn't miss remote history.
        if (clerkUserId) {
          await clearSyncStateForUser(clerkUserId);
        }
      }

      // Sign out from Clerk
      await signOut();
      setShowSignOutDialog(false);
    } catch (error) {
      console.error('[Settings] Sign out error:', error);
      Alert.alert('Error', 'Failed to sign out. Please try again.');
    }
  }, [signOut, clerkUserId]);

  const handleSignInComplete = useCallback(() => {
    // SyncProvider handles merge + background sync.
  }, []);

  const handleDeleteAccount = useCallback(async () => {
    try {
      // Delete all user data from Convex
      await deleteMyAccountMutation();

      // Clear local data
      await clearAllData();

      // Mark device as guest-owned after wipe.
      await setLocalDbOwner('guest');

      // Clear sync state
      if (clerkUserId) {
        await clearSyncStateForUser(clerkUserId);
      }

      // Sign out from Clerk
      await signOut();

      setShowDeleteAccountDialog(false);
    } catch (error) {
      console.error('[Settings] Delete account error:', error);
      Alert.alert('Error', 'Failed to delete account. Please try again.');
    }
  }, [deleteMyAccountMutation, signOut, clerkUserId]);

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" />

      <ScrollView
        contentContainerStyle={[styles.scrollContent, { paddingTop: insets.top + 20 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* Title */}
        <Text style={styles.title}>Settings</Text>

        {/* Account Section */}
        <View style={styles.section}>
          <SectionHeader title="Account" />

          {isLoaded && (
            isSignedIn && user ? (
              <UserProfileCard
                email={user.primaryEmailAddress?.emailAddress}
                firstName={user.firstName}
                imageUrl={user.imageUrl}
                onSignOutPress={() => setShowSignOutDialog(true)}
              />
            ) : (
              <View style={styles.signInContainer}>
                <Text style={styles.guestLabel}>You're using BudgetThing as a guest</Text>
                <Text style={styles.guestHint}>
                  Sign in to sync your data across devices
                </Text>
                <View style={styles.signInButtonWrapper}>
                  <AppleSignInButton onSignInComplete={handleSignInComplete} />
                </View>
              </View>
            )
          )}
        </View>

        {/* Sync Section */}
        <View style={styles.section}>
          <SectionHeader title="Sync" />

          <SettingsItem
            label="Status"
            rightElement={
              <View style={styles.syncStatusRight}>
                {isSyncBusy && (
                  <ActivityIndicator size="small" color="rgba(255, 255, 255, 0.9)" />
                )}
                <Text style={styles.syncStatusText}>{syncStatusLabel}</Text>
              </View>
            }
          />

          <SettingsItem
            label="Last Sync"
            rightElement={
              <Text style={styles.syncValueText}>
                {isSignedIn ? lastSyncLabel : '—'}
              </Text>
            }
          />

          <SettingsItem
            label="Sync Now"
            onPress={isSyncBusy ? undefined : handleSyncNow}
            rightElement={
              isSyncBusy ? (
                <ActivityIndicator size="small" color="rgba(255, 255, 255, 0.9)" />
              ) : (
                <Ionicons name="refresh" size={16} color="rgba(255, 255, 255, 0.25)" />
              )
            }
          />

          {isSignedIn && lastSyncError ? (
            <Text style={styles.syncErrorText}>Last sync failed. Try again later.</Text>
          ) : null}
        </View>

        {/* Basics Section */}
        <View style={styles.section}>
          <SectionHeader title="Basics" />

          <SettingsItem
            label="Haptics"
            rightElement={
              <Switch
                value={hapticsEnabled}
                onValueChange={toggleHaptics}
                trackColor={{ false: '#3a3a3c', true: '#34C759' }}
                thumbColor="#FFFFFF"
                ios_backgroundColor="#3a3a3c"
              />
            }
          />

          <SettingsItem
            label="Currency"
            onPress={() => {
              Haptics.selectionAsync();
              router.push('/settings/currency');
            }}
            rightElement={
              <View style={styles.currencyPill}>
                <Text style={styles.currencyText}>{currency}</Text>
              </View>
            }
          />
        </View>

        {/* Manage Section */}
        <View style={styles.section}>
          <SectionHeader title="Manage" />

          <SettingsItem
            label="Manage Accounts"
            onPress={() => {
              Haptics.selectionAsync();
              router.push('/settings/accounts');
            }}
            rightElement={<Chevron />}
          />

          <SettingsItem
            label="Manage Categories"
            onPress={() => {
              Haptics.selectionAsync();
              router.push('/settings/categories');
            }}
            rightElement={<Chevron />}
          />
        </View>

        {/* Help Section */}
        <View style={styles.section}>
          <SectionHeader title="Help" />

          <SettingsItem
            label="Support"
            onPress={() => openLink("https://budgetthing.vanshraja.me/support")}
            rightElement={<ExternalLinkIcon />}
          />

          <SettingsItem
            label="Privacy Policy"
            onPress={() => openLink("https://budgetthing.vanshraja.me/privacy")}
            rightElement={<ExternalLinkIcon />}
          />

          <SettingsItem
            label="View Tutorial"
            onPress={() => {
              Haptics.selectionAsync();
              router.push({ pathname: '/onboarding', params: { fromSettings: 'true' } });
            }}
            rightElement={<Chevron />}
          />
        </View>

        {/* About Section */}
        <View style={styles.footer}>
          <SectionHeader title="About" />
          <Text style={styles.aboutText}>
            BudgetThing helps you log expenses quickly with a simple, clean UI.
          </Text>
          <Text style={styles.versionText}>Version 1.0 (1)</Text>
        </View>

        {/* Delete Account Section - Only shown when signed in */}
        {isSignedIn && (
          <View style={styles.deleteSection}>
            <TouchableOpacity
              style={styles.deleteAccountButton}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                setShowDeleteAccountDialog(true);
              }}
              activeOpacity={0.7}
            >
              <Text style={styles.deleteAccountText}>Delete My Account</Text>
            </TouchableOpacity>
          </View>
        )}

      </ScrollView>

      <FloatingTabSwitcher
        selectedIndex={selectedIndex}
        onSelectIndex={onSelectIndex}
      />

      {/* Sign Out Dialog */}
      <SignOutDialog
        visible={showSignOutDialog}
        onDismiss={() => setShowSignOutDialog(false)}
        onSignOut={handleSignOut}
      />

      {/* Delete Account Dialog */}
      <DeleteAccountDialog
        visible={showDeleteAccountDialog}
        onDismiss={() => setShowDeleteAccountDialog(false)}
        onDelete={handleDeleteAccount}
      />

    </View>
  );
}

// ============================================================================
// Styles
// ============================================================================

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
  scrollContent: {
    paddingHorizontal: 24,
    paddingBottom: 100,
  },
  title: {
    fontFamily: 'AvenirNextCondensed-Heavy',
    fontSize: 36,
    color: '#FFFFFF',
    marginBottom: 18,
  },
  section: {
    marginBottom: 8,
  },
  sectionHeader: {
    fontFamily: 'AvenirNextCondensed-DemiBold',
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.6)',
    marginTop: 10,
    marginBottom: 4,
  },
  itemContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 44,
  },
  itemLabel: {
    fontFamily: 'AvenirNextCondensed-DemiBold',
    fontSize: 18,
    color: '#FFFFFF',
  },

  // Sync
  syncStatusRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  syncStatusText: {
    fontFamily: 'AvenirNextCondensed-Medium',
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.6)',
  },
  syncValueText: {
    fontFamily: 'AvenirNextCondensed-Medium',
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.6)',
  },
  syncErrorText: {
    fontFamily: 'AvenirNextCondensed-Medium',
    fontSize: 13,
    color: 'rgba(255, 59, 48, 0.9)',
    marginTop: 4,
  },

  // Sign In Section
  signInContainer: {
    marginTop: 8,
  },
  guestLabel: {
    fontFamily: 'AvenirNextCondensed-DemiBold',
    fontSize: 16,
    color: '#FFFFFF',
    marginBottom: 4,
  },
  guestHint: {
    fontFamily: 'AvenirNextCondensed-Medium',
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.5)',
    marginBottom: 16,
  },
  signInButtonWrapper: {
    marginBottom: 8,
  },

  // Currency Pill
  currencyPill: {
    paddingHorizontal: 12,
    height: 36,
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
    borderRadius: 9999,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.15)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  currencyText: {
    fontFamily: 'AvenirNextCondensed-DemiBold',
    fontSize: 16,
    color: '#FFFFFF',
  },

  // Footer
  footer: {
    marginTop: 10,
    gap: 6,
  },
  aboutText: {
    fontFamily: 'AvenirNextCondensed-DemiBold',
    fontSize: 16,
    color: 'rgba(255, 255, 255, 0.6)',
    lineHeight: 22,
  },
  versionText: {
    fontSize: 12,
    color: 'rgba(255, 255, 255, 0.45)',
    marginTop: 4,
  },

  // Delete Account Section
  deleteSection: {
    marginTop: 32,
    paddingTop: 24,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 59, 48, 0.2)',
  },
  deleteAccountButton: {
    padding: 16,
    alignItems: 'center',
  },
  deleteAccountText: {
    fontFamily: 'AvenirNextCondensed-DemiBold',
    fontSize: 16,
    color: '#FF3B30',
  },
});
