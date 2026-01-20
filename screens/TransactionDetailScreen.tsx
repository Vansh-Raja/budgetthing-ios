/**
 * Transaction Detail Screen
 * 
 * A rich detailed view for transactions, supporting View and Edit modes.
 * Matches Swift's TransactionDetailView design.
 */

import React, { useState, useMemo, useEffect, useRef } from 'react';
import {
    View,
    StyleSheet,
    TouchableOpacity,
    ScrollView,
    Alert,
    LayoutAnimation,
    Platform,
    Modal,
    ActivityIndicator,
} from 'react-native';
import { Text, TextInput } from '@/components/ui/LockedText';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useAuth } from '@clerk/clerk-expo';

import { Colors } from '../constants/theme';
import { SplitType, Transaction, Trip, TripExpense } from '../lib/logic/types';
import { formatCents, getCurrencySymbol } from '../lib/logic/currencyUtils';
import { Actions } from '../lib/logic/actions';
import { withTransaction } from '../lib/db/database';
import { TransactionRepository, TripExpenseRepository } from '../lib/db/repositories';
import { TripSplitCalculator } from '../lib/logic/tripSplitCalculator';
import { SharedTripRepository } from '../lib/db/sharedTripRepositories';
import { SharedTripExpenseRepository } from '../lib/db/sharedTripWriteRepositories';
import { reconcileSharedTripDerivedTransactionsForExpense } from '../lib/sync/sharedTripReconcile';
import { useSyncStatus } from '../lib/sync/SyncProvider';
import { useCategories, useAccounts } from '../lib/hooks/useData';
import { useTrips } from '../lib/hooks/useTrips';
import { SplitEditorScreen } from './SplitEditorScreen';

interface TransactionDetailScreenProps {
    transactionId?: string;
    sharedTripExpense?: { tripId: string; expenseId: string };
    initialEditMode?: boolean;
    onDismiss: () => void;
    onDelete?: () => void; // Callback after delete
    onUpdate?: () => void; // Callback after update
    readOnly?: boolean;
    onEditInTrip?: (tripId: string, expenseId: string) => void;
}

