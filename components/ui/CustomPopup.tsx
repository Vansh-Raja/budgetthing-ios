/**
 * CustomPopup - A unified popup component with three variants:
 * - alert: Confirmation dialogs with title, message, and buttons
 * - actionSheet: Selection menus with action items
 * - info: Copyable content display (e.g., join codes)
 */

import { Text } from '@/components/ui/LockedText';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import React from 'react';
import {
    Modal,
    Pressable,
    StyleSheet,
    TouchableOpacity,
    View,
} from 'react-native';
import Animated, {
    useAnimatedStyle,
    useSharedValue,
    withTiming
} from 'react-native-reanimated';

import { Colors, Fonts } from '@/constants/theme';

// ============================================================================
// Types
// ============================================================================

export interface PopupButton {
    text: string;
    style?: 'default' | 'cancel' | 'destructive';
    onPress?: () => void;
}

export interface PopupAction {
    text: string;
    icon?: keyof typeof Ionicons.glyphMap;
    style?: 'default' | 'destructive';
    onPress: () => void;
}

export interface CustomPopupProps {
    visible: boolean;
    onClose: () => void;

    // Content
    title: string;
    message?: string;

    // Variant
    variant: 'alert' | 'actionSheet' | 'info';

    // For 'alert' variant
    buttons?: PopupButton[];

    // For 'actionSheet' variant
    actions?: PopupAction[];

    // For 'info' variant (copyable content)
    copyableContent?: string;
    copyButtonText?: string;
}

// ============================================================================
// Component
// ============================================================================

