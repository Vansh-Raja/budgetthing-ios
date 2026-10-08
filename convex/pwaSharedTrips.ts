/**
 * PWA shared-trip read models and commands. Membership-guarded; every change
 * is recorded through the trip-scoped change log so native members pull it
 * through the unchanged `sharedTripSync` protocol. Derived rows stay virtual.
 */
import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { pwaError, requireUser, serverNow, toWire } from "./pwaAuth";
import { assertCents, assertDateMs, assertEmoji, assertText, computeAndValidateSplits, optionalText, vExpectedVersion, vNullableNumber, vNullableString, vSplitMap, vSplitType } from "./pwaValidation";
import { recordTripChange } from "./sharedTripSeq";
import { idempotentSharedTripExpenseId, idempotentSharedTripSettlementId } from "../lib/logic/idempotency";

type SharedTable = "sharedTrips" | "sharedTripParticipants" | "sharedTripExpenses" | "sharedTripSettlements";

async function requireMember(ctx: any, tripId: string, userId: string) {
  const member = await ctx.db.query("sharedTripMembers").withIndex("by_user_trip", (q: any) => q.eq("userId", userId).eq("tripId", tripId)).first();
  if (!member || member.deletedAtMs !== undefined) throw pwaError("FORBIDDEN", "Not a member of this trip");
  return member;
}

async function byClientId(ctx: any, table: SharedTable, id: string) {
  return ctx.db.query(table).withIndex("by_client_id", (q: any) => q.eq("id", id)).first();
}

async function requireLiveShared(ctx: any, table: SharedTable, id: string, tripId: string) {
  const row = await byClientId(ctx, table, id);
  if (!row || row.deletedAtMs !== undefined) throw pwaError("NOT_FOUND", `${table} ${id} not found`);
  const rowTripId = table === "sharedTrips" ? row.id : row.tripId;
  if (rowTripId !== tripId) throw pwaError("FORBIDDEN", "Row belongs to another trip");
  return row;
}

async function insertShared(ctx: any, table: SharedTable, tripId: string, id: string, data: Record<string, unknown>, nowMs: number) {
  const doc: Record<string, unknown> = { id, ...(table === "sharedTrips" ? {} : { tripId }) };
  for (const [k, val] of Object.entries(data)) if (val !== undefined && val !== null) doc[k] = val;
  Object.assign(doc, { createdAtMs: nowMs, updatedAtMs: nowMs, syncVersion: 1 });
  await ctx.db.insert(table, doc);
  await recordTripChange(ctx, tripId, table, id, nowMs, "upsert");
  return toWire(await byClientId(ctx, table, id));
}

async function patchShared(ctx: any, table: SharedTable, tripId: string, existing: any, patch: Record<string, unknown>, nowMs: number) {
  const next: Record<string, unknown> = {};
  for (const [k, val] of Object.entries(patch)) { if (val === undefined) continue; next[k] = val === null ? undefined : val; }
  next.updatedAtMs = nowMs;
  next.syncVersion = (existing.syncVersion ?? 0) + 1;
  await ctx.db.patch(existing._id, next);
  const isDelete = next.deletedAtMs !== undefined;
  await recordTripChange(ctx, tripId, table, existing.id, nowMs, isDelete ? "delete" : "upsert");
  return toWire(await ctx.db.get(existing._id));
}

function assertVersion(row: any, expected?: number | null) {
  if (expected === undefined || expected === null) return;
  if ((row.syncVersion ?? 0) !== expected) throw pwaError("CONFLICT", "Row changed since you loaded it", { row: toWire(row), expectedSyncVersion: expected, currentSyncVersion: row.syncVersion ?? 0 });
}

function parseJson(value: string | null | undefined) {
  if (!value) return undefined;
  try { return JSON.parse(value); } catch { return undefined; }
}

