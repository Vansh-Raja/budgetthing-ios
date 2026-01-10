/**
 * Edit Account Screen - Create or Edit an Account
 * 
 * Pixel-perfect port of EditAccountView.swift
 */

import React, { useState, useEffect } from 'react';
import {
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
    TextInput,
    ScrollView,
    Switch,
    Alert,
    KeyboardAvoidingView,
    Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { Stack, useRouter, useLocalSearchParams } from 'expo-router';

import { Colors } from '../constants/theme';
import { Account, AccountKind } from '../lib/logic/types';
import { AccountRepository } from '../lib/db/repositories';
import { getCurrencySymbol } from '../lib/logic/currencyUtils';

interface EditAccountScreenProps {
    accountId?: string; // If present, edit mode
    onDismiss?: () => void;
    onSave?: () => void;
}

const ACCOUNT_KINDS: { type: AccountKind; label: string; icon: any }[] = [
    { type: 'cash', label: 'Cash', icon: 'wallet-outline' },
    { type: 'card', label: 'Card', icon: 'card-outline' },
    { type: 'savings', label: 'Savings', icon: 'trending-up-outline' },
];

export function EditAccountScreen({ accountId, onDismiss, onSave }: EditAccountScreenProps) {
    const insets = useSafeAreaInsets();
    const router = useRouter();

    // Form State
    const [name, setName] = useState('');
    const [emoji, setEmoji] = useState('💵');
    const [kind, setKind] = useState<AccountKind>('cash');
    const [balanceStr, setBalanceStr] = useState('');
    const [limitStr, setLimitStr] = useState('');
    const [limitEnabled, setLimitEnabled] = useState(false);
    const [billingDayStr, setBillingDayStr] = useState('');

    const [loading, setLoading] = useState(!!accountId);
    const [isSaving, setIsSaving] = useState(false);

    // Load account if editing
    useEffect(() => {
        if (accountId) {
            loadAccount(accountId);
        }
    }, [accountId]);

    const loadAccount = async (id: string) => {
        try {
            const account = await AccountRepository.getById(id);
            if (account) {
                setName(account.name);
                setEmoji(account.emoji);
                setKind(account.kind);
                setBalanceStr(account.openingBalanceCents ? (account.openingBalanceCents / 100).toFixed(2) : '');

                if (account.limitAmountCents) {
                    setLimitEnabled(true);
                    setLimitStr((account.limitAmountCents / 100).toFixed(2));
                }

                if (account.billingCycleDay) {
                    setBillingDayStr(account.billingCycleDay.toString());
                }
            }
        } catch (e) {
            console.error("Failed to load account", e);
            Alert.alert("Error", "Could not load account details");
        } finally {
            setLoading(false);
        }
    };

    const handleSave = async () => {
        if (name.trim().length === 0) {
            Alert.alert("Missing Name", "Please enter an account name");
            return;
        }

        try {
            setIsSaving(true);
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

            const openingBalanceCents = balanceStr ? Math.round(parseFloat(balanceStr) * 100) : undefined;
            const limitAmountCents = limitEnabled && limitStr ? Math.round(parseFloat(limitStr) * 100) : undefined;
            const billingCycleDay = limitEnabled && billingDayStr ? parseInt(billingDayStr) : undefined;

            const data = {
                name: name.trim(),
                emoji,
                kind,
                openingBalanceCents,
                limitAmountCents,
                billingCycleDay,
            };

            if (accountId) {
                await AccountRepository.update(accountId, data);
            } else {
                await AccountRepository.create({
                    ...data,
                    sortIndex: 999, // Append to end
                });
            }

            if (onSave) onSave();
            if (onDismiss) onDismiss();
            else router.back();

        } catch (e) {
            console.error("Failed to save account", e);
            Alert.alert("Error", "Failed to save account");
        } finally {
            setIsSaving(false);
        }
    };

    const handleDelete = async () => {
        Alert.alert(
            "Delete Account?",
            "This will remove the account but keep transactions (they will become account-less). This cannot be undone.",
            [
                { text: "Cancel", style: "cancel" },
                {
                    text: "Delete",
                    style: "destructive",
                    onPress: async () => {
                        try {
                            if (accountId) {
                                await AccountRepository.delete(accountId);
                                Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                                if (onSave) onSave();
                                if (onDismiss) onDismiss();
                                else router.back();
                            }
                        } catch (e) {
                            Alert.alert("Error", "Failed to delete account");
                        }
                    }
                }
            ]
        );
    };

    if (loading) return <View style={styles.container} />;

    return (
        <View style={styles.container}>
            {/* Only show Stack header when NOT used as a modal */}
            <Stack.Screen options={{
                title: accountId ? "Edit Account" : "New Account",
                headerStyle: { backgroundColor: '#000000' },
                headerTintColor: '#FFFFFF',
                headerShown: !onDismiss, // Hide when used as modal
                headerRight: () => (
                    <TouchableOpacity onPress={handleSave} disabled={isSaving}>
                        <Text style={[styles.headerButton, isSaving && { opacity: 0.5 }]}>Save</Text>
                    </TouchableOpacity>
                ),
            }} />

            {onDismiss && (
                <View style={[styles.header, { paddingTop: insets.top + 10 }]}>
                    <TouchableOpacity onPress={onDismiss} style={styles.closeButton}>
                        <Ionicons name="close" size={24} color="#FFFFFF" />
                    </TouchableOpacity>
                    <Text style={styles.headerTitle}>{accountId ? "Edit Account" : "New Account"}</Text>
                    <TouchableOpacity onPress={handleSave} disabled={isSaving}>
                        <Text style={[styles.headerButton, isSaving && { opacity: 0.5 }]}>Save</Text>
                    </TouchableOpacity>
                </View>
            )}

            <ScrollView contentContainerStyle={styles.content}>
                <View style={styles.formSection}>
                    {/* Identity */}
                    <View style={styles.row}>
                        <TouchableOpacity style={styles.emojiButton}>
                            <Text style={styles.emoji}>{emoji}</Text>
                        </TouchableOpacity>
                        <TextInput
                            style={styles.nameInput}
                            value={name}
                            onChangeText={setName}
                            placeholder="Account Name"
                            placeholderTextColor="rgba(255, 255, 255, 0.3)"
                            autoFocus={!accountId}
                        />
                    </View>

                    {/* Type Picker */}
                    <View style={styles.typeContainer}>
                        {ACCOUNT_KINDS.map(k => (
                            <TouchableOpacity
                                key={k.type}
                                style={[styles.typeButton, kind === k.type && styles.typeButtonActive]}
                                onPress={() => {
                                    Haptics.selectionAsync();
                                    setKind(k.type);
                                }}
                            >
                                <Ionicons
                                    name={k.icon}
                                    size={18}
                                    color={kind === k.type ? '#FFFFFF' : 'rgba(255, 255, 255, 0.5)'}
                                />
                                <Text style={[styles.typeLabel, kind === k.type && styles.typeLabelActive]}>
                                    {k.label}
                                </Text>
                            </TouchableOpacity>
                        ))}
                    </View>
                </View>

                <View style={styles.formSection}>
                    {/* Balance */}
                    <View style={styles.inputRow}>
                        <Text style={styles.label}>Opening Balance</Text>
                        <View style={styles.amountInputContainer}>
                            <Text style={styles.currencySymbol}>{getCurrencySymbol('INR')}</Text>
                            <TextInput
                                style={styles.amountInput}
                                value={balanceStr}
                                onChangeText={setBalanceStr}
                                keyboardType="decimal-pad"
                                placeholder="0.00"
                                placeholderTextColor="rgba(255, 255, 255, 0.3)"
                            />
                        </View>
                    </View>

                    {/* Credit Limit / Details */}
                    {kind === 'card' && (
                        <>
                            <View style={styles.divider} />

                            <View style={[styles.inputRow, { justifyContent: 'space-between' }]}>
                                <Text style={styles.label}>Credit Limit</Text>
                                <Switch
                                    value={limitEnabled}
                                    onValueChange={(v) => {
                                        Haptics.selectionAsync();
                                        setLimitEnabled(v);
                                    }}
                                    trackColor={{ false: '#3a3a3c', true: Colors.accent }}
                                />
                            </View>

                            {limitEnabled && (
                                <>
                                    <View style={styles.subInputRow}>
                                        <Text style={styles.subLabel}>Limit Amount</Text>
                                        <View style={styles.amountInputContainer}>
                                            <Text style={styles.currencySymbol}>{getCurrencySymbol('INR')}</Text>
                                            <TextInput
                                                style={styles.amountInput}
                                                value={limitStr}
                                                onChangeText={setLimitStr}
                                                keyboardType="decimal-pad"
                                                placeholder="0.00"
                                                placeholderTextColor="rgba(255, 255, 255, 0.3)"
                                            />
                                        </View>
                                    </View>

                                    <View style={styles.subInputRow}>
                                        <Text style={styles.subLabel}>Billing Cycle Day</Text>
                                        <TextInput
                                            style={styles.amountInput}
                                            value={billingDayStr}
                                            onChangeText={setBillingDayStr}
                                            keyboardType="number-pad"
                                            placeholder="1"
                                            placeholderTextColor="rgba(255, 255, 255, 0.3)"
                                            maxLength={2}
                                        />
                                    </View>
                                </>
                            )}
                        </>
                    )}
                </View>

                {accountId && (
                    <TouchableOpacity style={styles.deleteButton} onPress={handleDelete}>
                        <Text style={styles.deleteText}>Delete Account</Text>
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
        fontFamily: 'AvenirNextCondensed-DemiBold', // changed from Heavy as it was not looking good
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

    // Identity
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

    // Type
    typeContainer: {
        flexDirection: 'row',
        backgroundColor: 'rgba(0, 0, 0, 0.3)',
        borderRadius: 10,
        padding: 4,
    },
    typeButton: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
        paddingVertical: 8,
        borderRadius: 8,
    },
    typeButtonActive: {
        backgroundColor: 'rgba(255, 255, 255, 0.15)',
    },
    typeLabel: {
        fontFamily: 'System',
        fontSize: 13,
        fontWeight: '600',
        color: 'rgba(255, 255, 255, 0.5)',
    },
    typeLabelActive: {
        color: '#FFFFFF',
    },

    // Inputs
    inputRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        minHeight: 40,
    },
    subInputRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        minHeight: 40,
        paddingLeft: 12, // Indent
    },
    label: {
        fontFamily: 'AvenirNextCondensed-Medium',
        fontSize: 18,
        color: '#FFFFFF',
    },
    subLabel: {
        fontFamily: 'AvenirNextCondensed-Medium',
        fontSize: 16,
        color: 'rgba(255, 255, 255, 0.7)',
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
    divider: {
        height: 1,
        backgroundColor: 'rgba(255, 255, 255, 0.1)',
    },

    // Delete
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
