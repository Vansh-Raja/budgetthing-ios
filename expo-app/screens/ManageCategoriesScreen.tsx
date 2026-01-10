/**
 * Manage Categories Screen
 */

import React, { useState } from 'react';
import {
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
    ScrollView,
    Modal,
} from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';

import { Colors } from '../constants/theme';
import { Category } from '../lib/logic/types';
import { useCategories } from '../lib/hooks/useData';
import { EditCategoryScreen } from './EditCategoryScreen';

export function ManageCategoriesScreen() {
    const router = useRouter();
    const { data: categories, refresh } = useCategories();

    const [editingCategoryId, setEditingCategoryId] = useState<string | null>(null);
    const [showEditor, setShowEditor] = useState(false);

    // Filter out system categories
    const userCategories = categories.filter(c => !c.isSystem).sort((a, b) => a.sortIndex - b.sortIndex);
    const systemCategories = categories.filter(c => c.isSystem);

    const handleEdit = (id: string) => {
        Haptics.selectionAsync();
        // Navigate to detail screen (matching Swift flow)
        router.push(`/category/${id}`);
    };

    const handleAdd = () => {
        Haptics.selectionAsync();
        setEditingCategoryId(null);
        setShowEditor(true);
    };

    const handleEditorDismiss = () => {
        setShowEditor(false);
        setEditingCategoryId(null);
    };

    const handleEditorSave = () => {
        refresh();
        handleEditorDismiss();
    };

    const CategoryRow = ({ category }: { category: Category }) => (
        <TouchableOpacity
            style={styles.row}
            onPress={() => handleEdit(category.id)}
            activeOpacity={0.7}
            disabled={category.isSystem}
        >
            <View style={styles.emojiContainer}>
                <Text style={styles.emoji}>{category.emoji}</Text>
            </View>

            <View style={styles.textContainer}>
                <Text style={[styles.name, category.isSystem && styles.systemName]}>{category.name}</Text>
                {category.monthlyBudgetCents ? (
                    <Text style={styles.subtitle}>Budget: ₹{(category.monthlyBudgetCents / 100).toFixed(0)}/mo</Text>
                ) : null}
            </View>

            {!category.isSystem && (
                <Ionicons name="chevron-forward" size={20} color="rgba(255, 255, 255, 0.3)" />
            )}
        </TouchableOpacity>
    );

    return (
        <View style={styles.container}>
            <Stack.Screen options={{
                title: "Categories",
                headerStyle: { backgroundColor: '#000000' },
                headerTintColor: '#FFFFFF',
                headerLeft: () => (
                    <TouchableOpacity onPress={() => router.back()} style={{ padding: 8 }}>
                        <Ionicons name="chevron-back" size={24} color="#FFFFFF" />
                    </TouchableOpacity>
                ),
                headerRight: () => (
                    <TouchableOpacity onPress={handleAdd} style={{ padding: 8 }}>
                        <Ionicons name="add" size={24} color={Colors.accent} />
                    </TouchableOpacity>
                ),
            }} />

            <ScrollView contentContainerStyle={styles.content}>
                {userCategories.length > 0 && (
                    <View style={styles.section}>
                        <Text style={styles.sectionHeader}>Your Categories</Text>
                        <View style={styles.card}>
                            {userCategories.map((category, i) => (
                                <View key={category.id}>
                                    <CategoryRow category={category} />
                                    {i < userCategories.length - 1 && <View style={styles.divider} />}
                                </View>
                            ))}
                        </View>
                    </View>
                )}

                {systemCategories.length > 0 && (
                    <View style={styles.section}>
                        <Text style={styles.sectionHeader}>System</Text>
                        <View style={styles.card}>
                            {systemCategories.map((category, i) => (
                                <View key={category.id}>
                                    <CategoryRow category={category} />
                                    {i < systemCategories.length - 1 && <View style={styles.divider} />}
                                </View>
                            ))}
                        </View>
                    </View>
                )}
            </ScrollView>

            <Modal
                visible={showEditor}
                animationType="slide"
                presentationStyle="pageSheet"
                onRequestClose={handleEditorDismiss}
            >
                <EditCategoryScreen
                    categoryId={editingCategoryId ?? undefined}
                    onDismiss={handleEditorDismiss}
                    onSave={handleEditorSave}
                />
            </Modal>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#000000',
    },
    content: {
        padding: 20,
        gap: 24,
    },
    section: {
        gap: 8,
    },
    sectionHeader: {
        fontFamily: 'AvenirNextCondensed-DemiBold',
        fontSize: 14,
        color: 'rgba(255, 255, 255, 0.5)',
        marginLeft: 16,
        textTransform: 'uppercase',
    },
    card: {
        backgroundColor: 'rgba(255, 255, 255, 0.08)',
        borderRadius: 16,
        overflow: 'hidden',
    },
    row: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 16,
        gap: 16,
    },
    emojiContainer: {
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: 'rgba(255, 255, 255, 0.1)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    emoji: {
        fontSize: 24,
    },
    textContainer: {
        flex: 1,
        gap: 2,
    },
    name: {
        fontFamily: 'AvenirNextCondensed-DemiBold',
        fontSize: 18,
        color: '#FFFFFF',
    },
    systemName: {
        color: 'rgba(255, 255, 255, 0.5)',
    },
    subtitle: {
        fontFamily: 'System',
        fontSize: 13,
        color: 'rgba(255, 255, 255, 0.5)',
    },
    divider: {
        height: 1,
        backgroundColor: 'rgba(255, 255, 255, 0.08)',
        marginLeft: 72,
    },
});
