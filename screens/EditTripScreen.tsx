/**
 * Edit Trip Screen - Update existing trip details
 */

import React, { useState } from 'react';
import {
    View,
    StyleSheet,
    TouchableOpacity,
    ScrollView,
    Switch,
    Alert,
    KeyboardAvoidingView,
    Platform,
} from 'react-native';
import { Text, TextInput } from '@/components/ui/LockedText';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import * as Haptics from 'expo-haptics';
import { format } from 'date-fns';

import { Colors } from '../constants/theme';
import { Trip } from '../lib/logic/types';
import { getCurrencySymbol } from '../lib/logic/currencyUtils';
import { TripRepository } from '../lib/db/repositories';
import { EmojiPickerModal } from '../components/emoji/EmojiPickerModal';
import { RECOMMENDED_TRIP_EMOJIS } from '../lib/emoji/recommendedEmojis';

interface EditTripScreenProps {
    trip: Trip;
    onDismiss: () => void;
    onSave?: () => void;
}

export function EditTripScreen({ trip, onDismiss, onSave }: EditTripScreenProps) {
    const insets = useSafeAreaInsets();

    // State
    const [name, setName] = useState(trip.name);
    const [emoji, setEmoji] = useState(trip.emoji);
    const [isGroup, setIsGroup] = useState(trip.isGroup);
    const [startDate, setStartDate] = useState(new Date(trip.startDate || Date.now()));
    const [endDate, setEndDate] = useState(new Date(trip.endDate || Date.now() + 7 * 86400000));
    const [hasBudget, setHasBudget] = useState(!!trip.budgetCents);
    const [budgetString, setBudgetString] = useState(trip.budgetCents ? (trip.budgetCents / 100).toFixed(2) : '');
    const [isSaving, setIsSaving] = useState(false);

    const [showEmojiPicker, setShowEmojiPicker] = useState(false);

    // Date Picker State
    const [showStartPicker, setShowStartPicker] = useState(false);
    const [showEndPicker, setShowEndPicker] = useState(false);

    const canSave = name.trim().length > 0;
    const currencyCode = 'INR';

    const handleSave = async () => {
        if (!canSave) return;

        try {
            setIsSaving(true);
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

            await TripRepository.update(trip.id, {
                name,
                emoji,
                isGroup,
                startDate: startDate.getTime(),
                endDate: endDate.getTime(),
                budgetCents: hasBudget ? Math.round(parseFloat(budgetString) * 100) : undefined,
            });

            if (onSave) onSave();
            onDismiss();
        } catch (e) {
            console.error("Failed to update trip", e);
            Alert.alert("Error", "Failed to update trip.");
        } finally {
            setIsSaving(false);
        }
    };

    const onDateChange = (event: any, selectedDate?: Date, which?: 'start' | 'end') => {
        if (Platform.OS === 'android') {
            if (which === 'start') setShowStartPicker(false);
            if (which === 'end') setShowEndPicker(false);
        }

        if (selectedDate) {
            if (which === 'start') {
                setStartDate(selectedDate);
                if (selectedDate > endDate) {
                    setEndDate(selectedDate);
                }
            } else {
                setEndDate(selectedDate);
                if (selectedDate < startDate) {
                    setStartDate(selectedDate);
                }
            }
        }
    };

    return (
        <View style={styles.container}>
            {/* Header */}
            <View style={[styles.header, { paddingTop: insets.top + 10 }]}>
                <TouchableOpacity onPress={onDismiss} style={styles.closeButton}>
                    <Text style={styles.cancelText}>Cancel</Text>
                </TouchableOpacity>
                <Text style={styles.headerTitle}>Edit Trip</Text>
                <TouchableOpacity onPress={handleSave} disabled={!canSave || isSaving}>
                    <Text style={[styles.saveText, (!canSave || isSaving) && { opacity: 0.5 }]}>Save</Text>
                </TouchableOpacity>
            </View>

            <ScrollView contentContainerStyle={styles.content}>
                <View style={styles.formSection}>
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
                            placeholder="Trip Name"
                            placeholderTextColor="rgba(255, 255, 255, 0.3)"
                            autoFocus
                        />
                    </View>
                </View>

                <View style={styles.formSection}>
                    <View style={styles.row}>
                        <Text style={styles.label}>Start Date</Text>
                        {Platform.OS === 'ios' ? (
                            <DateTimePicker
                                value={startDate}
                                mode="date"
                                display="compact"
                                themeVariant="dark"
                                onChange={(e, d) => onDateChange(e, d, 'start')}
                                style={{ width: 120 }}
                            />
                        ) : (
                            <TouchableOpacity onPress={() => setShowStartPicker(true)}>
                                <Text style={styles.value}>{format(startDate, 'MMM d, yyyy')}</Text>
                            </TouchableOpacity>
                        )}
                    </View>
                    <View style={styles.divider} />
                    <View style={styles.row}>
                        <Text style={styles.label}>End Date</Text>
                        {Platform.OS === 'ios' ? (
                            <DateTimePicker
                                value={endDate}
                                mode="date"
                                display="compact"
                                themeVariant="dark"
                                onChange={(e, d) => onDateChange(e, d, 'end')}
                                style={{ width: 120 }}
                                minimumDate={startDate}
                            />
                        ) : (
                            <TouchableOpacity onPress={() => setShowEndPicker(true)}>
                                <Text style={styles.value}>{format(endDate, 'MMM d, yyyy')}</Text>
                            </TouchableOpacity>
                        )}
                    </View>
                </View>

                <View style={styles.formSection}>
                    <View style={styles.row}>
                        <Text style={styles.label}>Group Trip</Text>
                        <Switch
                            value={isGroup}
                            onValueChange={v => {
                                Haptics.selectionAsync();
                                setIsGroup(v);
                            }}
                            trackColor={{ false: '#3a3a3c', true: Colors.accent }}
                            thumbColor="#FFFFFF"
                            ios_backgroundColor="#3a3a3c"
                        />
                    </View>
                </View>

                {/* Budget */}
                <View style={styles.formSection}>
                    <View style={styles.row}>
                        <Text style={styles.label}>Total Budget</Text>
                        <Switch
                            value={hasBudget}
                            onValueChange={v => {
                                Haptics.selectionAsync();
                                setHasBudget(v);
                                if (!v) setBudgetString('');
                            }}
                            trackColor={{ false: '#3a3a3c', true: Colors.accent }}
                            thumbColor="#FFFFFF"
                            ios_backgroundColor="#3a3a3c"
                        />
                    </View>

                    {hasBudget && (
                        <>
                            <View style={styles.divider} />
                            <View style={styles.inputRow}>
                                <Text style={[styles.label, { flex: 1 }]}>Amount</Text>
                                <Text style={styles.currencySymbol}>{getCurrencySymbol(currencyCode)}</Text>
                                <TextInput
                                    style={styles.amountInput}
                                    value={budgetString}
                                    onChangeText={setBudgetString}
                                    keyboardType="decimal-pad"
                                    placeholder="0"
                                    placeholderTextColor="rgba(255, 255, 255, 0.3)"
                                />
                            </View>
                        </>
                    )}
                </View>
            </ScrollView>

            {/* Android Pickers */}
            {Platform.OS === 'android' && showStartPicker && (
                <DateTimePicker
                    value={startDate}
                    mode="date"
                    display="default"
                    onChange={(e, d) => onDateChange(e, d, 'start')}
                />
            )}
            {Platform.OS === 'android' && showEndPicker && (
                <DateTimePicker
                    value={endDate}
                    mode="date"
                    display="default"
                    onChange={(e, d) => onDateChange(e, d, 'end')}
                />
            )}

            <EmojiPickerModal
                visible={showEmojiPicker}
                title="Choose Icon"
                value={emoji}
                recommendedEmojis={RECOMMENDED_TRIP_EMOJIS}
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
        backgroundColor: '#1C1C1E', // Modal bg
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
    cancelText: {
        fontFamily: 'AvenirNextCondensed-Medium',
        fontSize: 18,
        color: Colors.accent,
    },
    saveText: {
        fontFamily: 'AvenirNextCondensed-Bold',
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
        borderRadius: 12,
        paddingHorizontal: 16,
    },
    row: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingVertical: 12,
        minHeight: 50,
    },
    divider: {
        height: 1,
        backgroundColor: 'rgba(255,255,255,0.1)',
    },
    label: {
        fontFamily: 'AvenirNextCondensed-Medium',
        fontSize: 17,
        color: '#FFFFFF',
    },
    value: {
        fontFamily: 'AvenirNextCondensed-Regular',
        fontSize: 17,
        color: Colors.accent,
    },
    emojiButton: {
        width: 44,
        height: 44,
        borderRadius: 22,
        backgroundColor: 'rgba(255, 255, 255, 0.1)',
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: 12,
    },
    emoji: {
        fontSize: 24,
    },
    nameInput: {
        flex: 1,
        fontFamily: 'AvenirNextCondensed-DemiBold',
        fontSize: 20,
        color: '#FFFFFF',
    },
    inputRow: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 12,
    },
    currencySymbol: {
        fontFamily: 'AvenirNextCondensed-Medium',
        fontSize: 17,
        color: 'rgba(255, 255, 255, 0.5)',
        marginRight: 4,
    },
    amountInput: {
        fontFamily: 'AvenirNextCondensed-Medium',
        fontSize: 17,
        color: '#FFFFFF',
        minWidth: 60,
        textAlign: 'right',
    },
});
