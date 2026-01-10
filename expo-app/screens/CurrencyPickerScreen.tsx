/**
 * Currency Picker Screen
 */

import React, { useState, useMemo } from 'react';
import {
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
    ScrollView,
    TextInput,
} from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';

import { Colors } from '../constants/theme';
import { CURRENCIES, getCurrencySymbol } from '../lib/logic/currencyUtils';
import { UserSettingsRepository } from '../lib/db/repositories';

interface CurrencyPickerScreenProps {
    currentCurrency?: string;
    onSelect?: (code: string) => void;
    onDismiss?: () => void;
}

export function CurrencyPickerScreen({ currentCurrency = 'INR', onSelect, onDismiss }: CurrencyPickerScreenProps) {
    const router = useRouter();
    const [search, setSearch] = useState('');
    const [selected, setSelected] = useState(currentCurrency);

    const filteredCurrencies = useMemo(() => {
        if (!search) return CURRENCIES;
        const q = search.toLowerCase();
        return CURRENCIES.filter(c =>
            c.code.toLowerCase().includes(q) ||
            c.name.toLowerCase().includes(q) ||
            c.symbol.includes(q)
        );
    }, [search]);

    const handleSelect = async (code: string) => {
        Haptics.selectionAsync();
        setSelected(code);

        try {
            await UserSettingsRepository.update({ currencyCode: code });
            if (onSelect) onSelect(code);
            if (onDismiss) onDismiss();
            else router.back();
        } catch (e) {
            console.error("Failed to update currency", e);
        }
    };

    return (
        <View style={styles.container}>
            <Stack.Screen options={{
                title: "Currency",
                headerStyle: { backgroundColor: '#000000' },
                headerTintColor: '#FFFFFF',
                headerLeft: () => (
                    <TouchableOpacity onPress={() => router.back()} style={{ padding: 8 }}>
                        <Ionicons name="chevron-back" size={24} color="#FFFFFF" />
                    </TouchableOpacity>
                ),
            }} />

            <View style={styles.searchContainer}>
                <Ionicons name="search" size={18} color="rgba(255, 255, 255, 0.5)" />
                <TextInput
                    style={styles.searchInput}
                    value={search}
                    onChangeText={setSearch}
                    placeholder="Search currencies..."
                    placeholderTextColor="rgba(255, 255, 255, 0.3)"
                    autoCorrect={false}
                />
                {search.length > 0 && (
                    <TouchableOpacity onPress={() => setSearch('')}>
                        <Ionicons name="close-circle" size={18} color="rgba(255, 255, 255, 0.5)" />
                    </TouchableOpacity>
                )}
            </View>

            <ScrollView contentContainerStyle={styles.content}>
                <View style={styles.card}>
                    {filteredCurrencies.map((currency, i) => (
                        <View key={currency.code}>
                            <TouchableOpacity
                                style={styles.row}
                                onPress={() => handleSelect(currency.code)}
                                activeOpacity={0.7}
                            >
                                <Text style={styles.symbol}>{currency.symbol}</Text>
                                <View style={styles.textContainer}>
                                    <Text style={styles.code}>{currency.code}</Text>
                                    <Text style={styles.name}>{currency.name}</Text>
                                </View>
                                {selected === currency.code && (
                                    <Ionicons name="checkmark-circle" size={24} color={Colors.accent} />
                                )}
                            </TouchableOpacity>
                            {i < filteredCurrencies.length - 1 && <View style={styles.divider} />}
                        </View>
                    ))}
                </View>
            </ScrollView>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#000000',
    },
    searchContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: 'rgba(255, 255, 255, 0.08)',
        borderRadius: 12,
        marginHorizontal: 20,
        marginTop: 10,
        marginBottom: 10,
        paddingHorizontal: 12,
        height: 44,
        gap: 8,
    },
    searchInput: {
        flex: 1,
        fontFamily: 'AvenirNextCondensed-Medium',
        fontSize: 17,
        color: '#FFFFFF',
    },
    content: {
        padding: 20,
        paddingTop: 0,
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
    symbol: {
        fontFamily: 'System',
        fontSize: 24,
        fontWeight: '600',
        color: '#FFFFFF',
        width: 32,
        textAlign: 'center',
    },
    textContainer: {
        flex: 1,
        gap: 2,
    },
    code: {
        fontFamily: 'AvenirNextCondensed-DemiBold',
        fontSize: 18,
        color: '#FFFFFF',
    },
    name: {
        fontFamily: 'System',
        fontSize: 13,
        color: 'rgba(255, 255, 255, 0.5)',
    },
    divider: {
        height: 1,
        backgroundColor: 'rgba(255, 255, 255, 0.08)',
        marginLeft: 64,
    },
});
