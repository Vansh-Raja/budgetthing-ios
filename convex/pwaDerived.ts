/**
 * Virtual derived trip rows for the PWA.
 *
 * Native derives `trip_share` / `trip_cashflow` / `trip_settlement` rows into
 * its local SQLite (never synced). The PWA computes the same rows on the
 * server at read time with the shared calculator and NEVER persists them.
 * IDs match native (`derivedKey` = userId) so both runtimes agree.
 */
import { query } from "./_generated/server";
import { mutation, withAuditReason } from "./functions";
import { v } from "convex/values";
import { listOwnedLive, requireUser, serverNow, type Ctx } from "./pwaAuth";
import { assertOwnedRef } from "./pwaValidation";
import { computeTripDerivedRowsForUser, type DerivedTransactionUpsert } from "../lib/logic/tripAccounting/computeDerivedRows";
import { normalizeCurrentUserFlags } from "../lib/logic/tripAccounting/currentUserParticipant";
import { isDerivedTripSystemType } from "../lib/logic/syncGuards";

export type VirtualDerivedRow = DerivedTransactionUpsert & {
  createdAtMs: number;
  updatedAtMs: number;
  virtual: true;
  origin: "local_trip" | "shared_trip";
  tripId: string;
};

export type OverrideKey = { sourceKind: string; sourceId: string; direction: string };

export function overrideKeyFor(row: DerivedTransactionUpsert, origin: "local_trip" | "shared_trip"): OverrideKey | null {
  if (row.systemType === "trip_cashflow" && row.sourceTripExpenseId) {
    return { sourceKind: origin === "local_trip" ? "trip_expense" : "shared_trip_expense", sourceId: row.sourceTripExpenseId, direction: "cashflow" };
  }
  if (row.systemType === "trip_settlement" && row.sourceTripSettlementId) {
    const direction = row.type === "income" ? "in" : "out";
    return { sourceKind: origin === "local_trip" ? "trip_settlement" : "shared_trip_settlement", sourceId: row.sourceTripSettlementId, direction };
  }
  return null;
}

function keyString(k: OverrideKey) {
  return `${k.sourceKind}|${k.sourceId}|${k.direction}`;
}

export async function loadOverrideMap(ctx: Ctx, userId: string): Promise<Map<string, string>> {
  const rows = await ctx.db
    .query("derivedAccountOverrides")
    .withIndex("by_user", (q: any) => q.eq("userId", userId))
    .collect();
  const map = new Map<string, string>();
  for (const r of rows) {
    if (r.deletedAtMs !== undefined) continue;
    map.set(keyString(r), r.accountId);
  }
  return map;
}

/** Default account for derived cashflow: settings.defaultAccountId, else first live account by sortIndex. */
export async function resolveDefaultAccountId(ctx: Ctx, userId: string, accounts?: any[]): Promise<string | null> {
  const settings = await ctx.db
    .query("userSettings")
    .withIndex("by_user", (q: any) => q.eq("userId", userId))
    .first();
  const live = accounts ?? (await listOwnedLive(ctx, userId, "accounts"));
  const liveIds = new Set(live.map((a: any) => a.id));
  if (settings?.defaultAccountId && liveIds.has(settings.defaultAccountId)) return settings.defaultAccountId;
  const sorted = [...live].sort((a: any, b: any) => (a.sortIndex ?? 0) - (b.sortIndex ?? 0));
  return sorted[0]?.id ?? null;
}

/**
 * Compute every virtual derived row for the user across local group trips and
 * shared trips. Applies PWA account overrides. Pure read; no writes.
 */
const NO_DEFAULT_ACCOUNT = "__no_default_account__";

