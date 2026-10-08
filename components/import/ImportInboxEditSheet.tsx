import { useCustomPopup } from '@/components/ui/CustomPopupProvider';
import { Text, TextInput } from '@/components/ui/LockedText';
import { Ionicons } from '@expo/vector-icons';
import DateTimePicker from '@/components/ui/DateTimePicker';
import * as Haptics from 'expo-haptics';
import React, { useEffect, useMemo, useState } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  View,
} from 'react-native';
import { BorderRadius, Colors, Fonts, Spacing } from '../../constants/theme';
import { formatCents, parseToCents } from '../../lib/logic/currencyUtils';
import { Account, Category, ImportInboxItem, TransactionType } from '../../lib/logic/types';

interface Props {
  item: ImportInboxItem | null;
  accounts: Account[];
  categories: Category[];
  onClose: () => void;
  onConfirm: (id: string, overrides: {
    amountCents: number;
    dateMs: number;
    note: string | null;
    accountId: string | null;
    categoryId: string | null;
    type: TransactionType;
  }) => Promise<void>;
  onIgnore: (id: string) => Promise<void>;
}

function OptionRow({
  selected,
  label,
  sublabel,
  onPress,
}: {
  selected: boolean;
  label: string;
  sublabel?: string;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity style={styles.optionRow} onPress={onPress} activeOpacity={0.75}>
      <View>
        <Text style={styles.optionLabel}>{label}</Text>
        {sublabel ? <Text style={styles.optionSublabel}>{sublabel}</Text> : null}
      </View>
      <View style={{ flex: 1 }} />
      {selected ? <Ionicons name="checkmark" size={18} color={Colors.accent} /> : null}
    </TouchableOpacity>
  );
}