export function TransactionDetailScreen({
    transactionId,
    sharedTripExpense,
    initialEditMode,
    onDismiss,
    onDelete,
    onUpdate,
    readOnly,
    onEditInTrip,
}: TransactionDetailScreenProps) {
    const insets = useSafeAreaInsets();
    const { userId } = useAuth();

    const isMountedRef = useRef(true);
    useEffect(() => {
        isMountedRef.current = true;
        return () => {
            isMountedRef.current = false;
        };
    }, []);
 
    // Data

    const { data: categories } = useCategories();
    const { data: accounts } = useAccounts();
    const { trips } = useTrips(); // We need trips to find related trip info
    const { syncNow } = useSyncStatus();

    const [transaction, setTransaction] = useState<Transaction | null>(null);
    const [tripExpense, setTripExpense] = useState<TripExpense | null>(null);
    const [relatedTrip, setRelatedTrip] = useState<Trip | null>(null);
    const [isSharedTripContext, setIsSharedTripContext] = useState(false);
    const [loading, setLoading] = useState(true);
 
    const [isBackgroundSyncing, setIsBackgroundSyncing] = useState(false);
    const [isEditing, setIsEditing] = useState(!!initialEditMode);


    // Edit State
    const [editAmountString, setEditAmountString] = useState("");
    const [editNote, setEditNote] = useState("");
    const [editDate, setEditDate] = useState(new Date());
    const [editCategoryId, setEditCategoryId] = useState<string | null>(null);
    const [editAccountId, setEditAccountId] = useState<string | null>(null);

    // Trip editing state (group trips)
    const [editPaidByParticipantId, setEditPaidByParticipantId] = useState<string | null>(null);
    const [editSplitType, setEditSplitType] = useState<SplitType>('equal');
    const [editSplitData, setEditSplitData] = useState<Record<string, number>>({});
    const [editComputedSplits, setEditComputedSplits] = useState<Record<string, number>>({});

    // Pickers
    const [showCategoryPicker, setShowCategoryPicker] = useState(false);
    const [showAccountPicker, setShowAccountPicker] = useState(false);
    const [showDatePicker, setShowDatePicker] = useState(false);
    const [showSplitEditor, setShowSplitEditor] = useState(false);
    const [showPayerPicker, setShowPayerPicker] = useState(false);

    const effectiveTransactionId = sharedTripExpense?.expenseId ?? transactionId;
    const isSharedExpense = !!sharedTripExpense;
 
    // Load Data
    useEffect(() => {
        loadData();
    }, [effectiveTransactionId, userId]);


    const loadData = async () => {
        let shouldShowLoading = transaction === null || transaction.id !== effectiveTransactionId;

        try {
            if (isMountedRef.current && shouldShowLoading) setLoading(true);

            if (!effectiveTransactionId) {
                Alert.alert("Error", "Missing transaction id");
                onDismiss();
                return;
            }

            // 1. Load transaction data (either from personal transactions or shared trip mirror)
            let tx: Transaction | null = null;
            let nextTripExpense: TripExpense | null = null;
            let nextRelatedTrip: Trip | null = null;
            let nextIsSharedTripContext = false;

            if (isSharedExpense) {
                if (!userId || !sharedTripExpense) {
                    Alert.alert("Error", "You must be signed in");
                    onDismiss();
                    return;
                }

                const hydrated = await SharedTripRepository.getHydratedTripForUser(userId, sharedTripExpense.tripId);
                const exp = hydrated?.expenses?.find(e => e.id === sharedTripExpense.expenseId) ?? null;

                if (!hydrated || !exp) {
                    Alert.alert("Error", "Expense not found");
                    onDismiss();
                    return;
                }

                tx = {
                    id: exp.id,
                    amountCents: exp.transaction?.amountCents ?? 0,
                    date: exp.transaction?.date ?? Date.now(),
                    note: exp.transaction?.note,
                    type: 'expense',
                    systemType: null,
                    createdAtMs: exp.transaction?.createdAtMs ?? exp.createdAtMs,
                    updatedAtMs: exp.transaction?.updatedAtMs ?? exp.updatedAtMs,
                    deletedAtMs: undefined,
                };

                nextTripExpense = exp;
                nextRelatedTrip = hydrated;
                nextIsSharedTripContext = true;
            } else {
                tx = await TransactionRepository.getById(effectiveTransactionId);
                if (!tx) {
                    Alert.alert("Error", "Transaction not found");
                    onDismiss();
                    return;
                }

                const personalTx = tx;
 
                const isSharedTripShareTx = personalTx.systemType === 'trip_share' && !!personalTx.sourceTripExpenseId;


                // 2) Local trip expense relation (non-shared-trip)
                if (!isSharedTripShareTx) {
                    if (personalTx.tripExpenseId) {
                        for (const t of trips) {
                            const exp = t.expenses?.find(e => e.id === personalTx.tripExpenseId || e.transactionId === personalTx.id);
                            if (exp) {
                                nextTripExpense = exp;
                                nextRelatedTrip = t;
                                break;
                            }
                        }
                    } else {
                        // Reverse lookup
                        for (const t of trips) {
                            const exp = t.expenses?.find(e => e.transactionId === personalTx.id);
                            if (exp) {
                                nextTripExpense = exp;
                                nextRelatedTrip = t;
                                break;
                            }
                        }
                    }
                }

                // 3) Shared trip "trip_share" transactions (derived personal view).
                if (isSharedTripShareTx && personalTx.sourceTripExpenseId && userId) {
                    const sharedTripId = await SharedTripRepository.getTripIdForExpense(personalTx.sourceTripExpenseId);
                    if (sharedTripId) {
                        const sharedTrip = await SharedTripRepository.getHydratedTripForUser(userId, sharedTripId);
                        const sharedExpense = sharedTrip?.expenses?.find(e => e.id === personalTx.sourceTripExpenseId) ?? null;

                        if (sharedTrip && sharedExpense) {
                            nextTripExpense = sharedExpense;
                            nextRelatedTrip = sharedTrip;
                            nextIsSharedTripContext = true;
                        }
                    }
                }
            }

            if (!isMountedRef.current || !tx) return;

            setTransaction(tx);

            // Setup Edit State
            setEditAmountString((Math.abs(tx.amountCents) / 100).toString());
            setEditNote(tx.note || "");
            setEditDate(new Date(tx.date));

            if (isSharedExpense) {
                setEditCategoryId(null);
                setEditAccountId(null);
            } else {
                setEditCategoryId(tx.categoryId || null);
                setEditAccountId(tx.accountId || null);
            }

            setTripExpense(nextTripExpense);
            setRelatedTrip(nextRelatedTrip);
            setIsSharedTripContext(nextIsSharedTripContext);

            // Ensure group-trip edit state is initialized even when starting in edit mode.
            if (nextRelatedTrip?.isGroup && nextTripExpense) {
                setEditPaidByParticipantId(nextTripExpense.paidByParticipantId ?? null);
                setEditSplitType(nextTripExpense.splitType);
                setEditSplitData(nextTripExpense.splitData ?? {});
                setEditComputedSplits(nextTripExpense.computedSplits ?? {});
            }

 
        } catch (e) {
            console.error(e);
        } finally {
            if (isMountedRef.current && shouldShowLoading) setLoading(false);
        }
    };

    // Keep local-trip metadata in sync as trips hydrate/change.
    useEffect(() => {
        if (!transaction) return;
        if (transaction.systemType === 'trip_share' && transaction.sourceTripExpenseId) return;
        if (isSharedTripContext) return;

        let foundExpense: TripExpense | null = null;
        let foundTrip: Trip | null = null;

        if (transaction.tripExpenseId) {
            for (const t of trips) {
                const exp = t.expenses?.find(e => e.id === transaction.tripExpenseId || e.transactionId === transaction.id);
                if (exp) {
                    foundExpense = exp;
                    foundTrip = t;
                    break;
                }
            }
        } else {
            for (const t of trips) {
                const exp = t.expenses?.find(e => e.transactionId === transaction.id);
                if (exp) {
                    foundExpense = exp;
                    foundTrip = t;
                    break;
                }
            }
        }

        setTripExpense(foundExpense);
        setRelatedTrip(foundTrip);
    }, [transaction, trips, isSharedTripContext]);
 
    // derived

    const category = categories.find(c => c.id === (isEditing ? editCategoryId : transaction?.categoryId));
    const account = accounts.find(a => a.id === (isEditing ? editAccountId : transaction?.accountId));
    const isIncome = transaction?.type === 'income';

    const isTripShare = transaction?.systemType === 'trip_share' && !!transaction?.sourceTripExpenseId;
    const isReadOnly = !!readOnly || isTripShare;

    const displayNote = (isTripShare || isSharedExpense)
        ? (tripExpense?.transaction?.note ?? transaction?.note)
        : transaction?.note;

    const displayCategoryEmoji = (isTripShare || isSharedExpense)
        ? (tripExpense?.categoryEmoji ?? category?.emoji)
        : category?.emoji;

    const displayCategoryName = (isTripShare || isSharedExpense)
        ? (tripExpense?.categoryName ?? category?.name)
        : category?.name;

    const splitTotalAmountCents = (isTripShare || isSharedExpense)
        ? Math.abs(tripExpense?.transaction?.amountCents ?? 0)
        : Math.abs(transaction?.amountCents ?? 0);

    // Sync trip-edit state from DB when not editing.
    useEffect(() => {
        if (isEditing) return;

        if (!relatedTrip || !tripExpense || !relatedTrip.isGroup) {
            setEditPaidByParticipantId(null);
            setEditSplitType('equal');
            setEditSplitData({});
            setEditComputedSplits({});
            return;
        }

        setEditPaidByParticipantId(tripExpense.paidByParticipantId ?? null);
        setEditSplitType(tripExpense.splitType);
        setEditSplitData(tripExpense.splitData ?? {});
        setEditComputedSplits(tripExpense.computedSplits ?? {});
    }, [isEditing, relatedTrip, tripExpense]);

    // Live-preview recompute for group-trip splits while editing.
    useEffect(() => {
        if (!isEditing) return;
        if (!relatedTrip || !tripExpense || !relatedTrip.isGroup) return;

        const parsed = parseFloat(editAmountString);
        const totalAmountCents = Math.round((Number.isFinite(parsed) ? parsed : 0) * 100);
        if (totalAmountCents <= 0) {
            setEditComputedSplits({});
            return;
        }

        const computed = TripSplitCalculator.calculateSplits(
            totalAmountCents,
            editSplitType,
            relatedTrip.participants ?? [],
            editSplitData
        );
        setEditComputedSplits(computed);
    }, [isEditing, relatedTrip, tripExpense, editAmountString, editSplitType, editSplitData]);

    const ensurePayerSelected = () => {
        if (!relatedTrip?.participants || relatedTrip.participants.length === 0) return null;

        if (editPaidByParticipantId && relatedTrip.participants.some(p => p.id === editPaidByParticipantId)) {
            return editPaidByParticipantId;
        }

        const fallback = relatedTrip.participants.find(p => p.isCurrentUser)?.id ?? relatedTrip.participants[0].id;
        setEditPaidByParticipantId(fallback);
        return fallback;
    };
 
    // Recent categories for the quick picker (top 5 + current)
    const quickCategories = useMemo(() => {
        const result = categories.filter(c => !c.isSystem).slice(0, 5);
        // Ensure current selected is in the list
        if (editCategoryId && !result.find(c => c.id === editCategoryId)) {
            const current = categories.find(c => c.id === editCategoryId);
            if (current) result.unshift(current);
        }
        return result;
    }, [categories, editCategoryId]);

    // Save Handler
    const handleSave = async () => {
        if (!transaction) return;

        const newAmount = parseFloat(editAmountString);
        if (!Number.isFinite(newAmount) || newAmount < 0) {
            Alert.alert("Invalid Amount", "Please enter a valid positive number");
            return;
        }

        // Shared trip expenses store positive cents.
        const absoluteCents = Math.round(newAmount * 100);
        const newAmountCents = isSharedExpense
            ? absoluteCents
            : absoluteCents * (isIncome ? 1 : -1);

        try {
            if (isSharedExpense) {
                if (!sharedTripExpense) return;

                const categorySnapshot = editCategoryId ? categories.find((c) => c.id === editCategoryId) : undefined;

                const payerId = ensurePayerSelected();
                const computed = relatedTrip?.isGroup
                    ? TripSplitCalculator.calculateSplits(
                        absoluteCents,
                        editSplitType,
                        relatedTrip.participants ?? [],
                        editSplitData
                    )
                    : {};

                await SharedTripExpenseRepository.update(sharedTripExpense.expenseId, {
                    amountCents: absoluteCents,
                    dateMs: editDate.getTime(),
                    note: editNote.trim() ? editNote.trim() : null,
                    paidByParticipantId: payerId,
                    splitType: editSplitType,
                    splitData: editSplitData,
                    computedSplits: computed,
                    categoryName: categorySnapshot?.name ?? tripExpense?.categoryName ?? null,
                    categoryEmoji: categorySnapshot?.emoji ?? tripExpense?.categoryEmoji ?? null,
                });

                // Keep derived personal rows up-to-date locally (non-blocking).
                if (userId) {
                    reconcileSharedTripDerivedTransactionsForExpense(userId, sharedTripExpense.expenseId)
                        .catch((e) => console.warn('[TransactionDetail] reconcile failed', e));
                }

                // Exit edit mode immediately; sync in background.
                setIsEditing(false);

                setTransaction((prev) => prev ? ({
                    ...prev,
                    amountCents: newAmountCents,
                    date: editDate.getTime(),
                    note: editNote.trim() || undefined,
                }) : prev);

                setTripExpense((prev) => {
                    if (!prev) return prev;
                    return {
                        ...prev,
                        paidByParticipantId: payerId ?? undefined,
                        splitType: editSplitType,
                        splitData: editSplitData,
                        computedSplits: computed,
                        categoryName: categorySnapshot?.name ?? prev.categoryName,
                        categoryEmoji: categorySnapshot?.emoji ?? prev.categoryEmoji,
                        transaction: {
                            ...(prev.transaction ?? ({} as any)),
                            id: prev.id,
                            amountCents: absoluteCents,
                            date: editDate.getTime(),
                            note: editNote.trim() || undefined,
                            type: 'expense',
                            systemType: null,
                            createdAtMs: prev.transaction?.createdAtMs ?? prev.createdAtMs,
                            updatedAtMs: Date.now(),
                        },
                    };
                });

                setIsBackgroundSyncing(true);

                // Defer to next tick so UI can render instantly.
                setTimeout(() => {
                    syncNow('update_shared_trip_expense')
                        .catch((e) => console.warn('[TransactionDetail] shared expense sync failed', e))
                        .finally(() => {
                            if (isMountedRef.current) setIsBackgroundSyncing(false);
                        });
                }, 0);

                Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                onUpdate?.();
                return;
            }

            await withTransaction(async () => {
                await TransactionRepository.update(transaction.id, {
                    amountCents: newAmountCents,
                    date: editDate.getTime(),
                    note: editNote.trim() || undefined,
                    categoryId: editCategoryId || undefined,
                    accountId: editAccountId || undefined
                });

                // If this transaction is part of a group trip, update payer + split metadata as well.
                if (relatedTrip?.isGroup && tripExpense) {
                    const totalAmountCents = Math.abs(newAmountCents);
                    const computed = TripSplitCalculator.calculateSplits(
                        totalAmountCents,
                        editSplitType,
                        relatedTrip.participants ?? [],
                        editSplitData
                    );

                    await TripExpenseRepository.update(tripExpense.id, {
                        paidByParticipantId: editPaidByParticipantId ?? tripExpense.paidByParticipantId,
                        splitType: editSplitType,
                        splitData: editSplitData,
                        computedSplits: computed,
                    });
                }
            });

            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            setIsEditing(false);
            loadData(); // refresh
            onUpdate?.();
        } catch (e) {
            console.error(e);
            Alert.alert("Error", "Failed to update transaction");
        }
    };

    const handleDelete = () => {
        const title = isSharedExpense ? 'Delete Expense?' : 'Delete Transaction?';
        const message = isSharedExpense ? 'This deletes it for everyone.' : 'This cannot be undone.';

        Alert.alert(
            title,
            message,
            [
                { text: "Cancel", style: "cancel" },
                {
                    text: "Delete", style: "destructive", onPress: async () => {
                        try {
                            if (isSharedExpense && sharedTripExpense) {
                                await SharedTripExpenseRepository.delete(sharedTripExpense.expenseId);

                                // Local derived cleanup.
                                if (userId) {
                                    reconcileSharedTripDerivedTransactionsForExpense(userId, sharedTripExpense.expenseId)
                                        .catch((e) => console.warn('[TransactionDetail] reconcile delete failed', e));
                                }

                                setIsBackgroundSyncing(true);

                                setTimeout(() => {
                                    syncNow('delete_shared_trip_expense')
                                        .catch((e) => console.warn('[TransactionDetail] shared expense delete sync failed', e))
                                        .finally(() => {
                                            if (isMountedRef.current) setIsBackgroundSyncing(false);
                                        });
                                }, 0);
                            } else {
                                await Actions.deleteTransaction(transaction!.id);
                            }

                            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                            onDelete?.();
                            onDismiss();
                        } catch (e) {
                            Alert.alert("Error", "Failed to delete");
                        }
                    }
                }
            ]
        );
    };

    const handleRemoveFromTrip = () => {
        if (isSharedTripContext || isTripShare) return;
        if (!relatedTrip || !tripExpense || !transaction) return;

        Alert.alert(
            "Remove from Trip?",
            `This will keep the transaction but remove it from "${relatedTrip.name}".`,
            [
                { text: "Cancel", style: "cancel" },
                {
                    text: "Remove", style: "destructive", onPress: async () => {
                        try {
                            await TripExpenseRepository.delete(tripExpense.id);
                            // Important: TransactionRepository.update ignores `undefined` fields.
                            // Use NULL to clear the link.
                            await TransactionRepository.update(transaction.id, { tripExpenseId: null });

                            setTripExpense(null);
                            setRelatedTrip(null);
                            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                            loadData();
                        } catch (e) {
                            Alert.alert("Error", "Failed to remove from trip");
                        }
                    }
                }
            ]
        );
    };

    if (loading || !transaction) {
        return (
            <View style={[styles.container, { paddingTop: insets.top }]}>
                <Text style={{ color: 'white', textAlign: 'center', marginTop: 20 }}>Loading...</Text>
            </View>
        );
    }

    return (
        <View style={styles.container}>
            {/* Header - Minimalistic, no title */}
            <View style={[styles.header, { paddingTop: insets.top + 10 }]}>
                <TouchableOpacity
                    onPress={onDismiss}
                    style={styles.circleButton}
                >
                    <Ionicons name="chevron-back" size={24} color="white" />
                </TouchableOpacity>

                <View style={{ flex: 1 }} />

                {!isReadOnly && isEditing && (
                    <TouchableOpacity
                        onPress={handleSave}
                        style={styles.saveButton}
                    >
                        <Text style={styles.saveButtonText}>Save</Text>
                    </TouchableOpacity>
                )}

                {!isReadOnly && !isEditing && (
                    <TouchableOpacity
                        onPress={() => {
                            setIsEditing(true);
                            Haptics.selectionAsync();
                        }}
                        style={styles.editButton}
                    >
                        <Text style={styles.editButtonText}>Edit</Text>
                    </TouchableOpacity>
                )}

                {isReadOnly && isTripShare && (
                    <TouchableOpacity
                        onPress={() => {
                            if (!relatedTrip || !tripExpense) return;
                            Haptics.selectionAsync();
                            onEditInTrip?.(relatedTrip.id, tripExpense.id);
                        }}
                        style={styles.editButton}
                        disabled={!relatedTrip || !tripExpense || !onEditInTrip}
                    >
                        <Text style={styles.editInTripText}>Edit in Trip</Text>
                    </TouchableOpacity>
                )}
            </View>

            <ScrollView contentContainerStyle={styles.content}>

                {/* Hero Section */}
                <View style={styles.heroSection}>
                    {/* Emoji */}
                    <TouchableOpacity
                        onPress={() => isEditing && setShowCategoryPicker(true)}
                        style={styles.emojiButton}
                        disabled={!isEditing}
                    >
                        <Text style={styles.heroEmoji}>{
                            transaction?.systemType === 'transfer' ? "⇅" :
                                transaction?.systemType === 'adjustment' ? "🛠" :
                                    displayCategoryEmoji || (isIncome ? "💰" : "💸")
                        }</Text>
                        {isEditing && (
                            <View style={styles.editBadge}>
                                <Ionicons name="pencil" size={12} color="black" />
                            </View>
                        )}
                    </TouchableOpacity>

                    {/* Amount */}
                    {isEditing ? (
                        <View style={styles.editAmountContainer}>
                            <Text style={styles.currencySymbol}>{getCurrencySymbol("INR")}</Text>
                            <TextInput
                                style={styles.editAmountInput}
                                value={editAmountString}
                                onChangeText={setEditAmountString}
                                keyboardType="decimal-pad"
                            />
                        </View>
                    ) : (
                        <Text style={styles.heroAmount}>
                            {formatCents(Math.abs(transaction!.amountCents), "INR")}
                        </Text>
                    )}

                    {!isEditing && isTripShare && (
                        <Text style={styles.tripShareLabel}>Your share</Text>
                    )}

                    {/* View Mode Meta */}
                    {!isEditing && (
                        <Text style={styles.metaText}>
                            {new Date(transaction!.date).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: 'numeric', hour12: true })}

                            {!!account && !isTripShare && !isSharedExpense && (
                                <Text>
                                    <Text style={{ color: 'rgba(255,255,255,0.3)' }}> • </Text>
                                    {account.emoji} {account.name}
                                </Text>
                            )}

                            {(isTripShare || isSharedExpense) && !!relatedTrip && (
                                <Text>
                                    <Text style={{ color: 'rgba(255,255,255,0.3)' }}> • </Text>
                                    {relatedTrip.emoji} {relatedTrip.name}
                                </Text>
                            )}
                        </Text>
                    )}

                    {!isEditing && isSharedExpense && isBackgroundSyncing && (
                        <View style={styles.syncingRow}>
                            <ActivityIndicator size="small" color="rgba(255,255,255,0.6)" />
                            <Text style={styles.syncingText}>Syncing…</Text>
                        </View>
                    )}
                </View>

                {/* EDIT MODE LAYOUT */}
                {isEditing ? (
                    <View style={styles.editForm}>

                        {/* Date & Time Row */}
                        <View style={styles.row}>
                            <TouchableOpacity onPress={() => setShowDatePicker(true)} style={styles.pill}>
                                <Text style={styles.pillText}>
                                    {editDate.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                                </Text>
                            </TouchableOpacity>
                            <TouchableOpacity onPress={() => setShowDatePicker(true)} style={styles.pill}>
                                <Text style={styles.pillText}>
                                    {editDate.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })}
                                </Text>
                            </TouchableOpacity>
                        </View>

                        {!isSharedExpense && (
                            <>
                                {/* Account */}
                                <View style={styles.fieldGroup}>
                                    <Text style={styles.label}>Account</Text>
                                    <TouchableOpacity onPress={() => setShowAccountPicker(true)} style={[styles.pill, { alignSelf: 'flex-start' }]}>
                                        <Text style={{ fontSize: 16, marginRight: 6 }}>{account?.emoji || "🏦"}</Text>
                                        <Text style={styles.pillText}>{account?.name || "Select Account"}</Text>
                                    </TouchableOpacity>
                                </View>
                            </>
                        )}

                        {/* Category Quick Picker */}
                        <View style={styles.fieldGroup}>
                            <Text style={styles.label}>Category</Text>
                            <View style={{ flexDirection: 'row', gap: 12 }}>
                                {quickCategories.map(c => (
                                    <TouchableOpacity
                                        key={c.id}
                                        style={[styles.categoryCircle, editCategoryId === c.id && styles.categoryCircleSelected]}
                                        onPress={() => setEditCategoryId(c.id)}
                                    >
                                        <Text style={{ fontSize: 24 }}>{c.emoji}</Text>
                                    </TouchableOpacity>
                                ))}
                                <TouchableOpacity
                                    style={styles.categoryCircle}
                                    onPress={() => setShowCategoryPicker(true)}
                                >
                                    <Ionicons name="grid-outline" size={20} color="white" />
                                </TouchableOpacity>
                            </View>
                        </View>

                        {/* Notes */}
                        <View style={styles.fieldGroup}>
                            <Text style={styles.label}>Notes</Text>
                            <View style={styles.notesContainer}>
                                <TextInput
                                    style={styles.noteInputEdit}
                                    value={editNote}
                                    onChangeText={setEditNote}
                                    placeholder="Add a note..."
                                    placeholderTextColor="rgba(255,255,255,0.3)"
                                    multiline
                                    textAlignVertical="top"
                                />
                            </View>
                        </View>

                        {/* Trip */}
                        <View style={styles.fieldGroup}>
                            <Text style={styles.label}>Trip</Text>
                            {relatedTrip ? (
                                <View style={styles.tripPill}>
                                    <Text>{relatedTrip.emoji}</Text>
                                    <Text style={{ color: 'white', fontWeight: '600' }}>{relatedTrip.name}</Text>
                                    {!isSharedTripContext && (
                                        <TouchableOpacity onPress={handleRemoveFromTrip}>
                                            <Ionicons name="close-circle" size={18} color={Colors.error} style={{ marginLeft: 4 }} />
                                        </TouchableOpacity>
                                    )}
                                </View>
                            ) : (
                                <TouchableOpacity style={styles.addToTripButton}>
                                    <Ionicons name="airplane" size={16} color="rgba(255,255,255,0.6)" />
                                    <Text style={{ color: 'rgba(255,255,255,0.8)', fontWeight: '600' }}>Add to Trip</Text>
                                </TouchableOpacity>
                            )}
                        </View>

                        {/* Split Details - editable for group trips */}
                        {relatedTrip && relatedTrip.isGroup && tripExpense && (
                            <View style={styles.splitDetailsSection}>
                                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                                    <Text style={styles.splitDetailsLabel}>Split Details</Text>
                                    <View style={{ flex: 1 }} />
                                    <TouchableOpacity
                                        onPress={() => {
                                            Haptics.selectionAsync();
                                            ensurePayerSelected();
                                            setShowSplitEditor(true);
                                        }}
                                        activeOpacity={0.7}
                                        style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}
                                    >
                                        <Text style={{ color: Colors.accent, fontSize: 12, fontWeight: '600' }}>Edit</Text>
                                        <Ionicons name="chevron-forward" size={12} color={Colors.accent} />
                                    </TouchableOpacity>
                                </View>

                                <View style={styles.splitCard}>
                                    <TouchableOpacity
                                        style={styles.paidByRow}
                                        onPress={() => {
                                            Haptics.selectionAsync();
                                            setShowPayerPicker(true);
                                        }}
                                        activeOpacity={0.7}
                                    >
                                        {(() => {
                                            const payer = relatedTrip.participants?.find(p => p.id === editPaidByParticipantId);
                                            const parsed = parseFloat(editAmountString);
                                            const amountCents = Math.round((Number.isFinite(parsed) ? parsed : 0) * 100);
                                            const displayAmountCents = amountCents > 0 ? amountCents : Math.abs(transaction.amountCents);

                                            if (payer) {
                                                return (
                                                    <>
                                                        <View style={[styles.avatar, { backgroundColor: '#' + (payer.colorHex || 'FF9500') }]}>
                                                            <Text style={styles.avatarLetter}>{payer.name?.[0]?.toUpperCase() || '?'}</Text>
                                                        </View>
                                                        <Text style={styles.paidByText}>
                                                            {payer.isCurrentUser ? 'You paid' : `${payer.name} paid`}
                                                        </Text>
                                                        <View style={{ flex: 1 }} />
                                                        <Text style={styles.paidByAmount}>{formatCents(displayAmountCents, "INR")}</Text>
                                                        <Ionicons name="chevron-down" size={14} color="rgba(255,255,255,0.35)" />
                                                    </>
                                                );
                                            }

                                            return (
                                                <>
                                                    <View style={[styles.avatar, { backgroundColor: 'rgba(255,255,255,0.12)' }]}>
                                                        <Ionicons name="person-outline" size={14} color="rgba(255,255,255,0.75)" />
                                                    </View>
                                                    <Text style={styles.paidByText}>Select who paid</Text>
                                                    <View style={{ flex: 1 }} />
                                                    <Text style={styles.paidByAmount}>{formatCents(displayAmountCents, "INR")}</Text>
                                                    <Ionicons name="chevron-down" size={14} color="rgba(255,255,255,0.35)" />
                                                </>
                                            );
                                        })()}
                                    </TouchableOpacity>

                                    <View style={{ height: 1, backgroundColor: 'rgba(255,255,255,0.06)' }} />

                                    <View style={styles.splitTypeRow}>
                                        <Ionicons
                                            name={
                                                editSplitType === 'equal' ? 'people-outline' :
                                                    editSplitType === 'percentage' ? 'pie-chart-outline' :
                                                        editSplitType === 'shares' ? 'layers-outline' :
                                                            editSplitType === 'exact' ? 'cash-outline' : 'checkmark-circle-outline'
                                            }
                                            size={14}
                                            color={Colors.accent}
                                        />
                                        <Text style={styles.splitTypeText}>
                                            By {editSplitType === 'equal' ? 'Equal' :
                                                editSplitType === 'equalSelected' ? 'Selected' :
                                                    editSplitType === 'percentage' ? 'Percentage' :
                                                        editSplitType === 'shares' ? 'Shares' :
                                                            editSplitType === 'exact' ? 'Exact' : editSplitType}
                                        </Text>
                                    </View>

                                    {relatedTrip.participants?.map(participant => {
                                        const owedAmount = editComputedSplits?.[participant.id];
                                        if (!owedAmount || owedAmount <= 0) return null;

                                        return (
                                            <View key={participant.id} style={styles.participantRow}>
                                                <View style={[styles.avatarSmall, { backgroundColor: '#' + (participant.colorHex || 'FF9500') }]}>
                                                    <Text style={styles.avatarLetterSmall}>{participant.name?.[0]?.toUpperCase() || '?'}</Text>
                                                </View>
                                                <Text style={styles.participantName}>
                                                    {participant.isCurrentUser ? 'You' : participant.name}
                                                </Text>
                                                <View style={{ flex: 1 }} />
                                                <Text style={styles.participantAmount}>
                                                    {formatCents(owedAmount, "INR")}
                                                </Text>
                                            </View>
                                        );
                                    })}
                                </View>
                            </View>
                        )}
 
                    </View>
                ) : (
                    /* VIEW MODE LAYOUT */
                    <View style={styles.dataSection}>
                        {/* Note (Only if exists) */}
                        {!!displayNote && (
                            <View style={styles.viewNoteContainer}>
                                <Text style={styles.viewNoteText}>{displayNote}</Text>
                            </View>
                        )}

                        {/* Trip Card */}
                        {relatedTrip && (
                            <View style={styles.tripSection}>
                                {/* Trip Label */}
                                <Text style={styles.sectionLabel}>Trip</Text>

                                {/* Trip Badge Row */}
                                    <View style={styles.tripBadge}>
                                        <Text style={{ fontSize: 22, marginRight: 10 }}>{relatedTrip.emoji}</Text>
                                        <Text style={styles.tripName}>{relatedTrip.name}</Text>
                                        <View style={{ flex: 1 }} />
                                        {!isSharedTripContext && (
                                            <TouchableOpacity onPress={handleRemoveFromTrip}>
                                                <Ionicons name="close-circle" size={20} color="rgba(255,255,255,0.5)" />
                                            </TouchableOpacity>
                                        )}
                                    </View>

                                {/* Split Details Section - for group trips */}
                                {tripExpense && relatedTrip.isGroup && (
                                    <View style={styles.splitDetailsSection}>
                                        <Text style={styles.splitDetailsLabel}>Split Details</Text>

                                        <View style={styles.splitCard}>
                                            {/* Paid By Row */}
                                            {(() => {
                                                const payer = relatedTrip.participants?.find(p => p.id === tripExpense.paidByParticipantId);
                                                if (payer) {
                                                    return (
                                                        <View style={styles.paidByRow}>
                                                            <View style={[styles.avatar, { backgroundColor: '#' + (payer.colorHex || 'FF9500') }]}>
                                                                <Text style={styles.avatarLetter}>{payer.name?.[0]?.toUpperCase() || '?'}</Text>
                                                            </View>
                                                            <Text style={styles.paidByText}>
                                                                {payer.isCurrentUser ? 'You paid' : `${payer.name} paid`}
                                                            </Text>
                                                            <View style={{ flex: 1 }} />
                                                            <Text style={styles.paidByAmount}>
                                                                {formatCents(splitTotalAmountCents, "INR")}
                                                            </Text>
                                                        </View>
                                                    );
                                                }
                                                return null;
                                            })()}

                                            {/* Split Type Row */}
                                            <View style={styles.splitTypeRow}>
                                                <Ionicons
                                                    name={
                                                        tripExpense.splitType === 'equal' ? 'people-outline' :
                                                            tripExpense.splitType === 'percentage' ? 'pie-chart-outline' :
                                                                tripExpense.splitType === 'shares' ? 'layers-outline' :
                                                                    tripExpense.splitType === 'exact' ? 'cash-outline' : 'checkmark-circle-outline'
                                                    }
                                                    size={14}
                                                    color={Colors.accent}
                                                />
                                                <Text style={styles.splitTypeText}>
                                                    By {tripExpense.splitType === 'equal' ? 'Equal' :
                                                        tripExpense.splitType === 'equalSelected' ? 'Selected' :
                                                            tripExpense.splitType === 'percentage' ? 'Percentage' :
                                                                tripExpense.splitType === 'shares' ? 'Shares' :
                                                                    tripExpense.splitType === 'exact' ? 'Exact' : tripExpense.splitType}
                                                </Text>
                                            </View>

                                            {/* Participant Splits */}
                                            {relatedTrip.participants?.map(participant => {
                                                const owedAmount = tripExpense.computedSplits?.[participant.id];
                                                if (!owedAmount || owedAmount <= 0) return null;

                                                return (
                                                    <View key={participant.id} style={styles.participantRow}>
                                                        <View style={[styles.avatarSmall, { backgroundColor: '#' + (participant.colorHex || 'FF9500') }]}>
                                                            <Text style={styles.avatarLetterSmall}>{participant.name?.[0]?.toUpperCase() || '?'}</Text>
                                                        </View>
                                                        <Text style={styles.participantName}>
                                                            {participant.isCurrentUser ? 'You' : participant.name}
                                                        </Text>
                                                        <View style={{ flex: 1 }} />
                                                        <Text style={styles.participantAmount}>
                                                            {formatCents(owedAmount, "INR")}
                                                        </Text>
                                                    </View>
                                                );
                                            })}
                                        </View>
                                    </View>
                                )}
                            </View>
                        )}
                    </View>
                )}

                {!isReadOnly && (
                    <>
                        {/* Delete Button */}
                        <TouchableOpacity
                            style={styles.deleteButton}
                            onPress={handleDelete}
                        >
                            <Text style={styles.deleteText}>{isSharedExpense ? 'Delete Expense' : 'Delete Transaction'}</Text>
                        </TouchableOpacity>
                    </>
                )}

                <View style={{ height: 100 }} />
            </ScrollView>

            {/* Modals for Editing */}

            {/* Date Picker (Platform specific) */}
            {showDatePicker && Platform.OS === 'ios' && (
                <Modal transparent animationType="fade">
                    <View style={styles.dateModalBg}>
                        <View style={styles.datePickerContainer}>
                            <View style={{ alignItems: 'flex-end', padding: 8 }}>
                                <TouchableOpacity onPress={() => setShowDatePicker(false)}>
                                    <Text style={{ color: Colors.accent, fontWeight: 'bold' }}>Done</Text>
                                </TouchableOpacity>
                            </View>
                            <DateTimePicker
                                value={editDate}
                                mode="datetime"
                                display="spinner"
                                onChange={(e, d) => {
                                    if (d) setEditDate(d);
                                }}
                                textColor="white"
                            />
                        </View>
                    </View>
                </Modal>
            )}

            {/* Simple Category Picker Modal */}
            <Modal visible={showCategoryPicker} animationType="slide" presentationStyle="pageSheet">
                <View style={styles.modalContainer}>
                    <View style={styles.modalHeader}>
                        <Text style={styles.modalTitle}>Select Category</Text>
                        <TouchableOpacity onPress={() => setShowCategoryPicker(false)}>
                            <Text style={{ color: Colors.accent, fontSize: 16 }}>Close</Text>
                        </TouchableOpacity>
                    </View>
                    <ScrollView contentContainerStyle={{ padding: 20 }}>
                        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 15 }}>
                            {categories.filter(c => !c.isSystem).map(c => (
                                <TouchableOpacity
                                    key={c.id}
                                    style={styles.pickerItem}
                                    onPress={() => {
                                        setEditCategoryId(c.id);
                                        setShowCategoryPicker(false);
                                    }}
                                >
                                    <Text style={{ fontSize: 32 }}>{c.emoji}</Text>
                                    <Text style={{ color: 'white', fontSize: 12 }}>{c.name}</Text>
                                </TouchableOpacity>
                            ))}
                        </View>
                    </ScrollView>
                </View>
            </Modal>

            {/* Simple Account Picker Modal */}
            <Modal visible={showAccountPicker} animationType="slide" presentationStyle="pageSheet">
                <View style={styles.modalContainer}>
                    <View style={styles.modalHeader}>
                        <Text style={styles.modalTitle}>Select Account</Text>
                        <TouchableOpacity onPress={() => setShowAccountPicker(false)}>
                            <Text style={{ color: Colors.accent, fontSize: 16 }}>Close</Text>
                        </TouchableOpacity>
                    </View>
                    <ScrollView contentContainerStyle={{ padding: 20 }}>
                        {accounts.map(a => (
                            <TouchableOpacity
                                key={a.id}
                                style={{ flexDirection: 'row', alignItems: 'center', padding: 15, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.1)' }}
                                onPress={() => {
                                    setEditAccountId(a.id);
                                    setShowAccountPicker(false);
                                }}
                            >
                                <Text style={{ fontSize: 24, marginRight: 15 }}>{a.emoji}</Text>
                                <Text style={{ fontSize: 18, color: 'white', fontFamily: 'AvenirNextCondensed-DemiBold' }}>{a.name}</Text>
                            </TouchableOpacity>
                        ))}
                    </ScrollView>
                </View>
            </Modal>

            {/* Trip Split Editor Modal */}
            <Modal
                visible={showSplitEditor}
                animationType="slide"
                presentationStyle="pageSheet"
                onRequestClose={() => setShowSplitEditor(false)}
            >
                {relatedTrip && tripExpense && relatedTrip.isGroup && (
                    <SplitEditorScreen
                        participants={relatedTrip.participants ?? []}
                        totalAmountCents={Math.max(0, Math.round((parseFloat(editAmountString) || 0) * 100))}
                        currencyCode="INR"
                        initialSplitType={editSplitType}
                        initialSplitData={editSplitData}
                        payerId={editPaidByParticipantId || undefined}
                        onPayerChange={(id) => setEditPaidByParticipantId(id)}
                        onSave={(splitType, splitData, computedSplits) => {
                            setEditSplitType(splitType);
                            setEditSplitData(splitData);
                            setEditComputedSplits(computedSplits);
                            setShowSplitEditor(false);
                        }}
                        onCancel={() => setShowSplitEditor(false)}
                    />
                )}
            </Modal>

            {/* Payer Picker Modal */}
            <Modal
                visible={showPayerPicker}
                animationType="slide"
                presentationStyle="pageSheet"
                onRequestClose={() => setShowPayerPicker(false)}
            >
                <View style={styles.modalContainer}>
                    <View style={styles.modalHeader}>
                        <Text style={styles.modalTitle}>Who paid?</Text>
                        <TouchableOpacity onPress={() => setShowPayerPicker(false)}>
                            <Text style={{ color: Colors.accent, fontSize: 16 }}>Close</Text>
                        </TouchableOpacity>
                    </View>
                    <ScrollView contentContainerStyle={{ padding: 20 }}>
                        {(relatedTrip?.participants ?? []).map(p => (
                            <TouchableOpacity
                                key={p.id}
                                style={{ flexDirection: 'row', alignItems: 'center', padding: 15, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.1)' }}
                                onPress={() => {
                                    Haptics.selectionAsync();
                                    setEditPaidByParticipantId(p.id);
                                    setShowPayerPicker(false);
                                }}
                            >
                                <View style={[styles.avatar, { backgroundColor: '#' + (p.colorHex || 'FF9500') }]}>
                                    <Text style={styles.avatarLetter}>{p.name?.[0]?.toUpperCase() || '?'}</Text>
                                </View>
                                <Text style={{ marginLeft: 12, fontSize: 18, color: 'white', fontFamily: 'AvenirNextCondensed-DemiBold' }}>
                                    {p.isCurrentUser ? 'You' : p.name}
                                </Text>
                                <View style={{ flex: 1 }} />
                                {editPaidByParticipantId === p.id && (
                                    <Ionicons name="checkmark" size={18} color={Colors.accent} />
                                )}
                            </TouchableOpacity>
                        ))}
                    </ScrollView>
                </View>
            </Modal>

        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#000',
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 20,
        paddingBottom: 10,
    },
    circleButton: {
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: 'rgba(255,255,255,0.1)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    saveButton: {
        backgroundColor: 'rgba(255,255,255,0.2)',
        paddingHorizontal: 16,
        paddingVertical: 8,
        borderRadius: 20,
    },
    saveButtonText: {
        color: 'white',
        fontSize: 16,
        fontWeight: '600',
    },
    editButton: {
        backgroundColor: 'rgba(255,255,255,0.1)',
        paddingHorizontal: 16,
        paddingVertical: 8,
        borderRadius: 20,
    },
    editButtonText: {
        color: 'white',
        fontSize: 15,
        fontWeight: '600',
    },
    editInTripText: {
        color: Colors.accent,
        fontSize: 15,
        fontWeight: '600',
    },
    content: {
        paddingHorizontal: 20,
        paddingTop: 10,
    },

    // Hero
    heroSection: {
        alignItems: 'center',
        marginBottom: 40,
        marginTop: 60, // Increased top spacing
    },
    heroEmoji: {
        fontSize: 64, // Bigger like Swift
        marginBottom: 10,
    },
    emojiButton: {
        position: 'relative',
    },
    editBadge: {
        position: 'absolute',
        bottom: 10,
        right: -5,
        backgroundColor: 'white',
        borderRadius: 10,
        width: 20,
        height: 20,
        justifyContent: 'center',
        alignItems: 'center',
        borderWidth: 2,
        borderColor: 'black',
    },
    heroAmount: {
        fontSize: 48,
        fontFamily: 'AvenirNextCondensed-Heavy',
        color: 'white',
        marginBottom: 8,
    },
    editAmountContainer: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    currencySymbol: {
        fontSize: 48,
        color: 'rgba(255,255,255,0.5)',
        fontFamily: 'AvenirNextCondensed-Heavy',
    },
    editAmountInput: {
        fontSize: 48,
        color: 'white',
        fontFamily: 'AvenirNextCondensed-Heavy',
        minWidth: 80,
    },

    // View Meta
    metaText: {
        fontSize: 16,
        color: 'rgba(255,255,255,0.6)',
        fontFamily: 'System',
    },
    tripShareLabel: {
        marginTop: 6,
        fontSize: 14,
        color: 'rgba(255,255,255,0.5)',
        fontFamily: 'System',
    },
    syncingRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        marginTop: 10,
    },
    syncingText: {
        fontFamily: 'System',
        fontSize: 12,
        color: 'rgba(255,255,255,0.5)',
    },

    // Edit Layout
    editForm: {
        gap: 24,
    },
    row: {
        flexDirection: 'row',
        gap: 12,
    },
    pill: {
        backgroundColor: '#1C1C1E',
        paddingHorizontal: 16,
        paddingVertical: 12,
        borderRadius: 20,
        flexDirection: 'row',
        alignItems: 'center',
    },
    pillText: {
        color: 'white',
        fontSize: 16,
    },
    fieldGroup: {
        gap: 10,
    },
    label: {
        color: 'rgba(255,255,255,0.5)',
        fontSize: 14,
        marginLeft: 4,
    },
    categoryCircle: {
        width: 44,
        height: 44,
        borderRadius: 22,
        backgroundColor: '#1C1C1E',
        justifyContent: 'center',
        alignItems: 'center',
    },
    categoryCircleSelected: {
        backgroundColor: 'rgba(255,255,255,0.2)',
        borderWidth: 1,
        borderColor: Colors.accent,
    },
    notesContainer: {
        backgroundColor: '#1C1C1E',
        borderRadius: 16,
        padding: 16,
        minHeight: 120,
    },
    noteInputEdit: {
        color: 'white',
        fontSize: 16,
        lineHeight: 22,
        minHeight: 100,
    },
    tripPill: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#1C1C1E',
        padding: 12,
        borderRadius: 20,
        alignSelf: 'flex-start',
        gap: 8,
    },
    addToTripButton: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#1C1C1E',
        padding: 12,
        borderRadius: 12,
        alignSelf: 'flex-start',
        gap: 8,
    },

    // View Layout
    dataSection: {
        gap: 24,
    },
    viewNoteContainer: {
        backgroundColor: '#1C1C1E',
        borderRadius: 16,
        padding: 16,
    },
    viewNoteText: {
        color: 'white',
        fontSize: 18,
        lineHeight: 24,
    },
    tripCard: {
        backgroundColor: '#1C1C1E',
        borderRadius: 16,
        padding: 16,
    },
    tripHeader: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    tripName: {
        color: 'white',
        fontSize: 17,
        fontWeight: '600',
        flex: 1,
    },
    removeButton: {
        padding: 4,
    },
    splitRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        marginTop: 4,
    },
    avatarPlaceholder: {
        width: 24,
        height: 24,
        borderRadius: 12,
        backgroundColor: '#333',
        justifyContent: 'center',
        alignItems: 'center',
    },
    avatarText: {
        color: 'white',
        fontSize: 10,
        fontWeight: 'bold',
    },
    splitMainText: {
        color: 'white',
        fontSize: 14,
    },
    splitAmountText: {
        color: 'white',
        fontSize: 16,
        fontFamily: 'AvenirNextCondensed-DemiBold',
    },
    divider: {
        height: 1,
        backgroundColor: 'rgba(255,255,255,0.1)',
        marginVertical: 12,
        marginLeft: 44, // Align with text
    },

    // Delete
    deleteButton: {
        backgroundColor: '#2C2C2E', // Subtle dark button
        paddingVertical: 16,
        borderRadius: 12,
        alignItems: 'center',
        marginTop: 40,
    },
    deleteText: {
        color: Colors.error,
        fontSize: 17,
        fontWeight: '600',
    },

    // Modals
    dateModalBg: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.5)',
        justifyContent: 'flex-end',
    },
    datePickerContainer: {
        backgroundColor: '#1C1C1E',
        paddingBottom: 20,
    },
    modalContainer: {
        flex: 1,
        backgroundColor: '#1C1C1E',
    },
    modalHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: 20,
        borderBottomWidth: 1,
        borderBottomColor: 'rgba(255,255,255,0.1)',
    },
    modalTitle: {
        color: 'white',
        fontSize: 18,
        fontFamily: 'AvenirNextCondensed-DemiBold',
    },
    pickerItem: {
        alignItems: 'center',
        justifyContent: 'center',
        width: 70,
        height: 70,
        backgroundColor: 'rgba(255,255,255,0.08)',
        borderRadius: 12,
    },

    // Trip Section - Split Details
    tripSection: {
        gap: 12,
    },
    sectionLabel: {
        color: 'rgba(255,255,255,0.7)',
        fontSize: 18,
        fontFamily: 'AvenirNextCondensed-DemiBold',
    },
    tripBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: 'rgba(255,255,255,0.08)',
        padding: 12,
        borderRadius: 10,
    },
    splitDetailsSection: {
        marginTop: 8,
        gap: 8,
    },
    splitDetailsLabel: {
        color: 'rgba(255,255,255,0.6)',
        fontSize: 16,
        fontFamily: 'AvenirNextCondensed-DemiBold',
    },
    splitCard: {
        backgroundColor: 'rgba(255,255,255,0.04)',
        borderRadius: 12,
        overflow: 'hidden',
    },
    paidByRow: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 14,
        backgroundColor: 'rgba(255,255,255,0.08)',
        gap: 12,
    },
    avatar: {
        width: 32,
        height: 32,
        borderRadius: 16,
        justifyContent: 'center',
        alignItems: 'center',
    },
    avatarLetter: {
        color: 'white',
        fontSize: 12,
        fontFamily: 'AvenirNextCondensed-DemiBold',
    },
    paidByText: {
        color: 'white',
        fontSize: 15,
        fontFamily: 'AvenirNextCondensed-DemiBold',
    },
    paidByAmount: {
        color: 'white',
        fontSize: 15,
        fontFamily: 'AvenirNextCondensed-DemiBold',
    },
    splitTypeRow: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 14,
        gap: 8,
    },
    splitTypeText: {
        color: 'rgba(255,255,255,0.7)',
        fontSize: 14,
        fontFamily: 'AvenirNextCondensed-DemiBold',
    },
    participantRow: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 14,
        paddingVertical: 10,
        gap: 12,
    },
    avatarSmall: {
        width: 28,
        height: 28,
        borderRadius: 14,
        justifyContent: 'center',
        alignItems: 'center',
    },
    avatarLetterSmall: {
        color: 'white',
        fontSize: 10,
        fontWeight: 'bold',
    },
    participantName: {
        color: 'rgba(255,255,255,0.8)',
        fontSize: 14,
    },
    participantAmount: {
        color: 'rgba(255,255,255,0.8)',
        fontSize: 14,
        fontFamily: 'AvenirNextCondensed-DemiBold',
    },
});