export function CustomPopup({
    visible,
    onClose,
    title,
    message,
    variant,
    buttons = [],
    actions = [],
    copyableContent,
    copyButtonText = 'Copy',
}: CustomPopupProps) {
    const [copied, setCopied] = React.useState(false);
    const opacity = useSharedValue(0);
    const scale = useSharedValue(0.95);

    React.useEffect(() => {
        if (visible) {
            setCopied(false);
            opacity.value = withTiming(1, { duration: 200 });
            scale.value = withTiming(1, { duration: 200 });
        } else {
            opacity.value = withTiming(0, { duration: 150 });
            scale.value = withTiming(0.95, { duration: 150 });
        }
    }, [visible, opacity, scale]);

    const backdropStyle = useAnimatedStyle(() => ({
        opacity: opacity.value,
    }));

    const cardStyle = useAnimatedStyle(() => ({
        opacity: opacity.value,
        transform: [{ scale: scale.value }],
    }));

    const handleCopy = async () => {
        if (!copyableContent) return;
        await Clipboard.setStringAsync(copyableContent);
        setCopied(true);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

        // Reset after 2 seconds
        setTimeout(() => setCopied(false), 2000);
    };

    const handleButtonPress = (button: PopupButton) => {
        Haptics.selectionAsync();
        // Close first, then call onPress - allows nested popups to work
        onClose();
        // Use setTimeout to ensure state updates before callback runs
        setTimeout(() => button.onPress?.(), 50);
    };

    const handleActionPress = (action: PopupAction) => {
        Haptics.selectionAsync();
        // Close first, then call onPress - allows nested popups to work
        onClose();
        // Use setTimeout to ensure state updates before callback runs
        setTimeout(() => action.onPress(), 50);
    };

    const handleBackdropPress = () => {
        Haptics.selectionAsync();
        onClose();
    };

    if (!visible) return null;

    return (
        <Modal
            visible={visible}
            transparent
            animationType="none"
            onRequestClose={onClose}
        >
            <Animated.View style={[styles.backdrop, backdropStyle]}>
                <Pressable style={StyleSheet.absoluteFill} onPress={handleBackdropPress} />

                <Animated.View style={[styles.card, cardStyle]}>
                    {/* Title */}
                    <Text style={styles.title}>{title}</Text>

                    {/* Message (for alert variant) */}
                    {variant === 'alert' && message && (
                        <Text style={styles.message}>{message}</Text>
                    )}

                    {/* Info variant - Copyable content */}
                    {variant === 'info' && copyableContent && (
                        <View style={styles.infoContainer}>
                            <View style={styles.codeBox}>
                                <Text style={styles.codeText}>{copyableContent}</Text>
                            </View>

                            <TouchableOpacity
                                style={[styles.copyButton, copied && styles.copyButtonSuccess]}
                                onPress={handleCopy}
                                activeOpacity={0.7}
                            >
                                <Ionicons
                                    name={copied ? 'checkmark' : 'copy-outline'}
                                    size={18}
                                    color={copied ? Colors.success : '#FFFFFF'}
                                />
                                <Text style={[styles.copyButtonText, copied && styles.copyButtonTextSuccess]}>
                                    {copied ? 'Copied!' : copyButtonText}
                                </Text>
                            </TouchableOpacity>
                        </View>
                    )}

                    {/* Action Sheet variant - Action items */}
                    {variant === 'actionSheet' && actions.length > 0 && (
                        <View style={styles.actionsContainer}>
                            {actions.map((action, index) => (
                                <TouchableOpacity
                                    key={index}
                                    style={[
                                        styles.actionButton,
                                        action.style === 'destructive' && styles.actionButtonDestructive,
                                    ]}
                                    onPress={() => handleActionPress(action)}
                                    activeOpacity={0.7}
                                >
                                    {action.icon && (
                                        <Ionicons
                                            name={action.icon}
                                            size={20}
                                            color={action.style === 'destructive' ? Colors.error : Colors.accent}
                                            style={styles.actionIcon}
                                        />
                                    )}
                                    <Text
                                        style={[
                                            styles.actionText,
                                            action.style === 'destructive' && styles.actionTextDestructive,
                                        ]}
                                    >
                                        {action.text}
                                    </Text>
                                </TouchableOpacity>
                            ))}
                        </View>
                    )}

                    {/* Alert variant - Buttons */}
                    {variant === 'alert' && buttons.length > 0 && (
                        <View style={styles.buttonsContainer}>
                            {buttons.map((button, index) => (
                                <TouchableOpacity
                                    key={index}
                                    style={[
                                        styles.button,
                                        button.style === 'cancel' && styles.buttonCancel,
                                        button.style === 'destructive' && styles.buttonDestructive,
                                        button.style === 'default' && styles.buttonDefault,
                                        !button.style && styles.buttonDefault,
                                    ]}
                                    onPress={() => handleButtonPress(button)}
                                    activeOpacity={0.7}
                                >
                                    <Text
                                        style={[
                                            styles.buttonText,
                                            button.style === 'destructive' && styles.buttonTextDestructive,
                                        ]}
                                    >
                                        {button.text}
                                    </Text>
                                </TouchableOpacity>
                            ))}
                        </View>
                    )}

                    {/* Info variant - Close button */}
                    {variant === 'info' && (
                        <TouchableOpacity
                            style={styles.closeButton}
                            onPress={() => { Haptics.selectionAsync(); onClose(); }}
                            activeOpacity={0.7}
                        >
                            <Text style={styles.closeButtonText}>Done</Text>
                        </TouchableOpacity>
                    )}

                    {/* Action Sheet variant - Cancel button */}
                    {variant === 'actionSheet' && (
                        <TouchableOpacity
                            style={styles.cancelButton}
                            onPress={() => { Haptics.selectionAsync(); onClose(); }}
                            activeOpacity={0.7}
                        >
                            <Text style={styles.cancelButtonText}>Cancel</Text>
                        </TouchableOpacity>
                    )}
                </Animated.View>
            </Animated.View>
        </Modal>
    );
}

// ============================================================================
// Styles
// ============================================================================