async function participantsFor(ctx: any, tripId: string, myParticipantId: string) {
  return (await ctx.db.query("sharedTripParticipants").withIndex("by_trip", (q: any) => q.eq("tripId", tripId)).collect())
    .filter((p: any) => p.deletedAtMs === undefined)
    .map((p: any) => ({ id: p.id, name: p.name, isCurrentUser: p.id === myParticipantId, colorHex: p.colorHex, linkedUserId: p.linkedUserId, createdAtMs: p.createdAtMs, updatedAtMs: p.updatedAtMs, syncVersion: p.syncVersion }));
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

export const listMine = query({
  args: {},
  handler: async (ctx) => {
    const userId = await requireUser(ctx);
    const memberships = (await ctx.db.query("sharedTripMembers").withIndex("by_user", (q: any) => q.eq("userId", userId)).collect()).filter((m: any) => m.deletedAtMs === undefined);
    const out: any[] = [];
    for (const m of memberships) {
      const trip = await byClientId(ctx, "sharedTrips", m.tripId);
      if (!trip || trip.deletedAtMs !== undefined) continue;
      const expenses = (await ctx.db.query("sharedTripExpenses").withIndex("by_trip", (q: any) => q.eq("tripId", trip.id)).collect()).filter((e: any) => e.deletedAtMs === undefined);
      const participants = await participantsFor(ctx, trip.id, m.participantId);
      out.push({
        ...toWire(trip), myParticipantId: m.participantId, participantCount: participants.length, expenseCount: expenses.length,
        totalSpentCents: expenses.reduce((s: number, e: any) => s + Math.abs(e.amountCents), 0),
      });
    }
    return out.sort((a, b) => (b.updatedAtMs ?? 0) - (a.updatedAtMs ?? 0));
  },
});

export const getTrip = query({
  args: { tripId: v.string() },
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    const member = await requireMember(ctx, args.tripId, userId);
    const trip = await byClientId(ctx, "sharedTrips", args.tripId);
    if (!trip || trip.deletedAtMs !== undefined) return null;
    const participants = await participantsFor(ctx, trip.id, member.participantId);
    const expenses = (await ctx.db.query("sharedTripExpenses").withIndex("by_trip", (q: any) => q.eq("tripId", trip.id)).collect())
      .filter((e: any) => e.deletedAtMs === undefined)
      .map((e: any) => ({ ...toWire(e), splitData: parseJson(e.splitDataJson), computedSplits: parseJson(e.computedSplitsJson) }))
      .sort((a: any, b: any) => b.dateMs - a.dateMs);
    const settlements = (await ctx.db.query("sharedTripSettlements").withIndex("by_trip", (q: any) => q.eq("tripId", trip.id)).collect())
      .filter((s: any) => s.deletedAtMs === undefined).map(toWire).sort((a: any, b: any) => b.dateMs - a.dateMs);
    const members = (await ctx.db.query("sharedTripMembers").withIndex("by_trip", (q: any) => q.eq("tripId", trip.id)).collect())
      .filter((x: any) => x.deletedAtMs === undefined).map((x: any) => ({ userId: x.userId, participantId: x.participantId, joinedAtMs: x.joinedAtMs }));
    return { ...toWire(trip), myParticipantId: member.participantId, participants, expenses, settlements, members };
  },
});

