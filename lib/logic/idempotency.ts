import { hashStringToBase36 } from './hash';
import { stableStringify } from './stableStringify';

const WINDOW_MS = 5000;

export function idempotencyBucket(ms: number) {
  return Math.floor(ms / WINDOW_MS);
}

function makeId(prefix: string, payload: string) {
  return `${prefix}_${hashStringToBase36(payload)}`;
}

export function idempotentTripSettlementId(input: {
  tripId: string;
  fromParticipantId: string;
  toParticipantId: string;
  amountCents: number;
  dateMs: number;
  note?: string | null;
}) {
  const bucket = idempotencyBucket(input.dateMs);
  const payload = [
    input.tripId,
    input.fromParticipantId,
    input.toParticipantId,
    String(Math.abs(input.amountCents)),
    String(bucket),
    (input.note ?? '').trim(),
  ].join('|');
  return makeId('idem_trip_settlement', payload);
}

export function idempotentSharedTripSettlementId(input: {
  tripId: string;
  fromParticipantId: string;
  toParticipantId: string;
  amountCents: number;
  dateMs: number;
  note?: string | null;
}) {
  const bucket = idempotencyBucket(input.dateMs);
  const payload = [
    input.tripId,
    input.fromParticipantId,
    input.toParticipantId,
    String(Math.abs(input.amountCents)),
    String(bucket),
    (input.note ?? '').trim(),
  ].join('|');
  return makeId('idem_shared_trip_settlement', payload);
}

export function idempotentSharedTripExpenseId(input: {
  tripId: string;
  amountCents: number;
  dateMs: number;
  paidByParticipantId?: string | null;
  splitType: string;
  splitData?: Record<string, number> | null;
  computedSplits?: Record<string, number> | null;
  categoryName?: string | null;
  categoryEmoji?: string | null;
  note?: string | null;
}) {
  const bucket = idempotencyBucket(input.dateMs);
  const payloadObj = {
    tripId: input.tripId,
    amountCents: Math.abs(input.amountCents),
    bucket,
    paidByParticipantId: input.paidByParticipantId ?? null,
    splitType: input.splitType,
    splitData: input.splitData ?? null,
    computedSplits: input.computedSplits ?? null,
    categoryName: (input.categoryName ?? '').trim() || null,
    categoryEmoji: (input.categoryEmoji ?? '').trim() || null,
    note: (input.note ?? '').trim() || null,
  };
  return makeId('idem_shared_trip_expense', stableStringify(payloadObj as any));
}

export function idempotentTransferTransactionId(input: {
  transferFromAccountId: string;
  transferToAccountId: string;
  amountCents: number;
  dateMs: number;
  note?: string | null;
}) {
  const bucket = idempotencyBucket(input.dateMs);
  const payload = [
    input.transferFromAccountId,
    input.transferToAccountId,
    String(Math.abs(input.amountCents)),
    String(bucket),
    (input.note ?? '').trim(),
  ].join('|');
  return makeId('idem_transfer', payload);
}

export function idempotentAdjustmentTransactionId(input: {
  accountId: string;
  amountCents: number;
  dateMs: number;
  note?: string | null;
}) {
  const bucket = idempotencyBucket(input.dateMs);
  const payload = [
    input.accountId,
    String(input.amountCents),
    String(bucket),
    (input.note ?? '').trim(),
  ].join('|');
  return makeId('idem_adjustment', payload);
}
