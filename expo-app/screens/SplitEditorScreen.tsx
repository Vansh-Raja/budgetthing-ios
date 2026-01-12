/**
 * SplitEditorScreen - Advanced expense splitting interface
 * 
 * Pixel-perfect port of SplitEditorView.swift
 */

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  View,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Text, TextInput } from '@/components/ui/LockedText';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';

import { Colors } from '../constants/theme';
import { TripParticipant, SplitType } from '../lib/logic/types';
import { formatCents, getCurrencySymbol } from '../lib/logic/currencyUtils';
import { TripSplitCalculator } from '../lib/logic/tripSplitCalculator';

interface SplitEditorScreenProps {
  participants: TripParticipant[];
  totalAmountCents: number;
  currencyCode?: string;
  initialSplitType?: SplitType;
  initialSplitData?: Record<string, number>;
  onSave: (splitType: SplitType, splitData: Record<string, number>, computedSplits: Record<string, number>) => void;
  onCancel: () => void;
  payerId?: string;
  onPayerChange?: (id: string) => void;
}

const SPLIT_TYPES: { type: SplitType; label: string; icon: any; description: string }[] = [
  { type: 'equal', label: 'Equal', icon: 'person-outline', description: 'Split equally among everyone' },
  { type: 'equalSelected', label: 'Selected', icon: 'checkmark-circle-outline', description: 'Split equally among selected people' },
  { type: 'exact', label: 'Exact', icon: 'cash-outline', description: 'Specify exact amounts' },
  { type: 'percentage', label: 'Percentage', icon: 'pie-chart-outline', description: 'Split by percentage' },
  { type: 'shares', label: 'Shares', icon: 'layers-outline', description: 'Split by shares (e.g. 2 shares vs 1 share)' },
];

