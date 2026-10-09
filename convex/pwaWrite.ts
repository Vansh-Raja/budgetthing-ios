/**
 * Change-log-aware write helper for owned (personal) tables.
 *
 * Mirrors what the native SQLite repositories do locally: stamp timestamps,
 * start `syncVersion` at 1, bump it on every change, soft-delete with
 * `deletedAtMs`, and record each change in the per-user changeLog so native
 * clients pull it through the unchanged `sync:pull` protocol.
 */
import type { MutationCtx } from "./_generated/server";
import { recordUserChange } from "./userSyncSeq";
import { serverNow, toWire, type OwnedTable } from "./pwaAuth";

type Row = Record<string, any>;

export async function insertOwned(ctx: MutationCtx, userId: string, table: OwnedTable, id: string, data: Row, nowMs = serverNow()) {
  const doc: Row = { id, userId, ...stripUndefined(data), createdAtMs: nowMs, updatedAtMs: nowMs, syncVersion: 1 };
  if (table === "userSettings") delete doc.createdAtMs; // schema has no createdAtMs for settings
  // Read back by _id: client ids are not unique across users (every settings row is "local"),
  // so a by_client_id lookup would scan all users' rows.
  const _id = await ctx.db.insert(table as any, doc as any);
  await recordUserChange(ctx, userId, table, id, nowMs, "upsert");
  const inserted = await ctx.db.get(_id);
  return toWire(inserted as any);
}

/**
 * Patch an owned row. `null` values clear optional fields (stored as undefined),
 * matching the native NULL-clears semantics of `sync:push`.
 */
export async function patchOwned(ctx: MutationCtx, userId: string, table: OwnedTable, existing: Row, patch: Row, nowMs = serverNow()) {
  const next: Row = {};
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) continue;
    next[key] = value === null ? undefined : value;
  }
  next.updatedAtMs = nowMs;
  next.syncVersion = (existing.syncVersion ?? 0) + 1;
  await ctx.db.patch(existing._id, next as any);
  const isDelete = next.deletedAtMs !== undefined || (existing.deletedAtMs !== undefined && !("deletedAtMs" in patch));
  await recordUserChange(ctx, userId, table, existing.id, nowMs, isDelete ? "delete" : "upsert");
  const updated = await ctx.db.get(existing._id);
  return toWire(updated as any);
}

export async function softDeleteOwned(ctx: MutationCtx, userId: string, table: OwnedTable, existing: Row, nowMs = serverNow()) {
  if (existing.deletedAtMs !== undefined) return toWire(existing as any);
  return patchOwned(ctx, userId, table, existing, { deletedAtMs: nowMs }, nowMs);
}

export function stripUndefined<T extends Row>(obj: T): T {
  const out: Row = {};
  for (const [k, val] of Object.entries(obj)) {
    if (val === undefined || val === null) continue;
    out[k] = val;
  }
  return out as T;
}
