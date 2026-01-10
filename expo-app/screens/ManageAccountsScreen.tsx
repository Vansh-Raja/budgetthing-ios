/**
 * Manage Accounts Screen
 * 
 * Lists all accounts and allows adding/editing.
 */

import React, { useState } from 'react';
import {
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
    ScrollView,
    Modal,
    StatusBar,
} from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';

import { Colors } from '../constants/theme';
import { Account } from '../lib/logic/types';
import { useAccounts } from '../lib/hooks/useData';
import { formatCents } from '../lib/logic/currencyUtils';
import { EditAccountScreen } from './EditAccountScreen';

export function ManageAccountsScreen() {
    const insets = useSafeAreaInsets();
    const router = useRouter();
    const { data: accounts, refresh } = useAccounts();

    const [editingAccountId, setEditingAccountId] = useState<string | null>(null);
    const [showEditor, setShowEditor] = useState(false);

    // Derived state
    const cashAccounts = accounts.filter(a => a.kind === 'cash').sort((a, b) => a.sortIndex - b.sortIndex);
    const cardAccounts = accounts.filter(a => a.kind === 'card').sort((a, b) => a.sortIndex - b.sortIndex);
    const savingsAccounts = accounts.filter(a => a.kind === 'savings').sort((a, b) => a.sortIndex - b.sortIndex);

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

    const AccountRow = ({ account }: { account: Account }) => (
        <TouchableOpacity
            style={styles.row}
            onPress={() => handleEdit(account.id)}
            activeOpacity={0.7}
        >
            <View style={styles.emojiContainer}>
                <Text style={styles.emoji}>{account.emoji}</Text>
            </View>

            <View style={styles.textContainer}>
                <Text style={styles.name}>{account.name}</Text>
                {account.kind === 'card' && account.limitAmountCents ? (
                    <Text style={styles.subtitle}>Limit: {formatCents(account.limitAmountCents)}</Text>
                ) : (
                    <Text style={styles.subtitle}>Open: {formatCents(account.openingBalanceCents || 0)}</Text>
                )}
            </View>

            <Ionicons name="chevron-forward" size={20} color="rgba(255, 255, 255, 0.3)" />
        </TouchableOpacity>
    );

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

            <ScrollView contentContainerStyle={styles.content}>
                {/* Cash */}
                {cashAccounts.length > 0 && (
                    <View style={styles.section}>
                        <Text style={styles.sectionHeader}>Cash & Checking</Text>
                        <View style={styles.card}>
                            {cashAccounts.map((account, i) => (
                                <View key={account.id}>
                                    <AccountRow account={account} />
                                    {i < cashAccounts.length - 1 && <View style={styles.divider} />}
                                </View>
                            ))}
                        </View>
                    </View>
                )}

                {/* Cards */}
                {cardAccounts.length > 0 && (
                    <View style={styles.section}>
                        <Text style={styles.sectionHeader}>Credit Cards</Text>
                        <View style={styles.card}>
                            {cardAccounts.map((account, i) => (
                                <View key={account.id}>
                                    <AccountRow account={account} />
                                    {i < cardAccounts.length - 1 && <View style={styles.divider} />}
                                </View>
                            ))}
                        </View>
                    </View>
                )}

                {/* Savings */}
                {savingsAccounts.length > 0 && (
                    <View style={styles.section}>
                        <Text style={styles.sectionHeader}>Savings & Investments</Text>
                        <View style={styles.card}>
                            {savingsAccounts.map((account, i) => (
                                <View key={account.id}>
                                    <AccountRow account={account} />
                                    {i < savingsAccounts.length - 1 && <View style={styles.divider} />}
                                </View>
                            ))}
                        </View>
                    </View>
                )}
            </ScrollView>

            {/* Internal Modal for Editing */}
            <Modal
                visible={showEditor}
                animationType="slide"
                presentationStyle="pageSheet"
                onRequestClose={handleEditorDismiss}
            >
                <EditAccountScreen
                    accountId={editingAccountId ?? undefined}
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
