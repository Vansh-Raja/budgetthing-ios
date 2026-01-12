/**
 * Delete Account Confirmation Dialog
 * 
 * Allows user to permanently delete their account and all cloud data.
 * Required by Apple App Store guidelines for apps supporting account creation.
 */

import React, { useState } from 'react';
import {
    Modal,
    View,
    TouchableOpacity,
    StyleSheet,
    ActivityIndicator,
} from 'react-native';
import { Text } from '@/components/ui/LockedText';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';

interface DeleteAccountDialogProps {
    visible: boolean;
    onDismiss: () => void;
    onDelete: () => Promise<void>;
}

export function DeleteAccountDialog({
    visible,
    onDismiss,
    onDelete,
}: DeleteAccountDialogProps) {
    const [isLoading, setIsLoading] = useState(false);

    const handleDelete = async () => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
        setIsLoading(true);

        try {
            await onDelete();
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        } catch (error) {
            console.error('[Auth] Delete account error:', error);
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        } finally {
            setIsLoading(false);
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
                    {/* Warning Icon */}
                    <View style={styles.iconContainer}>
                        <Ionicons name="warning" size={40} color="#FF3B30" />
                    </View>

                    <Text style={styles.title}>Delete Account?</Text>
                    <Text style={styles.message}>
                        This will permanently delete your account and all data from our servers.
                        This action cannot be undone.
                    </Text>

                    <View style={styles.buttonContainer}>
                        <TouchableOpacity
                            style={[styles.button, styles.cancelButton]}
                            onPress={onDismiss}
                            disabled={isLoading}
                            activeOpacity={0.8}
                        >
                            <Text style={styles.cancelButtonText}>Cancel</Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                            style={[styles.button, styles.deleteButton]}
                            onPress={handleDelete}
                            disabled={isLoading}
                            activeOpacity={0.8}
                        >
                            {isLoading ? (
                                <ActivityIndicator color="#FFFFFF" size="small" />
                            ) : (
                                <Text style={styles.deleteButtonText}>Delete My Account</Text>
                            )}
                        </TouchableOpacity>
                    </View>
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
        alignItems: 'center',
    },
    iconContainer: {
        width: 64,
        height: 64,
        borderRadius: 32,
        backgroundColor: 'rgba(255, 59, 48, 0.15)',
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 16,
    },
    title: {
        fontFamily: 'AvenirNextCondensed-Heavy',
        fontSize: 24,
        color: '#FF3B30',
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
        width: '100%',
        gap: 12,
    },
    button: {
        width: '100%',
        padding: 16,
        borderRadius: 12,
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: 52,
    },
    cancelButton: {
        backgroundColor: 'rgba(255, 255, 255, 0.12)',
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.15)',
    },
    cancelButtonText: {
        fontFamily: 'AvenirNextCondensed-DemiBold',
        fontSize: 17,
        color: '#FFFFFF',
    },
    deleteButton: {
        backgroundColor: '#FF3B30',
    },
    deleteButtonText: {
        fontFamily: 'AvenirNextCondensed-DemiBold',
        fontSize: 17,
        color: '#FFFFFF',
    },
});
