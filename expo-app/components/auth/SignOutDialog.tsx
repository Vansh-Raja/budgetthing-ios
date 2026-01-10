/**
 * Sign Out Confirmation Dialog
 * 
 * Allows user to choose whether to keep or remove local data when signing out.
 */

import React, { useState } from 'react';
import {
    Modal,
    View,
    Text,
    TouchableOpacity,
    StyleSheet,
    ActivityIndicator,
} from 'react-native';
import { BlurView } from 'expo-blur';
import * as Haptics from 'expo-haptics';

interface SignOutDialogProps {
    visible: boolean;
    onDismiss: () => void;
    onSignOut: (removeData: boolean) => Promise<void>;
}

export function SignOutDialog({
    visible,
    onDismiss,
    onSignOut,
}: SignOutDialogProps) {
    const [isLoading, setIsLoading] = useState(false);
    const [loadingAction, setLoadingAction] = useState<'keep' | 'remove' | null>(null);

    const handleSignOut = async (removeData: boolean) => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        setIsLoading(true);
        setLoadingAction(removeData ? 'remove' : 'keep');

        try {
            await onSignOut(removeData);
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        } catch (error) {
            console.error('[Auth] Sign out error:', error);
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        } finally {
            setIsLoading(false);
            setLoadingAction(null);
        }
    };

    return (
        <Modal
            visible={visible}
            transparent
            animationType="fade"
            onRequestClose={onDismiss}
        >
            <BlurView intensity={40} tint="dark" style={styles.backdrop}>
                <View style={styles.dialog}>
                    <Text style={styles.title}>Sign Out</Text>
                    <Text style={styles.message}>
                        What would you like to do with your data on this device?
                    </Text>

                    <View style={styles.buttonContainer}>
                        <TouchableOpacity
                            style={[styles.button, styles.keepButton]}
                            onPress={() => handleSignOut(false)}
                            disabled={isLoading}
                            activeOpacity={0.8}
                        >
                            {loadingAction === 'keep' ? (
                                <ActivityIndicator color="#FFFFFF" size="small" />
                            ) : (
                                <>
                                    <Text style={styles.buttonTitle}>Keep Data</Text>
                                    <Text style={styles.buttonSubtitle}>
                                        Sign out but keep your data on this device
                                    </Text>
                                </>
                            )}
                        </TouchableOpacity>

                        <TouchableOpacity
                            style={[styles.button, styles.removeButton]}
                            onPress={() => handleSignOut(true)}
                            disabled={isLoading}
                            activeOpacity={0.8}
                        >
                            {loadingAction === 'remove' ? (
                                <ActivityIndicator color="#FF3B30" size="small" />
                            ) : (
                                <>
                                    <Text style={[styles.buttonTitle, styles.removeText]}>Remove Data</Text>
                                    <Text style={[styles.buttonSubtitle, styles.removeSubtitle]}>
                                        Sign out and delete all data from this device
                                    </Text>
                                </>
                            )}
                        </TouchableOpacity>
                    </View>

                    <TouchableOpacity
                        style={styles.cancelButton}
                        onPress={onDismiss}
                        disabled={isLoading}
                        activeOpacity={0.8}
                    >
                        <Text style={styles.cancelText}>Cancel</Text>
                    </TouchableOpacity>
                </View>
            </BlurView>
        </Modal>
    );
}

const styles = StyleSheet.create({
    backdrop: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
    },
    dialog: {
        backgroundColor: '#1C1C1E',
        borderRadius: 20,
        padding: 24,
        width: '85%',
        maxWidth: 340,
    },
    title: {
        fontFamily: 'AvenirNextCondensed-Heavy',
        fontSize: 24,
        color: '#FFFFFF',
        textAlign: 'center',
        marginBottom: 12,
    },
    message: {
        fontFamily: 'AvenirNextCondensed-Medium',
        fontSize: 16,
        color: 'rgba(255, 255, 255, 0.7)',
        textAlign: 'center',
        marginBottom: 24,
        lineHeight: 22,
    },
    buttonContainer: {
        gap: 12,
    },
    button: {
        padding: 16,
        borderRadius: 12,
        alignItems: 'center',
    },
    keepButton: {
        backgroundColor: 'rgba(255, 255, 255, 0.12)',
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.15)',
    },
    removeButton: {
        backgroundColor: 'rgba(255, 59, 48, 0.12)',
        borderWidth: 1,
        borderColor: 'rgba(255, 59, 48, 0.3)',
    },
    buttonTitle: {
        fontFamily: 'AvenirNextCondensed-DemiBold',
        fontSize: 17,
        color: '#FFFFFF',
        marginBottom: 4,
    },
    buttonSubtitle: {
        fontFamily: 'AvenirNextCondensed-Medium',
        fontSize: 13,
        color: 'rgba(255, 255, 255, 0.5)',
        textAlign: 'center',
    },
    removeText: {
        color: '#FF3B30',
    },
    removeSubtitle: {
        color: 'rgba(255, 59, 48, 0.7)',
    },
    cancelButton: {
        marginTop: 16,
        padding: 12,
        alignItems: 'center',
    },
    cancelText: {
        fontFamily: 'AvenirNextCondensed-DemiBold',
        fontSize: 17,
        color: '#FF9500',
    },
});
