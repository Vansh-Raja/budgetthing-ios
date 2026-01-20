import { describe, expect, it } from '@jest/globals';

import type { TripParticipant } from '../types';
import { computeTripDerivedRowsForUser } from '../tripAccounting/computeDerivedRows';

function participants(): TripParticipant[] {
  return [
    { id: 'A', tripId: 't', name: 'A', isCurrentUser: true, createdAtMs: 0, updatedAtMs: 0 },
    { id: 'B', tripId: 't', name: 'B', isCurrentUser: false, createdAtMs: 0, updatedAtMs: 0 },
  ];
}

describe('tripAccounting rules (shared + local)', () => {
  const baseInput = {
    defaultAccountId: 'acc1',
    tripLabel: '✈️ Trip',
    participants: participants(),
    meParticipantId: 'A',
    expenses: [
      {
        id: 'exp1',
        tripId: 't',
        amountCents: 3000,
        dateMs: 1000,
        note: 'Hotel',
        paidByParticipantId: 'A',
        splitType: 'equal',
        computedSplits: { A: 1250, B: 1750 },
        categoryEmoji: '🏨',
        categoryName: 'Hotel',
      },
    ],
    settlements: [],
  } as const;

  it('payer creates cashflow (full) + share (ledger) [shared]', () => {
    const rows = computeTripDerivedRowsForUser({ ...baseInput, derivedKey: 'user123' });
    const cashflow = rows.find((r) => r.systemType === 'trip_cashflow');
    const share = rows.find((r) => r.systemType === 'trip_share');

    expect(cashflow?.amountCents).toBe(3000);
    expect(cashflow?.accountId).toBe('acc1');
    expect(share?.amountCents).toBe(1250);
    expect(share?.accountId).toBeUndefined();
  });

  it('payer creates cashflow (full) + share (ledger) [local]', () => {
    const rows = computeTripDerivedRowsForUser({ ...baseInput, derivedKey: 'local' });
    const cashflow = rows.find((r) => r.systemType === 'trip_cashflow');
    const share = rows.find((r) => r.systemType === 'trip_share');

    expect(cashflow?.amountCents).toBe(3000);
    expect(cashflow?.accountId).toBe('acc1');
    expect(share?.amountCents).toBe(1250);
    expect(share?.accountId).toBeUndefined();
  });

  it('non-payer creates share only (no cashflow)', () => {
    const input = {
      ...baseInput,
      meParticipantId: 'B',
      participants: [
        { id: 'A', tripId: 't', name: 'A', isCurrentUser: false, createdAtMs: 0, updatedAtMs: 0 },
        { id: 'B', tripId: 't', name: 'B', isCurrentUser: true, createdAtMs: 0, updatedAtMs: 0 },
      ],
      expenses: [
        { ...baseInput.expenses[0], paidByParticipantId: 'A', computedSplits: { A: 1250, B: 1750 } },
      ],
    };

    const rows = computeTripDerivedRowsForUser({ ...(input as any), derivedKey: 'local' });
    expect(rows.some((r) => r.systemType === 'trip_cashflow')).toBe(false);
    const share = rows.find((r) => r.systemType === 'trip_share');
    expect(share?.amountCents).toBe(1750);
  });

  it('settlement creates payer outflow and receiver inflow', () => {
    const rows = computeTripDerivedRowsForUser({
      ...baseInput,
      expenses: [],
      settlements: [
        {
          id: 's1',
          tripId: 't',
          fromParticipantId: 'A',
          toParticipantId: 'B',
          amountCents: 500,
          dateMs: 2000,
          note: 'Payment',
        },
      ],
      derivedKey: 'local',
      meParticipantId: 'A',
    } as any);

    expect(rows.some((r) => r.systemType === 'trip_settlement' && r.type === 'expense')).toBe(true);
  });

  it('idempotent output (same input -> same IDs)', () => {
    const a = computeTripDerivedRowsForUser({ ...baseInput, derivedKey: 'user123' });
    const b = computeTripDerivedRowsForUser({ ...baseInput, derivedKey: 'user123' });
    expect(a.map((r) => r.id).sort()).toEqual(b.map((r) => r.id).sort());
  });
});
