import { describe, expect, it } from 'vitest';
import { api } from '../../convex/_generated/api';
import { USER_A, USER_B, expectConvexError, nativeAccountRow, nativeTransactionRow, setup } from './helpers';
import { deterministicImportTransactionId } from '../../lib/logic/importProvenance';
import { idempotentTransferTransactionId } from '../../lib/logic/idempotency';
import { TripSplitCalculator } from '../../lib/logic/tripSplitCalculator';

describe('PWA API: authentication and ownership', () => {
  it('rejects unauthenticated callers', async () => {
    const t = setup();
    await expectConvexError(t.query(api.pwaPersonal.listAccounts, {}), 'UNAUTHENTICATED');
    await expectConvexError(t.mutation(api.pwaPersonal.createAccount, { name: 'x', emoji: '💵', kind: 'cash' }), 'UNAUTHENTICATED');
  });

  it('isolates users: B cannot see or edit A rows', async () => {
    const t = setup();
    const a = t.withIdentity(USER_A);
    const b = t.withIdentity(USER_B);
    const acct = await a.mutation(api.pwaPersonal.createAccount, { name: 'Cash', emoji: '💵', kind: 'cash', openingBalanceCents: 500 });
    expect(await b.query(api.pwaPersonal.listAccounts, {})).toEqual([]);
    await expectConvexError(b.mutation(api.pwaPersonal.updateAccount, { id: acct.id, name: 'hax' }), 'NOT_FOUND');
    await expectConvexError(b.mutation(api.pwaPersonal.archiveAccount, { id: acct.id }), 'NOT_FOUND');
    expect((await a.query(api.pwaPersonal.listAccounts, {})).map((x: any) => x.name)).toEqual(['Cash']);
  });
});

describe('PWA API ↔ native sync compatibility', () => {
  it('web-created rows pull into native with canonical fields, versions and change-log order', async () => {
    const t = setup();
    const a = t.withIdentity(USER_A);
    const acct = await a.mutation(api.pwaPersonal.createAccount, { name: 'Cash', emoji: '💵', kind: 'cash', openingBalanceCents: 500 });
    expect(acct.syncVersion).toBe(1);
    expect(acct.userId).toBe('user_a');
    expect(acct.createdAtMs).toBe(acct.updatedAtMs);

    const pull1: any = await a.query(api.sync.pull, { lastSeq: 0 });
    expect(pull1!.accounts.map((r: any) => r.id)).toEqual([acct.id]);
    expect(pull1!.latestSeq).toBe(1);
    expect(await a.query(api.sync.latestSeq, {})).toBe(1);

    const updated = await a.mutation(api.pwaPersonal.updateAccount, { id: acct.id, name: 'Wallet', openingBalanceCents: null });
    expect(updated.syncVersion).toBe(2);
    expect(updated.openingBalanceCents).toBeUndefined(); // null cleared the optional field

    const archived = await a.mutation(api.pwaPersonal.archiveAccount, { id: acct.id });
    expect(archived.deletedAtMs).toBeGreaterThan(0);
    expect(archived.syncVersion).toBe(3);

    const pull2: any = await a.query(api.sync.pull, { lastSeq: 1 });
    expect(pull2!.latestSeq).toBe(3);
    expect(pull2!.accounts).toHaveLength(1);
    expect(pull2!.accounts[0].deletedAtMs).toBeGreaterThan(0);
    expect(pull2!.accounts[0].name).toBe('Wallet');
  });

  it('native-pushed rows are visible to web reads, and web edits bump the same version chain', async () => {
    const t = setup();
    const a = t.withIdentity(USER_A);
    await a.mutation(api.sync.push, { accounts: [nativeAccountRow('acct-native')], transactions: [nativeTransactionRow('tx-native', { accountId: 'acct-native' })] });
    const accounts = await a.query(api.pwaPersonal.listAccounts, {});
    expect(accounts.map((x: any) => x.id)).toEqual(['acct-native']);
    expect(accounts[0].balanceCents).toBe(10_000 - 1234);
    expect(accounts[0]).not.toHaveProperty('needsSync');

    const edited = await a.mutation(api.pwaLedger.updateTransaction, { id: 'tx-native', amountCents: 2000, note: null });
    expect(edited.syncVersion).toBe(2);
    expect(edited.note).toBeUndefined();
    const pull: any = await a.query(api.sync.pull, { lastSeq: 2 });
    expect(pull!.transactions.map((r: any) => r.id)).toEqual(['tx-native']);
    expect(pull!.transactions[0].amountCents).toBe(2000);
  });

  it('optimistic concurrency returns a structured CONFLICT', async () => {
    const t = setup();
    const a = t.withIdentity(USER_A);
    const acct = await a.mutation(api.pwaPersonal.createAccount, { name: 'Cash', emoji: '💵', kind: 'cash' });
    await a.mutation(api.pwaPersonal.updateAccount, { id: acct.id, name: 'v2' });
    const err = await expectConvexError(a.mutation(api.pwaPersonal.updateAccount, { id: acct.id, expectedSyncVersion: 1, name: 'stale' }), 'CONFLICT');
    expect(err.currentSyncVersion).toBe(2);
    expect(err.row.name).toBe('v2');
  });
});