/** Resolve trip ids / display meta for shared expense, settlement, and participant ids (member-scoped). */
export const resolveMeta = query({
  args: { expenseIds: v.optional(v.array(v.string())), settlementIds: v.optional(v.array(v.string())), participantIds: v.optional(v.array(v.string())) },
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    const memberships = (await ctx.db.query("sharedTripMembers").withIndex("by_user", (q: any) => q.eq("userId", userId)).collect()).filter((m: any) => m.deletedAtMs === undefined);
    const myTrips = new Set(memberships.map((m: any) => m.tripId));
    const tripCache = new Map<string, any>();
    const tripFor = async (tripId: string) => {
      if (!myTrips.has(tripId)) return null;
      if (!tripCache.has(tripId)) tripCache.set(tripId, await byClientId(ctx, "sharedTrips", tripId));
      return tripCache.get(tripId);
    };
    const expenses: Record<string, any> = {};
    for (const id of new Set(args.expenseIds ?? [])) {
      const e = await byClientId(ctx, "sharedTripExpenses", id);
      const trip = e ? await tripFor(e.tripId) : null;
      if (e && trip) expenses[id] = { tripId: e.tripId, tripEmoji: trip.emoji, categoryEmoji: e.categoryEmoji ?? null, categoryName: e.categoryName ?? null, amountCents: e.amountCents };
    }
    const settlements: Record<string, any> = {};
    for (const id of new Set(args.settlementIds ?? [])) {
      const s = await byClientId(ctx, "sharedTripSettlements", id);
      const trip = s ? await tripFor(s.tripId) : null;
      if (s && trip) settlements[id] = { tripId: s.tripId, tripEmoji: trip.emoji };
    }
    const participants: Record<string, any> = {};
    for (const id of new Set(args.participantIds ?? [])) {
      const p = await byClientId(ctx, "sharedTripParticipants", id);
      const trip = p ? await tripFor(p.tripId) : null;
      if (p && trip) participants[id] = { tripId: p.tripId };
    }
    return { expenses, settlements, participants };
  },
});

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------

export const updateTrip = mutation({
  args: { tripId: v.string(), expectedSyncVersion: vExpectedVersion, name: v.optional(v.string()), emoji: v.optional(v.string()), startDateMs: v.optional(vNullableNumber), endDateMs: v.optional(vNullableNumber), budgetCents: v.optional(vNullableNumber) },
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    await requireMember(ctx, args.tripId, userId);
    const trip = await requireLiveShared(ctx, "sharedTrips", args.tripId, args.tripId);
    assertVersion(trip, args.expectedSyncVersion);
    const patch: Record<string, unknown> = {};
    if (args.name !== undefined) patch.name = assertText(args.name, "name", { min: 1, max: 80 });
    if (args.emoji !== undefined) patch.emoji = assertEmoji(args.emoji);
    if (args.startDateMs !== undefined) patch.startDateMs = args.startDateMs === null ? null : assertDateMs(args.startDateMs, "startDateMs");
    if (args.endDateMs !== undefined) patch.endDateMs = args.endDateMs === null ? null : assertDateMs(args.endDateMs, "endDateMs");
    if (args.budgetCents !== undefined) patch.budgetCents = args.budgetCents === null ? null : assertCents(args.budgetCents, "budgetCents", { allowZero: true });
    return patchShared(ctx, "sharedTrips", args.tripId, trip, patch, serverNow());
  },
});

export const addParticipant = mutation({
  args: { tripId: v.string(), name: v.string(), colorHex: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    await requireMember(ctx, args.tripId, userId);
    await requireLiveShared(ctx, "sharedTrips", args.tripId, args.tripId);
    const id = `${args.tripId}:p:${crypto.randomUUID()}`;
    return insertShared(ctx, "sharedTripParticipants", args.tripId, id, { name: assertText(args.name, "name", { min: 1, max: 60 }), colorHex: args.colorHex }, serverNow());
  },
});

export const updateParticipant = mutation({
  args: { tripId: v.string(), id: v.string(), expectedSyncVersion: vExpectedVersion, name: v.optional(v.string()), colorHex: v.optional(vNullableString) },
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    await requireMember(ctx, args.tripId, userId);
    const row = await requireLiveShared(ctx, "sharedTripParticipants", args.id, args.tripId);
    assertVersion(row, args.expectedSyncVersion);
    const patch: Record<string, unknown> = {};
    if (args.name !== undefined) patch.name = assertText(args.name, "name", { min: 1, max: 60 });
    if (args.colorHex !== undefined) patch.colorHex = args.colorHex;
    return patchShared(ctx, "sharedTripParticipants", args.tripId, row, patch, serverNow());
  },
});