const styles = StyleSheet.create({
    backdrop: {
        flex: 1,
        backgroundColor: 'rgba(0, 0, 0, 0.55)',
        justifyContent: 'center',
        alignItems: 'center',
        padding: 20,
    },
    card: {
        width: '100%',
        maxWidth: 320,
        backgroundColor: '#1C1C1E',
        borderRadius: 18,
        padding: 20,
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.10)',
    },

    // Title & Message
    title: {
        fontFamily: Fonts.heavy,
        fontSize: 20,
        color: '#FFFFFF',
        textAlign: 'center',
        marginBottom: 8,
    },
    message: {
        fontFamily: Fonts.medium,
        fontSize: 15,
        color: 'rgba(255, 255, 255, 0.6)',
        textAlign: 'center',
        marginBottom: 16,
        lineHeight: 20,
    },

    // Info variant
    infoContainer: {
        marginTop: 8,
        marginBottom: 16,
    },
    codeBox: {
        backgroundColor: 'rgba(255, 255, 255, 0.08)',
        borderRadius: 12,
        paddingVertical: 16,
        paddingHorizontal: 20,
        marginBottom: 12,
        alignItems: 'center',
    },
    codeText: {
        fontFamily: Fonts.heavy,
        fontSize: 28,
        color: Colors.accent,
        letterSpacing: 4,
    },
    copyButton: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'rgba(255, 255, 255, 0.10)',
        borderRadius: 12,
        paddingVertical: 12,
        paddingHorizontal: 20,
        gap: 8,
    },
    copyButtonSuccess: {
        backgroundColor: 'rgba(52, 199, 89, 0.15)',
    },
    copyButtonText: {
        fontFamily: Fonts.demiBold,
        fontSize: 16,
        color: '#FFFFFF',
    },
    copyButtonTextSuccess: {
        color: Colors.success,
    },

    // Action Sheet variant
    actionsContainer: {
        marginTop: 8,
        marginBottom: 12,
        gap: 8,
    },
    actionButton: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: 'rgba(255, 255, 255, 0.08)',
        borderRadius: 12,
        paddingVertical: 14,
        paddingHorizontal: 16,
    },
    actionButtonDestructive: {
        backgroundColor: 'rgba(255, 59, 48, 0.12)',
    },
    actionIcon: {
        marginRight: 12,
    },
    actionText: {
        fontFamily: Fonts.demiBold,
        fontSize: 17,
        color: '#FFFFFF',
    },
    actionTextDestructive: {
        color: Colors.error,
    },

    // Alert variant buttons
    buttonsContainer: {
        flexDirection: 'row',
        gap: 10,
        marginTop: 8,
    },
    button: {
        flex: 1,
        paddingVertical: 12,
        borderRadius: 12,
        alignItems: 'center',
    },
    buttonDefault: {
        backgroundColor: Colors.accent,
    },
    buttonCancel: {
        backgroundColor: 'rgba(255, 255, 255, 0.10)',
    },
    buttonDestructive: {
        backgroundColor: 'rgba(255, 59, 48, 0.15)',
    },
    buttonText: {
        fontFamily: Fonts.demiBold,
        fontSize: 16,
        color: '#FFFFFF',
    },
    buttonTextDestructive: {
        color: Colors.error,
    },

    // Close button (info variant)
    closeButton: {
        backgroundColor: Colors.accent,
        borderRadius: 12,
        paddingVertical: 12,
        alignItems: 'center',
    },
    closeButtonText: {
        fontFamily: Fonts.demiBold,
        fontSize: 16,
        color: '#FFFFFF',
    },

    // Cancel button (action sheet variant)
    cancelButton: {
        backgroundColor: 'rgba(255, 255, 255, 0.10)',
        borderRadius: 12,
        paddingVertical: 12,
        alignItems: 'center',
        marginTop: 4,
    },
    cancelButtonText: {
        fontFamily: Fonts.demiBold,
        fontSize: 16,
        color: 'rgba(255, 255, 255, 0.6)',
    },
});
