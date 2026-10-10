import { describe, expect, it } from 'vitest';
import { api, internal } from '../../convex/_generated/api';
import { USER_A, USER_B, expectConvexError, setup } from './helpers';

/** Regression tests for PR #1/#2 review findings (Greptile + Codex). */

describe('Import API (PR #1 review)', () => {
  const item = (externalId: string, extra: Record<string, unknown> = {}) => ({
    externalId, type: 'expense', amountCents: 1250, currencyCode: 'INR', occurredAt: '2026-10-01T10:00:00Z', merchantName: 'Cafe', ...extra,
  });

  it('a batch with one invalid item writes no inbox rows', async () => {
    const t = setup();
    const a = t.withIdentity(USER_A);
    const { rawKey } = await a.mutation(api.apiImportKeys.create, { name: 'agent', expiresIn: '30d' });
    const res: any = await t.mutation(internal.apiImportHttp.createImportsForToken, {
      rawKey, idempotencyKey: 'k1', body: { source: 'test', items: [item('ok-1'), item('bad-2', { amountCents: -5 })] },
    });
    expect(res.statusCode).toBe(400);
    const rows = await t.run(async (ctx) => ctx.db.query('importInboxItems').collect());
    expect(rows).toHaveLength(0);
  });

  it('failed auth stops writing audit rows once the per-client limit is reached', async () => {
    const t = setup();
    for (let i = 0; i < 30; i++) {
      const res: any = await t.mutation(internal.apiImportHttp.metadataForToken, { rawKey: 'not-a-token', ipHash: 'ip-1' });
      expect(res.statusCode).toBe(401);
    }
    const audits = await t.run(async (ctx) => (await ctx.db.query('apiImportAuditEvents').collect()).filter((e: any) => e.eventType === 'auth_failed'));
    expect(audits).toHaveLength(20);
  });
});

describe('Import API failed-auth bound (PR #1 security review)', () => {
  it('varying the client IP cannot exceed the global failed-auth write cap', async () => {
    const t = setup();
    for (let i = 0; i < 400; i++) {
      const res: any = await t.mutation(internal.apiImportHttp.metadataForToken, { rawKey: 'not-a-token', ipHash: `forged-${i}` });
      expect(res.statusCode).toBe(401);
    }
    const audits = await t.run(async (ctx) => (await ctx.db.query('apiImportAuditEvents').collect()).filter((e: any) => e.eventType === 'auth_failed'));
    const rateRows = await t.run(async (ctx) => ctx.db.query('apiImportRateLimits').collect());
    expect(audits.length).toBeLessThanOrEqual(300);
    expect(rateRows.length).toBeLessThanOrEqual(301); // one global bucket + at most 300 per-IP rows
  });
});

