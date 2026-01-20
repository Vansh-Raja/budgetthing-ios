import type { SystemType, TransactionType, TripParticipant } from '../types';
import { TripSplitCalculator } from '../tripSplitCalculator';
import {
  derivedTripCashflowId,
  derivedTripSettlementId,
  derivedTripShareId,
} from '../../sync/sharedTripDerivedIds';

export type TripExpenseInput = {
  id: string;
  tripId: string;
  amountCents: number;
  dateMs: number;
  note?: string | null;
  paidByParticipantId?: string | null;
  splitType: string;
  splitData?: Record<string, number> | null;
  computedSplits?: Record<string, number> | null;
  categoryName?: string | null;
  categoryEmoji?: string | null;
};

export type TripSettlementInput = {
  id: string;
  tripId: string;
  fromParticipantId: string;
  toParticipantId: string;
  amountCents: number;
  dateMs: number;
  note?: string | null;
};

export type DerivedTransactionUpsert = {
  id: string;
  amountCents: number;
  date: number;
  note?: string;
  type: TransactionType;
  systemType: SystemType;
  accountId?: string;
  sourceTripExpenseId?: string;
  sourceTripSettlementId?: string;
};

export type ComputeDerivedRowsInput = {
  derivedKey: string; // used for derived IDs
  defaultAccountId?: string | null;
  tripLabel?: string | null; // e.g. "✈️ Manali 2025"
  participants: TripParticipant[];
  meParticipantId: string;
  expenses: ReadonlyArray<TripExpenseInput>;
  settlements: ReadonlyArray<TripSettlementInput>;
};

export function computeTripDerivedRowsForUser(input: ComputeDerivedRowsInput): DerivedTransactionUpsert[] {
  const upserts: DerivedTransactionUpsert[] = [];
  const defaultAccountId = input.defaultAccountId ?? null;

  const participantById = new Map(input.participants.map((p) => [p.id, p]));
  const meId = input.meParticipantId;

  for (const expense of input.expenses) {
    const payerId = expense.paidByParticipantId ?? null;
    const payer = payerId ? participantById.get(payerId) : undefined;
    const totalAmount = Math.abs(expense.amountCents);

    // Resolve splits (prefer stored computedSplits).
    let splits = expense.computedSplits ?? undefined;
    if (!splits) {
      splits = TripSplitCalculator.calculateSplits(
        totalAmount,
        expense.splitType as any,
        input.participants,
        expense.splitData ?? undefined
      );
    }

    const myShare = splits?.[meId] ?? 0;

    // Cashflow: only if I paid.
    if (payer?.id === meId && defaultAccountId) {
      const parts: string[] = [];
      if (input.tripLabel) parts.push(input.tripLabel);
      if (expense.categoryEmoji && expense.categoryName) parts.push(`${expense.categoryEmoji} ${expense.categoryName}`);
      if (expense.note) parts.push(expense.note);

      upserts.push({
        id: derivedTripCashflowId(input.derivedKey, expense.id),
        amountCents: totalAmount,
        date: expense.dateMs,
        note: parts.length ? parts.join(' · ') : undefined,
        type: 'expense',
        systemType: 'trip_cashflow',
        accountId: defaultAccountId,
        sourceTripExpenseId: expense.id,
      });
    }

    // Ledger: my share (if I'm included).
    if (myShare > 0) {
      const parts: string[] = [];
      if (expense.categoryEmoji && expense.categoryName) parts.push(`${expense.categoryEmoji} ${expense.categoryName}`);
      if (expense.note) parts.push(expense.note);

      upserts.push({
        id: derivedTripShareId(input.derivedKey, expense.id),
        amountCents: myShare,
        date: expense.dateMs,
        note: parts.length ? parts.join(' · ') : undefined,
        type: 'expense',
        systemType: 'trip_share',
        sourceTripExpenseId: expense.id,
      });
    }
  }

  for (const settlement of input.settlements) {
    const from = participantById.get(settlement.fromParticipantId);
    const to = participantById.get(settlement.toParticipantId);
    const amountCents = Math.abs(settlement.amountCents);
    if (!defaultAccountId) continue;

    const baseParts: string[] = [];
    if (input.tripLabel) baseParts.push(input.tripLabel);
    if (from && to) baseParts.push(`Settle · ${from.name} → ${to.name}`);
    if (settlement.note) baseParts.push(settlement.note);
    const note = baseParts.length ? baseParts.join(' · ') : undefined;

    if (to?.id === meId) {
      upserts.push({
        id: derivedTripSettlementId(input.derivedKey, settlement.id, 'in'),
        amountCents,
        date: settlement.dateMs,
        note,
        type: 'income',
        systemType: 'trip_settlement',
        accountId: defaultAccountId,
        sourceTripSettlementId: settlement.id,
      });
    }

    if (from?.id === meId) {
      upserts.push({
        id: derivedTripSettlementId(input.derivedKey, settlement.id, 'out'),
        amountCents,
        date: settlement.dateMs,
        note,
        type: 'expense',
        systemType: 'trip_settlement',
        accountId: defaultAccountId,
        sourceTripSettlementId: settlement.id,
      });
    }
  }

  return upserts;
}
