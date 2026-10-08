/**
 * Manage Categories Screen
 */

import { Text } from '@/components/ui/LockedText';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { Stack, useRouter } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import {
    Modal,
    StyleSheet,
    TouchableOpacity,
    View,
} from 'react-native';
import DraggableFlatList, { RenderItemParams } from 'react-native-draggable-flatlist';

import { CustomPopupProvider } from '@/components/ui/CustomPopupProvider';
import { Colors } from '../constants/theme';
import { CategoryRepository } from '../lib/db/repositories';
import { useCategories } from '../lib/hooks/useData';
import { Category } from '../lib/logic/types';
import { EditCategoryScreen } from './EditCategoryScreen';

export function ManageCategoriesScreen() {
    const router = useRouter();
    const { data: categories, refresh } = useCategories();

    const [editingCategoryId, setEditingCategoryId] = useState<string | null>(null);
    const [showEditor, setShowEditor] = useState(false);
    const [orderedUserCategories, setOrderedUserCategories] = useState<Category[]>([]);

    // Filter out system categories
    const userCategories = useMemo(
        () => categories.filter(c => !c.isSystem).sort((a, b) => a.sortIndex - b.sortIndex),
        [categories]
    );
    const systemCategories = useMemo(
        () => categories.filter(c => c.isSystem).sort((a, b) => a.sortIndex - b.sortIndex),
        [categories]
    );

    useEffect(() => {
        setOrderedUserCategories(userCategories);
    }, [userCategories]);

    const handleReorder = async ({ data }: { data: Category[] }) => {
        setOrderedUserCategories(data);
        try {
            await CategoryRepository.reorder(data.map(c => c.id));
        } catch (e) {
            console.error('[ManageCategories] Failed to reorder categories:', e);
            refresh();
        }
    };

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

    const renderUserCategory = ({ item: category, drag, isActive, getIndex }: RenderItemParams<Category>) => {
        const index = getIndex?.() ?? -1;
        const isFirst = index === 0;
        const isLast = index === orderedUserCategories.length - 1;

        return (
            <View
                style={[
                    styles.cardRowContainer,
                    isFirst && styles.cardRowFirst,
                    isLast && styles.cardRowLast,
                    isActive && styles.cardRowActive,
                ]}
            >
                <View style={styles.rowContainer}>
                    <TouchableOpacity
                        style={styles.rowMain}
                        onPress={() => handleEdit(category.id)}
                        activeOpacity={0.7}
                        disabled={isActive}
                    >
                        <View style={styles.emojiContainer}>
                            <Text style={styles.emoji}>{category.emoji}</Text>
                        </View>

                        <View style={styles.textContainer}>
                            <Text style={styles.name}>{category.name}</Text>
                            {category.monthlyBudgetCents ? (
                                <Text style={styles.subtitle}>Budget: ₹{(category.monthlyBudgetCents / 100).toFixed(0)}/mo</Text>
                            ) : null}
                        </View>

                        <Ionicons name="chevron-forward" size={20} color="rgba(255, 255, 255, 0.3)" style={styles.chevron} />
                    </TouchableOpacity>

                    <TouchableOpacity
                        style={styles.dragHandle}
                        onLongPress={() => {
                            Haptics.selectionAsync();
                            drag();
                        }}
                        delayLongPress={150}
                        activeOpacity={0.7}
                        disabled={isActive}
                        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                    >
                        <Ionicons name="reorder-three" size={24} color="rgba(255, 255, 255, 0.35)" />
                    </TouchableOpacity>
                </View>

                {!isLast && <View style={styles.divider} />}
            </View>
        );
    };

    const renderSystemSection = () => {
        if (systemCategories.length === 0) return null;

        return (
            <View style={styles.section}>
                <Text style={styles.sectionHeader}>System</Text>
                {systemCategories.map((category, index) => {
                    const isFirst = index === 0;
                    const isLast = index === systemCategories.length - 1;

                    return (
                        <View
                            key={category.id}
                            style={[
                                styles.cardRowContainer,
                                isFirst && styles.cardRowFirst,
                                isLast && styles.cardRowLast,
                                styles.cardRowDisabled,
                            ]}
                        >
                            <View style={styles.row}>
                                <View style={styles.emojiContainer}>
                                    <Text style={styles.emoji}>{category.emoji}</Text>
                                </View>

                                <View style={styles.textContainer}>
                                    <Text style={[styles.name, styles.systemName]}>{category.name}</Text>
                                </View>
                            </View>

                            {!isLast && <View style={styles.divider} />}
                        </View>
                    );
                })}
            </View>
        );
    };

    return (
        <View style={styles.container}>
            <Stack.Screen options={{
                headerShown: true,
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

            <DraggableFlatList
                data={orderedUserCategories}
                keyExtractor={(item) => item.id}
                onDragEnd={handleReorder}
                renderItem={renderUserCategory}
                contentContainerStyle={styles.content}
                ListHeaderComponent={
                    orderedUserCategories.length > 0 ? (
                        <View style={styles.section}>
                            <Text style={styles.sectionHeader}>Your Categories</Text>
                        </View>
                    ) : null
                }
                ListFooterComponent={<View style={styles.footer}>{renderSystemSection()}</View>}
            />

            <Modal
                visible={showEditor}
                animationType="slide"
                presentationStyle="pageSheet"
                onRequestClose={handleEditorDismiss}
            >
                <CustomPopupProvider>
                    <EditCategoryScreen
                        categoryId={editingCategoryId ?? undefined}
                        onDismiss={handleEditorDismiss}
                        onSave={handleEditorSave}
                    />
                </CustomPopupProvider>
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
        paddingBottom: 40,
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
    footer: {
        marginTop: 24,
    },
    cardRowContainer: {
        backgroundColor: 'rgba(255, 255, 255, 0.08)',
        overflow: 'hidden',
    },
    cardRowFirst: {
        borderTopLeftRadius: 16,
        borderTopRightRadius: 16,
    },
    cardRowLast: {
        borderBottomLeftRadius: 16,
        borderBottomRightRadius: 16,
    },
    cardRowActive: {
        backgroundColor: 'rgba(255, 255, 255, 0.12)',
    },
    cardRowDisabled: {
        opacity: 0.6,
    },
    rowContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        width: '100%',
    },
    row: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 16,
        gap: 16,
    },
    rowMain: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        padding: 16,
        gap: 16,
    },
    chevron: {
        marginRight: 6,
    },
    dragHandle: {
        paddingRight: 14,
        paddingVertical: 16,
        justifyContent: 'center',
        alignItems: 'center',
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
