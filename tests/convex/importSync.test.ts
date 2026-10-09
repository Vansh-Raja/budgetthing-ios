import { describe, expect, it } from 'vitest';
import { api, internal } from '../../convex/_generated/api';
import { USER_A, nativeTransactionRow, setup } from './helpers';
import { deterministicImportTransactionId } from '../../lib/logic/importProvenance';

/** Phase 6: server-authoritative import state machine on the legacy native sync:push. */

async function seedPendingItem(t: any) {
  const a = t.withIdentity(USER_A);
  const acct = await a.mutation(api.pwaPersonal.createAccount, { name: 'Cash', emoji: '💵', kind: 'cash', openingBalanceCents: 10_000 });
  const { rawKey } = await a.mutation(api.apiImportKeys.create, { name: 'agent', expiresIn: '30d' });
  const res: any = await t.mutation(internal.apiImportHttp.createImportsForToken, {
    rawKey, idempotencyKey: `k-${Math.random()}`,
    body: { source: 'test', items: [{ externalId: 'e1', type: 'expense', amountCents: 1250, currencyCode: 'INR', occurredAt: '2026-10-01T10:00:00Z', merchantName: 'Cafe', accountId: acct.id }] },
  });
  expect(res.statusCode).toBe(200);
  const item = await t.run(async (ctx: any) => (await ctx.db.query('importInboxItems').collect())[0]);
  return { a, acct, item, txId: deterministicImportTransactionId(item.id) };
}

/** What a released native client pushes for a local confirm. */
function nativeConfirm(item: any, txId: string, accountId: string, updatedAtMs: number) {
  return {
    transactions: [nativeTransactionRow(txId, { amountCents: item.amountCents, date: item.dateMs, type: item.type, accountId, sourceType: 'api_import', sourceImportInboxItemId: item.id, updatedAtMs, createdAtMs: updatedAtMs })],
    importInboxItems: [{ ...wireItem(item), status: 'confirmed', confirmedTransactionId: txId, confirmedAtMs: updatedAtMs, updatedAtMs, syncVersion: (item.syncVersion ?? 1) + 1, needsSync: 1 }],
  };
}
function nativeIgnore(item: any, updatedAtMs: number) {
  return { importInboxItems: [{ ...wireItem(item), status: 'ignored', ignoredAtMs: updatedAtMs, updatedAtMs, syncVersion: (item.syncVersion ?? 1) + 1, needsSync: 1 }] };
}
function wireItem(item: any) {
  const { _id, _creationTime, userId, ...rest } = item;
  return rest;
}
const serverItem = (t: any, id: string) => t.run(async (ctx: any) => (await ctx.db.query('importInboxItems').collect()).find((i: any) => i.id === id));
const serverTx = (t: any, id: string) => t.run(async (ctx: any) => (await ctx.db.query('transactions').collect()).find((x: any) => x.id === id));