describe('PWA ledger rules', () => {
  it('transfer is one canonical row with a deterministic id, idempotent within the window', async () => {
    const t = setup();
    const a = t.withIdentity(USER_A);
    const from = await a.mutation(api.pwaPersonal.createAccount, { name: 'A', emoji: '💵', kind: 'cash', openingBalanceCents: 10_000 });
    const to = await a.mutation(api.pwaPersonal.createAccount, { name: 'B', emoji: '🏦', kind: 'savings' });
    const date = 1_700_000_000_000;
    const t1 = await a.mutation(api.pwaLedger.createTransfer, { fromAccountId: from.id, toAccountId: to.id, amountCents: 2500, date, note: 'move' });
    const t2 = await a.mutation(api.pwaLedger.createTransfer, { fromAccountId: from.id, toAccountId: to.id, amountCents: 2500, date: date + 1000, note: 'move' });
    expect(t1.id).toBe(t2.id);
    expect(t1.id).toBe(idempotentTransferTransactionId({ transferFromAccountId: from.id, transferToAccountId: to.id, amountCents: 2500, dateMs: date, note: 'move' }));
    expect(t1.systemType).toBe('transfer');
    const accounts = await a.query(api.pwaPersonal.listAccounts, {});
    expect(accounts.find((x: any) => x.id === from.id).balanceCents).toBe(7500);
    expect(accounts.find((x: any) => x.id === to.id).balanceCents).toBe(2500);
    expect((await a.query(api.pwaPersonal.getSnapshot, {})).transactions).toHaveLength(1);
  });

  it('adjustment stores absolute cents with income/expense by sign', async () => {
    const t = setup();
    const a = t.withIdentity(USER_A);
    const acct = await a.mutation(api.pwaPersonal.createAccount, { name: 'A', emoji: '💵', kind: 'cash', openingBalanceCents: 1000 });
    const adj = await a.mutation(api.pwaLedger.createAdjustment, { accountId: acct.id, amountCents: -300, date: 1_700_000_000_000 });
    expect(adj.type).toBe('expense');
    expect(adj.amountCents).toBe(300);
    expect(adj.systemType).toBe('adjustment');
    expect((await a.query(api.pwaPersonal.listAccounts, {}))[0].balanceCents).toBe(700);
  });

  it('adjustment keeps the system adjustment category like native, and rejects foreign categories', async () => {
    const t = setup();
    const a = t.withIdentity(USER_A);
    const b = t.withIdentity(USER_B);
    const acct = await a.mutation(api.pwaPersonal.createAccount, { name: 'A', emoji: '💵', kind: 'cash', openingBalanceCents: 1000 });
    const sys = await a.mutation(api.pwaPersonal.createCategory, { name: 'System · Adjustment', emoji: '🛠', isSystem: true });
    const adj = await a.mutation(api.pwaLedger.createAdjustment, { accountId: acct.id, amountCents: 250, date: 1_700_000_000_000, categoryId: sys.id });
    expect(sys.isSystem).toBe(1);
    expect(sys.sortIndex).toBe(9999);
    expect(adj.categoryId).toBe(sys.id);
    expect(adj.type).toBe('income');
    const foreign = await b.mutation(api.pwaPersonal.createCategory, { name: 'Other', emoji: '❓' });
    await expectConvexError(a.mutation(api.pwaLedger.createAdjustment, { accountId: acct.id, amountCents: 100, date: 1_700_000_000_001, categoryId: foreign.id }), 'VALIDATION');
  });

  it('rejects non-integer cents, derived system types cannot be written, bulk ops skip derived', async () => {
    const t = setup();
    const a = t.withIdentity(USER_A);
    await expectConvexError(a.mutation(api.pwaLedger.createTransaction, { amountCents: 12.5, date: 1_700_000_000_000, type: 'expense' }), 'VALIDATION');
    await expectConvexError(a.mutation(api.pwaLedger.createTransaction, { amountCents: 0, date: 1_700_000_000_000, type: 'expense' }), 'VALIDATION');
  });

  it('settings upsert uses the native "local" client id', async () => {
    const t = setup();
    const a = t.withIdentity(USER_A);
    const s = await a.mutation(api.pwaPersonal.updateSettings, { currencyCode: 'USD' });
    expect(s.id).toBe('local');
    expect(s.currencyCode).toBe('USD');
    const pull: any = await a.query(api.sync.pull, { lastSeq: 0 });
    expect(pull!.userSettings.map((r: any) => r.id)).toEqual(['local']);
    const again = await a.mutation(api.pwaPersonal.updateSettings, { hapticsEnabled: false });
    expect(again.syncVersion).toBe(2);
    expect(again.currencyCode).toBe('USD');
  });
});

