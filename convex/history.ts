/**
 * Version history and restore, backed by the append-only `auditLog`.
 *
 * - `forEntity`: every recorded version of one record (newest first). Personal records are
 *   owner-only; shared-trip records are readable by every active member of that trip.
 * - `forSharedTrip`: a shared trip's full history, for its members.
 * - `recent`: the caller's latest changes across their personal records.
 * - `restore`: bring a personal record back to a recorded version. Restoring is itself a
 *   new, audited write (data-forward): history is never rewritten or deleted.
 * - `eraseUserHistory`: bounded, self-rescheduling erasure used by account deletion.
 */
import { v } from "convex/values";
import { query } from "./_generated/server";
import { internal } from "./_generated/api";
import { internalMutation, mutation, withAuditReason } from "./functions";
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

/**
 * Foreign keys per restorable table: a restored version must not point at records that no
 * longer exist (or are deleted) for this user.
 */
const REFERENCES: Partial<Record<OwnedTable, Array<{ field: string; table: OwnedTable; label: string }>>> = {
  transactions: [
    { field: "accountId", table: "accounts", label: "account" },
    { field: "categoryId", table: "categories", label: "category" },
    { field: "transferFromAccountId", table: "accounts", label: "transfer source account" },
    { field: "transferToAccountId", table: "accounts", label: "transfer destination account" },
    { field: "tripExpenseId", table: "tripExpenses", label: "trip expense link" },
  ],
  tripParticipants: [{ field: "tripId", table: "trips", label: "trip" }],
  tripExpenses: [
    { field: "tripId", table: "trips", label: "trip" },
    { field: "transactionId", table: "transactions", label: "transaction" },
    { field: "paidByParticipantId", table: "tripParticipants", label: "payer" },
  ],
  tripSettlements: [
    { field: "tripId", table: "trips", label: "trip" },
    { field: "fromParticipantId", table: "tripParticipants", label: "payer" },
    { field: "toParticipantId", table: "tripParticipants", label: "recipient" },
  ],
  userSettings: [{ field: "defaultAccountId", table: "accounts", label: "default account" }],
};

function isSharedTable(table: string) {
  return table.startsWith("sharedTrip");
}

async function isActiveMember(ctx: any, userId: string, tripId: string): Promise<boolean> {
  const member = await ctx.db
    .query("sharedTripMembers")
    .withIndex("by_user_trip", (q: any) => q.eq("userId", userId).eq("tripId", tripId))
    .first();
  return !!member && member.deletedAtMs === undefined;
}

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
    tripId: (row.tripId as string | undefined) ?? null,
    restorable: (RESTORABLE as readonly string[]).includes(row.entityTable),
  };
}

const clampLimit = (n: number | undefined, dflt: number, max: number) => Math.min(Math.max(n ?? dflt, 1), max);

export const forEntity = query({
  args: { entityTable: v.string(), entityId: v.string(), tripId: v.optional(v.string()), limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    const limit = clampLimit(args.limit, 100, 500);
    if (isSharedTable(args.entityTable)) {
      // Shared-trip records: any active member may read them, via the trip-scoped index.
      if (!args.tripId || !(await isActiveMember(ctx, userId, args.tripId))) return [];
      const rows = await ctx.db
        .query("auditLog")
        .withIndex("by_trip_time", (q: any) => q.eq("tripId", args.tripId))
        .order("desc")
        .filter((q: any) => q.and(q.eq(q.field("entityTable"), args.entityTable), q.eq(q.field("entityId"), args.entityId)))
        .take(limit);
      return rows.map(toEntry);
    }
    const rows = await ctx.db
      .query("auditLog")
      .withIndex("by_user_entity", (q: any) => q.eq("userId", userId).eq("entityTable", args.entityTable).eq("entityId", args.entityId))
      .order("desc")
      .take(limit);
    return rows.map(toEntry);
  },
});

export const forSharedTrip = query({
  args: { tripId: v.string(), limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    if (!(await isActiveMember(ctx, userId, args.tripId))) return [];
    const rows = await ctx.db
      .query("auditLog")
      .withIndex("by_trip_time", (q: any) => q.eq("tripId", args.tripId))
      .order("desc")
      .take(clampLimit(args.limit, 100, 500));
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
      .take(clampLimit(args.limit, 50, 200));
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

    // Referential integrity: the restored version must not point at missing or deleted records.
    const restoringDeleted = snapshot.deletedAtMs !== undefined && snapshot.deletedAtMs !== null;
    if (!restoringDeleted) {
      for (const ref of REFERENCES[table] ?? []) {
        const refId = snapshot[ref.field];
        if (typeof refId !== "string" || refId === "") continue;
        const target = await getOwned(ctx, userId, ref.table, refId);
        if (!target || target.deletedAtMs !== undefined) {
          throw pwaError("STATE", `This version uses a ${ref.label} that no longer exists. Restore the ${ref.label} first.`, { field: ref.field });
        }
      }
    }

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

const ERASE_BATCH = 500;

/**
 * Erase a user's personal audit history in bounded batches, rescheduling itself until done,
 * so account deletion never exceeds per-transaction limits. Shared-trip history stays with
 * the trip for its remaining members.
 */
export const eraseUserHistory = internalMutation({
  args: { userId: v.string(), cursor: v.optional(v.union(v.string(), v.null())) },
  handler: async (ctx, args) => {
    const page = await ctx.db
      .query("auditLog")
      .withIndex("by_user_time", (q: any) => q.eq("userId", args.userId))
      .paginate({ numItems: ERASE_BATCH, cursor: args.cursor ?? null });
    let erased = 0;
    for (const row of page.page) {
      if (row.tripId) continue; // shared-trip history belongs to the trip
      await ctx.db.delete(row._id);
      erased++;
    }
    if (!page.isDone) {
      await ctx.scheduler.runAfter(0, internal.history.eraseUserHistory, { userId: args.userId, cursor: page.continueCursor });
    }
    return { erased, done: page.isDone };
  },
});
