/**
 * Server-authoritative import state machine for the legacy native `sync:push`.
 *
 * API-import inbox items and their deterministic `api_import_*` transactions are
 * taken out of generic last-write-wins. The server owns each item's lifecycle:
 *
 *   pending ──confirm (exact deterministic tx)──▶ confirmed   (terminal)
 *   pending ──ignore───────────────────────────▶ ignored     (terminal)
 *
 * Transitions are monotonic and independent of client clocks. A write that loses
 * is a server-side no-op that re-records the winning rows in the change log (with
 * an updatedAtMs newer than the losing write), so the losing device's next full
 * pull overwrites its local copy. Released native clients still get
 * `{ status: "ok" }`; no per-record acknowledgement is invented.
 *
 * Clients can only move review state. Item identity, payload and provenance are
 * immutable; unattributable import transactions never create active records.
 */
import { recordUserChange } from "./userSyncSeq";
import { withAuditReason } from "./functions";
import { deterministicImportTransactionId } from "../lib/logic/importProvenance";

type Row = Record<string, any>;

function isImportTransaction(tx: Row): boolean {
  return (
    tx?.sourceType === "api_import" ||
    (typeof tx?.sourceImportInboxItemId === "string" && tx.sourceImportInboxItemId.length > 0) ||
    (typeof tx?.id === "string" && tx.id.startsWith("api_import_"))
  );
}

async function byClientId(ctx: any, table: string, userId: string, id: string): Promise<Row | null> {
  return ctx.db
    .query(table)
    .withIndex("by_client_id", (q: any) => q.eq("id", id))
    .filter((q: any) => q.eq(q.field("userId"), userId))
    .first();
}

function isLive(row: Row | null | undefined): boolean {
  return !!row && (row.deletedAtMs === undefined || row.deletedAtMs === null);
}

/** Re-record a winning row so a device holding a losing copy re-pulls it. */
async function touchWinner(ctx: any, userId: string, table: string, row: Row, losingUpdatedAtMs: number) {
  const updatedAtMs = Math.max(Date.now(), (row.updatedAtMs ?? 0) + 1, losingUpdatedAtMs + 1);
  await ctx.db.patch(row._id, { updatedAtMs, syncVersion: (row.syncVersion ?? 0) + 1 });
  await recordUserChange(ctx, userId, table, row.id, updatedAtMs, isLive(row) ? "upsert" : "delete");
}

async function patchItem(ctx: any, userId: string, item: Row, patch: Row, losingUpdatedAtMs: number) {
  const updatedAtMs = Math.max(Date.now(), (item.updatedAtMs ?? 0) + 1, losingUpdatedAtMs + 1);
  await ctx.db.patch(item._id, { ...patch, updatedAtMs, syncVersion: (item.syncVersion ?? 0) + 1 });
  await recordUserChange(ctx, userId, "importInboxItems", item.id, updatedAtMs, "upsert");
}

async function auditEvent(ctx: any, userId: string, eventType: string, status: string, detail: Row) {
  const now = Date.now();
  await ctx.db.insert("apiImportAuditEvents", {
    id: `audit_${now}_${detail.itemId ?? "sync"}`,
    userId,
    eventType,
    status,
    detailJson: JSON.stringify(detail),
    createdAtMs: now,
  });
}

/**
 * Server-winner for a stale confirm against an ignored item: the deterministic
 * transaction exists only as a tombstone built from the item's own immutable data.
 */
async function writeResolutionTombstone(ctx: any, userId: string, item: Row, txId: string, losingUpdatedAtMs: number) {
  const now = Date.now();
  const updatedAtMs = Math.max(now, losingUpdatedAtMs + 1);
  const data = {
    amountCents: item.amountCents,
    date: item.dateMs,
    note: item.note ?? item.merchantName ?? undefined,
    type: item.type,
    accountId: item.accountId ?? undefined,
    categoryId: item.categoryId ?? undefined,
    sourceType: "api_import",
    sourceImportInboxItemId: item.id,
    deletedAtMs: now,
    updatedAtMs,
  };
  const existing = await byClientId(ctx, "transactions", userId, txId);
  if (existing) {
    await ctx.db.patch(existing._id, { ...data, syncVersion: (existing.syncVersion ?? 0) + 1 });
  } else {
    await ctx.db.insert("transactions", { id: txId, userId, ...data, createdAtMs: now, syncVersion: 1 });
  }
  await recordUserChange(ctx, userId, "transactions", txId, updatedAtMs, "delete");
}

/**
 * Applies all import-linked rows from one push. Returns the transactions that
 * should still go through generic LWW (ordinary rows, plus import transactions
 * the state machine approved, with provenance forced to the canonical values).
 */
