/**
 * Wire (Convex row) → domain type mappers so web adapters return exactly the
 * shapes the shared screens expect from the native repositories.
 */
import type { Account, Category, ImportInboxItem, Transaction, Trip, TripExpense, TripParticipant, TripSettlement, UserSettings } from '../logic/types';

const undef = <T>(v: T | null | undefined): T | undefined => (v === null || v === undefined ? undefined : v);

export function toAccount(w: any): Account {
  return {
    id: w.id, name: w.name, emoji: w.emoji, kind: w.kind, sortIndex: w.sortIndex ?? 0,
    openingBalanceCents: undef(w.openingBalanceCents), limitAmountCents: undef(w.limitAmountCents), billingCycleDay: undef(w.billingCycleDay),
    createdAtMs: w.createdAtMs, updatedAtMs: w.updatedAtMs, deletedAtMs: undef(w.deletedAtMs),
  };
}

export function toCategory(w: any): Category {
  return {
    id: w.id, name: w.name, emoji: w.emoji, sortIndex: w.sortIndex ?? 0, monthlyBudgetCents: undef(w.monthlyBudgetCents),
    isSystem: w.isSystem === 1 || w.isSystem === true, createdAtMs: w.createdAtMs, updatedAtMs: w.updatedAtMs, deletedAtMs: undef(w.deletedAtMs),
  };
}

export function toTransaction(w: any): Transaction {
  return {
    id: w.id, amountCents: w.amountCents, date: w.date, note: undef(w.note), type: w.type, systemType: w.systemType ?? null,
    accountId: undef(w.accountId), categoryId: undef(w.categoryId), transferFromAccountId: undef(w.transferFromAccountId), transferToAccountId: undef(w.transferToAccountId),
    tripExpenseId: undef(w.tripExpenseId), sourceTripExpenseId: undef(w.sourceTripExpenseId), sourceTripSettlementId: undef(w.sourceTripSettlementId),
    sourceType: undef(w.sourceType), sourceImportInboxItemId: undef(w.sourceImportInboxItemId),
    createdAtMs: w.createdAtMs, updatedAtMs: w.updatedAtMs, deletedAtMs: undef(w.deletedAtMs),
  };
}

/** Virtual derived row → Transaction (same shape native derives locally). */
export function derivedToTransaction(d: any): Transaction {
  return {
    id: d.id, amountCents: d.amountCents, date: d.date, note: undef(d.note), type: d.type, systemType: d.systemType,
    accountId: undef(d.accountId), sourceTripExpenseId: undef(d.sourceTripExpenseId), sourceTripSettlementId: undef(d.sourceTripSettlementId),
    createdAtMs: d.createdAtMs ?? d.date, updatedAtMs: d.updatedAtMs ?? d.date, deletedAtMs: undefined,
  };
}

export function toSettings(w: any): UserSettings {
  return {
    currencyCode: w?.currencyCode ?? 'INR',
    hapticsEnabled: w ? w.hapticsEnabled === 1 || w.hapticsEnabled === true : false,
    defaultAccountId: w?.defaultAccountId ?? null,
    // No settings row yet (first sign-in, before the seed): don't flash onboarding.
    hasSeenOnboarding: w ? w.hasSeenOnboarding !== 0 : true,
    syncTransactionFilters: w ? w.syncTransactionFilters === 1 : false,
    resetTransactionFiltersOnReopen: w ? w.resetTransactionFiltersOnReopen === 1 : false,
    transactionsFiltersJson: w?.transactionsFiltersJson ?? null,
    transactionsFiltersUpdatedAtMs: w?.transactionsFiltersUpdatedAtMs ?? null,
    updatedAtMs: w?.updatedAtMs ?? 0,
  };
}

export function toParticipant(w: any): TripParticipant {
  return {
    id: w.id, tripId: w.tripId, name: w.name, isCurrentUser: w.isCurrentUser === true || w.isCurrentUser === 1,
    colorHex: undef(w.colorHex), linkedUserId: undef(w.linkedUserId), createdAtMs: w.createdAtMs, updatedAtMs: w.updatedAtMs, deletedAtMs: undef(w.deletedAtMs),
  };
}