export function SplitEditorScreen({
  participants,
  totalAmountCents,
  currencyCode = 'INR',
  initialSplitType = 'equal',
  initialSplitData = {},
  onSave,
  onCancel,
  payerId,
  onPayerChange,
}: SplitEditorScreenProps) {
  const insets = useSafeAreaInsets();

  // State
  const [splitType, setSplitType] = useState<SplitType>(initialSplitType);
  const [localSplitData, setLocalSplitData] = useState<Record<string, string>>({});

  // Initialize data on mount or type change
  useEffect(() => {
    initializeData(initialSplitType === splitType && Object.keys(initialSplitData).length > 0);
  }, [splitType]);

  const initializeData = (repopulate: boolean) => {
    const nextData: Record<string, string> = {};

    switch (splitType) {
      case 'equal':
        break; // No input needed

      case 'equalSelected':
        participants.forEach(p => {
          if (repopulate && initialSplitData[p.id] !== undefined) {
            nextData[p.id] = initialSplitData[p.id] > 0 ? "1" : "0";
          } else {
            nextData[p.id] = "1"; // Default all selected
          }
        });
        break;

      case 'percentage':
        if (repopulate && Object.keys(initialSplitData).length > 0) {
          participants.forEach(p => {
            nextData[p.id] = String(initialSplitData[p.id] ?? 0);
          });
        } else {
          // Equal percentages
          const equalPct = Math.floor(100 / participants.length);
          const remainder = 100 - (equalPct * participants.length);
          participants.forEach((p, i) => {
            nextData[p.id] = String(equalPct + (i === participants.length - 1 ? remainder : 0));
          });
        }
        break;

      case 'shares':
        if (repopulate && Object.keys(initialSplitData).length > 0) {
          participants.forEach(p => {
            nextData[p.id] = String(initialSplitData[p.id] ?? 0);
          });
        } else {
          participants.forEach(p => {
            nextData[p.id] = "1"; // Default 1 share
          });
        }
        break;

      case 'exact':
        if (repopulate && Object.keys(initialSplitData).length > 0) {
          participants.forEach(p => {
            // Convert cents to decimal string
            nextData[p.id] = (initialSplitData[p.id] ? initialSplitData[p.id] / 100 : 0).toString();
          });
        } else {
          participants.forEach(p => {
            nextData[p.id] = "";
          });
        }
        break;
    }
    setLocalSplitData(nextData);
  };

  // Parsing
  const parsedSplitData = useMemo(() => {
    const result: Record<string, number> = {};
    Object.entries(localSplitData).forEach(([id, val]) => {
      const num = parseFloat(val);
      if (!isNaN(num)) {
        if (splitType === 'exact') {
          // Input is decimal, store as cents
          result[id] = Math.round(num * 100);
        } else {
          // Percentage/Shares store as raw number
          result[id] = num;
        }
      }
    });
    return result;
  }, [localSplitData, splitType]);

  // Calculations
  const computedSplits = useMemo(() => {
    return TripSplitCalculator.calculateSplits(
      totalAmountCents,
      splitType,
      participants,
      parsedSplitData
    );
  }, [totalAmountCents, splitType, participants, parsedSplitData]);

  // Validation
  const validation = useMemo(() => {
    switch (splitType) {
      case 'equal':
        return { valid: true, message: `Each person pays ${formatCents(Object.values(computedSplits)[0] || 0, currencyCode)}` };

      case 'equalSelected': {
        const selectedCount = Object.values(parsedSplitData).filter(v => v > 0).length;
        const perPerson = Object.values(computedSplits).find(v => v > 0) || 0;
        return {
          valid: selectedCount > 0,
          message: `${selectedCount} selected · Each pays ${formatCents(perPerson, currencyCode)}`
        };
      }

      case 'percentage': {
        const sumPct = Object.values(parsedSplitData).reduce((a, b) => a + b, 0);
        const valid = Math.abs(sumPct - 100) < 0.1;
        return {
          valid,
          message: valid ? "Total 100%" : `Total ${sumPct.toFixed(1)}% (Must be 100%)`,
          isError: !valid
        };
      }

      case 'shares': {
        const sumShares = Object.values(parsedSplitData).reduce((a, b) => a + b, 0);
        return {
          valid: sumShares > 0,
          message: `Total shares: ${sumShares}`
        };
      }

      case 'exact': {
        const sumExact = Object.values(parsedSplitData).reduce((a, b) => a + b, 0);
        const diff = totalAmountCents - sumExact;
        const valid = Math.abs(diff) < 1; // Tolerance for rounding
        return {
          valid,
          message: valid
            ? `Matches ${formatCents(totalAmountCents, currencyCode)}`
            : diff > 0
              ? `${formatCents(diff, currencyCode)} remaining`
              : `Over by ${formatCents(-diff, currencyCode)}`,
          isError: !valid
        };
      }
    }
  }, [splitType, parsedSplitData, computedSplits, totalAmountCents, currencyCode]);

  const handleSave = () => {
    if (validation.valid) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      onSave(splitType, parsedSplitData, computedSplits);
    } else {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    }
  };

  const handleInputChange = (id: string, text: string) => {
    setLocalSplitData(prev => ({ ...prev, [id]: text }));
  };

  const currentDescription = SPLIT_TYPES.find(t => t.type === splitType)?.description;

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={styles.container}
    >
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top }]}>
        <TouchableOpacity onPress={onCancel} style={styles.headerButton}>
          <Text style={styles.headerButtonText}>Cancel</Text>
        </TouchableOpacity>

        <View style={{ alignItems: 'center' }}>
          <Text style={styles.headerTitle}>Split Options</Text>
          {/* Payer Selector */}
          <TouchableOpacity
            style={styles.payerSelector}
            onPress={() => {
              // TODO: Show simple picker or toggle
              // For now, simpler implementation: toggle through participants? 
              // Or pass onPayerChange to parent? 
              // The requirement is to allow selecting payer.
              // Making this fully self-contained here:
              if (onPayerChange && participants.length > 0) {
                const currentIdx = participants.findIndex(p => p.id === payerId);
                const nextIdx = (currentIdx + 1) % participants.length;
                Haptics.selectionAsync();
                onPayerChange(participants[nextIdx].id);
              }
            }}
          >
            <Text style={styles.payerText}>
              Paid by <Text style={{ fontWeight: 'bold', color: 'white' }}>{participants.find(p => p.id === payerId)?.isCurrentUser ? "You" : participants.find(p => p.id === payerId)?.name}</Text>
            </Text>
            {participants.length > 1 && <Ionicons name="chevron-down" size={12} color="rgba(255,255,255,0.5)" style={{ marginLeft: 4 }} />}
          </TouchableOpacity>
        </View>

        <TouchableOpacity
          onPress={handleSave}
          style={styles.headerButton}
          disabled={!validation.valid}
        >
          <Text style={[
            styles.headerButtonText,
            styles.doneButtonText,
            !validation.valid && styles.disabledButtonText
          ]}>Done</Text>
        </TouchableOpacity>
      </View>

      {/* Split Type Selector */}
      <View style={styles.typeSelectorContainer}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.typeSelectorContent}>
          {SPLIT_TYPES.map(t => (
            <TouchableOpacity
              key={t.type}
              onPress={() => {
                Haptics.selectionAsync();
                setSplitType(t.type);
              }}
              style={[
                styles.typeButton,
                splitType === t.type && styles.typeButtonActive
              ]}
            >
              <Ionicons
                name={t.icon}
                size={12}
                color={splitType === t.type ? '#FFFFFF' : 'rgba(255, 255, 255, 0.5)'}
              />
              <Text style={[
                styles.typeButtonText,
                splitType === t.type && styles.typeButtonTextActive
              ]}>{t.label}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
        {/* Description */}
        <Text style={styles.description}>{currentDescription}</Text>

        {/* List */}
        <View style={styles.listContainer}>
          {participants.map((participant, index) => (
            <View key={participant.id}>
              <View style={styles.row}>
                {/* Avatar */}
                <View style={[styles.avatar, { backgroundColor: '#' + (participant.colorHex || 'FF9500') }]}>
                  <Text style={styles.avatarText}>{participant.name.charAt(0).toUpperCase()}</Text>
                </View>

                {/* Name */}
                <Text style={styles.name}>
                  {participant.isCurrentUser ? 'You' : participant.name}
                </Text>

                <View style={{ flex: 1 }} />

                {/* Inputs */}
                {splitType === 'equal' && (
                  <Text style={styles.readOnlyValue}>
                    {formatCents(computedSplits[participant.id] ?? 0, currencyCode)}
                  </Text>
                )}

                {splitType === 'equalSelected' && (
                  <View style={styles.rowRight}>
                    {(parsedSplitData[participant.id] > 0) && (
                      <Text style={styles.readOnlyValueSmall}>
                        {formatCents(computedSplits[participant.id] ?? 0, currencyCode)}
                      </Text>
                    )}
                    <TouchableOpacity
                      onPress={() => {
                        Haptics.selectionAsync();
                        const current = parsedSplitData[participant.id] || 0;
                        handleInputChange(participant.id, current > 0 ? "0" : "1");
                      }}
                    >
                      <Ionicons
                        name={parsedSplitData[participant.id] > 0 ? "checkmark-circle" : "ellipse-outline"}
                        size={24}
                        color={parsedSplitData[participant.id] > 0 ? Colors.accent : 'rgba(255, 255, 255, 0.3)'}
                      />
                    </TouchableOpacity>
                  </View>
                )}

                {splitType === 'percentage' && (
                  <View style={styles.inputContainer}>
                    <TextInput
                      style={styles.input}
                      value={localSplitData[participant.id] || ""}
                      onChangeText={(t) => handleInputChange(participant.id, t)}
                      keyboardType="decimal-pad"
                      placeholder="0"
                      placeholderTextColor="rgba(255, 255, 255, 0.3)"
                    />
                    <Text style={styles.unit}>%</Text>
                  </View>
                )}

                {splitType === 'shares' && (
                  <View style={styles.sharesContainer}>
                    <TouchableOpacity
                      onPress={() => {
                        Haptics.selectionAsync();
                        const current = parseFloat(localSplitData[participant.id] || "0");
                        handleInputChange(participant.id, String(Math.max(0, current - 1)));
                      }}
                    >
                      <Ionicons name="remove-circle" size={24} color="rgba(255, 255, 255, 0.4)" />
                    </TouchableOpacity>

                    <Text style={styles.shareValue}>{localSplitData[participant.id] || "0"}</Text>

                    <TouchableOpacity
                      onPress={() => {
                        Haptics.selectionAsync();
                        const current = parseFloat(localSplitData[participant.id] || "0");
                        handleInputChange(participant.id, String(current + 1));
                      }}
                    >
                      <Ionicons name="add-circle" size={24} color={Colors.accent} />
                    </TouchableOpacity>
                  </View>
                )}

                {splitType === 'exact' && (
                  <View style={styles.inputContainer}>
                    <Text style={styles.unit}>{getCurrencySymbol(currencyCode)}</Text>
                    <TextInput
                      style={[styles.input, { width: 80 }]}
                      value={localSplitData[participant.id] || ""}
                      onChangeText={(t) => handleInputChange(participant.id, t)}
                      keyboardType="decimal-pad"
                      placeholder="0.00"
                      placeholderTextColor="rgba(255, 255, 255, 0.3)"
                    />
                  </View>
                )}
              </View>
              {index < participants.length - 1 && <View style={styles.divider} />}
            </View>
          ))}
        </View>

        {/* Validation Bar */}
        <View style={styles.validationBar}>
          <Text style={[styles.validationText, validation.isError && styles.errorText]}>
            {validation.message}
          </Text>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.1)',
  },
  headerButton: {
    padding: 8,
  },
  headerButtonText: {
    fontFamily: 'System',
    fontSize: 17,
    color: '#FFFFFF',
  },
  doneButtonText: {
    fontWeight: '600',
    color: Colors.accent,
  },
  disabledButtonText: {
    color: 'rgba(255, 255, 255, 0.3)',
  },
  headerTitle: {
    fontFamily: 'AvenirNextCondensed-Heavy',
    fontSize: 20,
    color: '#FFFFFF',
  },
  payerSelector: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  payerText: {
    fontFamily: 'System',
    fontSize: 13,
    color: 'rgba(255, 255, 255, 0.6)',
  },

  // Type Selector
  typeSelectorContainer: {
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    paddingVertical: 12,
  },
  typeSelectorContent: {
    paddingHorizontal: 20,
    gap: 8,
  },
  typeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderRadius: 9999,
  },
  typeButtonActive: {
    backgroundColor: Colors.accent,
  },
  typeButtonText: {
    fontFamily: 'AvenirNextCondensed-DemiBold',
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.5)',
  },
  typeButtonTextActive: {
    color: '#FFFFFF',
  },

  scrollContent: {
    paddingBottom: 40,
  },
  description: {
    fontFamily: 'System',
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.6)',
    marginHorizontal: 20,
    marginTop: 16,
    marginBottom: 8,
  },

  // List
  listContainer: {
    marginHorizontal: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    borderRadius: 12,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    gap: 12,
    minHeight: 56,
  },
  divider: {
    height: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    marginLeft: 60,
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: {
    fontFamily: 'AvenirNextCondensed-DemiBold',
    fontSize: 14,
    color: '#FFFFFF',
  },
  name: {
    fontFamily: 'AvenirNextCondensed-DemiBold',
    fontSize: 16,
    color: '#FFFFFF',
  },

  // Inputs/Displays
  readOnlyValue: {
    fontFamily: 'AvenirNextCondensed-DemiBold',
    fontSize: 16,
    color: 'rgba(255, 255, 255, 0.6)',
  },
  readOnlyValueSmall: {
    fontFamily: 'AvenirNextCondensed-DemiBold',
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.6)',
    marginRight: 8,
  },
  rowRight: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  input: {
    fontFamily: 'AvenirNextCondensed-DemiBold',
    fontSize: 18,
    color: '#FFFFFF',
    minWidth: 40,
    textAlign: 'right',
    padding: 0,
  },
  unit: {
    fontFamily: 'AvenirNextCondensed-DemiBold',
    fontSize: 16,
    color: 'rgba(255, 255, 255, 0.5)',
  },
  sharesContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  shareValue: {
    fontFamily: 'AvenirNextCondensed-DemiBold',
    fontSize: 20,
    color: '#FFFFFF',
    width: 30,
    textAlign: 'center',
  },

  // Validation
  validationBar: {
    marginHorizontal: 20,
    marginTop: 16,
    padding: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    borderRadius: 12,
    alignItems: 'center',
  },
  validationText: {
    fontFamily: 'System',
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.7)',
    fontWeight: '600',
  },
  errorText: {
    color: Colors.accent,
  },
});