describe('Import sync state machine (native sync:push)', () => {
  it('native confirm on a pending item: confirmed + one active provenance transaction', async () => {
    const t = setup();
    const { a, acct, item, txId } = await seedPendingItem(t);
    await a.mutation(api.sync.push, nativeConfirm(item, txId, acct.id, Date.now()));
    expect(await serverItem(t, item.id)).toMatchObject({ status: 'confirmed', confirmedTransactionId: txId });
    const tx = await serverTx(t, txId);
    expect(tx).toMatchObject({ sourceType: 'api_import', sourceImportInboxItemId: item.id, amountCents: 1250 });
    expect(tx.deletedAtMs).toBeUndefined();
  });

  it('a confirm from a device whose clock is behind is still accepted (monotonic, not timestamp LWW)', async () => {
    const t = setup();
    const { a, acct, item, txId } = await seedPendingItem(t);
    await a.mutation(api.sync.push, nativeConfirm(item, txId, acct.id, item.updatedAtMs - 3_600_000));
    expect((await serverItem(t, item.id)).status).toBe('confirmed');
  });

  it('confirm on one device, later stale ignore from another: stays confirmed, winner re-sent on pull', async () => {
    const t = setup();
    const { a, acct, item, txId } = await seedPendingItem(t);
    await a.mutation(api.sync.push, nativeConfirm(item, txId, acct.id, Date.now()));
    const seq = (await a.query(api.sync.pull, { lastSeq: 0 }))!.latestSeq;
    const lateIgnore = Date.now() + 60_000;
    await a.mutation(api.sync.push, nativeIgnore(item, lateIgnore));
    const after = await serverItem(t, item.id);
    expect(after).toMatchObject({ status: 'confirmed', confirmedTransactionId: txId });
    expect(after.updatedAtMs).toBeGreaterThan(lateIgnore); // overwrites the losing device on pull
    const pulled: any = await a.query(api.sync.pull, { lastSeq: seq });
    expect(pulled.importInboxItems.map((i: any) => i.status)).toEqual(['confirmed']);
    expect((await serverTx(t, txId)).deletedAtMs).toBeUndefined();
  });

  it('ignored on the server, then a stale native confirm: tombstoned resolution transaction + audit', async () => {
    const t = setup();
    const { a, acct, item, txId } = await seedPendingItem(t);
    await a.mutation(api.pwaImports.ignore, { id: item.id });
    const seq = (await a.query(api.sync.pull, { lastSeq: 0 }))!.latestSeq;
    await a.mutation(api.sync.push, nativeConfirm(item, txId, acct.id, Date.now() + 60_000));
    expect((await serverItem(t, item.id)).status).toBe('ignored');
    const tx = await serverTx(t, txId);
    expect(tx.deletedAtMs).toBeDefined();
    expect(tx).toMatchObject({ amountCents: 1250, sourceType: 'api_import', sourceImportInboxItemId: item.id });
    const pulled: any = await a.query(api.sync.pull, { lastSeq: seq });
    expect(pulled.transactions.find((x: any) => x.id === txId)?.deletedAtMs).toBeDefined();
    expect(pulled.importInboxItems.map((i: any) => i.status)).toEqual(['ignored']);
    const audits = await t.run(async (ctx: any) => (await ctx.db.query('apiImportAuditEvents').collect()).filter((e: any) => e.eventType === 'import_sync_server_winner_ignored'));
    expect(audits).toHaveLength(1);
    // Balance unaffected: the resolution transaction is deleted.
    expect((await a.query(api.pwaPersonal.listAccounts, {}))[0].balanceCents).toBe(10_000);
  });

  it('unattributable import transactions and client-created inbox rows never become active', async () => {
    const t = setup();
    const { a, acct, item } = await seedPendingItem(t);
    const now = Date.now();
    await a.mutation(api.sync.push, {
      transactions: [
        nativeTransactionRow('api_import_forged', { accountId: acct.id, sourceType: 'api_import', sourceImportInboxItemId: item.id }),
        nativeTransactionRow('tx-no-item', { accountId: acct.id, sourceType: 'api_import' }),
      ],
      importInboxItems: [{ ...wireItem(item), id: 'client-made', status: 'pending', updatedAtMs: now }],
    });
    expect(await serverTx(t, 'api_import_forged')).toBeFalsy();
    expect(await serverTx(t, 'tx-no-item')).toBeFalsy();
    expect(await serverItem(t, 'client-made')).toBeFalsy();
    expect((await serverItem(t, item.id)).status).toBe('pending');
  });

  it('clients cannot change an item payload; a lone valid transaction confirms its pending item', async () => {
    const t = setup();
    const { a, acct, item, txId } = await seedPendingItem(t);
    await a.mutation(api.sync.push, { importInboxItems: [{ ...wireItem(item), amountCents: 999_999, merchantName: 'Evil', updatedAtMs: Date.now() + 1000 }] });
    expect(await serverItem(t, item.id)).toMatchObject({ amountCents: 1250, merchantName: 'Cafe', status: 'pending' });
    const { transactions } = nativeConfirm(item, txId, acct.id, Date.now());
    await a.mutation(api.sync.push, { transactions });
    expect(await serverItem(t, item.id)).toMatchObject({ status: 'confirmed', confirmedTransactionId: txId });
  });

  it('web confirm followed by the same native confirm is idempotent (one transaction)', async () => {
    const t = setup();
    const { a, acct, item, txId } = await seedPendingItem(t);
    await a.mutation(api.pwaImports.confirm, { id: item.id, accountId: acct.id });
    await a.mutation(api.sync.push, nativeConfirm(item, txId, acct.id, Date.now()));
    const txs = await t.run(async (ctx: any) => (await ctx.db.query('transactions').collect()).filter((x: any) => x.sourceImportInboxItemId === item.id));
    expect(txs).toHaveLength(1);
    expect((await serverItem(t, item.id)).status).toBe('confirmed');
  });
});