export function ImportInboxEditSheet({ item, accounts, categories, onClose, onConfirm, onIgnore }: Props) {
  const { showPopup } = useCustomPopup();
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(new Date());
  const [note, setNote] = useState('');
  const [accountId, setAccountId] = useState<string | null>(null);
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [type, setType] = useState<TransactionType>('expense');
  const [saving, setSaving] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [picker, setPicker] = useState<'account' | 'category' | null>(null);

  useEffect(() => {
    if (!item) return;
    setAmount((item.amountCents / 100).toFixed(2));
    setDate(new Date(item.dateMs));
    setNote(item.note ?? '');
    setAccountId(item.accountId ?? accounts[0]?.id ?? null);
    setCategoryId(item.categoryId ?? null);
    setType(item.type);
    setSaving(false);
    setShowDatePicker(false);
    setPicker(null);
  }, [item?.id, accounts]);

  const selectedAccount = useMemo(
    () => accounts.find((account) => account.id === accountId) ?? null,
    [accounts, accountId]
  );
  const selectedCategory = useMemo(
    () => categories.find((category) => category.id === categoryId) ?? null,
    [categories, categoryId]
  );

  if (!item) return null;

  const parsedAmount = parseToCents(amount);
  const amountValid = parsedAmount !== null && parsedAmount > 0;

  const handleConfirm = async () => {
    if (saving) return;
    if (!amountValid || parsedAmount === null) {
      showPopup({
        title: 'Check amount',
        message: 'Enter an amount greater than zero.',
        buttons: [{ text: 'OK', style: 'default' }],
      });
      return;
    }
    if (!accountId) {
      showPopup({
        title: 'Choose account',
        message: 'API imports need an account before they affect your balance.',
        buttons: [{ text: 'OK', style: 'default' }],
      });
      return;
    }

    setSaving(true);
    try {
      await onConfirm(item.id, {
        amountCents: parsedAmount,
        dateMs: date.getTime(),
        note: note.trim() || null,
        accountId,
        categoryId,
        type,
      });
      onClose();
    } finally {
      setSaving(false);
    }
  };

  const handleIgnore = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    showPopup({
      title: 'Ignore import?',
      message: 'This hides the item from the inbox. It will not become a transaction.',
      buttons: [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Ignore',
          style: 'destructive',
          onPress: async () => {
            setSaving(true);
            try {
              await onIgnore(item.id);
              onClose();
            } finally {
              setSaving(false);
            }
          },
        },
      ],
    });
  };

  return (
    <Modal visible animationType="slide" presentationStyle="fullScreen" onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.header}>
          <TouchableOpacity onPress={onClose} style={styles.headerButton} activeOpacity={0.75}>
            <Text style={styles.headerButtonText}>Cancel</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Review Import</Text>
          <TouchableOpacity onPress={handleConfirm} disabled={saving} style={styles.headerButton} activeOpacity={0.75}>
            <Text style={[styles.headerButtonText, styles.saveText]}>{saving ? 'Saving' : 'Confirm'}</Text>
          </TouchableOpacity>
        </View>

        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <Text style={styles.merchant} numberOfLines={2}>
            {item.merchantName || item.note || 'Imported transaction'}
          </Text>
          <Text style={styles.previewAmount}>
            {type === 'income' ? '+' : ''}
            {formatCents(amountValid && parsedAmount !== null ? parsedAmount : item.amountCents, item.currencyCode)}
          </Text>

          {item.possibleDuplicate ? (
            <View style={styles.warningBox}>
              <Ionicons name="copy-outline" size={16} color="#FFCC00" />
              <Text style={styles.warningText}>Possible duplicate. Confirm only if this is a separate transaction.</Text>
            </View>
          ) : null}

          <View style={styles.segment}>
            {(['expense', 'income'] as TransactionType[]).map((nextType) => (
              <TouchableOpacity
                key={nextType}
                style={[styles.segmentButton, type === nextType && styles.segmentButtonActive]}
                onPress={() => {
                  Haptics.selectionAsync();
                  setType(nextType);
                }}
                activeOpacity={0.75}
              >
                <Text style={[styles.segmentText, type === nextType && styles.segmentTextActive]}>
                  {nextType === 'expense' ? 'Expense' : 'Income'}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <View style={styles.field}>
            <Text style={styles.label}>Amount</Text>
            <TextInput
              value={amount}
              onChangeText={setAmount}
              keyboardType="decimal-pad"
              style={styles.input}
              placeholder="0.00"
              placeholderTextColor={Colors.textMuted}
            />
          </View>

          <TouchableOpacity style={styles.row} onPress={() => setShowDatePicker((v) => !v)} activeOpacity={0.75}>
            <Text style={styles.rowLabel}>Date</Text>
            <Text style={styles.rowValue}>{date.toLocaleString()}</Text>
            <Ionicons name="chevron-forward" size={16} color={Colors.textMuted} />
          </TouchableOpacity>
          {showDatePicker ? (
            <DateTimePicker
              value={date}
              mode="datetime"
              display={Platform.OS === 'ios' ? 'spinner' : 'default'}
              onChange={(_, selected) => {
                if (selected) setDate(selected);
                if (Platform.OS !== 'ios') setShowDatePicker(false);
              }}
            />
          ) : null}

          <TouchableOpacity style={styles.row} onPress={() => setPicker(picker === 'account' ? null : 'account')} activeOpacity={0.75}>
            <Text style={styles.rowLabel}>Account</Text>
            <Text style={styles.rowValue}>
              {selectedAccount ? `${selectedAccount.emoji} ${selectedAccount.name}` : 'Choose'}
            </Text>
            <Ionicons name="chevron-forward" size={16} color={Colors.textMuted} />
          </TouchableOpacity>
          {picker === 'account' ? (
            <View style={styles.options}>
              {accounts.map((account) => (
                <OptionRow
                  key={account.id}
                  selected={account.id === accountId}
                  label={`${account.emoji} ${account.name}`}
                  sublabel={account.kind}
                  onPress={() => {
                    Haptics.selectionAsync();
                    setAccountId(account.id);
                    setPicker(null);
                  }}
                />
              ))}
            </View>
          ) : null}

          <TouchableOpacity style={styles.row} onPress={() => setPicker(picker === 'category' ? null : 'category')} activeOpacity={0.75}>
            <Text style={styles.rowLabel}>Category</Text>
            <Text style={styles.rowValue}>
              {selectedCategory ? `${selectedCategory.emoji} ${selectedCategory.name}` : 'Uncategorized'}
            </Text>
            <Ionicons name="chevron-forward" size={16} color={Colors.textMuted} />
          </TouchableOpacity>
          {picker === 'category' ? (
            <View style={styles.options}>
              <OptionRow
                selected={categoryId === null}
                label="Uncategorized"
                onPress={() => {
                  Haptics.selectionAsync();
                  setCategoryId(null);
                  setPicker(null);
                }}
              />
              {categories.filter((c) => !c.isSystem).map((category) => (
                <OptionRow
                  key={category.id}
                  selected={category.id === categoryId}
                  label={`${category.emoji} ${category.name}`}
                  onPress={() => {
                    Haptics.selectionAsync();
                    setCategoryId(category.id);
                    setPicker(null);
                  }}
                />
              ))}
            </View>
          ) : null}

          <View style={styles.field}>
            <Text style={styles.label}>Note</Text>
            <TextInput
              value={note}
              onChangeText={setNote}
              style={[styles.input, styles.noteInput]}
              placeholder="Optional"
              placeholderTextColor={Colors.textMuted}
              multiline
            />
          </View>

          <TouchableOpacity style={styles.ignoreButton} onPress={handleIgnore} activeOpacity={0.75}>
            <Text style={styles.ignoreText}>Ignore Import</Text>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  header: {
    paddingTop: 56,
    paddingHorizontal: 18,
    paddingBottom: 14,
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.divider,
  },
  headerButton: {
    minWidth: 72,
  },
  headerButtonText: {
    fontFamily: Fonts.demiBold,
    color: Colors.textSecondary,
    fontSize: 16,
  },
  headerTitle: {
    flex: 1,
    textAlign: 'center',
    fontFamily: Fonts.demiBold,
    color: Colors.textPrimary,
    fontSize: 18,
  },
  saveText: {
    color: Colors.accent,
    textAlign: 'right',
  },
  content: {
    padding: 24,
    paddingBottom: 48,
  },
  merchant: {
    fontFamily: Fonts.demiBold,
    color: Colors.textPrimary,
    fontSize: 24,
  },
  previewAmount: {
    marginTop: 8,
    marginBottom: 18,
    fontFamily: Fonts.heavy,
    color: Colors.textPrimary,
    fontSize: 42,
  },
  warningBox: {
    flexDirection: 'row',
    gap: Spacing.sm,
    alignItems: 'center',
    padding: Spacing.md,
    borderRadius: BorderRadius.sm,
    backgroundColor: 'rgba(255,204,0,0.12)',
    marginBottom: Spacing.md,
  },
  warningText: {
    flex: 1,
    fontFamily: Fonts.medium,
    color: '#FFCC00',
    fontSize: 13,
  },
  segment: {
    flexDirection: 'row',
    padding: 3,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.pillBackground,
    marginBottom: Spacing.lg,
  },
  segmentButton: {
    flex: 1,
    paddingVertical: 9,
    borderRadius: BorderRadius.full,
    alignItems: 'center',
  },
  segmentButtonActive: {
    backgroundColor: Colors.accent,
  },
  segmentText: {
    fontFamily: Fonts.demiBold,
    color: Colors.textSecondary,
    fontSize: 14,
  },
  segmentTextActive: {
    color: '#000',
  },
  field: {
    marginBottom: Spacing.lg,
  },
  label: {
    fontFamily: Fonts.demiBold,
    color: Colors.textTertiary,
    fontSize: 13,
    marginBottom: 8,
  },
  input: {
    minHeight: 46,
    borderRadius: BorderRadius.sm,
    backgroundColor: Colors.cardBackground,
    borderWidth: 1,
    borderColor: Colors.pillBorder,
    paddingHorizontal: 14,
    color: Colors.textPrimary,
    fontFamily: Fonts.medium,
    fontSize: 17,
  },
  noteInput: {
    minHeight: 84,
    paddingTop: 12,
    textAlignVertical: 'top',
  },
  row: {
    minHeight: 54,
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.divider,
    gap: Spacing.md,
  },
  rowLabel: {
    width: 82,
    fontFamily: Fonts.demiBold,
    color: Colors.textTertiary,
    fontSize: 14,
  },
  rowValue: {
    flex: 1,
    textAlign: 'right',
    fontFamily: Fonts.medium,
    color: Colors.textPrimary,
    fontSize: 16,
  },
  options: {
    borderRadius: BorderRadius.sm,
    backgroundColor: Colors.cardBackground,
    marginTop: Spacing.sm,
    marginBottom: Spacing.md,
    overflow: 'hidden',
  },
  optionRow: {
    minHeight: 50,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.divider,
  },
  optionLabel: {
    fontFamily: Fonts.medium,
    color: Colors.textPrimary,
    fontSize: 16,
  },
  optionSublabel: {
    marginTop: 2,
    fontFamily: Fonts.medium,
    color: Colors.textTertiary,
    fontSize: 12,
  },
  ignoreButton: {
    alignSelf: 'center',
    marginTop: 22,
    paddingHorizontal: 18,
    paddingVertical: 12,
  },
  ignoreText: {
    fontFamily: Fonts.demiBold,
    color: Colors.accentRed,
    fontSize: 16,
  },
});