export const removeParticipant = mutation({
  args: { tripId: v.string(), id: v.string(), expectedSyncVersion: vExpectedVersion },
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    await requireMember(ctx, args.tripId, userId);
    const row = await requireLiveShared(ctx, "sharedTripParticipants", args.id, args.tripId);
    assertVersion(row, args.expectedSyncVersion);
    if (row.linkedUserId) throw pwaError("STATE", "Remove the member instead of deleting a linked participant");
    return patchShared(ctx, "sharedTripParticipants", args.tripId, row, { deletedAtMs: serverNow() }, serverNow());
  },
});

export const addExpense = mutation({
  args: {
    tripId: v.string(), amountCents: v.number(), dateMs: v.number(), note: v.optional(vNullableString),
    paidByParticipantId: v.string(), splitType: vSplitType, splitData: v.optional(v.union(vSplitMap, v.null())),
    categoryName: v.optional(vNullableString), categoryEmoji: v.optional(vNullableString),
  },
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    const member = await requireMember(ctx, args.tripId, userId);
    await requireLiveShared(ctx, "sharedTrips", args.tripId, args.tripId);
    const amountCents = assertCents(args.amountCents, "amountCents");
    const dateMs = assertDateMs(args.dateMs, "dateMs");
    const participants = await participantsFor(ctx, args.tripId, member.participantId);
    const r = computeAndValidateSplits({ amountCents, splitType: args.splitType, participants, splitData: args.splitData ?? undefined, paidByParticipantId: args.paidByParticipantId });
    const note = optionalText(args.note, "note");
    const categoryName = optionalText(args.categoryName, "categoryName", 80);
    const categoryEmoji = optionalText(args.categoryEmoji, "categoryEmoji", 16);
    const id = idempotentSharedTripExpenseId({ tripId: args.tripId, amountCents, dateMs, paidByParticipantId: args.paidByParticipantId, splitType: args.splitType, splitData: r.splitData ?? null, computedSplits: r.computedSplits, categoryName: categoryName ?? null, categoryEmoji: categoryEmoji ?? null, note: note ?? null });
    const existing = await byClientId(ctx, "sharedTripExpenses", id);
    const now = serverNow();
    const data = { amountCents, dateMs, note, paidByParticipantId: args.paidByParticipantId, splitType: args.splitType, splitDataJson: r.splitData ? JSON.stringify(r.splitData) : undefined, computedSplitsJson: JSON.stringify(r.computedSplits), categoryName, categoryEmoji };
    if (existing && existing.deletedAtMs === undefined) return toWire(existing);
    if (existing) return patchShared(ctx, "sharedTripExpenses", args.tripId, existing, { ...data, deletedAtMs: null }, now);
    return insertShared(ctx, "sharedTripExpenses", args.tripId, id, data, now);
  },
});