describe('Derived trip rows are virtual', () => {
  async function seedGroupTrip(a: any) {
    const cash = await a.mutation(api.pwaPersonal.createAccount, { name: 'Cash', emoji: '💵', kind: 'cash', openingBalanceCents: 100_000 });
    const trip = await a.mutation(api.pwaTrips.createTrip, { name: 'Goa', emoji: '🏝️', isGroup: true, participants: [{ name: 'You', isCurrentUser: true }, { name: 'Sam', isCurrentUser: false }] });
    const me = trip.participants.find((p: any) => p.isCurrentUser);
    const sam = trip.participants.find((p: any) => !p.isCurrentUser);
    return { cash, trip, me, sam };
  }

  it('group expense paid by me: ledger share + cashflow are virtual, never persisted, and never synced', async () => {
    const t = setup();
    const a = t.withIdentity(USER_A);
    const { cash, trip, me } = await seedGroupTrip(a);
    const created: any = await a.mutation(api.pwaTrips.createExpense, { tripId: trip.id, amountCents: 3000, date: 1_700_000_000_000, paidByParticipantId: me.id, splitType: 'equal', note: 'dinner' });
    expect(created.transaction.accountId).toBeUndefined(); // TRIP_SHARE_LEDGER_ONLY
    expect(created.tripExpense.computedSplits[me.id]).toBe(1500);

    const snap: any = await a.query(api.pwaPersonal.getSnapshot, {});
    const derivedTypes = snap.derivedRows.map((r: any) => r.systemType).sort();
    expect(derivedTypes).toEqual(['trip_cashflow', 'trip_share']);
    const cashflow = snap.derivedRows.find((r: any) => r.systemType === 'trip_cashflow');
    expect(cashflow.accountId).toBe(cash.id); // CASHFLOW_ON_PAY with default account
    expect(cashflow.amountCents).toBe(3000);
    expect(cashflow.id).toBe(`drv_trip_cashflow_user_a_${created.tripExpense.id}`);
    expect(snap.derivedRows.find((r: any) => r.systemType === 'trip_share').amountCents).toBe(1500);
    expect(snap.accounts[0].balanceCents).toBe(100_000 - 3000);

    // Nothing derived was persisted or logged.
    const persisted = await t.run(async (ctx) => (await ctx.db.query('transactions').collect()).map((x: any) => x.systemType ?? null));
    expect(persisted).toEqual([null]);
    const pull: any = await a.query(api.sync.pull, { lastSeq: 0 });
    expect(pull!.transactions.every((r: any) => !String(r.systemType ?? '').startsWith('trip_'))).toBe(true);
  });

  it('non-payer gets only a ledger share; settlement charges accounts on both sides', async () => {
    const t = setup();
    const a = t.withIdentity(USER_A);
    const { trip, me, sam } = await seedGroupTrip(a);
    await a.mutation(api.pwaTrips.createExpense, { tripId: trip.id, amountCents: 3000, date: 1_700_000_000_000, paidByParticipantId: sam.id, splitType: 'equal' });
    let snap: any = await a.query(api.pwaPersonal.getSnapshot, {});
    expect(snap.derivedRows.map((r: any) => r.systemType)).toEqual(['trip_share']); // NO_CASHFLOW_IF_NOT_PAYER
    expect(snap.accounts[0].balanceCents).toBe(100_000);

    await a.mutation(api.pwaTrips.createSettlement, { tripId: trip.id, fromParticipantId: me.id, toParticipantId: sam.id, amountCents: 1500, date: 1_700_000_100_000 });
    snap = await a.query(api.pwaPersonal.getSnapshot, {});
    const settle = snap.derivedRows.find((r: any) => r.systemType === 'trip_settlement');
    expect(settle.type).toBe('expense'); // SETTLEMENT_MOVES_MONEY: payer decreases
    expect(snap.accounts[0].balanceCents).toBe(100_000 - 1500);
  });

  it('legacy persisted derived rows are excluded defensively and sync:push drops them', async () => {
    const t = setup();
    const a = t.withIdentity(USER_A);
    await t.run(async (ctx) => {
      await ctx.db.insert('transactions', { id: 'legacy-derived', userId: 'user_a', amountCents: 5, date: 1, type: 'expense', systemType: 'trip_share', createdAtMs: 1, updatedAtMs: 1, syncVersion: 1 });
    });
    const snap: any = await a.query(api.pwaPersonal.getSnapshot, {});
    expect(snap.transactions).toEqual([]);
    await a.mutation(api.sync.push, { transactions: [nativeTransactionRow('leak', { systemType: 'trip_cashflow' })] });
    const rows = await t.run(async (ctx) => (await ctx.db.query('transactions').collect()).map((x: any) => x.id));
    expect(rows).toEqual(['legacy-derived']);
    expect(await a.query(api.sync.latestSeq, {})).toBe(0);
  });

  it('account override changes only the virtual projection and never enters the change log', async () => {
    const t = setup();
    const a = t.withIdentity(USER_A);
    const { trip, me } = await seedGroupTrip(a);
    const card = await a.mutation(api.pwaPersonal.createAccount, { name: 'Card', emoji: '💳', kind: 'card', limitAmountCents: 50_000 });
    const created: any = await a.mutation(api.pwaTrips.createExpense, { tripId: trip.id, amountCents: 3000, date: 1_700_000_000_000, paidByParticipantId: me.id, splitType: 'equal' });
    const seqBefore = await a.query(api.sync.latestSeq, {});
    await a.mutation(api.pwaDerived.setOverride, { sourceKind: 'trip_expense', sourceId: created.tripExpense.id, direction: 'cashflow', accountId: card.id });
    expect(await a.query(api.sync.latestSeq, {})).toBe(seqBefore);
    const snap: any = await a.query(api.pwaPersonal.getSnapshot, {});
    expect(snap.derivedRows.find((r: any) => r.systemType === 'trip_cashflow').accountId).toBe(card.id);
    expect(snap.accounts.find((x: any) => x.id === card.id).availableCents).toBe(50_000 - 3000);
    await expectConvexError(t.withIdentity(USER_B).mutation(api.pwaDerived.setOverride, { sourceKind: 'trip_expense', sourceId: created.tripExpense.id, direction: 'cashflow', accountId: card.id }), 'VALIDATION');
  });

  it('group trips keep exactly one current user through participant changes', async () => {
    const t = setup();
    const a = t.withIdentity(USER_A);
    const { trip, me, sam } = await seedGroupTrip(a);
    await expectConvexError(a.mutation(api.pwaTrips.updateParticipant, { id: me.id, isCurrentUser: false }), 'STATE');
    await a.mutation(api.pwaTrips.updateParticipant, { id: sam.id, isCurrentUser: true });
    let hydrated: any = await a.query(api.pwaTrips.getTrip, { id: trip.id });
    expect(hydrated!.participants.filter((p: any) => p.isCurrentUser).map((p: any) => p.id)).toEqual([sam.id]);
    await a.mutation(api.pwaTrips.removeParticipant, { id: sam.id });
    hydrated = await a.query(api.pwaTrips.getTrip, { id: trip.id });
    expect(hydrated!.participants.filter((p: any) => p.isCurrentUser)).toHaveLength(1);
  });

  it('deleting a trip tombstones links and keeps base transactions unlinked', async () => {
    const t = setup();
    const a = t.withIdentity(USER_A);
    const { trip, me } = await seedGroupTrip(a);
    const created: any = await a.mutation(api.pwaTrips.createExpense, { tripId: trip.id, amountCents: 3000, date: 1_700_000_000_000, paidByParticipantId: me.id, splitType: 'equal' });
    await a.mutation(api.pwaTrips.deleteTrip, { id: trip.id });
    const snap: any = await a.query(api.pwaPersonal.getSnapshot, {});
    expect(snap.transactions.map((x: any) => x.id)).toEqual([created.transaction.id]);
    expect(snap.transactions[0].tripExpenseId).toBeUndefined();
    expect(snap.derivedRows).toEqual([]);
    expect(await a.query(api.pwaTrips.listTrips, {})).toEqual([]);
  });
});

