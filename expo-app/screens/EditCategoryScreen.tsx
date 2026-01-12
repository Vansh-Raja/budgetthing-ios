/**
 * Edit Category Screen - Create or Edit a Category
 */

import React, { useState, useEffect } from 'react';
import {
    View,
    StyleSheet,
    TouchableOpacity,
    ScrollView,
    Alert,
    KeyboardAvoidingView,
    Platform,
} from 'react-native';
import { Text, TextInput } from '@/components/ui/LockedText';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { Stack, useRouter } from 'expo-router';

import { Colors } from '../constants/theme';
import { Category } from '../lib/logic/types';
import { CategoryRepository } from '../lib/db/repositories';
import { getCurrencySymbol } from '../lib/logic/currencyUtils';

interface EditCategoryScreenProps {
    categoryId?: string;
    onDismiss?: () => void;
    onSave?: () => void;
}

const EMOJI_OPTIONS = ['🍔', '🛒', '🚕', '🏠', '🎉', '💊', '👕', '📱', '✈️', '🎬', '📚', '💼', '🏋️', '☕'];

export function EditCategoryScreen({ categoryId, onDismiss, onSave }: EditCategoryScreenProps) {
    const insets = useSafeAreaInsets();
    const router = useRouter();

    const [name, setName] = useState('');
    const [emoji, setEmoji] = useState('🍔');
    const [budgetStr, setBudgetStr] = useState('');

    const [loading, setLoading] = useState(!!categoryId);
    const [isSaving, setIsSaving] = useState(false);

    useEffect(() => {
        if (categoryId) {
            loadCategory(categoryId);
        }
    }, [categoryId]);

    const loadCategory = async (id: string) => {
        try {
            const category = await CategoryRepository.getById(id);
            if (category) {
                setName(category.name);
                setEmoji(category.emoji);
                setBudgetStr(category.monthlyBudgetCents ? (category.monthlyBudgetCents / 100).toFixed(2) : '');
            }
        } catch (e) {
            console.error("Failed to load category", e);
            Alert.alert("Error", "Could not load category details");
        } finally {
            setLoading(false);
        }
    };

    const handleSave = async () => {
        if (name.trim().length === 0) {
            Alert.alert("Missing Name", "Please enter a category name");
            return;
        }

        try {
            setIsSaving(true);
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

            const monthlyBudgetCents = budgetStr ? Math.round(parseFloat(budgetStr) * 100) : undefined;

            const data = {
                name: name.trim(),
                emoji,
                monthlyBudgetCents,
                isSystem: false,
            };

            if (categoryId) {
                await CategoryRepository.update(categoryId, data);
            } else {
                await CategoryRepository.create(data);
            }

            if (onSave) onSave();
            if (onDismiss) onDismiss();
            else router.back();

        } catch (e) {
            console.error("Failed to save category", e);
            Alert.alert("Error", "Failed to save category");
        } finally {
            setIsSaving(false);
        }
    };

    const handleDelete = async () => {
        Alert.alert(
            "Delete Category?",
            "This will remove the category. Transactions will become uncategorized. This cannot be undone.",
            [
                { text: "Cancel", style: "cancel" },
                {
                    text: "Delete",
                    style: "destructive",
                    onPress: async () => {
                        try {
                            if (categoryId) {
                                await CategoryRepository.delete(categoryId);
                                Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                                if (onSave) onSave();
                                if (onDismiss) onDismiss();
                                else router.back();
                            }
                        } catch (e) {
                            Alert.alert("Error", "Failed to delete category");
                        }
                    }
                }
            ]
        );
    };

    if (loading) return <View style={styles.container} />;

    return (
        <View style={styles.container}>
            {!onDismiss && (
                <Stack.Screen options={{
                    title: categoryId ? "Edit Category" : "New Category",
                    headerStyle: { backgroundColor: '#000000' },
                    headerTintColor: '#FFFFFF',
                    headerRight: () => (
                        <TouchableOpacity onPress={handleSave} disabled={isSaving}>
                            <Text style={[styles.headerButton, isSaving && { opacity: 0.5 }]}>Save</Text>
                        </TouchableOpacity>
                    ),
                }} />
            )}

            {onDismiss && (
                <View style={[styles.header, { paddingTop: insets.top + 10 }]}>
                    <TouchableOpacity onPress={onDismiss} style={styles.closeButton}>
                        <Ionicons name="close" size={24} color="#FFFFFF" />
                    </TouchableOpacity>
                    <Text style={styles.headerTitle}>{categoryId ? "Edit Category" : "New Category"}</Text>
                    <TouchableOpacity onPress={handleSave} disabled={isSaving}>
                        <Text style={[styles.headerButton, isSaving && { opacity: 0.5 }]}>Save</Text>
                    </TouchableOpacity>
                </View>
            )}

            <ScrollView contentContainerStyle={styles.content}>
                <View style={styles.formSection}>
                    <View style={styles.row}>
                        <TouchableOpacity style={styles.emojiButton}>
                            <Text style={styles.emoji}>{emoji}</Text>
                        </TouchableOpacity>
                        <TextInput
                            style={styles.nameInput}
                            value={name}
                            onChangeText={setName}
                            placeholder="Category Name"
                            placeholderTextColor="rgba(255, 255, 255, 0.3)"
                            autoFocus={!categoryId}
                        />
                    </View>

                    {/* Emoji Picker */}
                    <View style={styles.emojiGrid}>
                        {EMOJI_OPTIONS.map(e => (
                            <TouchableOpacity
                                key={e}
                                style={[styles.emojiOption, emoji === e && styles.emojiOptionSelected]}
                                onPress={() => {
                                    Haptics.selectionAsync();
                                    setEmoji(e);
                                }}
                            >
                                <Text style={styles.emojiText}>{e}</Text>
                            </TouchableOpacity>
                        ))}
                    </View>
                </View>

                <View style={styles.formSection}>
                    <View style={styles.inputRow}>
                        <Text style={styles.label}>Monthly Budget</Text>
                        <View style={styles.amountInputContainer}>
                            <Text style={styles.currencySymbol}>{getCurrencySymbol('INR')}</Text>
                            <TextInput
                                style={styles.amountInput}
                                value={budgetStr}
                                onChangeText={setBudgetStr}
                                keyboardType="decimal-pad"
                                placeholder="Optional"
                                placeholderTextColor="rgba(255, 255, 255, 0.3)"
                            />
                        </View>
                    </View>
                </View>

                {categoryId && (
                    <TouchableOpacity style={styles.deleteButton} onPress={handleDelete}>
                        <Text style={styles.deleteText}>Delete Category</Text>
                    </TouchableOpacity>
                )}
            </ScrollView>

            <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} keyboardVerticalOffset={100} />
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#000000',
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingBottom: 16,
        borderBottomWidth: 1,
        borderBottomColor: 'rgba(255, 255, 255, 0.1)',
    },
    headerTitle: {
        fontFamily: 'AvenirNextCondensed-DemiBold',
        fontSize: 18,
        color: '#FFFFFF',
    },
    headerButton: {
        fontFamily: 'AvenirNextCondensed-DemiBold',
        fontSize: 18,
        color: Colors.accent,
    },
    closeButton: {
        padding: 4,
    },
    content: {
        padding: 24,
        gap: 24,
    },
    formSection: {
        backgroundColor: 'rgba(255, 255, 255, 0.08)',
        borderRadius: 16,
        padding: 16,
        gap: 16,
    },
    row: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
    },
    emojiButton: {
        width: 48,
        height: 48,
        borderRadius: 24,
        backgroundColor: 'rgba(255, 255, 255, 0.1)',
        justifyContent: 'center',
        alignItems: 'center',
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.2)',
    },
    emoji: {
        fontSize: 28,
    },
    nameInput: {
        flex: 1,
        fontFamily: 'AvenirNextCondensed-DemiBold',
        fontSize: 24,
        color: '#FFFFFF',
    },
    emojiGrid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 8,
    },
    emojiOption: {
        width: 44,
        height: 44,
        justifyContent: 'center',
        alignItems: 'center',
        borderRadius: 12,
        backgroundColor: 'rgba(255, 255, 255, 0.05)',
    },
    emojiOptionSelected: {
        backgroundColor: 'rgba(255, 149, 0, 0.3)',
        borderWidth: 2,
        borderColor: Colors.accent,
    },
    emojiText: {
        fontSize: 24,
    },
    inputRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        minHeight: 40,
    },
    label: {
        fontFamily: 'AvenirNextCondensed-Medium',
        fontSize: 18,
        color: '#FFFFFF',
    },
    amountInputContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
    },
    currencySymbol: {
        fontFamily: 'AvenirNextCondensed-DemiBold',
        fontSize: 18,
        color: 'rgba(255, 255, 255, 0.5)',
    },
    amountInput: {
        fontFamily: 'AvenirNextCondensed-DemiBold',
        fontSize: 18,
        color: '#FFFFFF',
        minWidth: 80,
        textAlign: 'right',
    },
    deleteButton: {
        backgroundColor: 'rgba(255, 59, 48, 0.15)',
        padding: 16,
        borderRadius: 12,
        alignItems: 'center',
    },
    deleteText: {
        fontFamily: 'AvenirNextCondensed-DemiBold',
        fontSize: 18,
        color: '#FF3B30',
    },
});