export const updateExpense = mutation({
  args: {
    tripId: v.string(), id: v.string(), expectedSyncVersion: vExpectedVersion,
    amountCents: v.optional(v.number()), dateMs: v.optional(v.number()), note: v.optional(vNullableString),
    paidByParticipantId: v.optional(v.string()), splitType: v.optional(vSplitType), splitData: v.optional(v.union(vSplitMap, v.null())),
    categoryName: v.optional(vNullableString), categoryEmoji: v.optional(vNullableString),
  },
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    const member = await requireMember(ctx, args.tripId, userId);
    const row = await requireLiveShared(ctx, "sharedTripExpenses", args.id, args.tripId);
    assertVersion(row, args.expectedSyncVersion);
    const amountCents = args.amountCents !== undefined ? assertCents(args.amountCents, "amountCents") : row.amountCents;
    const splitType = args.splitType ?? row.splitType;
    const splitData = args.splitData !== undefined ? (args.splitData ?? undefined) : parseJson(row.splitDataJson);
    const paidBy = args.paidByParticipantId ?? row.paidByParticipantId;
    const participants = await participantsFor(ctx, args.tripId, member.participantId);
    const r = computeAndValidateSplits({ amountCents, splitType, participants, splitData, paidByParticipantId: paidBy });
    const patch: Record<string, unknown> = {
      amountCents, splitType, paidByParticipantId: paidBy,
      splitDataJson: r.splitData ? JSON.stringify(r.splitData) : null, computedSplitsJson: JSON.stringify(r.computedSplits),
    };
    if (args.dateMs !== undefined) patch.dateMs = assertDateMs(args.dateMs, "dateMs");
    if (args.note !== undefined) patch.note = args.note === null ? null : optionalText(args.note, "note") ?? null;
    if (args.categoryName !== undefined) patch.categoryName = args.categoryName === null ? null : optionalText(args.categoryName, "categoryName", 80) ?? null;
    if (args.categoryEmoji !== undefined) patch.categoryEmoji = args.categoryEmoji === null ? null : optionalText(args.categoryEmoji, "categoryEmoji", 16) ?? null;
    return patchShared(ctx, "sharedTripExpenses", args.tripId, row, patch, serverNow());
  },
});

export const deleteExpense = mutation({
  args: { tripId: v.string(), id: v.string(), expectedSyncVersion: vExpectedVersion },
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    await requireMember(ctx, args.tripId, userId);
    const row = await requireLiveShared(ctx, "sharedTripExpenses", args.id, args.tripId);
    assertVersion(row, args.expectedSyncVersion);
    const now = serverNow();
    return patchShared(ctx, "sharedTripExpenses", args.tripId, row, { deletedAtMs: now }, now);
  },
});

export const recordSettlement = mutation({
  args: { tripId: v.string(), fromParticipantId: v.string(), toParticipantId: v.string(), amountCents: v.number(), dateMs: v.number(), note: v.optional(vNullableString) },
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    const member = await requireMember(ctx, args.tripId, userId);
    await requireLiveShared(ctx, "sharedTrips", args.tripId, args.tripId);
    if (args.fromParticipantId === args.toParticipantId) throw pwaError("VALIDATION", "Choose two different participants");
    const ids = new Set((await participantsFor(ctx, args.tripId, member.participantId)).map((p: any) => p.id));
    if (!ids.has(args.fromParticipantId) || !ids.has(args.toParticipantId)) throw pwaError("VALIDATION", "Participants must belong to this trip");
    const amountCents = assertCents(args.amountCents, "amountCents");
    const dateMs = assertDateMs(args.dateMs, "dateMs");
    const note = optionalText(args.note, "note");
    const id = idempotentSharedTripSettlementId({ tripId: args.tripId, fromParticipantId: args.fromParticipantId, toParticipantId: args.toParticipantId, amountCents, dateMs, note: note ?? null });
    const existing = await byClientId(ctx, "sharedTripSettlements", id);
    const now = serverNow();
    const data = { fromParticipantId: args.fromParticipantId, toParticipantId: args.toParticipantId, amountCents, dateMs, note };
    if (existing && existing.deletedAtMs === undefined) return toWire(existing);
    if (existing) return patchShared(ctx, "sharedTripSettlements", args.tripId, existing, { ...data, deletedAtMs: null }, now);
    return insertShared(ctx, "sharedTripSettlements", args.tripId, id, data, now);
  },
});

export const deleteSettlement = mutation({
  args: { tripId: v.string(), id: v.string(), expectedSyncVersion: vExpectedVersion },
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    await requireMember(ctx, args.tripId, userId);
    const row = await requireLiveShared(ctx, "sharedTripSettlements", args.id, args.tripId);
    assertVersion(row, args.expectedSyncVersion);
    const now = serverNow();
    return patchShared(ctx, "sharedTripSettlements", args.tripId, row, { deletedAtMs: now }, now);
  },
});
