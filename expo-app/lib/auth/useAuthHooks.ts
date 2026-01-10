/**
 * Auth hooks for managing authentication state and flows
 */

import { useAuth, useUser } from '@clerk/clerk-expo';
import { useCallback, useEffect, useState } from 'react';
import * as SecureStore from 'expo-secure-store';
import { syncRepository } from '../db/sync';
import { useSync } from '../sync/syncEngine';
import { isDatabaseReady, waitForDatabase } from '../db/database';

const HAS_LOCAL_DATA_KEY = 'has_local_data';
const UPGRADE_SHOWN_KEY = 'upgrade_dialog_shown';

/**
 * Hook to check if user has local data that could be synced
 * Note: We delay the check to ensure database is initialized
 */
export function useHasLocalData() {
    const [hasLocalData, setHasLocalData] = useState(false);

    useEffect(() => {
        let mounted = true;

        const checkLocalData = async () => {
            try {
                // Wait for database to be ready
                await waitForDatabase();

                if (!mounted) return;

                const pending = await syncRepository.getPendingChanges();
                const hasPending = Object.values(pending).some(arr => arr.length > 0);

                if (!mounted) return;

                setHasLocalData(hasPending);

                // Store for later checks
                await SecureStore.setItemAsync(HAS_LOCAL_DATA_KEY, hasPending ? '1' : '0');
            } catch (error) {
                // Silently handle errors during initial load
                console.log('[Auth] Skipping local data check:', error);
            }
        };

        checkLocalData();

        return () => {
            mounted = false;
        };
    }, []);

    return hasLocalData;
}

/**
 * Hook to handle guest → signed-in upgrade flow
 */
export function useGuestUpgrade() {
    const { isSignedIn } = useAuth();
    const { sync } = useSync(); // Valid: calling hook at top level
    const [showUpgradeDialog, setShowUpgradeDialog] = useState(false);
    const [isUpgrading, setIsUpgrading] = useState(false);

    // Check if we should show upgrade dialog after sign-in
    useEffect(() => {
        const checkUpgrade = async () => {
            if (!isSignedIn) return;

            try {
                // Check if we've already shown the dialog this session
                const shown = await SecureStore.getItemAsync(UPGRADE_SHOWN_KEY);
                if (shown === '1') return;

                // Check if user had local data before signing in
                const hadData = await SecureStore.getItemAsync(HAS_LOCAL_DATA_KEY);
                if (hadData === '1') {
                    setShowUpgradeDialog(true);
                }
            } catch (error) {
                console.log('[Auth] Error checking upgrade status:', error);
            }
        };

        checkUpgrade();
    }, [isSignedIn]);

    const confirmUpgrade = useCallback(async () => {
        setIsUpgrading(true);
        try {
            // Push all local data to Convex
            await sync();

            await SecureStore.setItemAsync(UPGRADE_SHOWN_KEY, '1');
            await SecureStore.deleteItemAsync(HAS_LOCAL_DATA_KEY);

            setShowUpgradeDialog(false);
        } catch (error) {
            console.error('[Auth] Error during upgrade:', error);
            throw error;
        } finally {
            setIsUpgrading(false);
        }
    }, [sync]); // Add sync to dependency array

    const skipUpgrade = useCallback(async () => {
        // User chose not to upload - mark as shown so we don't ask again
        await SecureStore.setItemAsync(UPGRADE_SHOWN_KEY, '1');
        setShowUpgradeDialog(false);
    }, []);

    const dismissDialog = useCallback(() => {
        setShowUpgradeDialog(false);
    }, []);

    return {
        showUpgradeDialog,
        isUpgrading,
        confirmUpgrade,
        skipUpgrade,
        dismissDialog,
    };
}

/**
 * Hook for auth state with convenience methods
 */
export function useAuthState() {
    const { isSignedIn, isLoaded, signOut } = useAuth();
    const { user } = useUser();

    return {
        isLoaded,
        isSignedIn: isSignedIn ?? false,
        isGuest: !isSignedIn,
        user,
        signOut,
    };
}
