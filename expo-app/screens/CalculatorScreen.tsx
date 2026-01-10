/**
 * CalculatorScreen - Expense entry interface
 * 
 * A pixel-perfect port of ExpenseEntryView.swift with full calculator functionality.
 */

import React, { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Pressable,
  TextInput,
  ScrollView,
  Dimensions,
  Platform,
  StatusBar,
  Modal,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { Colors, Sizes, BorderRadius } from '../constants/theme';
import { getCurrencySymbol } from '../lib/logic/currencyUtils';
import { SplitEditorScreen } from './SplitEditorScreen';
import { SplitType } from '../lib/logic/types';
import { useCategories, useAccounts } from '../lib/hooks/useData';
import { useTrips } from '../lib/hooks/useTrips';
import { TransactionRepository, TripExpenseRepository, TripRepository } from '../lib/db/repositories';
import { TripSplitCalculator } from '../lib/logic/tripSplitCalculator';

// ============================================================================
// Types
// ============================================================================

type KeyType =
  | { type: 'digit'; value: number }
  | { type: 'dot' }
  | { type: 'clear' }
  | { type: 'backspace' }
  | { type: 'plusMinus' }
  | { type: 'percent' }
  | { type: 'op'; symbol: '+' | '−' | '×' | '÷' | '=' }
  | { type: 'save' };

type Operation = 'add' | 'subtract' | 'multiply' | 'divide';
type EntryMode = 'expense' | 'income';

interface EquationToken {
  type: 'number' | 'op' | 'equals';
  value: string;
}

// ============================================================================
// Calculator Engine Hook
// ============================================================================

function useCalculatorEngine() {
  const [amountString, setAmountString] = useState('0');
  const [currentValue, setCurrentValue] = useState<number | null>(null);
  const [pendingOperation, setPendingOperation] = useState<Operation | null>(null);
  const [lastOperand, setLastOperand] = useState<number | null>(null);
  const [lastInputWasOperation, setLastInputWasOperation] = useState(false);
  const [lastEquation, setLastEquation] = useState<string | null>(null);
  const [equationTokens, setEquationTokens] = useState<EquationToken[]>([]);

  const parseAmount = useCallback((str: string): number => {
    return parseFloat(str) || 0;
  }, []);

  const formatDecimal = useCallback((num: number): string => {
    // Format with at most 2 decimal places, no trailing zeros
    const fixed = num.toFixed(2);
    return fixed.replace(/\.?0+$/, '') || '0';
  }, []);

  const appendDigit = useCallback((n: number) => {
    setAmountString(prev => {
      if (prev === '0') return String(n);

      // Check decimal limit
      const dotIndex = prev.indexOf('.');
      if (dotIndex !== -1) {
        const fractional = prev.substring(dotIndex + 1);
        if (fractional.length >= 2) return prev; // Limit to 2 decimals
      }

      return prev + String(n);
    });
  }, []);

  const appendDot = useCallback(() => {
    setAmountString(prev => {
      if (!prev.includes('.')) return prev + '.';
      return prev;
    });
  }, []);

  const backspace = useCallback(() => {
    setAmountString(prev => {
      if (prev.length <= 1 || (prev.length === 2 && prev.startsWith('-'))) {
        return '0';
      }
      const newVal = prev.slice(0, -1);
      return newVal === '-' ? '0' : newVal;
    });
  }, []);

  const toggleSign = useCallback(() => {
    setAmountString(prev => {
      if (prev.startsWith('-')) return prev.substring(1);
      if (prev !== '0') return '-' + prev;
      return prev;
    });
  }, []);

  const applyPercent = useCallback(() => {
    setAmountString(prev => {
      const value = parseFloat(prev) || 0;
      const result = value / 100;
      return formatDecimal(result);
    });
  }, [formatDecimal]);

  const clearAll = useCallback(() => {
    setAmountString('0');
    setCurrentValue(null);
    setPendingOperation(null);
    setLastOperand(null);
    setLastInputWasOperation(false);
    setLastEquation(null);
    setEquationTokens([]);
  }, []);

  const symbolToOperation = useCallback((symbol: string): Operation | null => {
    switch (symbol) {
      case '+': return 'add';
      case '−': return 'subtract';
      case '×': return 'multiply';
      case '÷': return 'divide';
      default: return null;
    }
  }, []);

  const operationToSymbol = useCallback((op: Operation): string => {
    switch (op) {
      case 'add': return '+';
      case 'subtract': return '−';
      case 'multiply': return '×';
      case 'divide': return '÷';
    }
  }, []);

  const applyOperation = useCallback((lhs: number, rhs: number, op: Operation): number => {
    switch (op) {
      case 'add': return lhs + rhs;
      case 'subtract': return lhs - rhs;
      case 'multiply': return lhs * rhs;
      case 'divide': return rhs === 0 ? 0 : lhs / rhs;
    }
  }, []);

  const handleOperation = useCallback((symbol: string) => {
    if (symbol === '=') {
      // Evaluate equals
      const operand = lastInputWasOperation && lastOperand !== null
        ? lastOperand
        : parseAmount(amountString);

      if (!lastInputWasOperation) {
        setLastOperand(operand);
      }

      const opBefore = pendingOperation;
      const lhs = currentValue;

      let result = operand;
      if (opBefore !== null && lhs !== null) {
        result = applyOperation(lhs, operand, opBefore);
      }

      setCurrentValue(result);
      setPendingOperation(null);
      setAmountString(formatDecimal(result));
      setLastInputWasOperation(true);

      if (opBefore !== null && lhs !== null) {
        setLastEquation(`${formatDecimal(lhs)} ${operationToSymbol(opBefore)} ${formatDecimal(operand)}`);
        setEquationTokens(prev => [
          ...prev,
          { type: 'equals', value: '=' },
          { type: 'number', value: formatDecimal(result) },
        ]);
      }
      return;
    }

    const op = symbolToOperation(symbol);
    if (!op) return;

    const operand = parseAmount(amountString);
    setLastOperand(operand);

    // Calculate new value
    let newValue = operand;
    if (pendingOperation !== null && currentValue !== null && !lastInputWasOperation) {
      newValue = applyOperation(currentValue, operand, pendingOperation);
    }

    setCurrentValue(newValue);
    setPendingOperation(op);
    setAmountString(formatDecimal(newValue));
    setLastInputWasOperation(true);

    // Update equation tokens
    setEquationTokens(prev => {
      let updated = [...prev];
      if (updated.length === 0) {
        updated.push({ type: 'number', value: formatDecimal(operand) });
      }
      // Remove trailing op if exists
      if (updated.length > 0 && updated[updated.length - 1].type === 'op') {
        updated.pop();
      }
      updated.push({ type: 'op', value: operationToSymbol(op) });
      return updated;
    });
  }, [
    amountString, currentValue, pendingOperation, lastOperand, lastInputWasOperation,
    parseAmount, formatDecimal, applyOperation, symbolToOperation, operationToSymbol
  ]);

  const syncTokensWithAmount = useCallback(() => {
    setEquationTokens(prev => {
      const updated = [...prev];
      if (updated.length === 0) {
        return [{ type: 'number', value: amountString }];
      }
      const last = updated[updated.length - 1];
      if (last.type === 'number') {
        updated[updated.length - 1] = { type: 'number', value: amountString };
      } else if (last.type === 'equals') {
        return [{ type: 'number', value: amountString }];
      } else {
        updated.push({ type: 'number', value: amountString });
      }
      return updated;
    });
  }, [amountString]);

  const handleKey = useCallback((key: KeyType) => {
    switch (key.type) {
      case 'digit':
        setLastEquation(null);
        if (lastInputWasOperation) {
          setAmountString('0');
          setLastInputWasOperation(false);
        }
        appendDigit(key.value);
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        break;

      case 'dot':
        setLastEquation(null);
        if (lastInputWasOperation) {
          setAmountString('0');
          setLastInputWasOperation(false);
        }
        appendDot();
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        break;

      case 'clear':
        clearAll();
        Haptics.selectionAsync();
        break;

      case 'backspace':
        setLastEquation(null);
        backspace();
        setEquationTokens([]);
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        break;

      case 'plusMinus':
        setLastEquation(null);
        toggleSign();
        Haptics.selectionAsync();
        break;

      case 'percent':
        setLastEquation(null);
        applyPercent();
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        break;

      case 'op':
        handleOperation(key.symbol);
        Haptics.selectionAsync();
        break;
    }
  }, [
    lastInputWasOperation, appendDigit, appendDot, clearAll, backspace,
    toggleSign, applyPercent, handleOperation
  ]);

  // Sync tokens when amountString changes (for non-operation inputs)
  useEffect(() => {
    if (!lastInputWasOperation) {
      syncTokensWithAmount();
    }
  }, [amountString, lastInputWasOperation, syncTokensWithAmount]);

  return {
    amountString,
    equationTokens,
    handleKey,
    clearAll,
    getDecimalAmount: () => parseAmount(amountString),
  };
}

// ============================================================================
// Main Component
// ============================================================================

interface CalculatorScreenProps {
  initialTripId?: string;
  onSave?: (data: {
    amountCents: number;
    type: EntryMode;
    categoryId: string | null;
    accountId: string | null;
    note: string | null;
    tripId: string | null;
  }) => void;
}

export function CalculatorScreen({ initialTripId, onSave }: CalculatorScreenProps) {
  const insets = useSafeAreaInsets();
  const { width, height } = Dimensions.get('window');

  // Calculator state
  const calculator = useCalculatorEngine();

  // UI state
  const [mode, setMode] = useState<EntryMode>('expense');
  const [noteText, setNoteText] = useState('');
  const [showNoteField, setShowNoteField] = useState(false);
  const [showAccountDropdown, setShowAccountDropdown] = useState(false);
  const [showSavedToast, setShowSavedToast] = useState(false);
  const [errorToast, setErrorToast] = useState<string | null>(null);
  const [selectedEmoji, setSelectedEmoji] = useState<string | null>(null);
  const [selectedTripId, setSelectedTripId] = useState<string | null>(initialTripId || null);
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null);
  const [showSplitEditor, setShowSplitEditor] = useState(false);
  const [pendingTransaction, setPendingTransaction] = useState<any>(null);
  const [selectedPayerId, setSelectedPayerId] = useState<string | null>(null);
  const noteInputRef = useRef<TextInput>(null);

  // Data Hooks
  const { data: categoriesData } = useCategories();
  const { data: accountsData } = useAccounts();
  const { trips } = useTrips();

  const currencyCode = 'INR'; // TODO: Get from UserSettings

  // Prepare data for UI
  const categories = useMemo(() => categoriesData.filter(c => !c.isSystem).map(c => c.emoji), [categoriesData]);
  const categoryMap = useMemo(() => {
    const map = new Map<string, string>(); // emoji -> id
    categoriesData.forEach(c => map.set(c.emoji, c.id));
    return map;
  }, [categoriesData]);

  const accounts = accountsData.length > 0 ? accountsData : [{ id: '1', name: 'Cash', emoji: '💵' }];

  const openTrips = useMemo(() => trips.filter(t => !t.isArchived), [trips]);

  // Layout matching Swift GeometryReader logic
  // topHeight = proxy.size.height * 0.42
  const topHeight = height * 0.42;
  // amountFontSize = min(proxy.size.width * 0.22, 120)
  const amountFontSize = Math.min(width * 0.22, 120);
  // keyHeight = max(56, proxy.size.height * 0.064)
  const keyHeight = Math.max(56, height * 0.064);

  const formattedAmount = useMemo(() => {
    const prefix = calculator.amountString.startsWith('-') ? '-' : '';
    const bare = calculator.amountString.replace('-', '');
    const display = bare || '0';
    const symbol = getCurrencySymbol(currencyCode);
    return symbol + prefix + display;
  }, [calculator.amountString, currencyCode]);

  const currentAccount = useMemo(() => {
    return accounts.find(a => a.id === selectedAccountId) || accounts[0];
  }, [accounts, selectedAccountId]);

  // Handlers
  const handleSave = useCallback(async () => {
    const amountDecimal = calculator.getDecimalAmount();
    if (amountDecimal === 0) {
      setErrorToast('Enter an amount greater than 0 to save.');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      setTimeout(() => setErrorToast(null), 1400);
      return;
    }

    // Convert to cents
    const amountCents = Math.round(amountDecimal * 100) * (mode === 'expense' ? -1 : 1);

    // Resolve IDs
    const categoryId = mode === 'income' ? null : (selectedEmoji ? categoryMap.get(selectedEmoji) ?? null : null);
    const accountId = selectedAccountId || accounts[0].id;

    const data = {
      amountCents,
      type: mode,
      categoryId,
      accountId,
      note: noteText.trim() || null,
      tripId: selectedTripId,
    };

    if (onSave) {
      onSave(data);
      return;
    }

    // Check if group trip needs split
    const trip = openTrips.find(t => t.id === selectedTripId);
    if (trip?.isGroup && mode === 'expense') {
      // Default payer to current user
      const me = trip.participants?.find(p => p.isCurrentUser);
      setSelectedPayerId(me?.id || trip.participants?.[0]?.id || null);
      setPendingTransaction(data);
      setShowSplitEditor(true);
      return;
    }

    // Save solo transaction
    try {
      const tx = await TransactionRepository.create({
        amountCents,
        date: Date.now(),
        note: data.note ?? undefined,
        type: mode,
        categoryId: categoryId ?? undefined,
        accountId: accountId ?? undefined,
      });

      // Link to trip if selected (Solo)
      if (trip && mode === 'expense') {
        await TripExpenseRepository.create({
          tripId: trip.id,
          transactionId: tx.id,
          splitType: 'equal', // Solo is implicitly equal (1 person)
          // paidByParticipantId? We need to find "me" participant.
          // Or just leave empty if not strictly needed for solo?
          // Swift logic creates TripExpense.
        });
      }

      calculator.clearAll();
      setNoteText('');
      setShowNoteField(false);
      setShowSavedToast(true);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

      setTimeout(() => setShowSavedToast(false), 1200);
    } catch (e) {
      console.error(e);
      Alert.alert('Error', `Save failed: ${e}`);
      setErrorToast('Failed to save');
    }
  }, [calculator, mode, selectedEmoji, selectedAccountId, noteText, selectedTripId, onSave, categoryMap, accounts, openTrips]);

  const toggleNoteField = useCallback(() => {
    const newValue = !showNoteField;
    setShowNoteField(newValue);
    Haptics.selectionAsync();
    if (newValue) {
      setTimeout(() => noteInputRef.current?.focus(), 100);
    }
  }, [showNoteField]);

  const dismissNoteField = useCallback(() => {
    setShowNoteField(false);
  }, []);

  const onKeyPress = useCallback((key: KeyType) => {
    if (key.type === 'save') {
      handleSave();
    } else {
      calculator.handleKey(key);
    }
  }, [calculator, handleSave]);

  const handleSplitSave = async (splitType: SplitType, splitData: Record<string, number>) => {
    try {
      const tx = await TransactionRepository.create({
        amountCents: pendingTransaction.amountCents,
        date: Date.now(),
        note: pendingTransaction.note ?? undefined,
        type: pendingTransaction.type,
        categoryId: pendingTransaction.categoryId ?? undefined,
        accountId: pendingTransaction.accountId ?? undefined,
      });

      const trip = openTrips.find(t => t.id === pendingTransaction.tripId);
      const me = trip?.participants?.find(p => p.isCurrentUser);

      if (trip) {
        const computed = TripSplitCalculator.calculateSplits(
          Math.abs(pendingTransaction.amountCents),
          splitType,
          trip.participants || [],
          splitData
        );

        const tripExpense = await TripExpenseRepository.create({
          tripId: trip.id,
          transactionId: tx.id,
          paidByParticipantId: selectedPayerId || me?.id,
          splitType,
          splitData,
          computedSplits: computed,
        });

        // Link transaction to trip expense
        await TransactionRepository.update(tx.id, { tripExpenseId: tripExpense.id });
      }

      setShowSplitEditor(false);
      setPendingTransaction(null);

      calculator.clearAll();
      setNoteText('');
      setShowNoteField(false);
      setShowSavedToast(true);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

      setTimeout(() => setShowSavedToast(false), 1200);
    } catch (e) {
      console.error(e);
    }
  };

  // ============================================================================
  // Render Helpers
  // ============================================================================

  const renderEquationText = () => {
    if (calculator.equationTokens.length === 0) return null;

    return (
      <View style={styles.equationRow}>
        {calculator.equationTokens.map((token, index) => (
          <Text
            key={index}
            style={[
              styles.equationText,
              token.type === 'op' || token.type === 'equals'
                ? styles.equationOperator
                : styles.equationNumber,
            ]}
          >
            {token.value}{' '}
          </Text>
        ))}
      </View>
    );
  };

  const renderKey = (key: KeyType, label: string, isIcon = false) => {
    const isOperator = key.type === 'op' || key.type === 'percent';
    const color = isOperator ? Colors.accent : Colors.textPrimary;
    const fontFamily = isOperator ? 'AvenirNextCondensed-DemiBold' : 'AvenirNextCondensed-Medium';

    return (
      <TouchableOpacity
        key={label}
        style={[styles.keyButton, { height: keyHeight }]}
        onPress={() => onKeyPress(key)}
        activeOpacity={0.7}
        accessibilityLabel={label}
      >
        {isIcon ? (
          <Ionicons name="backspace-outline" size={28} color={color} />
        ) : (
          <Text style={[styles.keyText, { color, fontFamily }, isOperator && styles.keyTextOperator]}>
            {label}
          </Text>
        )}
      </TouchableOpacity>
    );
  };

  const renderEmojiRow = (
    items: string[],
    selectedId: string | null,
    onSelect: (id: string) => void,
    maxVisible = 7
  ) => {
    const count = items.length;
    const baseItem = 36;
    const baseSpacing = 14;
    const effectiveCount = Math.min(count + 1, maxVisible); // +1 for add button
    const needed = effectiveCount * baseItem + (effectiveCount - 1) * baseSpacing;
    const availableWidth = width - 40;
    const scale = effectiveCount > 0 ? Math.min(1.0, availableWidth / needed) : 1;
    const rowHeight = baseItem * scale;

    const content = (
      <View style={[styles.emojiRowContent, { gap: baseSpacing * scale }]}>
        {items.map((emoji) => (
          <TouchableOpacity
            key={emoji}
            style={[styles.emojiButton, { width: baseItem * scale, height: baseItem * scale }]}
            onPress={() => {
              onSelect(selectedId === emoji ? '' : emoji);
              Haptics.selectionAsync();
            }}
            activeOpacity={0.7}
            disabled={mode === 'income'}
          >
            <Text style={[styles.emojiText, { fontSize: 24 * scale }]}>
              {emoji}
            </Text>
            {selectedId === emoji && (
              <View style={[styles.emojiIndicator, { width: 16 * scale, height: 2 * scale }]} />
            )}
          </TouchableOpacity>
        ))}
        <TouchableOpacity
          style={[styles.emojiButton, { width: baseItem * scale, height: baseItem * scale }]}
          onPress={() => {
            Haptics.selectionAsync();
          }}
          activeOpacity={0.7}
        >
          <Text style={[styles.emojiAddText, { fontSize: 24 * scale }]}>⊕</Text>
        </TouchableOpacity>
      </View>
    );

    if (count > 6) {
      return (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={{ height: rowHeight }}
          contentContainerStyle={styles.emojiScrollContent}
        >
          {content}
        </ScrollView>
      );
    }

    return <View style={{ height: rowHeight, justifyContent: 'center' }}>{content}</View>;
  };

  // ============================================================================
  // Main Render
  // ============================================================================

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" />

      {/* Tap backdrop to dismiss dropdowns */}
      {(showAccountDropdown || showNoteField) && (
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={() => {
            setShowAccountDropdown(false);
            setShowNoteField(false);
          }}
        />
      )}

      {/* Top Controls Overlay */}
      <View style={[styles.topControls, { paddingTop: insets.top + 16 }]}>
        <View style={styles.topControlsRow}>
          {/* Mode Toggle */}
          <View style={styles.modeToggle}>
            <TouchableOpacity
              style={styles.modeButton}
              onPress={() => { setMode('expense'); Haptics.selectionAsync(); }}
              activeOpacity={0.7}
            >
              <Text style={[
                styles.modeButtonText,
                mode === 'expense' && { color: Colors.accent }
              ]}>−</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.modeButton}
              onPress={() => { setMode('income'); Haptics.selectionAsync(); }}
              activeOpacity={0.7}
            >
              <Text style={[
                styles.modeButtonText,
                mode === 'income' && { color: Colors.accentGreen }
              ]}>+</Text>
            </TouchableOpacity>
          </View>

          {/* Account Pill (centered) */}
          <TouchableOpacity
            style={styles.accountPill}
            onPress={() => {
              if (accounts.length > 1) {
                setShowAccountDropdown(!showAccountDropdown);
                Haptics.selectionAsync();
              }
            }}
            activeOpacity={accounts.length > 1 ? 0.7 : 1}
          >
            <Text style={styles.accountPillText}>
              {currentAccount.emoji} {currentAccount.name}
            </Text>
          </TouchableOpacity>

          {/* Save Button */}
          <TouchableOpacity
            style={styles.saveButton}
            onPress={handleSave}
            activeOpacity={0.7}
          >
            <Ionicons name="checkmark" size={16} color={Colors.textPrimary} />
          </TouchableOpacity>
        </View>

        {/* Account Dropdown */}
        {showAccountDropdown && (
          <View style={styles.accountDropdown}>
            {accounts.map((account, index) => (
              <React.Fragment key={account.id}>
                <TouchableOpacity
                  style={styles.accountDropdownItem}
                  onPress={() => {
                    setSelectedAccountId(account.id);
                    setShowAccountDropdown(false);
                    Haptics.selectionAsync();
                  }}
                  activeOpacity={0.7}
                >
                  <Text style={styles.accountDropdownEmoji}>{account.emoji}</Text>
                  <Text style={styles.accountDropdownName}>{account.name}</Text>
                  <View style={{ flex: 1 }} />
                  {(selectedAccountId === account.id || (!selectedAccountId && index === 0)) && (
                    <View style={styles.accountSelectedIndicator} />
                  )}
                </TouchableOpacity>
                {index < accounts.length - 1 && <View style={styles.accountDropdownDivider} />}
              </React.Fragment>
            ))}
          </View>
        )}

        {/* Toasts */}
        {showSavedToast && (
          <View style={styles.toast}>
            <Text style={styles.toastText}>{mode === 'income' ? 'Added' : 'Saved'}</Text>
          </View>
        )}
        {errorToast && (
          <View style={styles.toast}>
            <Text style={styles.toastText}>{errorToast}</Text>
          </View>
        )}
      </View>

      {/* Amount Display - Top Half */}
      <View style={[styles.amountContainer, { height: topHeight }]}>
        {renderEquationText()}
        <View style={styles.amountWrapper}>
          {/* Shadow layer */}
          <Text
            style={[
              styles.amountText,
              styles.amountShadow,
              { fontSize: amountFontSize },
            ]}
            numberOfLines={1}
            adjustsFontSizeToFit
          >
            {formattedAmount}
          </Text>
          {/* Main layer */}
          <Text
            style={[styles.amountText, { fontSize: amountFontSize }]}
            numberOfLines={1}
            adjustsFontSizeToFit
          >
            {formattedAmount}
          </Text>
        </View>
      </View>

      {/* Keypad Area - Bottom Half */}
      <View style={styles.keypadContainer}>
        {/* Note Button */}
        <View style={styles.noteButtonContainer}>
          <TouchableOpacity
            style={[
              styles.noteButton,
              noteText.trim() ? styles.noteButtonActive : null,
            ]}
            onPress={toggleNoteField}
            activeOpacity={0.7}
          >
            <Ionicons
              name="document-text-outline"
              size={12}
              color={noteText.trim() ? Colors.accent : 'rgba(255, 255, 255, 0.55)'}
            />
            <Ionicons
              name="chevron-forward"
              size={10}
              color={noteText.trim() ? Colors.accent : 'rgba(255, 255, 255, 0.55)'}
            />
          </TouchableOpacity>

          {/* Note Input Overlay */}
          {showNoteField && (
            <View style={styles.noteInputContainer}>
              <Ionicons
                name="document-text-outline"
                size={16}
                color={'rgba(255, 255, 255, 0.8)'}
              />
              <TextInput
                ref={noteInputRef}
                style={styles.noteInput}
                value={noteText}
                onChangeText={setNoteText}
                placeholder="Add note"
                placeholderTextColor={'rgba(255, 255, 255, 0.5)'}
                autoCapitalize="sentences"
                autoCorrect
                returnKeyType="done"
                onSubmitEditing={dismissNoteField}
              />
              {noteText.length > 0 && (
                <TouchableOpacity
                  onPress={() => { setNoteText(''); Haptics.selectionAsync(); }}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                >
                  <Ionicons name="close-circle" size={18} color={'rgba(255, 255, 255, 0.7)'} />
                </TouchableOpacity>
              )}
            </View>
          )}
        </View>

        {/* Trip Emoji Row (only if open trips exist and expense mode) */}
        {openTrips.length > 0 && mode !== 'income' && (
          <View style={[styles.emojiRowWrapper, { marginBottom: 4 }]}>
            {renderEmojiRow(
              openTrips.map(t => t.emoji),
              selectedTripId ? openTrips.find(t => t.id === selectedTripId)?.emoji ?? null : null,
              (emoji) => {
                const trip = openTrips.find(t => t.emoji === emoji);
                setSelectedTripId(prev => prev === trip?.id ? null : trip?.id ?? null);
              }
            )}
          </View>
        )}

        {/* Category Emoji Row */}
        <View style={[
          styles.emojiRowWrapper,
          { opacity: mode === 'income' ? 0.4 : 1 },
          (openTrips.length === 0 || mode === 'income') && { marginTop: 5 },
          { marginBottom: 4 }
        ]}>
          {renderEmojiRow(
            categories,
            selectedEmoji,
            setSelectedEmoji
          )}
        </View>

        {/* Keypad Grid - matching spacing: 12 and columns: 4 */}
        <View style={styles.keypadGrid}>
          {/* Row 1 */}
          {renderKey({ type: 'clear' }, 'C')}
          {renderKey({ type: 'percent' }, '%')}
          {renderKey({ type: 'backspace' }, '⌫', true)}
          {renderKey({ type: 'op', symbol: '÷' }, '÷')}

          {/* Row 2 */}
          {renderKey({ type: 'digit', value: 7 }, '7')}
          {renderKey({ type: 'digit', value: 8 }, '8')}
          {renderKey({ type: 'digit', value: 9 }, '9')}
          {renderKey({ type: 'op', symbol: '×' }, '×')}

          {/* Row 3 */}
          {renderKey({ type: 'digit', value: 4 }, '4')}
          {renderKey({ type: 'digit', value: 5 }, '5')}
          {renderKey({ type: 'digit', value: 6 }, '6')}
          {renderKey({ type: 'op', symbol: '−' }, '−')}

          {/* Row 4 */}
          {renderKey({ type: 'digit', value: 1 }, '1')}
          {renderKey({ type: 'digit', value: 2 }, '2')}
          {renderKey({ type: 'digit', value: 3 }, '3')}
          {renderKey({ type: 'op', symbol: '+' }, '+')}

          {/* Row 5 */}
          {renderKey({ type: 'digit', value: 0 }, '0')}
          {renderKey({ type: 'dot' }, '.')}
          {renderKey({ type: 'plusMinus' }, '+/−')}
          {renderKey({ type: 'op', symbol: '=' }, '=')}
        </View>
      </View>

      <Modal
        visible={showSplitEditor}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowSplitEditor(false)}
      >
        {pendingTransaction && (
          <SplitEditorScreen
            participants={openTrips.find(t => t.id === selectedTripId)?.participants ?? []}
            totalAmountCents={Math.abs(pendingTransaction.amountCents)}
            currencyCode={currencyCode}
            payerId={selectedPayerId || undefined}
            onPayerChange={(id) => setSelectedPayerId(id)}
            onSave={handleSplitSave}
            onCancel={() => setShowSplitEditor(false)}
          />
        )}
      </Modal>
    </View>
  );
}