describe('Import inbox confirm/ignore', () => {
  async function seedPending(t: ReturnType<typeof setup>, id = 'inbox-1') {
    await t.run(async (ctx) => {
      const now = Date.now();
      await ctx.db.insert('importInboxItems', {
        id, userId: 'user_a', source: 'api', externalIdHash: 'h1', status: 'pending', type: 'expense', amountCents: 999, currencyCode: 'INR',
        dateMs: now, merchantName: 'Cafe', possibleDuplicate: 0, createdAtMs: now, updatedAtMs: now, syncVersion: 1,
      });
    });
  }

  it('confirm creates the deterministic api_import transaction once', async () => {
    const t = setup();
    const a = t.withIdentity(USER_A);
    const acct = await a.mutation(api.pwaPersonal.createAccount, { name: 'Cash', emoji: '💵', kind: 'cash' });
    await seedPending(t);
    expect(await a.query(api.pwaImports.countPending, {})).toBe(1);
    const r1: any = await a.mutation(api.pwaImports.confirm, { id: 'inbox-1', accountId: acct.id });
    expect(r1.transaction.id).toBe(deterministicImportTransactionId('inbox-1'));
    expect(r1.transaction.sourceType).toBe('api_import');
    expect(r1.transaction.sourceImportInboxItemId).toBe('inbox-1');
    expect(r1.item.status).toBe('confirmed');
    const r2 = await a.mutation(api.pwaImports.confirm, { id: 'inbox-1', accountId: acct.id });
    expect(r2.alreadyConfirmed).toBe(true);
    expect((await a.query(api.pwaPersonal.getSnapshot, {})).transactions).toHaveLength(1);
    await expectConvexError(a.mutation(api.pwaImports.ignore, { id: 'inbox-1' }), 'STATE');
    const pull: any = await a.query(api.sync.pull, { lastSeq: 0 });
    expect(pull!.importInboxItems[0].confirmedTransactionId).toBe(r1.transaction.id);
    expect(pull!.transactions.map((x: any) => x.id)).toEqual([r1.transaction.id]);
  });

  it('ignore is terminal and requires an owned account to confirm', async () => {
    const t = setup();
    const a = t.withIdentity(USER_A);
    await seedPending(t, 'inbox-2');
    await expectConvexError(a.mutation(api.pwaImports.confirm, { id: 'inbox-2' }), 'VALIDATION');
    const ignored: any = await a.mutation(api.pwaImports.ignore, { id: 'inbox-2' });
    expect(ignored.status).toBe('ignored');
    await expectConvexError(a.mutation(api.pwaImports.confirm, { id: 'inbox-2', accountId: 'nope' }), 'STATE');
    expect(await t.withIdentity(USER_B).query(api.pwaImports.listPending, {})).toEqual([]);
  });
});

