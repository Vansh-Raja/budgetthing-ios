/**
 * Edit Account Screen - Create or Edit an Account
 * 
 * Pixel-perfect port of EditAccountView.swift
 */

import { useCustomPopup } from '@/components/ui/CustomPopupProvider';
import { Text, TextInput } from '@/components/ui/LockedText';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { Stack, useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import {
    KeyboardAvoidingView,
    Platform,
    ScrollView,
    StyleSheet,
    Switch,
    TouchableOpacity,
    View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { EmojiPickerModal } from '../components/emoji/EmojiPickerModal';
import { Colors } from '../constants/theme';
import { AccountRepository, CategoryRepository, TransactionRepository } from '../lib/db/repositories';
import { RECOMMENDED_ACCOUNT_EMOJIS_BY_KIND } from '../lib/emoji/recommendedEmojis';
import { useUserSettings } from '../lib/hooks/useUserSettings';
import { computeAccountBalanceCents } from '../lib/logic/accountBalance';
import { getCurrencySymbol, parseToCents } from '../lib/logic/currencyUtils';
import { Account, AccountKind } from '../lib/logic/types';

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
    const { settings, updateSettings } = useUserSettings();
    const { showPopup } = useCustomPopup();

    // Form State
    const [name, setName] = useState('');
    const [emoji, setEmoji] = useState('💵');
    const [kind, setKind] = useState<AccountKind>('cash');
    const [showEmojiPicker, setShowEmojiPicker] = useState(false);

    // For create: starting balance (cash/savings only)
    const [startingBalanceStr, setStartingBalanceStr] = useState('');

    // For edit: user-adjustable current balance (cash/savings only)
    const [currentBalanceStr, setCurrentBalanceStr] = useState('');

    const [limitStr, setLimitStr] = useState('');
    const [limitEnabled, setLimitEnabled] = useState(false);
    const [billingDayStr, setBillingDayStr] = useState('');

    const [loadedAccount, setLoadedAccount] = useState<Account | null>(null);

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
                setLoadedAccount(account);
                setName(account.name);
                setEmoji(account.emoji);
                setKind(account.kind);
                setStartingBalanceStr('');

                if (account.kind !== 'card') {
                    const txs = await TransactionRepository.getAll({ accountId: account.id });
                    const balanceCents = computeAccountBalanceCents(account, txs);
                    setCurrentBalanceStr((balanceCents / 100).toFixed(2));
                } else {
                    setCurrentBalanceStr('');
                }

                if (account.limitAmountCents !== undefined) {
                    setLimitEnabled(true);
                    setLimitStr((account.limitAmountCents / 100).toFixed(2));
                } else {
                    setLimitEnabled(false);
                    setLimitStr('');
                }

                if (account.billingCycleDay !== undefined) {
                    setBillingDayStr(account.billingCycleDay.toString());
                } else {
                    setBillingDayStr('');
                }
            }
        } catch (e) {
            console.error("Failed to load account", e);
            showPopup({
                title: 'Error',
                message: 'Could not load account details',
                buttons: [{ text: 'OK', style: 'default' }],
            });
        } finally {
            setLoading(false);
        }
    };

    const handleSave = async () => {
        const trimmedName = name.trim();
        if (trimmedName.length === 0) {
            showPopup({
                title: 'Missing Name',
                message: 'Please enter an account name',
                buttons: [{ text: 'OK', style: 'default' }],
            });
            return;
        }

        // Create-only: starting balance for cash/savings
        let openingBalanceCents: number | undefined;
        if (!accountId && kind !== 'card' && startingBalanceStr.trim().length > 0) {
            const parsed = parseToCents(startingBalanceStr);
            if (parsed === null) {
                showPopup({
                    title: 'Invalid Balance',
                    message: 'Please enter a valid starting balance.',
                    buttons: [{ text: 'OK', style: 'default' }],
                });
                return;
            }
            openingBalanceCents = parsed;
        }

        // Edit-only: target current balance for cash/savings
        let targetBalanceCents: number | null = null;
        if (accountId && kind !== 'card' && currentBalanceStr.trim().length > 0) {
            const parsed = parseToCents(currentBalanceStr);
            if (parsed === null) {
                showPopup({
                    title: 'Invalid Balance',
                    message: 'Please enter a valid current balance.',
                    buttons: [{ text: 'OK', style: 'default' }],
                });
                return;
            }
            targetBalanceCents = parsed;
        }

        // Card-only: credit limit (optional)
        let limitAmountCents: number | undefined;
        if (kind === 'card' && limitEnabled && limitStr.trim().length > 0) {
            const parsed = parseToCents(limitStr);
            if (parsed === null) {
                showPopup({
                    title: 'Invalid Limit',
                    message: 'Please enter a valid credit limit.',
                    buttons: [{ text: 'OK', style: 'default' }],
                });
                return;
            }
            limitAmountCents = parsed;
        }

        // Card-only: billing cycle day (optional, 1–28)
        let billingCycleDay: number | undefined;
        if (kind === 'card' && billingDayStr.trim().length > 0) {
            const parsed = parseInt(billingDayStr, 10);
            if (!Number.isFinite(parsed) || parsed < 1 || parsed > 28) {
                showPopup({
                    title: 'Invalid Billing Day',
                    message: 'Billing cycle day must be between 1 and 28.',
                    buttons: [{ text: 'OK', style: 'default' }],
                });
                return;
            }
            billingCycleDay = parsed;
        }

        const ensureSystemAdjustmentCategoryId = async (): Promise<string> => {
            const categories = await CategoryRepository.getAll();
            const existing = categories.find((c) => c.isSystem && c.name === "System · Adjustment");
            if (existing) return existing.id;

            const created = await CategoryRepository.create({
                name: "System · Adjustment",
                emoji: "🛠",
                sortIndex: 9999,
                isSystem: true,
            });
            return created.id;
        };

        try {
            setIsSaving(true);

            const accountData = {
                name: trimmedName,
                emoji,
                kind,
                openingBalanceCents,
                limitAmountCents: kind === 'card' && limitEnabled ? limitAmountCents : undefined,
                billingCycleDay: kind === 'card' ? billingCycleDay : undefined,
            };

            if (accountId) {
                // NOTE: openingBalanceCents is intentionally not updated in edit mode.
                await AccountRepository.update(accountId, {
                    name: accountData.name,
                    emoji: accountData.emoji,
                    kind: accountData.kind,
                    limitAmountCents: accountData.limitAmountCents,
                    billingCycleDay: accountData.billingCycleDay,
                });

                // For cash/savings edits: if target balance changed, insert an adjustment transaction.
                if (kind !== 'card' && targetBalanceCents !== null) {
                    const account = loadedAccount ?? (await AccountRepository.getById(accountId));
                    if (!account) {
                        showPopup({
                            title: 'Error',
                            message: 'Account not found',
                            buttons: [{ text: 'OK', style: 'default' }],
                        });
                        return;
                    }

                    const txs = await TransactionRepository.getAll({ accountId });
                    const current = computeAccountBalanceCents(account, txs);
                    const delta = targetBalanceCents - current;

                    if (delta !== 0) {
                        const adjustmentCategoryId = await ensureSystemAdjustmentCategoryId();

                        await TransactionRepository.create({
                            amountCents: delta,
                            date: Date.now(),
                            note: `Balance adjustment · ${trimmedName}`,
                            categoryId: adjustmentCategoryId,
                            accountId,
                            type: delta > 0 ? 'income' : 'expense',
                            systemType: 'adjustment',
                        });
                    }
                }
            } else {
                const created = await AccountRepository.create(accountData);

                // If no default is set yet, use the first created account.
                // NOTE: Swift also persists a "last used" account per-session; we can add that later if needed.
                if (!settings?.defaultAccountId) {
                    await updateSettings({ defaultAccountId: created.id });
                }
            }

            await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

            if (onSave) onSave();
            if (onDismiss) onDismiss();
            else router.back();

        } catch (e) {
            console.error("Failed to save account", e);
            await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
            showPopup({
                title: 'Error',
                message: 'Failed to save account',
                buttons: [{ text: 'OK', style: 'default' }],
            });
        } finally {
            setIsSaving(false);
        }
    };

    const isDefaultAccount = !!accountId && settings?.defaultAccountId === accountId;

    const handleSetDefaultAccount = async () => {
        if (!accountId) return;

        try {
            await updateSettings({ defaultAccountId: accountId });
            await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        } catch (e) {
            console.error('[EditAccount] Failed to set default account:', e);
            await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
            showPopup({
                title: 'Error',
                message: 'Failed to set default account',
                buttons: [{ text: 'OK', style: 'default' }],
            });
        }
    };

    const handleDelete = async () => {
        showPopup({
            title: 'Delete Account?',
            message: 'This will remove the account but keep transactions (they will become account-less). This cannot be undone.',
            buttons: [
                { text: 'Cancel', style: 'cancel' },
                {
                    text: 'Delete',
                    style: 'destructive',
                    onPress: async () => {
                        try {
                            if (accountId) {
                                await AccountRepository.delete(accountId);

                                // If the deleted account was the default, pick the first remaining account
                                // (ordered by sortIndex) as the new default.
                                if (settings?.defaultAccountId === accountId) {
                                    const remaining = await AccountRepository.getAll();
                                    const next = remaining.length > 0
                                        ? [...remaining].sort((a, b) => a.sortIndex - b.sortIndex)[0]
                                        : null;

                                    if (next) {
                                        await updateSettings({ defaultAccountId: next.id });
                                    }
                                    // If there are no remaining accounts, keep defaultAccountId as-is.
                                    // A future account creation can set it again.
                                }

                                Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                                if (onSave) onSave();
                                if (onDismiss) onDismiss();
                                else router.back();
                            }
                        } catch (e) {
                            showPopup({
                                title: 'Error',
                                message: 'Failed to delete account',
                                buttons: [{ text: 'OK', style: 'default' }],
                            });
                        }
                    }
                }
            ],
        });
    };

    if (loading) return <View style={styles.container} />;

    return (
        <View style={styles.container}>
            {!onDismiss && (
                <Stack.Screen options={{
                    title: accountId ? "Edit Account" : "New Account",
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
                        <TouchableOpacity
                            style={styles.emojiButton}
                            onPress={() => {
                                Haptics.selectionAsync();
                                setShowEmojiPicker(true);
                            }}
                            activeOpacity={0.7}
                        >
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
                                    const nextKind = k.type;
                                    setKind(nextKind);

                                    if (nextKind === 'card') {
                                        setStartingBalanceStr('');
                                        setCurrentBalanceStr('');
                                        return;
                                    }

                                    setLimitEnabled(false);
                                    setLimitStr('');
                                    setBillingDayStr('');

                                    if (accountId) {
                                        const account = loadedAccount;
                                        if (account) {
                                            TransactionRepository.getAll({ accountId: account.id })
                                                .then((txs) => {
                                                    const balanceCents = computeAccountBalanceCents(account, txs);
                                                    setCurrentBalanceStr((balanceCents / 100).toFixed(2));
                                                })
                                                .catch((e) => console.error('[EditAccount] Failed to derive balance', e));
                                        }
                                    }
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
                    {/* Cash/Savings: balance */}
                    {kind !== 'card' && (
                        <>
                            <View style={styles.inputRow}>
                                <Text style={styles.label}>{accountId ? "Current Balance" : "Starting Balance"}</Text>
                                <View style={styles.amountInputContainer}>
                                    <Text style={styles.currencySymbol}>{getCurrencySymbol('INR')}</Text>
                                    <TextInput
                                        style={styles.amountInput}
                                        value={accountId ? currentBalanceStr : startingBalanceStr}
                                        onChangeText={accountId ? setCurrentBalanceStr : setStartingBalanceStr}
                                        keyboardType="decimal-pad"
                                        placeholder="0.00"
                                        placeholderTextColor="rgba(255, 255, 255, 0.3)"
                                    />
                                </View>
                            </View>

                            <Text style={styles.helperText}>
                                {accountId
                                    ? "Adjusts via an automatic balance adjustment entry."
                                    : "Leave empty to start from 0."}
                            </Text>
                        </>
                    )}

                    {/* Card: limit + billing cycle */}
                    {kind === 'card' && (
                        <>
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
                                    <View style={styles.divider} />
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
                                </>
                            )}

                            <View style={styles.divider} />

                            <View style={styles.subInputRow}>
                                <Text style={styles.subLabel}>Billing Cycle Day</Text>
                                <TextInput
                                    style={styles.amountInput}
                                    value={billingDayStr}
                                    onChangeText={setBillingDayStr}
                                    keyboardType="number-pad"
                                    placeholder="e.g. 5"
                                    placeholderTextColor="rgba(255, 255, 255, 0.3)"
                                    maxLength={2}
                                />
                            </View>

                            <Text style={styles.helperText}>
                                Used only for “spent this billing cycle”.
                            </Text>
                        </>
                    )}
                </View>

                {accountId && (
                    <>
                        <TouchableOpacity
                            style={[styles.defaultButton, isDefaultAccount && { opacity: 0.6 }]}
                            onPress={() => {
                                Haptics.selectionAsync();
                                handleSetDefaultAccount();
                            }}
                            disabled={isDefaultAccount}
                        >
                            <Text style={styles.defaultText}>
                                {isDefaultAccount ? 'Default Account' : 'Set as Default Account'}
                            </Text>
                        </TouchableOpacity>

                        <TouchableOpacity style={styles.deleteButton} onPress={handleDelete}>
                            <Text style={styles.deleteText}>Delete Account</Text>
                        </TouchableOpacity>
                    </>
                )}
            </ScrollView>

            <EmojiPickerModal
                visible={showEmojiPicker}
                title="Choose Icon"
                value={emoji}
                recommendedEmojis={RECOMMENDED_ACCOUNT_EMOJIS_BY_KIND[kind]}
                onSelect={setEmoji}
                onClose={() => setShowEmojiPicker(false)}
            />

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
    helperText: {
        fontSize: 12,
        color: 'rgba(255, 255, 255, 0.6)',
        marginTop: -8,
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

    // Default
    defaultButton: {
        backgroundColor: 'rgba(255, 255, 255, 0.12)',
        padding: 16,
        borderRadius: 12,
        alignItems: 'center',
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.15)',
    },
    defaultText: {
        fontFamily: 'AvenirNextCondensed-DemiBold',
        fontSize: 18,
        color: '#FFFFFF',
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
