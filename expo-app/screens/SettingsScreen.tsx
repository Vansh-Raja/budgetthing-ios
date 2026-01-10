/**
 * Settings Screen - App settings and preferences
 * 
 * Pixel-perfect port of SettingsView.swift
 * Now includes Account section with Sign In / Sign Out functionality
 */

import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  StatusBar,
  Switch,
  Linking,
  Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';

import { Colors } from '../constants/theme';
import { FloatingTabSwitcher } from '../components/ui/FloatingTabSwitcher';
import {
  AppleSignInButton,
  SignOutDialog,
  GuestUpgradeDialog,
  UserProfileCard,
} from '../components/auth';
import { useAuthState, useGuestUpgrade, useHasLocalData } from '../lib/auth/useAuthHooks';
import { clearAllData } from '../lib/db/database';

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
  const { showUpgradeDialog, isUpgrading, confirmUpgrade, skipUpgrade } = useGuestUpgrade();
  useHasLocalData(); // Track local data for upgrade flow

  // UI State
  const [hapticsEnabled, setHapticsEnabled] = useState(true);
  const [currency, setCurrency] = useState('INR');
  const [showSignOutDialog, setShowSignOutDialog] = useState(false);

  // Handlers
  const toggleHaptics = (value: boolean) => {
    setHapticsEnabled(value);
    if (value) Haptics.selectionAsync();
  };

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
      }

      // Sign out from Clerk
      await signOut();
      setShowSignOutDialog(false);
    } catch (error) {
      console.error('[Settings] Sign out error:', error);
      Alert.alert('Error', 'Failed to sign out. Please try again.');
    }
  }, [signOut]);

  const handleSignInComplete = useCallback(() => {
    // The useGuestUpgrade hook will handle showing the upgrade dialog
    console.log('[Settings] Sign in complete');
  }, []);

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
              Alert.alert("Tutorial", "Onboarding flow coming soon");
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

      {/* Guest Upgrade Dialog */}
      <GuestUpgradeDialog
        visible={showUpgradeDialog}
        isLoading={isUpgrading}
        onConfirm={confirmUpgrade}
        onSkip={skipUpgrade}
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
});
