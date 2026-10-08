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

describe('Default-account pinning edge cases (PR #3 review)', () => {
  async function seed(a: any) {
    const first = await a.mutation(api.pwaPersonal.createAccount, { name: 'First', emoji: '💵', kind: 'cash', openingBalanceCents: 100_000 });
    const second = await a.mutation(api.pwaPersonal.createAccount, { name: 'Second', emoji: '🏦', kind: 'savings', openingBalanceCents: 100_000 });
    const trip = await a.mutation(api.pwaTrips.createTrip, { name: 'Goa', emoji: '🏝️', isGroup: true, participants: [{ name: 'You', isCurrentUser: true }, { name: 'Sam', isCurrentUser: false }] });
    const me = trip.participants.find((p: any) => p.isCurrentUser);
    return { first, second, trip, me };
  }
  const cashflowAccount = async (a: any, tripExpenseId: string) =>
    ((await a.query(api.pwaPersonal.getSnapshot, {})).derivedRows as any[]).find((r) => r.systemType === 'trip_cashflow' && r.sourceTripExpenseId === tripExpenseId)?.accountId;
  const settingsRow = (defaultAccountId: string, updatedAtMs: number) => ({
    id: 'local', currencyCode: 'INR', hapticsEnabled: 1, defaultAccountId, hasSeenOnboarding: 1, syncTransactionFilters: 0, resetTransactionFiltersOnReopen: 0,
    transactionsFiltersJson: null, transactionsFiltersUpdatedAtMs: null, createdAtMs: updatedAtMs, updatedAtMs, deletedAtMs: null, syncVersion: 5, needsSync: 1,
  });

  it('a push carrying a new default AND new trip payments: only pre-existing payments are pinned', async () => {
    const t = setup();
    const a = t.withIdentity(USER_A);
    const { first, second, trip, me } = await seed(a);
    await a.mutation(api.pwaPersonal.updateSettings, { defaultAccountId: first.id });
    const old: any = await a.mutation(api.pwaTrips.createExpense, { tripId: trip.id, amountCents: 3000, date: 1_700_000_000_000, paidByParticipantId: me.id, splitType: 'equal' });

    const now = Date.now() + 60_000;
    await a.mutation(api.sync.push, {
      transactions: [{ id: 'tx-offline', amountCents: 1000, date: now, note: null, type: 'expense', systemType: null, accountId: null, categoryId: null, transferFromAccountId: null, transferToAccountId: null, tripExpenseId: 'te-offline', sourceType: 'manual', sourceImportInboxItemId: null, createdAtMs: now, updatedAtMs: now, deletedAtMs: null, syncVersion: 1, needsSync: 1 }],
      tripExpenses: [{ id: 'te-offline', tripId: trip.id, transactionId: 'tx-offline', paidByParticipantId: me.id, splitType: 'equal', splitDataJson: null, computedSplitsJson: JSON.stringify({ [me.id]: 500, [trip.participants.find((p: any) => !p.isCurrentUser).id]: 500 }), createdAtMs: now, updatedAtMs: now, deletedAtMs: null, syncVersion: 1, needsSync: 1 }],
      userSettings: [settingsRow(second.id, now)],
    });
    expect(await cashflowAccount(a, old.tripExpense.id)).toBe(first.id);   // history stays
    expect(await cashflowAccount(a, 'te-offline')).toBe(second.id);         // new payment follows the new default
  });

  it('a stale settings row that loses last-write-wins pins nothing', async () => {
    const t = setup();
    const a = t.withIdentity(USER_A);
    const { first, second, trip, me } = await seed(a);
    await a.mutation(api.pwaPersonal.updateSettings, { defaultAccountId: first.id });
    await a.mutation(api.pwaTrips.createExpense, { tripId: trip.id, amountCents: 3000, date: 1_700_000_000_000, paidByParticipantId: me.id, splitType: 'equal' });
    await a.mutation(api.sync.push, { userSettings: [settingsRow(second.id, 1)] }); // older than the server row
    expect((await a.query(api.pwaPersonal.getSettings, {})).defaultAccountId).toBe(first.id);
    const overrides = await t.run(async (ctx) => ctx.db.query('derivedAccountOverrides').collect());
    expect(overrides).toHaveLength(0);
  });

  it('reordering accounts with no explicit default does not move past payments', async () => {
    const t = setup();
    const a = t.withIdentity(USER_A);
    const { first, second, trip, me } = await seed(a);
    await a.mutation(api.pwaPersonal.updateSettings, { defaultAccountId: null });
    const exp: any = await a.mutation(api.pwaTrips.createExpense, { tripId: trip.id, amountCents: 3000, date: 1_700_000_000_000, paidByParticipantId: me.id, splitType: 'equal' });
    expect(await cashflowAccount(a, exp.tripExpense.id)).toBe(first.id); // first by sortIndex
    await a.mutation(api.pwaPersonal.reorderAccounts, { idsInOrder: [second.id, first.id] });
    expect(await cashflowAccount(a, exp.tripExpense.id)).toBe(first.id);
  });

  it('archiving the default keeps its past payments off the remaining live accounts', async () => {
    const t = setup();
    const a = t.withIdentity(USER_A);
    const { first, second, trip, me } = await seed(a);
    await a.mutation(api.pwaPersonal.updateSettings, { defaultAccountId: first.id });
    const exp: any = await a.mutation(api.pwaTrips.createExpense, { tripId: trip.id, amountCents: 3000, date: 1_700_000_000_000, paidByParticipantId: me.id, splitType: 'equal' });
    await a.mutation(api.pwaPersonal.archiveAccount, { id: first.id });
    expect(await cashflowAccount(a, exp.tripExpense.id)).toBe(first.id); // stays with the archived account, like native
    const accounts: any[] = await a.query(api.pwaPersonal.listAccounts, {});
    expect(accounts.map((x) => x.id)).toEqual([second.id]);
    expect(accounts[0].balanceCents).toBe(100_000);
  });

  it('ordinary categories created after a system category still sort before it', async () => {
    const t = setup();
    const a = t.withIdentity(USER_A);
    await a.mutation(api.pwaPersonal.createCategory, { name: 'Food', emoji: '🍔' });
    await a.mutation(api.pwaPersonal.createCategory, { name: 'System · Adjustment', emoji: '🛠', isSystem: true });
    const travel = await a.mutation(api.pwaPersonal.createCategory, { name: 'Travel', emoji: '✈️' });
    expect(travel.sortIndex).toBe(1);
  });

  it('archiving the last account keeps pinned trip payments and settlements (no live default left)', async () => {
    const t = setup();
    const a = t.withIdentity(USER_A);
    const only = await a.mutation(api.pwaPersonal.createAccount, { name: 'Only', emoji: '💵', kind: 'cash', openingBalanceCents: 0 });
    await a.mutation(api.pwaPersonal.updateSettings, { defaultAccountId: only.id });
    const trip = await a.mutation(api.pwaTrips.createTrip, { name: 'Goa', emoji: '🏝️', isGroup: true, participants: [{ name: 'You', isCurrentUser: true }, { name: 'Sam', isCurrentUser: false }] });
    const me = trip.participants.find((p: any) => p.isCurrentUser);
    const sam = trip.participants.find((p: any) => !p.isCurrentUser);
    const exp: any = await a.mutation(api.pwaTrips.createExpense, { tripId: trip.id, amountCents: 3000, date: 1_700_000_000_000, paidByParticipantId: me.id, splitType: 'equal' });
    await a.mutation(api.pwaTrips.createSettlement, { tripId: trip.id, fromParticipantId: sam.id, toParticipantId: me.id, amountCents: 1500, date: 1_700_000_100_000 });
    await a.mutation(api.pwaPersonal.archiveAccount, { id: only.id });
    const rows: any[] = (await a.query(api.pwaPersonal.getSnapshot, {})).derivedRows;
    expect(rows.find((r) => r.systemType === 'trip_cashflow' && r.sourceTripExpenseId === exp.tripExpense.id)?.accountId).toBe(only.id);
    expect(rows.filter((r) => r.systemType === 'trip_settlement').map((r) => r.accountId)).toEqual([only.id]);
  });
});
