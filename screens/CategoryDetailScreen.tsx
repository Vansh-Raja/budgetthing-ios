/**
 * Category Detail Screen - View category information
 * 
 * Pixel-perfect port of CategoryDetailView.swift
 */

import { useCustomPopup } from '@/components/ui/CustomPopupProvider';
import { Text } from '@/components/ui/LockedText';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import {
    Modal,
    StyleSheet,
    TouchableOpacity,
    View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { CustomPopupProvider } from '@/components/ui/CustomPopupProvider';
import { Colors } from '../constants/theme';
import { CategoryRepository } from '../lib/db/repositories';
import { useCategories } from '../lib/hooks/useData';
import { formatCents } from '../lib/logic/currencyUtils';
import { EditCategoryScreen } from './EditCategoryScreen';

interface CategoryDetailScreenProps {
    categoryId: string;
    onDismiss?: () => void;
}

export function CategoryDetailScreen({ categoryId, onDismiss }: CategoryDetailScreenProps) {
    const router = useRouter();
    const insets = useSafeAreaInsets();
    const { data: categories, refresh } = useCategories();
    const { showPopup } = useCustomPopup();

    const [showEditor, setShowEditor] = useState(false);
    const [showDeletedToast, setShowDeletedToast] = useState(false);

    const category = categories.find(c => c.id === categoryId);

    const handleBack = () => {
        if (onDismiss) onDismiss();
        else router.back();
    };

    const handleEdit = () => {
        Haptics.selectionAsync();
        setShowEditor(true);
    };

    const handleDelete = () => {
        Haptics.selectionAsync();
        showPopup({
            title: 'Delete Category?',
            message: 'This will also delete all transactions in this category. This cannot be undone.',
            buttons: [
                { text: 'Cancel', style: 'cancel' },
                {
                    text: 'Delete',
                    style: 'destructive',
                    onPress: async () => {
                        try {
                            await CategoryRepository.delete(categoryId);
                            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                            setShowDeletedToast(true);
                            setTimeout(() => {
                                handleBack();
                            }, 900);
                        } catch (e) {
                            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
                        }
                    },
                },
            ],
        });
    };

    const handleEditorSave = () => {
        refresh();
        setShowEditor(false);
    };

    if (!category) {
        return (
            <View style={styles.container}>
                <Text style={styles.emptyText}>Category not found</Text>
            </View>
        );
    }

    return (
        <View style={styles.container}>
            <View style={[styles.content, { paddingTop: insets.top + 16 }]}>
                {/* Navigation */}
                <View style={styles.headerNav}>
                    <TouchableOpacity onPress={handleBack} style={styles.navButton}>
                        <Ionicons name="chevron-back" size={24} color="#FFFFFF" />
                    </TouchableOpacity>
                    <View style={{ flex: 1 }} />
                    <TouchableOpacity onPress={handleDelete} style={styles.navButton}>
                        <Text style={styles.deleteText}>Delete</Text>
                    </TouchableOpacity>
                </View>

                {/* Category Header */}
                <View style={styles.header}>
                    <View style={styles.emojiContainer}>
                        <Text style={styles.emoji}>{category.emoji}</Text>
                    </View>
                    <Text style={styles.name}>{category.name}</Text>
                </View>

                {/* Info Card */}
                <Text style={styles.sectionLabel}>Budget & Options</Text>
                <View style={styles.card}>
                    <View style={styles.cardRow}>
                        <Text style={styles.cardLabel}>Monthly Budget</Text>
                        <View style={styles.cardValueContainer}>
                            <Text style={styles.cardValue}>
                                {category.monthlyBudgetCents
                                    ? formatCents(category.monthlyBudgetCents)
                                    : 'None'}
                            </Text>
                        </View>
                    </View>

                    <View style={styles.divider} />

                    <View style={styles.cardRow}>
                        <Text style={styles.cardLabel}>Color Accent</Text>
                        <View style={[styles.colorCircle, { backgroundColor: Colors.accent }]} />
                    </View>
                </View>

                {/* Edit Button */}
                <TouchableOpacity style={styles.editButton} onPress={handleEdit}>
                    <Ionicons name="pencil" size={18} color="#FFFFFF" />
                    <Text style={styles.editButtonText}>Edit Category</Text>
                </TouchableOpacity>
            </View>

            {/* Deleted Toast */}
            {showDeletedToast && (
                <View style={styles.toast}>
                    <Text style={styles.toastText}>Deleted</Text>
                </View>
            )}

            {/* Edit Modal */}
            <Modal
                visible={showEditor}
                animationType="slide"
                presentationStyle="pageSheet"
                onRequestClose={() => setShowEditor(false)}
            >
                <CustomPopupProvider>
                    <EditCategoryScreen
                        categoryId={categoryId}
                        onDismiss={() => setShowEditor(false)}
                        onSave={handleEditorSave}
                    />
                </CustomPopupProvider>
            </Modal>
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
    content: {
        flex: 1,
        paddingHorizontal: 24,
    },

    // Navigation
    headerNav: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 24,
    },
    navButton: {
        padding: 4,
    },
    deleteText: {
        fontSize: 17,
        color: '#FF3B30',
    },

    // Header
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        marginBottom: 24,
    },
    emojiContainer: {
        width: 56,
        height: 48,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: 'rgba(255, 255, 255, 0.08)',
        borderRadius: 12,
    },
    emoji: {
        fontSize: 36,
    },
    name: {
        fontFamily: 'AvenirNextCondensed-Heavy',
        fontSize: 32,
        color: '#FFFFFF',
    },

    // Section
    sectionLabel: {
        fontSize: 14,
        color: 'rgba(255, 255, 255, 0.7)',
        marginBottom: 12,
    },

    // Card
    card: {
        backgroundColor: 'rgba(255, 255, 255, 0.06)',
        borderRadius: 16,
        padding: 16,
        gap: 12,
        marginBottom: 24,
    },
    cardRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
    },
    cardLabel: {
        fontSize: 16,
        color: '#FFFFFF',
    },
    cardValueContainer: {
        paddingHorizontal: 12,
        paddingVertical: 6,
        backgroundColor: 'rgba(255, 255, 255, 0.08)',
        borderRadius: 999,
    },
    cardValue: {
        fontSize: 14,
        color: 'rgba(255, 255, 255, 0.7)',
    },
    divider: {
        height: 1,
        backgroundColor: 'rgba(255, 255, 255, 0.1)',
    },
    colorCircle: {
        width: 20,
        height: 20,
        borderRadius: 10,
    },

    // Edit Button
    editButton: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        paddingVertical: 14,
        backgroundColor: 'rgba(255, 255, 255, 0.08)',
        borderRadius: 12,
    },
    editButtonText: {
        fontFamily: 'AvenirNextCondensed-DemiBold',
        fontSize: 18,
        color: '#FFFFFF',
    },

    // Toast
    toast: {
        position: 'absolute',
        top: 100,
        left: 0,
        right: 0,
        alignItems: 'center',
    },
    toastText: {
        fontFamily: 'AvenirNextCondensed-DemiBold',
        fontSize: 18,
        color: '#FFFFFF',
        paddingHorizontal: 14,
        paddingVertical: 8,
        backgroundColor: 'rgba(255, 255, 255, 0.08)',
        borderRadius: 999,
    },

    // Empty
    emptyText: {
        color: 'rgba(255, 255, 255, 0.5)',
        textAlign: 'center',
        marginTop: 100,
    },
});