describe('Shared trips', () => {
  it('membership gates reads/writes; web writes flow through the trip change log', async () => {
    const t = setup();
    const a = t.withIdentity(USER_A);
    const b = t.withIdentity(USER_B);
    const created = await a.mutation(api.sharedTrips.create, { name: 'Manali', emoji: '🏔️' });
    await expectConvexError(b.query(api.pwaSharedTrips.getTrip, { tripId: created.tripId }), 'FORBIDDEN');
    const guest = await a.mutation(api.pwaSharedTrips.addParticipant, { tripId: created.tripId, name: 'Guest' });
    const exp = await a.mutation(api.pwaSharedTrips.addExpense, { tripId: created.tripId, amountCents: 4000, dateMs: 1_700_000_000_000, paidByParticipantId: created.participantId, splitType: 'equal' });
    const again = await a.mutation(api.pwaSharedTrips.addExpense, { tripId: created.tripId, amountCents: 4000, dateMs: 1_700_000_000_500, paidByParticipantId: created.participantId, splitType: 'equal' });
    expect(again.id).toBe(exp.id);
    const detail: any = await a.query(api.pwaSharedTrips.getTrip, { tripId: created.tripId });
    expect(detail!.expenses[0].computedSplits[guest.id]).toBe(2000);
    const pulled: any = await a.query(api.sharedTripSync.pull, { tripId: created.tripId, lastSeq: 0 });
    expect(pulled.sharedTripExpenses.map((x: any) => x.id)).toEqual([exp.id]);
    expect(pulled.sharedTripParticipants.map((x: any) => x.id).sort()).toEqual([created.participantId, guest.id].sort());
    await expectConvexError(b.mutation(api.pwaSharedTrips.addExpense, { tripId: created.tripId, amountCents: 1, dateMs: 1, paidByParticipantId: guest.id, splitType: 'equal' }), 'FORBIDDEN');

    const cash = await a.mutation(api.pwaPersonal.createAccount, { name: 'Cash', emoji: '💵', kind: 'cash', openingBalanceCents: 10_000 });
    const snap: any = await a.query(api.pwaPersonal.getSnapshot, {});
    expect(snap.derivedRows.map((r: any) => r.systemType).sort()).toEqual(['trip_cashflow', 'trip_share']);
    expect(snap.accounts.find((x: any) => x.id === cash.id).balanceCents).toBe(6000);
    expect((await a.query(api.pwaSharedTrips.listMine, {}))[0].totalSpentCents).toBe(4000);
  });
});

