import { describe, expect, it } from 'vitest';
import { api, internal } from '../../convex/_generated/api';
import { USER_A, USER_B, expectConvexError, nativeAccountRow, nativeTransactionRow, setup } from './helpers';

/** Item 2: append-only audit trail + version history + data-forward restore. */

const auditRows = (t: any) => t.run(async (ctx: any) => ctx.db.query('auditLog').collect());

describe('Audit trail', () => {
  it('records create / update / delete of a web transaction with before/after and source=web', async () => {
    const t = setup();
    const a = t.withIdentity(USER_A);
    const acct = await a.mutation(api.pwaPersonal.createAccount, { name: 'Cash', emoji: '💵', kind: 'cash', openingBalanceCents: 10_000 });
    const tx: any = await a.mutation(api.pwaLedger.createTransaction, { amountCents: 500, date: 1_700_000_000_000, type: 'expense', accountId: acct.id, note: 'coffee' });
    await a.mutation(api.pwaLedger.updateTransaction, { id: tx.id, amountCents: 750, note: 'big coffee' });
    await a.mutation(api.pwaLedger.deleteTransaction, { id: tx.id });

    const history: any[] = await a.query(api.history.forEntity, { entityTable: 'transactions', entityId: tx.id });
    expect(history.map((h) => h.action)).toEqual(['delete', 'update', 'create']);
    expect(history.every((h) => h.source === 'web')).toBe(true);
    const update = history[1];
    expect(update.changedFields).toEqual(['amountCents', 'note']);
    expect(update.before).toMatchObject({ amountCents: 500, note: 'coffee' });
    expect(update.after).toMatchObject({ amountCents: 750, note: 'big coffee' });
  });

  it('labels native sync pushes and agent imports by source', async () => {
    const t = setup();
    const a = t.withIdentity(USER_A);
    await a.mutation(api.sync.push, { accounts: [nativeAccountRow('acct-native')], transactions: [nativeTransactionRow('tx-native', { accountId: 'acct-native' })] });
    const { rawKey } = await a.mutation(api.apiImportKeys.create, { name: 'agent', expiresIn: '30d' });
    await t.mutation(internal.apiImportHttp.createImportsForToken, {
      rawKey, idempotencyKey: 'k1', body: { source: 'test', items: [{ externalId: 'e1', type: 'expense', amountCents: 999, currencyCode: 'INR', occurredAt: '2026-10-01T10:00:00Z' }] },
    });
    const rows: any[] = await auditRows(t);
    expect(rows.find((r) => r.entityId === 'tx-native')?.source).toBe('native_sync');
    expect(rows.find((r) => r.entityTable === 'importInboxItems')?.source).toBe('import_api');
    // Secrets are never copied into history.
    const keyRow = rows.find((r) => r.entityTable === 'apiImportKeys');
    expect(keyRow.afterJson).not.toContain('keyHash');
  });

  it('restore brings back an earlier version as a new audited write; undo delete revives and syncs', async () => {
    const t = setup();
    const a = t.withIdentity(USER_A);
    const acct = await a.mutation(api.pwaPersonal.createAccount, { name: 'Cash', emoji: '💵', kind: 'cash', openingBalanceCents: 10_000 });
    const tx: any = await a.mutation(api.pwaLedger.createTransaction, { amountCents: 500, date: 1_700_000_000_000, type: 'expense', accountId: acct.id, note: 'coffee' });
    await a.mutation(api.pwaLedger.updateTransaction, { id: tx.id, amountCents: 750, note: 'big coffee' });

    let history: any[] = await a.query(api.history.forEntity, { entityTable: 'transactions', entityId: tx.id });
    const created = history.find((h) => h.action === 'create');
    await a.mutation(api.history.restore, { auditId: created.auditId });
    let snap: any = await a.query(api.pwaPersonal.getSnapshot, {});
    expect(snap.transactions.find((x: any) => x.id === tx.id)).toMatchObject({ amountCents: 500, note: 'coffee' });
    history = await a.query(api.history.forEntity, { entityTable: 'transactions', entityId: tx.id });
    expect(history[0]).toMatchObject({ action: 'update' });
    expect(history[0].reason).toMatch(/^restore version from create/);
    expect(history).toHaveLength(3); // nothing rewritten, one more version

    // Undo a delete.
    await a.mutation(api.pwaLedger.deleteTransaction, { id: tx.id });
    const seq = (await a.query(api.sync.pull, { lastSeq: 0 }))!.latestSeq;
    history = await a.query(api.history.forEntity, { entityTable: 'transactions', entityId: tx.id });
    const del = history.find((h) => h.action === 'delete');
    await a.mutation(api.history.restore, { auditId: del.auditId, version: 'before' });
    snap = await a.query(api.pwaPersonal.getSnapshot, {});
    expect(snap.transactions.find((x: any) => x.id === tx.id)).toMatchObject({ amountCents: 500 });
    history = await a.query(api.history.forEntity, { entityTable: 'transactions', entityId: tx.id });
    expect(history[0].action).toBe('restore');
    // Native clients pull the revived row.
    const pulled: any = await a.query(api.sync.pull, { lastSeq: seq });
    expect(pulled.transactions.find((x: any) => x.id === tx.id)?.deletedAtMs ?? null).toBeNull();
  });

  it('bookkeeping-only touches are not new versions; system actions carry a reason', async () => {
    const t = setup();
    const a = t.withIdentity(USER_A);
    const first = await a.mutation(api.pwaPersonal.createAccount, { name: 'First', emoji: '💵', kind: 'cash', openingBalanceCents: 0 });
    const second = await a.mutation(api.pwaPersonal.createAccount, { name: 'Second', emoji: '🏦', kind: 'savings', openingBalanceCents: 0 });
    await a.mutation(api.pwaPersonal.updateSettings, { defaultAccountId: first.id });
    const trip = await a.mutation(api.pwaTrips.createTrip, { name: 'Goa', emoji: '🏝️', isGroup: true, participants: [{ name: 'You', isCurrentUser: true }, { name: 'Sam', isCurrentUser: false }] });
    const me = trip.participants.find((p: any) => p.isCurrentUser);
    await a.mutation(api.pwaTrips.createExpense, { tripId: trip.id, amountCents: 3000, date: 1_700_000_000_000, paidByParticipantId: me.id, splitType: 'equal' });
    await a.mutation(api.pwaPersonal.updateSettings, { defaultAccountId: second.id });
    const rows: any[] = await auditRows(t);
    const pin = rows.find((r) => r.entityTable === 'derivedAccountOverrides');
    expect(pin.reason).toMatch(/default account change/);
    expect(rows.every((r) => r.action !== 'update' || r.changedFields.length > 0)).toBe(true);
  });

  it('history is private: another user cannot read or restore it', async () => {
    const t = setup();
    const a = t.withIdentity(USER_A);
    const b = t.withIdentity(USER_B);
    const acct = await a.mutation(api.pwaPersonal.createAccount, { name: 'Cash', emoji: '💵', kind: 'cash', openingBalanceCents: 0 });
    expect(await b.query(api.history.forEntity, { entityTable: 'accounts', entityId: acct.id })).toEqual([]);
    expect(await b.query(api.history.recent, {})).toEqual([]);
    const [entry] = await a.query(api.history.forEntity, { entityTable: 'accounts', entityId: acct.id });
    await expectConvexError(b.mutation(api.history.restore, { auditId: entry.auditId as any }), "NOT_FOUND");
  });

  it('deleting the account erases its personal history', async () => {
    const t = setup();
    const a = t.withIdentity(USER_A);
    await a.mutation(api.pwaPersonal.createAccount, { name: 'Cash', emoji: '💵', kind: 'cash', openingBalanceCents: 0 });
    expect((await auditRows(t)).length).toBeGreaterThan(0);
    await a.mutation(api.deleteMyAccount.deleteMyAccount, {});
    const left: any[] = await auditRows(t);
    expect(left.filter((r) => r.userId === USER_A.subject && !r.entityTable.startsWith('sharedTrip'))).toEqual([]);
  });
});
