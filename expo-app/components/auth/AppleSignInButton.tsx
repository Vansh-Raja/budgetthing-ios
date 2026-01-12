/**
 * Sign In with Apple Button Component
 * 
 * Uses Clerk's SSO integration for Apple Sign-In on iOS.
 */

import React, { useState, useCallback } from 'react';
import {
    TouchableOpacity,
    StyleSheet,
    ActivityIndicator,
    Alert,
    View,
} from 'react-native';
import { Text } from '@/components/ui/LockedText';
import { useSSO } from '@clerk/clerk-expo';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import * as WebBrowser from 'expo-web-browser';

// Needed for OAuth redirect handling
WebBrowser.maybeCompleteAuthSession();

interface AppleSignInButtonProps {
    onSignInStart?: () => void;
    onSignInComplete?: () => void;
    onSignInError?: (error: Error) => void;
}

export function AppleSignInButton({
    onSignInStart,
    onSignInComplete,
    onSignInError,
}: AppleSignInButtonProps) {
    const [isLoading, setIsLoading] = useState(false);
    const { startSSOFlow } = useSSO();

    const handleSignIn = useCallback(async () => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        setIsLoading(true);
        onSignInStart?.();

        try {
            const { createdSessionId, setActive } = await startSSOFlow({
                strategy: 'oauth_apple',
            });

            if (createdSessionId && setActive) {
                await setActive({ session: createdSessionId });
                Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                onSignInComplete?.();
            }
        } catch (error: any) {
            console.error('[Auth] Apple Sign-In error:', error);
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);

            // Don't show error for user cancellation
            if (error?.errors?.[0]?.code !== 'user_cancelled') {
                Alert.alert(
                    'Sign In Failed',
                    error?.errors?.[0]?.message || 'An error occurred during sign in. Please try again.',
                );
                onSignInError?.(error);
            }
        } finally {
            setIsLoading(false);
        }
    }, [startSSOFlow, onSignInStart, onSignInComplete, onSignInError]);

    return (
        <TouchableOpacity
            style={styles.button}
            onPress={handleSignIn}
            disabled={isLoading}
            activeOpacity={0.8}
        >
            {isLoading ? (
                <ActivityIndicator color="#000000" size="small" />
            ) : (
                <>
                    <Ionicons name="logo-apple" size={20} color="#000000" />
                    <Text style={styles.buttonText}>Sign in with Apple</Text>
                </>
            )}
        </TouchableOpacity>
    );
}

const styles = StyleSheet.create({
    button: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#FFFFFF',
        height: 50,
        borderRadius: 12,
        gap: 8,
    },
    buttonText: {
        fontFamily: 'AvenirNextCondensed-DemiBold',
        fontSize: 17,
        color: '#000000',
    },
});