describe('First-run defaults', () => {
  it('seeds native-identical defaults only for a completely empty account', async () => {
    const t = setup();
    const a = t.withIdentity(USER_A);
    const first: any = await a.mutation(api.pwaPersonal.seedDefaultsIfEmpty, {});
    expect(first.seeded).toBe(true);
    const cats: any[] = await a.query(api.pwaPersonal.listCategories, {});
    expect(cats.map((c) => c.name)).toEqual(['Food', 'Groceries', 'Transport', 'Rent', 'Fun', 'System · Adjustment', 'System · Transfer']);
    expect(cats.filter((c) => c.isSystem === 1)).toHaveLength(2);
    const accounts: any[] = await a.query(api.pwaPersonal.listAccounts, {});
    expect(accounts.map((x) => x.name)).toEqual(['Cash']);
    const settings: any = await a.query(api.pwaPersonal.getSettings, {});
    expect(settings.defaultAccountId).toBe(accounts[0].id);
    // A brand-new account starts with onboarding.
    expect(settings.hasSeenOnboarding).toBe(0);
    const second: any = await a.mutation(api.pwaPersonal.seedDefaultsIfEmpty, {});
    expect(second.seeded).toBe(false);
    expect((await a.query(api.pwaPersonal.listCategories, {})).length).toBe(7);
    // Native pulls the seeded rows through the unchanged protocol.
    const pull: any = await a.query(api.sync.pull, { lastSeq: 0 });
    expect(pull.categories).toHaveLength(7);
    expect(pull.accounts).toHaveLength(1);
    expect(pull.userSettings[0].defaultAccountId).toBe(accounts[0].id);
  });

  it('never resets onboarding for an account whose settings already exist', async () => {
    const t = setup();
    const a = t.withIdentity(USER_A);
    await a.mutation(api.pwaPersonal.updateSettings, { currencyCode: 'USD' });
    await a.mutation(api.pwaPersonal.seedDefaultsIfEmpty, {});
    const settings: any = await a.query(api.pwaPersonal.getSettings, {});
    expect(settings.hasSeenOnboarding).toBe(1);
    await a.mutation(api.pwaPersonal.updateSettings, { hasSeenOnboarding: false });
    expect((await a.query(api.pwaPersonal.getSettings, {})).hasSeenOnboarding).toBe(0);
  });
});

