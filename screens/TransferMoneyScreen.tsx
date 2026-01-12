/**
 * Transfer Money Screen
 * 
 * Allows creating a transfer transaction between two accounts.
 */

import React, { useState, useMemo } from 'react';
import {
    View,
    StyleSheet,
    TouchableOpacity,
    ScrollView,
    KeyboardAvoidingView,
    Platform,
    Alert,
    Modal,
} from 'react-native';
import { Text, TextInput } from '@/components/ui/LockedText';
import { Stack, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { format } from 'date-fns';

import { Colors } from '../constants/theme';
import { useAccounts } from '../lib/hooks/useData';
import { getCurrencySymbol } from '../lib/logic/currencyUtils';
import { TransactionRepository } from '../lib/db/repositories';
import { Account } from '../lib/logic/types';

interface TransferMoneyScreenProps {
    onDismiss: () => void;
}

export function TransferMoneyScreen({ onDismiss }: TransferMoneyScreenProps) {
    const insets = useSafeAreaInsets();
    const router = useRouter();

    // Data
    const { data: accounts } = useAccounts();
    const sortedAccounts = useMemo(() =>
        [...accounts].sort((a, b) => a.sortIndex - b.sortIndex),
        [accounts]);

    // State
    const [fromAccountId, setFromAccountId] = useState<string | null>(null);
    const [toAccountId, setToAccountId] = useState<string | null>(null);
    const [amountStr, setAmountStr] = useState('');
    const [note, setNote] = useState('');
    const [isSaving, setIsSaving] = useState(false);

    // Picker State
    const [pickerVisible, setPickerVisible] = useState(false);
    const [pickerMode, setPickerMode] = useState<'from' | 'to'>('from');

    const handleSave = async () => {
        if (!fromAccountId || !toAccountId) {
            Alert.alert("Missing Accounts", "Please select source and destination accounts.");
            return;
        }
        if (fromAccountId === toAccountId) {
            Alert.alert("Invalid Transfer", "Source and destination accounts must be different.");
            return;
        }
        const cents = Math.round(parseFloat(amountStr) * 100);
        if (isNaN(cents) || cents <= 0) {
            Alert.alert("Invalid Amount", "Please enter a valid amount.");
            return;
        }

        try {
            setIsSaving(true);
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

            await TransactionRepository.create({
                amountCents: cents, // Positive? Transfer logic handles +/- usually based on perspective. 
                // For systemType='transfer', convention is often amount is positive, 
                // and UI/Calculations handle usage.
                date: Date.now(),
                type: 'expense', // Transfers are often effectively expenses from source? Or neutral?
                // systemType: 'transfer' overrides standard type display usually.
                systemType: 'transfer',
                transferFromAccountId: fromAccountId,
                transferToAccountId: toAccountId,
                note: note.trim() || undefined,
            });

            onDismiss();
        } catch (e) {
            console.error("Failed to transfer", e);
            Alert.alert("Error", "Failed to create transfer");
        } finally {
            setIsSaving(false);
        }
    };

    const openPicker = (mode: 'from' | 'to') => {
        Haptics.selectionAsync();
        setPickerMode(mode);
        setPickerVisible(true);
    };

    const selectAccount = (account: Account) => {
        Haptics.selectionAsync();
        if (pickerMode === 'from') {
            setFromAccountId(account.id);
            // Auto-clear if same
            if (account.id === toAccountId) setToAccountId(null);
        } else {
            setToAccountId(account.id);
            if (account.id === fromAccountId) setFromAccountId(null);
        }
        setPickerVisible(false);
    };

    const fromAccount = accounts.find(a => a.id === fromAccountId);
    const toAccount = accounts.find(a => a.id === toAccountId);

    return (
        <View style={styles.container}>
            <Stack.Screen options={{ headerShown: false }} />

            {/* Header */}
            <View style={[styles.header, { paddingTop: insets.top + 10 }]}>
                <TouchableOpacity onPress={onDismiss} style={styles.closeButton}>
                    <Ionicons name="close" size={24} color="#FFFFFF" />
                </TouchableOpacity>
                <Text style={styles.headerTitle}>Transfer Money</Text>
                <TouchableOpacity onPress={handleSave} disabled={isSaving}>
                    <Text style={[styles.headerButton, isSaving && { opacity: 0.5 }]}>Transfer</Text>
                </TouchableOpacity>
            </View>

            <ScrollView contentContainerStyle={styles.content}>
                <View style={styles.formSection}>
                    {/* From */}
                    <TouchableOpacity style={styles.row} onPress={() => openPicker('from')}>
                        <Text style={styles.label}>From</Text>
                        <View style={styles.valueContainer}>
                            <Text style={[styles.value, !fromAccount && styles.placeholder]}>
                                {fromAccount ? `${fromAccount.emoji} ${fromAccount.name}` : 'Select Account'}
                            </Text>
                            <Ionicons name="chevron-forward" size={20} color="rgba(255,255,255,0.3)" />
                        </View>
                    </TouchableOpacity>

                    <View style={styles.divider} />

                    {/* To */}
                    <TouchableOpacity style={styles.row} onPress={() => openPicker('to')}>
                        <Text style={styles.label}>To</Text>
                        <View style={styles.valueContainer}>
                            <Text style={[styles.value, !toAccount && styles.placeholder]}>
                                {toAccount ? `${toAccount.emoji} ${toAccount.name}` : 'Select Account'}
                            </Text>
                            <Ionicons name="chevron-forward" size={20} color="rgba(255,255,255,0.3)" />
                        </View>
                    </TouchableOpacity>
                </View>

                <View style={styles.formSection}>
                    <View style={styles.inputRow}>
                        <Text style={styles.label}>Amount</Text>
                        <View style={styles.amountInputContainer}>
                            <Text style={styles.currencySymbol}>{getCurrencySymbol('INR')}</Text>
                            <TextInput
                                style={styles.amountInput}
                                value={amountStr}
                                onChangeText={setAmountStr}
                                keyboardType="decimal-pad"
                                placeholder="0"
                                placeholderTextColor="rgba(255, 255, 255, 0.3)"
                                autoFocus
                            />
                        </View>
                    </View>

                    <View style={styles.divider} />

                    <TextInput
                        style={styles.noteInput}
                        value={note}
                        onChangeText={setNote}
                        placeholder="Note (optional)"
                        placeholderTextColor="rgba(255, 255, 255, 0.3)"
                    />
                </View>
            </ScrollView>

            {/* Account Picker Modal */}
            <Modal visible={pickerVisible} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setPickerVisible(false)}>
                <View style={styles.pickerContainer}>
                    <View style={styles.pickerHeader}>
                        <Text style={styles.pickerTitle}>Select {pickerMode === 'from' ? 'Source' : 'Destination'}</Text>
                        <TouchableOpacity onPress={() => setPickerVisible(false)} style={styles.pickerClose}>
                            <Ionicons name="close-circle" size={30} color="rgba(255,255,255,0.3)" />
                        </TouchableOpacity>
                    </View>
                    <ScrollView contentContainerStyle={styles.pickerContent}>
                        {sortedAccounts.map(acc => {
                            const isSelected = (pickerMode === 'from' && fromAccountId === acc.id) ||
                                (pickerMode === 'to' && toAccountId === acc.id);
                            const isDisabled = (pickerMode === 'from' && acc.id === toAccountId) ||
                                (pickerMode === 'to' && acc.id === fromAccountId);

                            return (
                                <TouchableOpacity
                                    key={acc.id}
                                    style={[styles.pickerItem, isDisabled && { opacity: 0.3 }]}
                                    onPress={() => !isDisabled && selectAccount(acc)}
                                    disabled={isDisabled}
                                >
                                    <View style={styles.pickerEmoji}>
                                        <Text style={{ fontSize: 24 }}>{acc.emoji}</Text>
                                    </View>
                                    <Text style={[styles.pickerName, isSelected && { color: Colors.accent }]}>{acc.name}</Text>
                                    {isSelected && <Ionicons name="checkmark" size={24} color={Colors.accent} />}
                                </TouchableOpacity>
                            );
                        })}
                    </ScrollView>
                </View>
            </Modal>

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
        paddingHorizontal: 16,
    },
    row: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingVertical: 16,
    },
    divider: {
        height: 1,
        backgroundColor: 'rgba(255,255,255,0.1)',
    },
    label: {
        fontFamily: 'AvenirNextCondensed-Medium',
        fontSize: 18,
        color: '#FFFFFF',
    },
    valueContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    value: {
        fontFamily: 'AvenirNextCondensed-Regular',
        fontSize: 18,
        color: '#FFFFFF',
    },
    placeholder: {
        color: 'rgba(255,255,255,0.3)',
    },
    inputRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingVertical: 12, // slightly tighter for amount
        minHeight: 50,
    },
    amountInputContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
    },
    currencySymbol: {
        fontFamily: 'AvenirNextCondensed-DemiBold',
        fontSize: 24,
        color: 'rgba(255, 255, 255, 0.5)',
    },
    amountInput: {
        fontFamily: 'AvenirNextCondensed-DemiBold',
        fontSize: 24,
        color: '#FFFFFF',
        minWidth: 80,
        textAlign: 'right',
    },
    noteInput: {
        fontFamily: 'AvenirNextCondensed-Regular',
        fontSize: 18,
        color: '#FFFFFF',
        paddingVertical: 16,
        minHeight: 50,
    },

    // Picker Modal
    pickerContainer: {
        flex: 1,
        backgroundColor: '#1C1C1E',
        paddingTop: 20,
    },
    pickerHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingHorizontal: 20,
        paddingBottom: 20,
        borderBottomWidth: 1,
        borderBottomColor: 'rgba(255,255,255,0.1)',
    },
    pickerTitle: {
        fontFamily: 'AvenirNextCondensed-Bold',
        fontSize: 20,
        color: '#FFFFFF',
    },
    pickerClose: {
        padding: 4,
    },
    pickerContent: {
        padding: 20,
    },
    pickerItem: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 16,
        borderBottomWidth: 1,
        borderBottomColor: 'rgba(255,255,255,0.05)',
    },
    pickerEmoji: {
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: 'rgba(255,255,255,0.1)',
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: 16,
    },
    pickerName: {
        flex: 1,
        fontFamily: 'AvenirNextCondensed-Medium',
        fontSize: 18,
        color: '#FFFFFF',
    },
});