export async function computeVirtualDerivedRows(ctx: Ctx, userId: string, opts?: { accounts?: any[]; categories?: any[] }): Promise<VirtualDerivedRow[]> {
  const accounts = opts?.accounts ?? (await listOwnedLive(ctx, userId, "accounts"));
  const categories = opts?.categories ?? (await listOwnedLive(ctx, userId, "categories"));
  // With no live account there is no default, but saved overrides (e.g. to an archived account)
  // must still apply. Compute with a placeholder default, apply overrides, then drop only the
  // cashflow/settlement rows still on the placeholder, matching the no-default behaviour.
  const defaultAccountId = (await resolveDefaultAccountId(ctx, userId, accounts)) ?? NO_DEFAULT_ACCOUNT;
  const overrides = await loadOverrideMap(ctx, userId);
  // Overrides may point at an archived account: native keeps a derived row on the account it
  // was assigned even after that account is deleted, so the web must not re-home it either.
  const ownedAccountIds = new Set(
    (await ctx.db.query("accounts").withIndex("by_user", (q: any) => q.eq("userId", userId)).collect()).map((a: any) => a.id)
  );
  const liveAccountIds = new Set(accounts.map((a: any) => a.id));
  const catMap = new Map(categories.map((c: any) => [c.id, c]));
  const out: VirtualDerivedRow[] = [];

  const applyOverrides = (rows: DerivedTransactionUpsert[], origin: "local_trip" | "shared_trip", tripId: string, stampMs: number) => {
    for (const row of rows) {
      const key = overrideKeyFor(row, origin);
      if (key) {
        const chosen = overrides.get(keyString(key));
        if (chosen && ownedAccountIds.has(chosen)) row.accountId = chosen;
      }
      if (row.accountId === NO_DEFAULT_ACCOUNT) continue;
      out.push({ ...row, createdAtMs: stampMs, updatedAtMs: stampMs, virtual: true, origin, tripId });
    }
  };

  // ---- Local group trips ----
  const trips = (await listOwnedLive(ctx, userId, "trips")).filter((t: any) => t.isGroup === 1);
  if (trips.length) {
    const participantsAll = await listOwnedLive(ctx, userId, "tripParticipants");
    const expensesAll = await listOwnedLive(ctx, userId, "tripExpenses");
    const settlementsAll = await listOwnedLive(ctx, userId, "tripSettlements");
    const txIds = new Set(expensesAll.map((e: any) => e.transactionId));
    const txById = new Map<string, any>();
    if (txIds.size) {
      const txs = await listOwnedLive(ctx, userId, "transactions");
      for (const t of txs) if (txIds.has(t.id)) txById.set(t.id, t);
    }

    for (const trip of trips) {
      const participants = normalizeCurrentUserFlags(
        participantsAll
          .filter((p: any) => p.tripId === trip.id)
          .map((p: any) => ({
            id: p.id, tripId: p.tripId, name: p.name, isCurrentUser: p.isCurrentUser === 1,
            colorHex: p.colorHex, createdAtMs: p.createdAtMs, updatedAtMs: p.updatedAtMs,
          }))
      );
      const me = participants.find((p) => p.isCurrentUser);
      if (!me) continue;

      const legacyPaidFrom = new Map<string, string>();
      const expenses = expensesAll
        .filter((e: any) => e.tripId === trip.id)
        .map((e: any) => {
          const tx = txById.get(e.transactionId);
          if (!tx) return null;
          if (tx.accountId) legacyPaidFrom.set(e.id, tx.accountId);
          const cat = tx.categoryId ? catMap.get(tx.categoryId) : undefined;
          return {
            id: e.id, tripId: e.tripId, amountCents: Math.abs(tx.amountCents ?? 0), dateMs: tx.date ?? e.createdAtMs,
            note: tx.note ?? null, paidByParticipantId: e.paidByParticipantId ?? null, splitType: e.splitType,
            splitData: parseJson(e.splitDataJson), computedSplits: parseJson(e.computedSplitsJson),
            categoryEmoji: (cat as any)?.emoji ?? null, categoryName: (cat as any)?.name ?? null,
            updatedAtMs: Math.max(e.updatedAtMs ?? 0, tx.updatedAtMs ?? 0),
          };
        })
        .filter((e: any) => e && e.amountCents > 0) as any[];
      const settlements = settlementsAll
        .filter((s: any) => s.tripId === trip.id)
        .map((s: any) => ({
          id: s.id, tripId: s.tripId, fromParticipantId: s.fromParticipantId, toParticipantId: s.toParticipantId,
          amountCents: Math.abs(s.amountCents), dateMs: s.date, note: s.note ?? null, updatedAtMs: s.updatedAtMs ?? 0,
        }));
      const rows = computeTripDerivedRowsForUser({
        derivedKey: userId, defaultAccountId, tripLabel: `${trip.emoji} ${trip.name}`,
        participants, meParticipantId: me.id, expenses, settlements,
      });
      for (const row of rows) {
        if (row.systemType === "trip_cashflow" && row.sourceTripExpenseId) {
          const legacy = legacyPaidFrom.get(row.sourceTripExpenseId);
          if (legacy && liveAccountIds.has(legacy)) row.accountId = legacy;
        }
      }
      const stamp = Math.max(trip.updatedAtMs ?? 0, ...expenses.map((e: any) => e.updatedAtMs), ...settlements.map((s: any) => s.updatedAtMs));
      applyOverrides(rows, "local_trip", trip.id, stamp);
    }
  }

  // ---- Shared trips ----
  const memberships = await ctx.db
    .query("sharedTripMembers")
    .withIndex("by_user", (q: any) => q.eq("userId", userId))
    .collect();
  for (const member of memberships) {
    if (member.deletedAtMs !== undefined) continue;
    const trip = await ctx.db.query("sharedTrips").withIndex("by_client_id", (q: any) => q.eq("id", member.tripId)).first();
    if (!trip || trip.deletedAtMs !== undefined) continue;
    const participants = (await ctx.db.query("sharedTripParticipants").withIndex("by_trip", (q: any) => q.eq("tripId", trip.id)).collect())
      .filter((p: any) => p.deletedAtMs === undefined)
      .map((p: any) => ({ id: p.id, tripId: p.tripId, name: p.name, isCurrentUser: p.id === member.participantId, colorHex: p.colorHex, createdAtMs: p.createdAtMs, updatedAtMs: p.updatedAtMs }));
    const expenses = (await ctx.db.query("sharedTripExpenses").withIndex("by_trip", (q: any) => q.eq("tripId", trip.id)).collect())
      .filter((e: any) => e.deletedAtMs === undefined)
      .map((e: any) => ({
        id: e.id, tripId: e.tripId, amountCents: e.amountCents, dateMs: e.dateMs, note: e.note ?? null,
        paidByParticipantId: e.paidByParticipantId ?? null, splitType: e.splitType,
        splitData: parseJson(e.splitDataJson), computedSplits: parseJson(e.computedSplitsJson),
        categoryEmoji: e.categoryEmoji ?? null, categoryName: e.categoryName ?? null, updatedAtMs: e.updatedAtMs ?? 0,
      }));
    const settlements = (await ctx.db.query("sharedTripSettlements").withIndex("by_trip", (q: any) => q.eq("tripId", trip.id)).collect())
      .filter((s: any) => s.deletedAtMs === undefined)
      .map((s: any) => ({ id: s.id, tripId: s.tripId, fromParticipantId: s.fromParticipantId, toParticipantId: s.toParticipantId, amountCents: s.amountCents, dateMs: s.dateMs, note: s.note ?? null, updatedAtMs: s.updatedAtMs ?? 0 }));
    const rows = computeTripDerivedRowsForUser({
      derivedKey: userId, defaultAccountId, tripLabel: `${trip.emoji} ${trip.name}`,
      participants, meParticipantId: member.participantId, expenses, settlements,
    });
    const stamp = Math.max(trip.updatedAtMs ?? 0, ...expenses.map((e) => e.updatedAtMs), ...settlements.map((s) => s.updatedAtMs));
    applyOverrides(rows, "shared_trip", trip.id, stamp);
  }

  return out;
}