// ============================================================================
// Styles
// ============================================================================

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },

  // Top Controls
  topControls: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 16,
    zIndex: 100,
  },
  topControlsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 36,
  },
  modeToggle: {
    flexDirection: 'row',
    paddingHorizontal: 8,
    height: 36,
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
    borderRadius: 9999,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.15)',
    alignItems: 'center',
  },
  modeButton: {
    width: 28,
    height: 28,
    justifyContent: 'center',
    alignItems: 'center',
  },
  modeButtonText: {
    fontFamily: 'AvenirNextCondensed-DemiBold',
    fontSize: 16,
    color: 'rgba(255, 255, 255, 0.8)',
  },
  accountPill: {
    position: 'absolute',
    left: '50%',
    transform: [{ translateX: -60 }], // Approximation, assumes width ~120
    paddingHorizontal: 12,
    height: 36,
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
    borderRadius: 9999,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.15)',
    justifyContent: 'center',
    alignItems: 'center',
    minWidth: 120,
  },
  accountPillText: {
    fontFamily: 'AvenirNextCondensed-DemiBold',
    fontSize: 16,
    color: 'rgba(255, 255, 255, 1.0)', // or 0.8 if disabled
  },
  saveButton: {
    position: 'absolute',
    right: 0,
    paddingHorizontal: 12,
    height: 36,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 9999,
    justifyContent: 'center',
    alignItems: 'center',
  },

  // Account Dropdown
  accountDropdown: {
    position: 'absolute',
    top: 36 + 2 + 16, // height + padding + top offset
    left: '50%',
    transform: [{ translateX: -80 }],
    width: 160,
    backgroundColor: 'rgba(0, 0, 0, 0.9)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
    overflow: 'hidden',
    zIndex: 101,
  },
  accountDropdownItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  accountDropdownEmoji: {
    fontSize: 18,
    marginRight: 8,
  },
  accountDropdownName: {
    fontFamily: 'AvenirNextCondensed-DemiBold',
    fontSize: 16,
    color: '#FFFFFF',
  },
  accountSelectedIndicator: {
    width: 16,
    height: 2,
    backgroundColor: '#FF9500',
    borderRadius: 1,
  },
  accountDropdownDivider: {
    height: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
  },

  // Toast
  toast: {
    alignSelf: 'center',
    marginTop: 8,
    paddingHorizontal: 14,
    paddingVertical: 8,
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    borderRadius: 9999,
  },
  toastText: {
    fontFamily: 'AvenirNextCondensed-DemiBold',
    fontSize: 18,
    color: '#FFFFFF',
  },

  // Amount Display
  amountContainer: {
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: 110, // Increased to fix vertical centering (was 75)
    paddingHorizontal: 20,
    // Note: frame height set via style prop
  },
  equationRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    marginBottom: 8,
  },
  equationText: {
    fontFamily: 'AvenirNextCondensed-DemiBold',
    fontSize: 18,
  },
  equationNumber: {
    color: 'rgba(255, 255, 255, 0.7)',
  },
  equationOperator: {
    color: '#FF9500', // Orange
  },
  amountWrapper: {
    position: 'relative',
    width: '100%',
    alignItems: 'center',
  },
  amountText: {
    fontFamily: 'AvenirNextCondensed-Heavy',
    color: '#FFFFFF',
    textAlign: 'center',
  },
  amountShadow: {
    position: 'absolute',
    color: 'rgba(255, 255, 255, 0.16)',
    transform: [{ translateY: 8 }],
    zIndex: -1,
  },

  // Keypad
  keypadContainer: {
    flex: 1,
    paddingHorizontal: 20,
    paddingBottom: 28,
  },

  // Note Button
  noteButtonContainer: {
    width: '100%',
    alignItems: 'center',
    marginBottom: 12, // Matched Swift spacing 12
    position: 'relative',
    zIndex: 2, // Above keypad
  },
  noteButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    height: 24,
    backgroundColor: 'rgba(255, 255, 255, 0.10)',
    borderRadius: 9999,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.15)',
  },
  noteButtonActive: {
    borderColor: '#FF9500', // Orange
  },
  noteInputContainer: {
    position: 'absolute',
    top: -8, // Center vertically over 24px button (40 - 24) / 2
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    height: 40,
    backgroundColor: 'rgba(0, 0, 0, 0.9)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.6,
    shadowRadius: 12,
    elevation: 10,
    zIndex: 200,
  },
  noteInput: {
    flex: 1,
    fontFamily: 'System', // Standard font for input
    fontSize: 16,
    color: '#FFFFFF',
    paddingVertical: 0,
  },

  // Emoji Row
  emojiRowWrapper: {
    alignItems: 'center',
  },
  emojiRowContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  emojiScrollContent: {
    paddingHorizontal: 2,
  },
  emojiButton: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  emojiText: {
    textAlign: 'center',
    // fontSize set in render
  },
  emojiAddText: {
    textAlign: 'center',
    color: '#FFFFFF',
    fontWeight: '600',
  },
  emojiIndicator: {
    backgroundColor: '#FF9500',
    borderRadius: 1,
    marginTop: 4,
  },

  // Keypad Grid
  keypadGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 12,
    gap: 12, // Horizontal spacing
    justifyContent: 'space-between',
  },
  keyButton: {
    // 4 columns with 12px gap
    // (100% - 3 * 12) / 4 = 25% - 9px
    width: '21%', // Fallback for no gap support
    flexGrow: 1,
    flexBasis: '21%',
    justifyContent: 'center',
    alignItems: 'center',
    // Vertical spacing
    marginBottom: 16,
  },
  keyText: {
    // fontSize 24 -> 28 for better readability
    fontSize: 28,
    color: '#FFFFFF',
  },
  keyTextOperator: {
    // DemiBold
  },
});
