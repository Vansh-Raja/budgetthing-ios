/**
 * Guest Upgrade Dialog
 * 
 * Shown when a guest user signs in for the first time and has local data.
 * Asks whether to upload local data to sync across devices.
 */

import React from 'react';
import {
    Modal,
    View,
    Text,
    TouchableOpacity,
    StyleSheet,
    ActivityIndicator,
} from 'react-native';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';

interface GuestUpgradeDialogProps {
    visible: boolean;
    isLoading: boolean;
    onConfirm: () => void;
    onSkip: () => void;
}

export function GuestUpgradeDialog({
    visible,
    isLoading,
    onConfirm,
    onSkip,
}: GuestUpgradeDialogProps) {
    const handleConfirm = () => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        onConfirm();
    };

    const handleSkip = () => {
        Haptics.selectionAsync();
        onSkip();
    };

    return (
        <Modal
            visible={visible}
            transparent
            animationType="fade"
            onRequestClose={onSkip}
        >
            <BlurView intensity={40} tint="dark" style={styles.backdrop}>
                <View style={styles.dialog}>
                    <View style={styles.iconContainer}>
                        <Ionicons name="cloud-upload-outline" size={48} color="#FF9500" />
                    </View>

                    <Text style={styles.title}>Sync Your Data</Text>
                    <Text style={styles.message}>
                        You have existing data on this device. Would you like to upload it to sync across all your devices?
                    </Text>

                    <View style={styles.buttonContainer}>
                        <TouchableOpacity
                            style={[styles.button, styles.primaryButton]}
                            onPress={handleConfirm}
                            disabled={isLoading}
                            activeOpacity={0.8}
                        >
                            {isLoading ? (
                                <ActivityIndicator color="#000000" size="small" />
                            ) : (
                                <Text style={styles.primaryButtonText}>Upload My Data</Text>
                            )}
                        </TouchableOpacity>

                        <TouchableOpacity
                            style={[styles.button, styles.secondaryButton]}
                            onPress={handleSkip}
                            disabled={isLoading}
                            activeOpacity={0.8}
                        >
                            <Text style={styles.secondaryButtonText}>Start Fresh</Text>
                        </TouchableOpacity>
                    </View>

                    <Text style={styles.hint}>
                        Your local data will remain on this device either way.
                    </Text>
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
        width: 80,
        height: 80,
        borderRadius: 40,
        backgroundColor: 'rgba(255, 149, 0, 0.15)',
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 16,
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
        width: '100%',
        gap: 12,
    },
    button: {
        height: 50,
        borderRadius: 12,
        justifyContent: 'center',
        alignItems: 'center',
    },
    primaryButton: {
        backgroundColor: '#FF9500',
    },
    primaryButtonText: {
        fontFamily: 'AvenirNextCondensed-DemiBold',
        fontSize: 17,
        color: '#000000',
    },
    secondaryButton: {
        backgroundColor: 'rgba(255, 255, 255, 0.12)',
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.15)',
    },
    secondaryButtonText: {
        fontFamily: 'AvenirNextCondensed-DemiBold',
        fontSize: 17,
        color: '#FFFFFF',
    },
    hint: {
        fontFamily: 'AvenirNextCondensed-Medium',
        fontSize: 13,
        color: 'rgba(255, 255, 255, 0.4)',
        textAlign: 'center',
        marginTop: 16,
    },
});