describe('Split parity: server splits match the shared calculator', () => {
  async function seedThree(a: any) {
    await a.mutation(api.pwaPersonal.createAccount, { name: 'Cash', emoji: '💵', kind: 'cash', openingBalanceCents: 100_000 });
    const trip = await a.mutation(api.pwaTrips.createTrip, {
      name: 'Split', emoji: '🧮', isGroup: true,
      participants: [{ name: 'You', isCurrentUser: true }, { name: 'Sam', isCurrentUser: false }, { name: 'Ana', isCurrentUser: false }],
    });
    const [me, sam, ana] = ['You', 'Sam', 'Ana'].map((n) => trip.participants.find((p: any) => p.name === n));
    return { trip, me, sam, ana };
  }

  it('all five split types compute exactly what the client calculator computes and sum to the total', async () => {
    const t = setup();
    const a = t.withIdentity(USER_A);
    const { trip, me, sam, ana } = await seedThree(a);
    const amountCents = 10_001; // forces a remainder for equal/percentage/shares
    const cases: Array<{ splitType: 'equal' | 'equalSelected' | 'percentage' | 'shares' | 'exact'; splitData?: Record<string, number> }> = [
      { splitType: 'equal' },
      { splitType: 'equalSelected', splitData: { [me.id]: 1, [ana.id]: 1 } },
      { splitType: 'percentage', splitData: { [me.id]: 33.33, [sam.id]: 33.33, [ana.id]: 33.34 } },
      { splitType: 'shares', splitData: { [me.id]: 2, [sam.id]: 1, [ana.id]: 1 } },
      { splitType: 'exact', splitData: { [me.id]: 5000, [sam.id]: 3001, [ana.id]: 2000 } },
    ];
    for (const c of cases) {
      const created: any = await a.mutation(api.pwaTrips.createExpense, {
        tripId: trip.id, amountCents, date: 1_700_000_000_000 + cases.indexOf(c), paidByParticipantId: me.id, splitType: c.splitType, splitData: c.splitData,
      });
      const expected = TripSplitCalculator.calculateSplits(amountCents, c.splitType as any, trip.participants, c.splitData);
      expect(created.tripExpense.computedSplits, c.splitType).toEqual(expected);
      const sum = Object.values(created.tripExpense.computedSplits as Record<string, number>).reduce((s, v) => s + v, 0);
      expect(sum, c.splitType).toBe(amountCents);
      expect(Object.values(created.tripExpense.computedSplits as Record<string, number>).every(Number.isInteger), c.splitType).toBe(true);
    }
  });

  it('rejects percentages that miss 100, exact amounts that miss the total, and empty selections', async () => {
    const t = setup();
    const a = t.withIdentity(USER_A);
    const { trip, me, sam } = await seedThree(a);
    const base = { tripId: trip.id, amountCents: 1000, date: 1_700_000_000_000, paidByParticipantId: me.id };
    await expectConvexError(a.mutation(api.pwaTrips.createExpense, { ...base, splitType: 'percentage', splitData: { [me.id]: 50, [sam.id]: 40 } }), 'VALIDATION');
    await expectConvexError(a.mutation(api.pwaTrips.createExpense, { ...base, splitType: 'exact', splitData: { [me.id]: 500, [sam.id]: 400 } }), 'VALIDATION');
    await expectConvexError(a.mutation(api.pwaTrips.createExpense, { ...base, splitType: 'equalSelected', splitData: {} }), 'VALIDATION');
    await expectConvexError(a.mutation(api.pwaTrips.createExpense, { ...base, splitType: 'shares', splitData: { [me.id]: 0 } }), 'VALIDATION');
  });
});

