import { ImportInboxCard } from '@/components/import/ImportInboxCard';
import { ImportInboxEditSheet } from '@/components/import/ImportInboxEditSheet';
import { useCustomPopup } from '@/components/ui/CustomPopupProvider';
import { Text } from '@/components/ui/LockedText';
import { useToast } from '@/components/ui/ToastProvider';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, StyleSheet, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ImportInboxRepository, AccountRepository, CategoryRepository, UserSettingsRepository } from '../lib/db/repositories';
import { waitForDatabase } from '../lib/db/database';
import { Events, GlobalEvents } from '../lib/events';
import { Account, Category, ImportInboxItem, TransactionType } from '../lib/logic/types';
import { BorderRadius, Colors, Fonts, Spacing } from '../constants/theme';

export default function ImportInboxScreen() {
  const router = useRouter();
  const toast = useToast();
  const { showPopup } = useCustomPopup();
  const mounted = useRef(true);
  const [items, setItems] = useState<ImportInboxItem[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [defaultAccountId, setDefaultAccountId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [editingItem, setEditingItem] = useState<ImportInboxItem | null>(null);
  const [reviewSelections, setReviewSelections] = useState<Record<string, { accountId: string | null; categoryId: string | null }>>({});
  const autoCloseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const loadData = useCallback(async () => {
    await waitForDatabase();
    const [pending, accts, cats, settings] = await Promise.all([
      ImportInboxRepository.getPending(),
      AccountRepository.getAll(),
      CategoryRepository.getAll(),
      UserSettingsRepository.get(),
    ]);
    if (!mounted.current) return;
    setItems(pending);
    setAccounts(accts);
    setCategories(cats);
    setDefaultAccountId(settings.defaultAccountId ?? null);
    setLoading(false);
  }, []);

  useEffect(() => {
    mounted.current = true;
    loadData();
    const unsubInbox = GlobalEvents.on(Events.importInboxChanged, loadData);
    const unsubAccounts = GlobalEvents.on(Events.accountsChanged, loadData);
    const unsubCategories = GlobalEvents.on(Events.categoriesChanged, loadData);
    return () => {
      mounted.current = false;
      if (autoCloseTimerRef.current) {
        clearTimeout(autoCloseTimerRef.current);
        autoCloseTimerRef.current = null;
      }
      unsubInbox();
      unsubAccounts();
      unsubCategories();
    };
  }, [loadData]);

  const closeIfCleared = useCallback(async () => {
    if (autoCloseTimerRef.current) {
      clearTimeout(autoCloseTimerRef.current);
      autoCloseTimerRef.current = null;
    }

    const pendingCount = await ImportInboxRepository.countPending();
    if (!mounted.current || pendingCount > 0) return;

    autoCloseTimerRef.current = setTimeout(() => {
      autoCloseTimerRef.current = null;
      if (mounted.current) {
        router.back();
      }
    }, 320);
  }, [router]);

  const accountMap = useMemo(() => {
    const map = new Map<string, Account>();
    accounts.forEach((account) => map.set(account.id, account));
    return map;
  }, [accounts]);

  const categoryMap = useMemo(() => {
    const map = new Map<string, Category>();
    categories.forEach((category) => map.set(category.id, category));
    return map;
  }, [categories]);

  const reviewCategories = useMemo(
    () => categories.filter((category) => !category.isSystem),
    [categories]
  );

  const openEdit = useCallback((id: string) => {
    const item = items.find((candidate) => candidate.id === id);
    if (item) setEditingItem(item);
  }, [items]);

  const hasValidApiAccount = useCallback((item: ImportInboxItem) => {
    return Boolean(item.accountId && accountMap.has(item.accountId));
  }, [accountMap]);

  const hasValidApiCategory = useCallback((item: ImportInboxItem) => {
    if (!item.categoryId) return false;
    const apiCategory = categoryMap.get(item.categoryId);
    return Boolean(apiCategory && !apiCategory.isSystem);
  }, [categoryMap]);

  const getDefaultReviewSelection = useCallback((item: ImportInboxItem) => {
    const apiAccountId = hasValidApiAccount(item) ? item.accountId! : null;
    const apiCategoryId = hasValidApiCategory(item) ? item.categoryId! : null;
    const fallbackAccountId =
      apiAccountId ??
      (defaultAccountId && accountMap.has(defaultAccountId) ? defaultAccountId : null) ??
      accounts[0]?.id ??
      null;
    const fallbackCategoryId = apiCategoryId ?? reviewCategories[0]?.id ?? null;

    return {
      accountId: fallbackAccountId,
      categoryId: fallbackCategoryId,
    };
  }, [accountMap, accounts, defaultAccountId, hasValidApiAccount, hasValidApiCategory, reviewCategories]);

  const handleReviewAccountChange = useCallback((id: string, accountId: string) => {
    setReviewSelections((current) => ({
      ...current,
      [id]: {
        accountId,
        categoryId: current[id]?.categoryId ?? null,
      },
    }));
  }, []);

  const handleReviewCategoryChange = useCallback((id: string, categoryId: string | null) => {
    setReviewSelections((current) => ({
      ...current,
      [id]: {
        accountId: current[id]?.accountId ?? null,
        categoryId,
      },
    }));
  }, []);

  const getSelectionForConfirm = useCallback((item: ImportInboxItem) => {
    return reviewSelections[item.id] ?? getDefaultReviewSelection(item);
  }, [getDefaultReviewSelection, reviewSelections]);

  const findConfirmAccountId = useCallback(async (item: ImportInboxItem) => {
    if (item.accountId && accountMap.has(item.accountId)) {
      return item.accountId;
    }

    const settings = await UserSettingsRepository.get();
    if (settings.defaultAccountId && accountMap.has(settings.defaultAccountId)) {
      return settings.defaultAccountId;
    }

    return accounts[0]?.id ?? null;
  }, [accountMap, accounts]);

  const handleConfirm = useCallback(async (id: string) => {
    const item = items.find((candidate) => candidate.id === id);
    if (!item) return false;

    const needsInlineReview = !hasValidApiAccount(item) || !hasValidApiCategory(item);
    const selection = needsInlineReview ? getSelectionForConfirm(item) : {
      accountId: item.accountId ?? null,
      categoryId: item.categoryId ?? null,
    };
    const accountId = selection.accountId ?? await findConfirmAccountId(item);
    if (!accountId) {
      showPopup({
        title: 'Account Required',
        message: 'Create an account before accepting API imports.',
        buttons: [{ text: 'OK', style: 'default' }],
      });
      return false;
    }

    try {
      await ImportInboxRepository.confirm(id, {
        accountId,
        categoryId: selection.categoryId,
      });
      toast.show('Added to transactions', { kind: 'info' });
      setReviewSelections((current) => {
        const { [id]: _removed, ...rest } = current;
        return rest;
      });
      await closeIfCleared();
      return true;
    } catch (error) {
      console.warn('[ImportInbox] confirm failed', error);
      showPopup({
        title: 'Could not accept',
        message: error instanceof Error ? error.message : 'Please try again.',
        buttons: [{ text: 'OK', style: 'default' }],
      });
      return false;
    }
  }, [closeIfCleared, findConfirmAccountId, getSelectionForConfirm, hasValidApiAccount, hasValidApiCategory, items, showPopup, toast]);

  const handleSheetConfirm = useCallback(async (
    id: string,
    overrides: {
      amountCents: number;
      dateMs: number;
      note: string | null;
      accountId: string | null;
      categoryId: string | null;
      type: TransactionType;
    }
  ) => {
    try {
      await ImportInboxRepository.confirm(id, overrides);
      toast.show('Added to transactions', { kind: 'info' });
      await closeIfCleared();
    } catch (error: any) {
      console.warn('[ImportInbox] edit confirm failed', error);
      showPopup({
        title: 'Could not confirm',
        message: error?.message ?? 'Please try again.',
        buttons: [{ text: 'OK', style: 'default' }],
      });
      throw error;
    }
  }, [closeIfCleared, showPopup, toast]);

  const handleIgnore = useCallback(async (id: string) => {
    await ImportInboxRepository.ignore(id);
    toast.show('Ignored', { kind: 'info' });
    await closeIfCleared();
  }, [closeIfCleared, toast]);

  const renderItem = useCallback(({ item }: { item: ImportInboxItem }) => {
    const account = item.accountId ? accountMap.get(item.accountId) : null;
    const category = item.categoryId ? categoryMap.get(item.categoryId) : null;
    const needsReview = !hasValidApiAccount(item) || !hasValidApiCategory(item);
    const reviewSelection = reviewSelections[item.id] ?? getDefaultReviewSelection(item);
    const reviewIssues = [
      !item.accountId ? 'No account from API' : account ? null : 'API account unavailable',
      !item.categoryId ? 'No category from API' : category && !category.isSystem ? null : 'API category unavailable',
    ].filter(Boolean) as string[];

    return (
      <ImportInboxCard
        item={item}
        account={account}
        category={category && !category.isSystem ? category : null}
        accounts={accounts}
        categories={reviewCategories}
        expanded={needsReview}
        reviewIssues={reviewIssues}
        reviewAccountId={reviewSelection.accountId}
        reviewCategoryId={reviewSelection.categoryId}
        onConfirm={handleConfirm}
        onEdit={openEdit}
        onReviewAccountChange={handleReviewAccountChange}
        onReviewCategoryChange={handleReviewCategoryChange}
      />
    );
  }, [
    accountMap,
    accounts,
    categoryMap,
    getDefaultReviewSelection,
    handleConfirm,
    handleReviewAccountChange,
    handleReviewCategoryChange,
    hasValidApiAccount,
    hasValidApiCategory,
    openEdit,
    reviewCategories,
    reviewSelections,
  ]);

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.iconButton}
          onPress={() => {
            Haptics.selectionAsync();
            router.back();
          }}
          activeOpacity={0.75}
        >
          <Ionicons name="close" size={22} color={Colors.textPrimary} />
        </TouchableOpacity>
        <View style={styles.headerTextWrap}>
          <Text style={styles.title}>Import Inbox</Text>
          <Text style={styles.subtitle}>
            {items.length === 0 ? 'No pending API imports' : `${items.length} pending`}
          </Text>
        </View>
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={Colors.accent} />
        </View>
      ) : items.length === 0 ? (
        <View style={styles.center}>
          <View style={styles.emptyIcon}>
            <Ionicons name="checkmark-circle-outline" size={52} color={Colors.textMuted} />
          </View>
          <Text style={styles.emptyTitle}>All clear</Text>
          <Text style={styles.emptySubtitle}>New API imports will wait here for review.</Text>
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
        />
      )}

      <ImportInboxEditSheet
        item={editingItem}
        accounts={accounts}
        categories={categories}
        onClose={() => setEditingItem(null)}
        onConfirm={handleSheetConfirm}
        onIgnore={handleIgnore}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 18,
    paddingBottom: 16,
    gap: Spacing.md,
  },
  iconButton: {
    width: 38,
    height: 38,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.pillBackground,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTextWrap: {
    flex: 1,
  },
  title: {
    fontFamily: Fonts.heavy,
    color: Colors.textPrimary,
    fontSize: 34,
  },
  subtitle: {
    fontFamily: Fonts.medium,
    color: Colors.textTertiary,
    fontSize: 14,
    marginTop: 2,
  },
  list: {
    paddingHorizontal: 18,
    paddingBottom: 40,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  emptyIcon: {
    width: 76,
    height: 76,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.cardBackground,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.lg,
  },
  emptyTitle: {
    fontFamily: Fonts.heavy,
    color: Colors.textPrimary,
    fontSize: 28,
  },
  emptySubtitle: {
    marginTop: 6,
    textAlign: 'center',
    fontFamily: Fonts.medium,
    color: Colors.textTertiary,
    fontSize: 15,
  },
});
