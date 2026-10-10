/**
 * Version history and restore, backed by the append-only `auditLog`.
 *
 * - `forEntity`: every recorded version of one record (newest first).
 * - `recent`: the caller's latest changes across all records.
 * - `restore`: bring a record back to a recorded version. Restoring is itself a
 *   new, audited write (data-forward): history is never rewritten or deleted.
 */
import { v } from "convex/values";
import { query } from "./_generated/server";
import { mutation, withAuditReason } from "./functions";
import { getOwned, pwaError, requireUser, serverNow, type OwnedTable } from "./pwaAuth";
import { insertOwned, patchOwned } from "./pwaWrite";
import { isDerivedTripSystemType } from "../lib/logic/syncGuards";

/** Personal tables whose versions can be restored from the web. */
const RESTORABLE: readonly OwnedTable[] = [
  "accounts",
  "categories",
  "transactions",
  "trips",
  "tripParticipants",
  "tripExpenses",
  "tripSettlements",
  "userSettings",
] as const;

/** Fields that identify or version a row; never copied back from a snapshot. */
const IDENTITY_FIELDS = new Set(["id", "userId", "createdAtMs", "updatedAtMs", "syncVersion", "needsSync", "_id", "_creationTime"]);

function toEntry(row: any) {
  return {
    auditId: row._id as string,
    entityTable: row.entityTable as string,
    entityId: row.entityId as string,
    action: row.action as string,
    source: row.source as string,
    reason: (row.reason as string | undefined) ?? null,
    changedFields: row.changedFields as string[],
    before: row.beforeJson ? JSON.parse(row.beforeJson) : null,
    after: row.afterJson ? JSON.parse(row.afterJson) : null,
    atMs: row.atMs as number,
    restorable: (RESTORABLE as readonly string[]).includes(row.entityTable),
  };
}

export const forEntity = query({
  args: { entityTable: v.string(), entityId: v.string(), limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    const rows = await ctx.db
      .query("auditLog")
      .withIndex("by_user_entity", (q: any) => q.eq("userId", userId).eq("entityTable", args.entityTable).eq("entityId", args.entityId))
      .order("desc")
      .take(Math.min(Math.max(args.limit ?? 100, 1), 500));
    return rows.map(toEntry);
  },
});

export const recent = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    const rows = await ctx.db
      .query("auditLog")
      .withIndex("by_user_time", (q: any) => q.eq("userId", userId))
      .order("desc")
      .take(Math.min(Math.max(args.limit ?? 50, 1), 200));
    return rows.map(toEntry);
  },
});

/**
 * Restore a record to the state recorded by an audit entry.
 * `version: "after"` (default) restores the state right after that change;
 * `version: "before"` restores the state right before it (e.g. undo a delete or an edit).
 */
export const restore = mutation({
  args: { auditId: v.id("auditLog"), version: v.optional(v.union(v.literal("after"), v.literal("before"))) },
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    const entry = await ctx.db.get(args.auditId);
    if (!entry || entry.userId !== userId) throw pwaError("NOT_FOUND", "History entry not found");
    const table = entry.entityTable as OwnedTable;
    if (!(RESTORABLE as readonly string[]).includes(table)) throw pwaError("STATE", "This kind of record can't be restored here");
    const which = args.version ?? "after";
    const json = which === "after" ? entry.afterJson : entry.beforeJson;
    if (!json) throw pwaError("STATE", which === "before" ? "Nothing existed before this change" : "Nothing to restore for this change");
    const snapshot = JSON.parse(json) as Record<string, any>;
    if (isDerivedTripSystemType(snapshot.systemType)) throw pwaError("STATE", "Derived trip rows are computed, not restored");

    const when = new Date(entry.atMs).toISOString();
    const reason = `restore ${which === "before" ? "state before" : "version from"} ${entry.action} at ${when}`;
    return withAuditReason(ctx, reason, async () => {
      const current = await getOwned(ctx, userId, table, entry.entityId);
      const data: Record<string, any> = {};
      for (const [k, val] of Object.entries(snapshot)) if (!IDENTITY_FIELDS.has(k)) data[k] = val;
      if (!current) {
        // Hard-deleted (purged) record: recreate it under the same client id.
        return { restored: await insertOwned(ctx, userId, table, entry.entityId, data, serverNow()) };
      }
      // Clear fields that exist now but not in the snapshot (e.g. a later-added note), and
      // carry deletedAtMs from the snapshot so "undo delete" revives the record.
      const patch: Record<string, any> = { ...data };
      for (const k of Object.keys(current)) {
        if (IDENTITY_FIELDS.has(k) || k in snapshot) continue;
        patch[k] = null;
      }
      if (!("deletedAtMs" in snapshot)) patch.deletedAtMs = null;
      return { restored: await patchOwned(ctx, userId, table, current, patch) };
    });
  },
});