/** pwaTrips.listTrips / getTrip hydrated row → Trip. */
export function toHydratedTrip(h: any): Trip {
  const participants = (h.participants ?? []).map(toParticipant);
  const byId = new Map(participants.map((p: TripParticipant) => [p.id, p]));
  const expenses: TripExpense[] = (h.expenses ?? []).map((e: any) => ({
    id: e.id, tripId: e.tripId, transactionId: e.transactionId, paidByParticipantId: undef(e.paidByParticipantId), splitType: e.splitType,
    splitData: e.splitData ?? undefined, computedSplits: e.computedSplits ?? undefined, createdAtMs: e.createdAtMs, updatedAtMs: e.updatedAtMs, deletedAtMs: undefined,
    transaction: e.transaction ? toTransaction(e.transaction) : undefined, paidByParticipant: e.paidByParticipantId ? byId.get(e.paidByParticipantId) : undefined,
  }));
  const settlements: TripSettlement[] = (h.settlements ?? []).map((s: any) => ({
    id: s.id, tripId: s.tripId, fromParticipantId: s.fromParticipantId, toParticipantId: s.toParticipantId, amountCents: s.amountCents, date: s.date,
    note: undef(s.note), createdAtMs: s.createdAtMs, updatedAtMs: s.updatedAtMs, deletedAtMs: undefined,
    fromParticipant: byId.get(s.fromParticipantId), toParticipant: byId.get(s.toParticipantId),
  }));
  return {
    id: h.id, name: h.name, emoji: h.emoji, sortIndex: h.sortIndex ?? 0, isGroup: h.isGroup === true || h.isGroup === 1, isArchived: h.isArchived === true || h.isArchived === 1,
    startDate: undef(h.startDate), endDate: undef(h.endDate), budgetCents: undef(h.budgetCents), createdAtMs: h.createdAtMs, updatedAtMs: h.updatedAtMs, deletedAtMs: undefined,
    participants, expenses, settlements,
  };
}

/** pwaSharedTrips.getTrip → local Trip shape (mirrors native getHydratedTripForUser). */
export function sharedTripToTrip(d: any): Trip {
  const participants: TripParticipant[] = (d.participants ?? []).map((p: any) => ({
    id: p.id, tripId: d.id, name: p.name, isCurrentUser: p.id === d.myParticipantId, colorHex: undef(p.colorHex), linkedUserId: undef(p.linkedUserId),
    createdAtMs: p.createdAtMs, updatedAtMs: p.updatedAtMs, deletedAtMs: undefined,
  }));
  const byId = new Map(participants.map((p) => [p.id, p]));
  const expenses: TripExpense[] = (d.expenses ?? []).map((e: any) => ({
    id: e.id, tripId: e.tripId, transactionId: e.id, paidByParticipantId: undef(e.paidByParticipantId), splitType: e.splitType,
    splitData: e.splitData ?? undefined, computedSplits: e.computedSplits ?? undefined, createdAtMs: e.createdAtMs, updatedAtMs: e.updatedAtMs, deletedAtMs: undefined,
    categoryName: undef(e.categoryName), categoryEmoji: undef(e.categoryEmoji),
    transaction: { id: e.id, amountCents: e.amountCents, date: e.dateMs, note: undef(e.note), type: 'expense', systemType: null, createdAtMs: e.createdAtMs, updatedAtMs: e.updatedAtMs, deletedAtMs: undefined } as Transaction,
    paidByParticipant: e.paidByParticipantId ? byId.get(e.paidByParticipantId) : undefined,
  }));
  const settlements: TripSettlement[] = (d.settlements ?? []).map((s: any) => ({
    id: s.id, tripId: s.tripId, fromParticipantId: s.fromParticipantId, toParticipantId: s.toParticipantId, amountCents: s.amountCents, date: s.dateMs,
    note: undef(s.note), createdAtMs: s.createdAtMs, updatedAtMs: s.updatedAtMs, deletedAtMs: undefined, fromParticipant: byId.get(s.fromParticipantId), toParticipant: byId.get(s.toParticipantId),
  }));
  return {
    id: d.id, name: d.name, emoji: d.emoji, sortIndex: 0, isGroup: true, isArchived: false, startDate: undef(d.startDateMs), endDate: undef(d.endDateMs), budgetCents: undef(d.budgetCents),
    createdAtMs: d.createdAtMs, updatedAtMs: d.updatedAtMs, deletedAtMs: undefined, participants, expenses, settlements,
  };
}

export function toImportInboxItem(w: any): ImportInboxItem {
  return {
    id: w.id, source: w.source, externalIdHash: w.externalIdHash, externalIdLabel: w.externalIdLabel ?? null, apiKeyId: w.apiKeyId ?? null,
    idempotencyKeyHash: w.idempotencyKeyHash ?? null, payloadHash: w.payloadHash ?? null, status: w.status, type: w.type, amountCents: w.amountCents,
    currencyCode: w.currencyCode, dateMs: w.dateMs, merchantName: w.merchantName ?? null, note: w.note ?? null, accountId: w.accountId ?? null, categoryId: w.categoryId ?? null,
    possibleDuplicate: w.possibleDuplicate === true || w.possibleDuplicate === 1, duplicateSignals: w.duplicateSignals ?? null,
    confirmedTransactionId: w.confirmedTransactionId ?? null, confirmedAtMs: w.confirmedAtMs ?? null, ignoredAtMs: w.ignoredAtMs ?? null,
    createdAtMs: w.createdAtMs, updatedAtMs: w.updatedAtMs, deletedAtMs: undef(w.deletedAtMs),
  };
}

/** Merge canonical + virtual derived rows, newest first (native in-memory order). */
export function mergeLedger(snapshot: any): Transaction[] {
  const canonical = (snapshot?.transactions ?? []).map(toTransaction);
  const derived = (snapshot?.derivedRows ?? []).map(derivedToTransaction);
  return [...canonical, ...derived].sort((a, b) => b.date - a.date);
}