function parseJson(value: string | null | undefined): Record<string, number> | null {
  if (!value) return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

/** Insert or update (and un-delete) one PWA-only derived-account override. */
export async function upsertDerivedOverride(ctx: any, userId: string, key: OverrideKey, accountId: string): Promise<number> {
  const now = serverNow();
  const existing = await ctx.db
    .query("derivedAccountOverrides")
    .withIndex("by_user_source", (q: any) => q.eq("userId", userId).eq("sourceKind", key.sourceKind).eq("sourceId", key.sourceId).eq("direction", key.direction))
    .first();
  if (existing) {
    await ctx.db.patch(existing._id, { accountId, updatedAtMs: now, deletedAtMs: undefined, revision: existing.revision + 1 });
    return existing.revision + 1;
  }
  await ctx.db.insert("derivedAccountOverrides", { userId, ...key, accountId, updatedAtMs: now, revision: 1 });
  return 1;
}

/**
 * Native treats an account set on a local group-trip base transaction as the
 * account its "you paid" cashflow row charges (legacyPaidFromAccountByExpenseId).
 * The web keeps the base row account-less and records that choice as an override.
 */
export async function setLocalTripCashflowAccount(ctx: any, userId: string, tripExpenseId: string, accountId: string): Promise<void> {
  await upsertDerivedOverride(ctx, userId, { sourceKind: "trip_expense", sourceId: tripExpenseId, direction: "cashflow" }, accountId);
}

/**
 * Native keeps a derived cashflow/settlement row's account once it is assigned
 * (upsertDerivedBatch preserves accountId), so changing the default account only
 * affects new trip payments. The web projection recomputes on every read, so before
 * the default changes we pin every not-yet-overridden row to the account it charges
 * now. Writes only PWA-only overrides; nothing enters the changeLog.
 */
export async function pinDerivedAccounts(ctx: any, userId: string): Promise<number> {
  return withAuditReason(ctx, "default account change: keep past trip payments on their account", () => pinDerivedAccountsInner(ctx, userId));
}

async function pinDerivedAccountsInner(ctx: any, userId: string): Promise<number> {
  const rows = await computeVirtualDerivedRows(ctx, userId);
  const overrides = await loadOverrideMap(ctx, userId);
  let pinned = 0;
  for (const row of rows) {
    const key = overrideKeyFor(row, row.origin);
    if (!key || !row.accountId || overrides.has(keyString(key))) continue;
    // Also re-pins a previously cleared override to the account currently charged.
    await upsertDerivedOverride(ctx, userId, key, row.accountId);
    overrides.set(keyString(key), row.accountId);
    pinned++;
  }
  return pinned;
}

/** Pin derived accounts only when the effective default account is about to change. */
export async function pinDerivedAccountsIfDefaultChanges(ctx: any, userId: string, nextDefaultAccountId: string | null): Promise<void> {
  const current = await resolveDefaultAccountId(ctx, userId);
  if (current && current !== nextDefaultAccountId) await pinDerivedAccounts(ctx, userId);
}

/** Defensive: drop any legacy/malformed persisted derived row before merging the virtual projection. */
export function excludePersistedDerivedRows<T extends { systemType?: string | null }>(rows: T[]): T[] {
  return rows.filter((r) => !isDerivedTripSystemType(r.systemType ?? null));
}

// ---------------------------------------------------------------------------
// Overrides API (PWA-only, owner-scoped, never in legacy change logs)
// ---------------------------------------------------------------------------

export const listOverrides = query({
  args: {},
  handler: async (ctx) => {
    const userId = await requireUser(ctx);
    const rows = await ctx.db.query("derivedAccountOverrides").withIndex("by_user", (q: any) => q.eq("userId", userId)).collect();
    return rows.filter((r) => r.deletedAtMs === undefined).map(({ _id, _creationTime, userId: _u, ...rest }) => rest);
  },
});

export const setOverride = mutation({
  args: {
    sourceKind: v.union(v.literal("trip_expense"), v.literal("trip_settlement"), v.literal("shared_trip_expense"), v.literal("shared_trip_settlement")),
    sourceId: v.string(),
    direction: v.union(v.literal("cashflow"), v.literal("in"), v.literal("out")),
    accountId: v.union(v.string(), v.null()),
  },
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    const now = serverNow();
    const existing = await ctx.db
      .query("derivedAccountOverrides")
      .withIndex("by_user_source", (q: any) => q.eq("userId", userId).eq("sourceKind", args.sourceKind).eq("sourceId", args.sourceId).eq("direction", args.direction))
      .first();
    if (args.accountId === null) {
      if (existing && existing.deletedAtMs === undefined) {
        await ctx.db.patch(existing._id, { deletedAtMs: now, updatedAtMs: now, revision: existing.revision + 1 });
      }
      return { cleared: true };
    }
    await assertOwnedRef(ctx, userId, "accounts", args.accountId, "accountId");
    if (existing) {
      await ctx.db.patch(existing._id, { accountId: args.accountId, updatedAtMs: now, deletedAtMs: undefined, revision: existing.revision + 1 });
      return { cleared: false, revision: existing.revision + 1 };
    }
    await ctx.db.insert("derivedAccountOverrides", { userId, sourceKind: args.sourceKind, sourceId: args.sourceId, direction: args.direction, accountId: args.accountId, updatedAtMs: now, revision: 1 });
    return { cleared: false, revision: 1 };
  },
});