describe('PWA ledger/trip edits (PR #2 review)', () => {
  async function seed(a: any) {
    const cash = await a.mutation(api.pwaPersonal.createAccount, { name: 'Cash', emoji: '💵', kind: 'cash', openingBalanceCents: 100_000 });
    const bank = await a.mutation(api.pwaPersonal.createAccount, { name: 'Bank', emoji: '🏦', kind: 'savings', openingBalanceCents: 100_000 });
    await a.mutation(api.pwaPersonal.updateSettings, { defaultAccountId: cash.id });
    return { cash, bank };
  }
  const cashflowFor = async (a: any, tripExpenseId: string) =>
    ((await a.query(api.pwaPersonal.getSnapshot, {})).derivedRows as any[]).find((r) => r.systemType === 'trip_cashflow' && r.sourceTripExpenseId === tripExpenseId);

  it('detail-screen edits succeed for transfers and trip expenses even though accountId is always sent', async () => {
    const t = setup();
    const a = t.withIdentity(USER_A);
    const { cash, bank } = await seed(a);
    const transfer: any = await a.mutation(api.pwaLedger.createTransfer, { fromAccountId: cash.id, toAccountId: bank.id, amountCents: 500, date: 1_700_000_000_000 });
    const edited: any = await a.mutation(api.pwaLedger.updateTransaction, { id: transfer.id, note: 'rent', accountId: null });
    expect(edited.note).toBe('rent');
    expect(edited.transferFromAccountId).toBe(cash.id);

    const solo = await a.mutation(api.pwaTrips.createTrip, { name: 'Solo', emoji: '🧳', isGroup: false, participants: [{ name: 'You', isCurrentUser: true }] });
    const soloExp: any = await a.mutation(api.pwaTrips.createExpense, { tripId: solo.id, amountCents: 1000, date: 1_700_000_000_000, splitType: 'equal', accountId: cash.id });
    const soloEdited: any = await a.mutation(api.pwaLedger.updateTransaction, { id: soloExp.transaction.id, accountId: bank.id, note: 'moved' });
    expect(soloEdited.accountId).toBe(bank.id); // solo trips really charge an account

    const group = await a.mutation(api.pwaTrips.createTrip, { name: 'Group', emoji: '🏝️', isGroup: true, participants: [{ name: 'You', isCurrentUser: true }, { name: 'Sam', isCurrentUser: false }] });
    const me = group.participants.find((p: any) => p.isCurrentUser);
    const gExp: any = await a.mutation(api.pwaTrips.createExpense, { tripId: group.id, amountCents: 3000, date: 1_700_000_000_000, paidByParticipantId: me.id, splitType: 'equal' });
    const gEdited: any = await a.mutation(api.pwaLedger.updateTransaction, { id: gExp.transaction.id, note: 'note only', accountId: null });
    expect(gEdited.note).toBe('note only');
    expect(gEdited.accountId).toBeUndefined();
    // Choosing an account on a group expense moves its "you paid" cashflow, base stays ledger-only.
    await a.mutation(api.pwaLedger.updateTransaction, { id: gExp.transaction.id, accountId: bank.id });
    expect((await cashflowFor(a, gExp.tripExpense.id)).accountId).toBe(bank.id);
    expect((await a.query(api.pwaPersonal.getSnapshot, {})).transactions.find((x: any) => x.id === gExp.transaction.id).accountId).toBeUndefined();
  });

  it('calculator group saves keep the chosen account (createExpense and linkExpense)', async () => {
    const t = setup();
    const a = t.withIdentity(USER_A);
    const { bank } = await seed(a);
    const group = await a.mutation(api.pwaTrips.createTrip, { name: 'G', emoji: '🏝️', isGroup: true, participants: [{ name: 'You', isCurrentUser: true }, { name: 'Sam', isCurrentUser: false }] });
    const me = group.participants.find((p: any) => p.isCurrentUser);
    const created: any = await a.mutation(api.pwaTrips.createExpense, { tripId: group.id, amountCents: 2000, date: 1_700_000_000_000, paidByParticipantId: me.id, splitType: 'equal', accountId: bank.id });
    expect((await cashflowFor(a, created.tripExpense.id)).accountId).toBe(bank.id);

    const tx: any = await a.mutation(api.pwaLedger.createTransaction, { amountCents: 4000, date: 1_700_000_100_000, type: 'expense', accountId: bank.id });
    const link: any = await a.mutation(api.pwaTrips.linkExpense, { tripId: group.id, transactionId: tx.id, paidByParticipantId: me.id, splitType: 'equal' });
    expect((await cashflowFor(a, link.id)).accountId).toBe(bank.id);
  });

  it('changing a group expense amount recomputes its stored splits; exact splits must be edited together', async () => {
    const t = setup();
    const a = t.withIdentity(USER_A);
    await seed(a);
    const group = await a.mutation(api.pwaTrips.createTrip, { name: 'G', emoji: '🏝️', isGroup: true, participants: [{ name: 'You', isCurrentUser: true }, { name: 'Sam', isCurrentUser: false }] });
    const [me, sam] = [group.participants.find((p: any) => p.isCurrentUser), group.participants.find((p: any) => !p.isCurrentUser)];
    const eq: any = await a.mutation(api.pwaTrips.createExpense, { tripId: group.id, amountCents: 3000, date: 1_700_000_000_000, paidByParticipantId: me.id, splitType: 'equal' });
    await a.mutation(api.pwaLedger.updateTransaction, { id: eq.transaction.id, amountCents: 5000 });
    const after: any = await a.query(api.pwaTrips.getTrip, { id: group.id });
    expect(after.expenses.find((e: any) => e.id === eq.tripExpense.id).computedSplits).toEqual({ [me.id]: 2500, [sam.id]: 2500 });
    const share = ((await a.query(api.pwaPersonal.getSnapshot, {})).derivedRows as any[]).find((r) => r.systemType === 'trip_share' && r.sourceTripExpenseId === eq.tripExpense.id);
    expect(share.amountCents).toBe(2500);

    const ex: any = await a.mutation(api.pwaTrips.createExpense, { tripId: group.id, amountCents: 1000, date: 1_700_000_100_000, paidByParticipantId: me.id, splitType: 'exact', splitData: { [me.id]: 600, [sam.id]: 400 } });
    await expectConvexError(a.mutation(api.pwaLedger.updateTransaction, { id: ex.transaction.id, amountCents: 2000 }), 'VALIDATION');
    const together: any = await a.mutation(api.pwaTrips.updateExpense, { tripExpenseId: ex.tripExpense.id, amountCents: 2000, splitType: 'exact', splitData: { [me.id]: 1200, [sam.id]: 800 } });
    expect(together.transaction.amountCents).toBe(2000);
    expect(together.tripExpense.computedSplits).toEqual({ [me.id]: 1200, [sam.id]: 800 });
  });

  it('switching a trip to group keeps exactly one current user', async () => {
    const t = setup();
    const a = t.withIdentity(USER_A);
    const trip = await a.mutation(api.pwaTrips.createTrip, { name: 'T', emoji: '🧳', isGroup: false, participants: [] });
    await a.mutation(api.pwaTrips.updateTrip, { id: trip.id, isGroup: true });
    const after: any = await a.query(api.pwaTrips.getTrip, { id: trip.id });
    expect(after.isGroup).toBe(true);
    expect(after.participants.filter((p: any) => p.isCurrentUser)).toHaveLength(1);
  });

  it('exact splits must be whole cents', async () => {
    const t = setup();
    const a = t.withIdentity(USER_A);
    await seed(a);
    const group = await a.mutation(api.pwaTrips.createTrip, { name: 'G', emoji: '🏝️', isGroup: true, participants: [{ name: 'You', isCurrentUser: true }, { name: 'Sam', isCurrentUser: false }] });
    const [me, sam] = [group.participants.find((p: any) => p.isCurrentUser), group.participants.find((p: any) => !p.isCurrentUser)];
    await expectConvexError(a.mutation(api.pwaTrips.createExpense, { tripId: group.id, amountCents: 100, date: 1_700_000_000_000, paidByParticipantId: me.id, splitType: 'exact', splitData: { [me.id]: 33.5, [sam.id]: 66.5 } }), 'VALIDATION');
  });

  it('watchTrip returns null (not an error) for non-members, for live web subscriptions', async () => {
    const t = setup();
    const a = t.withIdentity(USER_A);
    const b = t.withIdentity(USER_B);
    const created: any = await a.mutation(api.sharedTrips.create, { name: 'S', emoji: '🏔️', participantName: 'Alice' });
    expect(await b.query(api.pwaSharedTrips.watchTrip, { tripId: created.tripId })).toBeNull();
    expect((await a.query(api.pwaSharedTrips.watchTrip, { tripId: created.tripId }))?.id).toBe(created.tripId);
  });
});