export async function applyImportSync(
  ctx: any,
  userId: string,
  transactions: Row[] | undefined,
  inboxRows: Row[] | undefined,
): Promise<Row[]> {
  const generic: Row[] = [];
  const importTxByItem = new Map<string, Row>();
  for (const tx of transactions ?? []) {
    if (!tx || typeof tx !== "object" || !tx.id) continue;
    if (!isImportTransaction(tx)) {
      generic.push(tx);
      continue;
    }
    const itemId = typeof tx.sourceImportInboxItemId === "string" ? tx.sourceImportInboxItemId : "";
    // Unattributable: no item, or not the item's exact deterministic id. Never becomes active.
    if (!itemId || tx.id !== deterministicImportTransactionId(itemId)) continue;
    importTxByItem.set(itemId, tx);
  }

  const inboxById = new Map<string, Row>();
  for (const row of inboxRows ?? []) {
    if (row && typeof row === "object" && typeof row.id === "string") inboxById.set(row.id, row);
  }

  const itemIds = new Set<string>([...inboxById.keys(), ...importTxByItem.keys()]);
  for (const itemId of itemIds) {
    const item = await byClientId(ctx, "importInboxItems", userId, itemId);
    const incoming = inboxById.get(itemId);
    const tx = importTxByItem.get(itemId);
    const losingUpdatedAtMs = Math.max(incoming?.updatedAtMs ?? 0, tx?.updatedAtMs ?? 0);
    // Inbox items are only ever created by the server (HTTP API); clients cannot create
    // or delete them, so a push for an unknown or deleted item is dropped.
    if (!isLive(item)) continue;

    const txId = deterministicImportTransactionId(itemId);
    const canonicalTx = tx ? { ...tx, sourceType: "api_import", sourceImportInboxItemId: itemId } : null;

    if (item!.status === "pending") {
      const serverTx = await byClientId(ctx, "transactions", userId, txId);
      const txLive = (tx && (tx.deletedAtMs === undefined || tx.deletedAtMs === null)) || isLive(serverTx);
      const wantsConfirm =
        (incoming?.status === "confirmed" && incoming.confirmedTransactionId === txId) ||
        (!!tx && (tx.deletedAtMs === undefined || tx.deletedAtMs === null));
      if (wantsConfirm && txLive) {
        if (canonicalTx) generic.push(canonicalTx);
        await withAuditReason(ctx, "import confirmed (device sync)", () => patchItem(ctx, userId, item!, {
          status: "confirmed",
          confirmedTransactionId: txId,
          confirmedAtMs: incoming?.confirmedAtMs ?? Date.now(),
        }, losingUpdatedAtMs));
      } else if (incoming?.status === "ignored") {
        await patchItem(ctx, userId, item!, { status: "ignored", ignoredAtMs: incoming.ignoredAtMs ?? Date.now() }, losingUpdatedAtMs);
        if (tx) await writeResolutionTombstone(ctx, userId, item!, txId, losingUpdatedAtMs);
      } else if (incoming && incoming.status !== "pending") {
        // e.g. "confirmed" without its exact transaction: refuse, let the device re-pull pending.
        await touchWinner(ctx, userId, "importInboxItems", item!, losingUpdatedAtMs);
      }
      continue;
    }

    if (item!.status === "confirmed") {
      // Only the item's own confirmed transaction may sync; ordinary edits/deletes of it
      // go through LWW like any transaction, with provenance pinned.
      if (canonicalTx && item!.confirmedTransactionId === txId) generic.push(canonicalTx);
      if (incoming && incoming.status !== "confirmed") {
        await touchWinner(ctx, userId, "importInboxItems", item!, losingUpdatedAtMs);
      }
      continue;
    }

    if (item!.status === "ignored") {
      const staleConfirm = incoming?.status === "confirmed" || (!!tx && (tx.deletedAtMs === undefined || tx.deletedAtMs === null));
      if (staleConfirm) {
        await withAuditReason(ctx, "import: stale confirm resolved against ignored item", () => writeResolutionTombstone(ctx, userId, item!, txId, losingUpdatedAtMs));
        await touchWinner(ctx, userId, "importInboxItems", item!, losingUpdatedAtMs);
        await auditEvent(ctx, userId, "import_sync_server_winner_ignored", "resolved", { itemId, txId });
      } else if (incoming && incoming.status !== "ignored") {
        await touchWinner(ctx, userId, "importInboxItems", item!, losingUpdatedAtMs);
      }
    }
  }
  return generic;
}
