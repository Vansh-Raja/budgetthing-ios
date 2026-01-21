/**
 * Manage Accounts Screen
 * 
 * Lists all accounts and allows adding/editing.
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
import { AccountRepository } from '../lib/db/repositories';
import { useAccounts, useTransactions } from '../lib/hooks/useData';
import { useUserSettings } from '../lib/hooks/useUserSettings';
import { computeAccountAvailableCents, computeAccountBalanceCents, getTransactionsForAccount } from '../lib/logic/accountBalance';
import { formatCents } from '../lib/logic/currencyUtils';
import { Account } from '../lib/logic/types';
import { EditAccountScreen } from './EditAccountScreen';

export function ManageAccountsScreen() {
    const router = useRouter();
    const { data: accounts, refresh } = useAccounts();
    const { data: transactions } = useTransactions();
    const { settings } = useUserSettings();

    const [editingAccountId, setEditingAccountId] = useState<string | null>(null);
    const [showEditor, setShowEditor] = useState(false);
    const [orderedAccounts, setOrderedAccounts] = useState<Account[]>([]);

    useEffect(() => {
        setOrderedAccounts(accounts);
    }, [accounts]);

    const totalsByAccountId = useMemo(() => {
        const totals = new Map<string, { balanceCents: number; availableCents: number | null }>();

        for (const account of orderedAccounts) {
            const txs = getTransactionsForAccount(transactions, account.id);
            totals.set(account.id, {
                balanceCents: computeAccountBalanceCents(account, txs),
                availableCents: computeAccountAvailableCents(account, txs),
            });
        }

        return totals;
    }, [orderedAccounts, transactions]);

    const handleReorder = async ({ data }: { data: Account[] }) => {
        setOrderedAccounts(data);
        try {
            await AccountRepository.reorder(data.map(a => a.id));
        } catch (e) {
            console.error('[ManageAccounts] Failed to reorder accounts:', e);
            refresh();
        }
    };

    const handleEdit = (id: string) => {
        Haptics.selectionAsync();
        setEditingAccountId(id);
        setShowEditor(true);
    };

    const handleAdd = () => {
        Haptics.selectionAsync();
        setEditingAccountId(null);
        setShowEditor(true);
    };

    const handleEditorDismiss = () => {
        setShowEditor(false);
        setEditingAccountId(null);
    };

    const handleEditorSave = () => {
        refresh();
        handleEditorDismiss();
    };

    const renderItem = ({ item: account, drag, isActive, getIndex }: RenderItemParams<Account>) => {
        const index = getIndex?.() ?? -1;
        const showDivider = index >= 0 && index < orderedAccounts.length - 1;
        const isDefault = settings?.defaultAccountId === account.id;

        return (
            <View>
                <View style={[styles.rowContainer, isActive && styles.rowActive]}>
                    <TouchableOpacity
                        style={styles.row}
                        onPress={() => handleEdit(account.id)}
                        activeOpacity={0.7}
                        disabled={isActive}
                    >
                        <View style={styles.emojiContainer}>
                            <Text style={styles.emoji}>{account.emoji}</Text>
                        </View>

                        <View style={styles.textContainer}>
                            <Text style={styles.name}>{account.name}</Text>
                            {(() => {
                                const totals = totalsByAccountId.get(account.id);
                                const balanceCents = totals?.balanceCents ?? (account.openingBalanceCents ?? 0);
                                const availableCents = totals?.availableCents ?? null;

                                if (account.kind === 'card') {
                                    if (availableCents === null) {
                                        return <Text style={styles.subtitle}>Unlimited credit</Text>;
                                    }
                                    return <Text style={styles.subtitle}>Available: {formatCents(availableCents)}</Text>;
                                }

                                return <Text style={styles.subtitle}>Balance: {formatCents(balanceCents)}</Text>;
                            })()}
                        </View>

                        {isDefault && (
                            <View style={styles.defaultBadge}>
                                <Text style={styles.defaultBadgeText}>Default</Text>
                            </View>
                        )}

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

                {showDivider && <View style={styles.divider} />}
            </View>
        );
    };

    return (
        <View style={styles.container}>
            <Stack.Screen options={{
                headerShown: true,
                title: "Accounts",
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

            <View style={styles.content}>
                <DraggableFlatList
                    data={orderedAccounts}
                    keyExtractor={(item) => item.id}
                    onDragEnd={handleReorder}
                    renderItem={renderItem}
                    style={styles.card}
                    contentContainerStyle={styles.cardContent}
                />
            </View>

            {/* Internal Modal for Editing */}
            <Modal
                visible={showEditor}
                animationType="slide"
                presentationStyle="pageSheet"
                onRequestClose={handleEditorDismiss}
            >
                <CustomPopupProvider>
                    <EditAccountScreen
                        accountId={editingAccountId ?? undefined}
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
        flex: 1,
        padding: 20,
    },
    cardContent: {
        paddingBottom: 8,
    },
    card: {
        backgroundColor: 'rgba(255, 255, 255, 0.08)',
        borderRadius: 16,
        overflow: 'hidden',
    },
    rowContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        width: '100%',
    },
    row: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        padding: 16,
        gap: 16,
    },
    rowActive: {
        backgroundColor: 'rgba(255, 255, 255, 0.06)',
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
    subtitle: {
        fontFamily: 'System',
        fontSize: 13,
        color: 'rgba(255, 255, 255, 0.5)',
    },
    defaultBadge: {
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 9999,
        backgroundColor: 'rgba(255, 255, 255, 0.10)',
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.15)',
    },
    defaultBadgeText: {
        fontFamily: 'AvenirNextCondensed-DemiBold',
        fontSize: 14,
        color: '#FFFFFF',
    },
    divider: {
        height: 1,
        backgroundColor: 'rgba(255, 255, 255, 0.08)',
        marginLeft: 72,
    },
});