/**
 * Convenience for the web Transaction detail: choose the account for a virtual
 * derived row by its native-compatible derived id. Resolves whether the source
 * is a local or shared trip row.
 */
export const setOverrideForDerivedRow = mutation({
  args: { derivedId: v.string(), accountId: v.union(v.string(), v.null()) },
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    const safeUser = userId.replace(/[^A-Za-z0-9._-]/g, "_");
    let m = args.derivedId.match(new RegExp(`^drv_trip_cashflow_${escapeRegExp(safeUser)}_(.+)$`));
    let direction: "cashflow" | "in" | "out" = "cashflow";
    let sourceId: string | null = m ? m[1] : null;
    let isSettlement = false;
    if (!sourceId) {
      m = args.derivedId.match(new RegExp(`^drv_trip_settlement_(in|out)_${escapeRegExp(safeUser)}_(.+)$`));
      if (m) { direction = m[1] as "in" | "out"; sourceId = m[2]; isSettlement = true; }
    }
    if (!sourceId) throw pwaErrorLocal("VALIDATION", "Not an account-bearing derived row");
    // Native ids replace unsafe characters; look up by exact id first, then by sanitized match.
    const localTable = isSettlement ? "tripSettlements" : "tripExpenses";
    const sharedTable = isSettlement ? "sharedTripSettlements" : "sharedTripExpenses";
    let sourceKind: string | null = null;
    let resolvedId: string | null = null;
    const localRows = await listOwnedLive(ctx, userId, localTable as any);
    const local = localRows.find((r: any) => r.id === sourceId || r.id.replace(/[^A-Za-z0-9._-]/g, "_") === sourceId);
    if (local) { sourceKind = isSettlement ? "trip_settlement" : "trip_expense"; resolvedId = local.id; }
    else {
      const memberships = (await ctx.db.query("sharedTripMembers").withIndex("by_user", (q: any) => q.eq("userId", userId)).collect()).filter((x: any) => x.deletedAtMs === undefined);
      for (const mbr of memberships) {
        const rows = await ctx.db.query(sharedTable as any).withIndex("by_trip", (q: any) => q.eq("tripId", mbr.tripId)).collect();
        const hit = rows.find((r: any) => r.id === sourceId || r.id.replace(/[^A-Za-z0-9._-]/g, "_") === sourceId);
        if (hit) { sourceKind = isSettlement ? "shared_trip_settlement" : "shared_trip_expense"; resolvedId = hit.id; break; }
      }
    }
    if (!sourceKind || !resolvedId) throw pwaErrorLocal("NOT_FOUND", "Derived source not found");
    const now = serverNow();
    const existing = await ctx.db
      .query("derivedAccountOverrides")
      .withIndex("by_user_source", (q: any) => q.eq("userId", userId).eq("sourceKind", sourceKind).eq("sourceId", resolvedId).eq("direction", direction))
      .first();
    if (args.accountId === null) {
      if (existing && existing.deletedAtMs === undefined) await ctx.db.patch(existing._id, { deletedAtMs: now, updatedAtMs: now, revision: existing.revision + 1 });
      return { cleared: true };
    }
    await assertOwnedRef(ctx, userId, "accounts", args.accountId, "accountId");
    if (existing) { await ctx.db.patch(existing._id, { accountId: args.accountId, updatedAtMs: now, deletedAtMs: undefined, revision: existing.revision + 1 }); return { cleared: false }; }
    await ctx.db.insert("derivedAccountOverrides", { userId, sourceKind, sourceId: resolvedId, direction, accountId: args.accountId, updatedAtMs: now, revision: 1 });
    return { cleared: false };
  },
});

function escapeRegExp(s: string) { return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }
import { pwaError as pwaErrorLocal } from "./pwaAuth";
