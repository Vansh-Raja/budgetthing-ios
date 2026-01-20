import { stableStringify } from '../stableStringify';
import {
  idempotentSharedTripExpenseId,
  idempotentSharedTripSettlementId,
  idempotentTripSettlementId,
} from '../idempotency';

describe('stableStringify', () => {
  it('sorts object keys deterministically', () => {
    const a = stableStringify({ b: 1, a: 2 } as any);
    const b = stableStringify({ a: 2, b: 1 } as any);
    expect(a).toBe(b);
  });
});

describe('idempotency ids', () => {
  it('settlement ids are stable within 5s bucket', () => {
    const id1 = idempotentTripSettlementId({
      tripId: 't1',
      fromParticipantId: 'p1',
      toParticipantId: 'p2',
      amountCents: 12345,
      dateMs: 10_000,
      note: 'Payment',
    });
    const id2 = idempotentTripSettlementId({
      tripId: 't1',
      fromParticipantId: 'p1',
      toParticipantId: 'p2',
      amountCents: 12345,
      dateMs: 14_999,
      note: 'Payment',
    });
    expect(id1).toBe(id2);
  });

  it('settlement ids change across 5s bucket boundary', () => {
    const id1 = idempotentSharedTripSettlementId({
      tripId: 't1',
      fromParticipantId: 'p1',
      toParticipantId: 'p2',
      amountCents: 500,
      dateMs: 10_000,
      note: 'Payment',
    });
    const id2 = idempotentSharedTripSettlementId({
      tripId: 't1',
      fromParticipantId: 'p1',
      toParticipantId: 'p2',
      amountCents: 500,
      dateMs: 15_000,
      note: 'Payment',
    });
    expect(id1).not.toBe(id2);
  });

  it('shared expense ids are stable despite key order', () => {
    const id1 = idempotentSharedTripExpenseId({
      tripId: 't1',
      amountCents: 1000,
      dateMs: 10_000,
      paidByParticipantId: 'p1',
      splitType: 'exact',
      splitData: { a: 1, b: 2 },
      computedSplits: { b: 200, a: 100 },
      categoryName: 'Food',
      categoryEmoji: '🍔',
      note: 'Lunch',
    });

    const id2 = idempotentSharedTripExpenseId({
      tripId: 't1',
      amountCents: 1000,
      dateMs: 10_999,
      paidByParticipantId: 'p1',
      splitType: 'exact',
      splitData: { b: 2, a: 1 },
      computedSplits: { a: 100, b: 200 },
      categoryName: 'Food',
      categoryEmoji: '🍔',
      note: 'Lunch',
    });
    expect(id1).toBe(id2);
  });
});