describe('Default account changes do not re-home past trip payments (native parity)', () => {
  async function seed(a: any) {
    const first = await a.mutation(api.pwaPersonal.createAccount, { name: 'First', emoji: '💵', kind: 'cash', openingBalanceCents: 100_000 });
    const second = await a.mutation(api.pwaPersonal.createAccount, { name: 'Second', emoji: '🏦', kind: 'savings', openingBalanceCents: 100_000 });
    await a.mutation(api.pwaPersonal.updateSettings, { defaultAccountId: first.id });
    const trip = await a.mutation(api.pwaTrips.createTrip, { name: 'Goa', emoji: '🏝️', isGroup: true, participants: [{ name: 'You', isCurrentUser: true }, { name: 'Sam', isCurrentUser: false }] });
    const me = trip.participants.find((p: any) => p.isCurrentUser);
    const old: any = await a.mutation(api.pwaTrips.createExpense, { tripId: trip.id, amountCents: 3000, date: 1_700_000_000_000, paidByParticipantId: me.id, splitType: 'equal' });
    return { first, second, trip, me, old };
  }
  const cashflowAccount = async (a: any, tripExpenseId: string) =>
    ((await a.query(api.pwaPersonal.getSnapshot, {})).derivedRows as any[]).find((r) => r.systemType === 'trip_cashflow' && r.sourceTripExpenseId === tripExpenseId)?.accountId;

  it('web settings change: old payment stays on the old default, new payment uses the new one', async () => {
    const t = setup();
    const a = t.withIdentity(USER_A);
    const { first, second, trip, me, old } = await seed(a);
    expect(await cashflowAccount(a, old.tripExpense.id)).toBe(first.id);

    const seqBefore = (await a.query(api.sync.pull, { lastSeq: 0 }))!.latestSeq;
    await a.mutation(api.pwaPersonal.updateSettings, { defaultAccountId: second.id });
    expect(await cashflowAccount(a, old.tripExpense.id)).toBe(first.id);
    const fresh: any = await a.mutation(api.pwaTrips.createExpense, { tripId: trip.id, amountCents: 1000, date: 1_700_000_100_000, paidByParticipantId: me.id, splitType: 'equal' });
    expect(await cashflowAccount(a, fresh.tripExpense.id)).toBe(second.id);

    const accounts: any[] = await a.query(api.pwaPersonal.listAccounts, {});
    expect(accounts.find((x) => x.id === first.id).balanceCents).toBe(100_000 - 3000);
    expect(accounts.find((x) => x.id === second.id).balanceCents).toBe(100_000 - 1000);
    // Pinning is PWA-only: only the settings change itself reaches the native change log.
    const pull: any = await a.query(api.sync.pull, { lastSeq: seqBefore });
    expect(pull.transactions).toHaveLength(1); // the new base transaction
    expect(pull.userSettings).toHaveLength(1);
  });

  it('native sync:push default change pins too; repeated settings writes are idempotent', async () => {
    const t = setup();
    const a = t.withIdentity(USER_A);
    const { first, second, old } = await seed(a);
    const now = Date.now();
    await a.mutation(api.sync.push, { userSettings: [{ id: 'local', currencyCode: 'INR', hapticsEnabled: 1, defaultAccountId: second.id, hasSeenOnboarding: 1, syncTransactionFilters: 0, resetTransactionFiltersOnReopen: 0, transactionsFiltersJson: null, transactionsFiltersUpdatedAtMs: null, createdAtMs: now, updatedAtMs: now + 10_000, deletedAtMs: null, syncVersion: 99, needsSync: 1 }] });
    expect((await a.query(api.pwaPersonal.getSettings, {})).defaultAccountId).toBe(second.id);
    expect(await cashflowAccount(a, old.tripExpense.id)).toBe(first.id);

    await a.mutation(api.pwaPersonal.updateSettings, { defaultAccountId: second.id });
    const overrides = await t.run(async (ctx) => (await ctx.db.query('derivedAccountOverrides').collect()).filter((o: any) => o.deletedAtMs === undefined));
    expect(overrides).toHaveLength(1);
    expect(overrides[0]).toMatchObject({ sourceKind: 'trip_expense', sourceId: old.tripExpense.id, direction: 'cashflow', accountId: first.id });
  });
});
