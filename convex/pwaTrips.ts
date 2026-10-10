/**
 * PWA local-trip read models and commands (trips, participants, expenses, settlements).
 * Local trips are personal rows synced through the user changeLog; group trips
 * keep exactly one current-user participant. Derived rows stay virtual.
 */
import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { setLocalTripCashflowAccount } from "./pwaDerived";
import { assertExpectedVersion, getOwned, listOwnedLive, newId, pwaError, requireOwnedLive, requireUser, serverNow, toWire } from "./pwaAuth";
import { insertOwned, patchOwned, softDeleteOwned } from "./pwaWrite";
import { assertCents, assertDateMs, assertEmoji, assertOwnedRef, assertText, computeAndValidateSplits, optionalText, vExpectedVersion, vNullableNumber, vNullableString, vSplitMap, vSplitType } from "./pwaValidation";
import { cascadeDeleteTripExpenseForTransaction } from "./pwaLedger";
import { idempotentTripSettlementId } from "../lib/logic/idempotency";
import { pickSingleCurrentUserParticipantId } from "../lib/logic/tripAccounting/currentUserParticipant";

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

async function hydrateTrips(ctx: any, userId: string, trips: any[]) {
  if (!trips.length) return [];
  const tripIds = new Set(trips.map((t) => t.id));
  const participants = (await listOwnedLive(ctx, userId, "tripParticipants")).filter((p: any) => tripIds.has(p.tripId));
  const expenses = (await listOwnedLive(ctx, userId, "tripExpenses")).filter((e: any) => tripIds.has(e.tripId));
  const settlements = (await listOwnedLive(ctx, userId, "tripSettlements")).filter((s: any) => tripIds.has(s.tripId));
  const txIds = new Set(expenses.map((e: any) => e.transactionId));
  const txById = new Map<string, any>();
  if (txIds.size) {
    for (const t of await listOwnedLive(ctx, userId, "transactions")) if (txIds.has(t.id)) txById.set(t.id, toWire(t));
  }
  return trips.map((t) => {
    const tParticipants = participants.filter((p: any) => p.tripId === t.id).map((p: any) => ({ ...toWire(p), isCurrentUser: p.isCurrentUser === 1 }));
    return {
      ...toWire(t),
      isGroup: t.isGroup === 1,
      isArchived: t.isArchived === 1,
      participants: tParticipants,
      expenses: expenses
        .filter((e: any) => e.tripId === t.id)
        .map((e: any) => ({
          ...toWire(e),
          splitData: parseJson(e.splitDataJson),
          computedSplits: parseJson(e.computedSplitsJson),
          transaction: txById.get(e.transactionId) ?? null,
        }))
        .filter((e: any) => e.transaction && e.transaction.deletedAtMs === undefined),
      settlements: settlements.filter((s: any) => s.tripId === t.id).map(toWire),
    };
  });
}

function parseJson(value: string | null | undefined) {
  if (!value) return undefined;
  try { return JSON.parse(value); } catch { return undefined; }
}

export const listTrips = query({
  args: { includeArchived: v.optional(v.boolean()) },
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    const trips = (await listOwnedLive(ctx, userId, "trips"))
      .filter((t: any) => (args.includeArchived ?? true) || t.isArchived !== 1)
      .sort((a: any, b: any) => (a.sortIndex ?? 0) - (b.sortIndex ?? 0));
    return hydrateTrips(ctx, userId, trips);
  },
});

export const getTrip = query({
  args: { id: v.string() },
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    const trip = await getOwned(ctx, userId, "trips", args.id);
    if (!trip || trip.deletedAtMs !== undefined) return null;
    return (await hydrateTrips(ctx, userId, [trip]))[0] ?? null;
  },
});

// ---------------------------------------------------------------------------
// Trip commands
// ---------------------------------------------------------------------------

export const createTrip = mutation({
  args: {
    name: v.string(), emoji: v.string(), isGroup: v.boolean(),
    startDate: v.optional(vNullableNumber), endDate: v.optional(vNullableNumber), budgetCents: v.optional(vNullableNumber),
    participants: v.optional(v.array(v.object({ name: v.string(), isCurrentUser: v.boolean(), colorHex: v.optional(v.string()) }))),
    /** When true, do not auto-add "You"; the caller adds participants next and then calls ensureCurrentUser. */
    deferParticipants: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    const existing = await listOwnedLive(ctx, userId, "trips");
    const sortIndex = existing.reduce((m: number, t: any) => Math.max(m, t.sortIndex ?? -1), -1) + 1;
    const tripId = newId();
    const now = serverNow();
    const trip = await insertOwned(ctx, userId, "trips", tripId, {
      name: assertText(args.name, "name", { min: 1, max: 80 }), emoji: assertEmoji(args.emoji), sortIndex,
      isGroup: args.isGroup ? 1 : 0, isArchived: 0,
      startDate: args.startDate == null ? undefined : assertDateMs(args.startDate, "startDate"),
      endDate: args.endDate == null ? undefined : assertDateMs(args.endDate, "endDate"),
      budgetCents: args.budgetCents == null ? undefined : assertCents(args.budgetCents, "budgetCents", { allowZero: true }),
    }, now);

    let participants = args.participants ?? [];
    if (args.isGroup && !args.deferParticipants) {
      if (participants.length === 0) participants = [{ name: "You", isCurrentUser: true }];
      else if (!participants.some((p) => p.isCurrentUser)) participants = [{ name: "You", isCurrentUser: true }, ...participants];
    }
    let currentAssigned = false;
    const created: any[] = [];
    for (const p of participants) {
      const isCurrent = args.isGroup && p.isCurrentUser && !currentAssigned;
      if (isCurrent) currentAssigned = true;
      created.push(await insertOwned(ctx, userId, "tripParticipants", newId(), {
        tripId, name: assertText(p.name, "participant name", { min: 1, max: 60 }), isCurrentUser: isCurrent ? 1 : 0, colorHex: p.colorHex,
      }, now));
    }
    return { ...trip, participants: created.map((p) => ({ ...p, isCurrentUser: p.isCurrentUser === 1 })) };
  },
});

export const updateTrip = mutation({
  args: {
    id: v.string(), expectedSyncVersion: vExpectedVersion,
    name: v.optional(v.string()), emoji: v.optional(v.string()), isArchived: v.optional(v.boolean()), isGroup: v.optional(v.boolean()),
    startDate: v.optional(vNullableNumber), endDate: v.optional(vNullableNumber), budgetCents: v.optional(vNullableNumber),
  },
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    const row = await requireOwnedLive(ctx, userId, "trips", args.id);
    assertExpectedVersion(row, args.expectedSyncVersion);
    const patch: Record<string, unknown> = {};
    if (args.isGroup !== undefined) patch.isGroup = args.isGroup ? 1 : 0;
    if (args.name !== undefined) patch.name = assertText(args.name, "name", { min: 1, max: 80 });
    if (args.emoji !== undefined) patch.emoji = assertEmoji(args.emoji);
    if (args.isArchived !== undefined) patch.isArchived = args.isArchived ? 1 : 0;
    if (args.startDate !== undefined) patch.startDate = args.startDate === null ? null : assertDateMs(args.startDate, "startDate");
    if (args.endDate !== undefined) patch.endDate = args.endDate === null ? null : assertDateMs(args.endDate, "endDate");
    if (args.budgetCents !== undefined) patch.budgetCents = args.budgetCents === null ? null : assertCents(args.budgetCents, "budgetCents", { allowZero: true });
    const updated = await patchOwned(ctx, userId, "trips", row, patch);
    // Becoming a group trip: keep the "exactly one current user" invariant (as on create).
    if (args.isGroup && row.isGroup !== 1) await ensureExactlyOneCurrentUser(ctx, userId, row.id, serverNow());
    return updated;
  },
});

/** Soft-delete a trip and its links; base transactions remain (unlinked), matching native. */
export const deleteTrip = mutation({
  args: { id: v.string(), expectedSyncVersion: vExpectedVersion },
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    const row = await requireOwnedLive(ctx, userId, "trips", args.id);
    assertExpectedVersion(row, args.expectedSyncVersion);
    const now = serverNow();
    for (const link of (await listOwnedLive(ctx, userId, "tripExpenses")).filter((e: any) => e.tripId === row.id)) {
      const tx = await getOwned(ctx, userId, "transactions", link.transactionId);
      if (tx && tx.deletedAtMs === undefined && tx.tripExpenseId === link.id) await patchOwned(ctx, userId, "transactions", tx, { tripExpenseId: null }, now);
      await softDeleteOwned(ctx, userId, "tripExpenses", link, now);
    }
    for (const s of (await listOwnedLive(ctx, userId, "tripSettlements")).filter((x: any) => x.tripId === row.id)) await softDeleteOwned(ctx, userId, "tripSettlements", s, now);
    for (const p of (await listOwnedLive(ctx, userId, "tripParticipants")).filter((x: any) => x.tripId === row.id)) await softDeleteOwned(ctx, userId, "tripParticipants", p, now);
    return softDeleteOwned(ctx, userId, "trips", row, now);
  },
});

export const reorderTrips = mutation({
  args: { idsInOrder: v.array(v.string()) },
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    const live = await listOwnedLive(ctx, userId, "trips");
    const byId = new Map(live.map((r: any) => [r.id, r]));
    const now = serverNow();
    let changed = 0;
    for (const [index, id] of args.idsInOrder.entries()) {
      const row = byId.get(id);
      if (row && row.sortIndex !== index) { await patchOwned(ctx, userId, "trips", row, { sortIndex: index }, now); changed += 1; }
    }
    return { changed };
  },
});

// ---------------------------------------------------------------------------
// Participants (exactly one current user per group trip)
// ---------------------------------------------------------------------------

async function ensureExactlyOneCurrentUser(ctx: any, userId: string, tripId: string, nowMs: number) {
  const trip = await getOwned(ctx, userId, "trips", tripId);
  if (!trip || trip.deletedAtMs !== undefined || trip.isGroup !== 1) return;
  const participants = (await listOwnedLive(ctx, userId, "tripParticipants")).filter((p: any) => p.tripId === tripId);
  if (participants.length === 0) {
    await insertOwned(ctx, userId, "tripParticipants", newId(), { tripId, name: "You", isCurrentUser: 1 }, nowMs);
    return;
  }
  const current = participants.filter((p: any) => p.isCurrentUser === 1);
  if (current.length === 1) return;
  const chosenId = pickSingleCurrentUserParticipantId(participants.map((p: any) => ({ ...p, isCurrentUser: p.isCurrentUser === 1 })));
  for (const p of participants) {
    const desired = p.id === chosenId ? 1 : 0;
    if (p.isCurrentUser !== desired) await patchOwned(ctx, userId, "tripParticipants", p, { isCurrentUser: desired }, nowMs);
  }
}

export const ensureCurrentUser = mutation({
  args: { tripId: v.string() },
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    await requireOwnedLive(ctx, userId, "trips", args.tripId);
    await ensureExactlyOneCurrentUser(ctx, userId, args.tripId, serverNow());
    return { ok: true };
  },
});

export const addParticipant = mutation({
  args: { tripId: v.string(), name: v.string(), colorHex: v.optional(v.string()), isCurrentUser: v.optional(v.boolean()) },
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    await requireOwnedLive(ctx, userId, "trips", args.tripId);
    const now = serverNow();
    const row = await insertOwned(ctx, userId, "tripParticipants", newId(), {
      tripId: args.tripId, name: assertText(args.name, "name", { min: 1, max: 60 }), colorHex: args.colorHex, isCurrentUser: 0,
    }, now);
    if (args.isCurrentUser) {
      const participants = (await listOwnedLive(ctx, userId, "tripParticipants")).filter((p: any) => p.tripId === args.tripId);
      for (const p of participants) {
        const desired = p.id === row.id ? 1 : 0;
        if (p.isCurrentUser !== desired) await patchOwned(ctx, userId, "tripParticipants", p, { isCurrentUser: desired }, now);
      }
    }
    await ensureExactlyOneCurrentUser(ctx, userId, args.tripId, now);
    const fresh = await getOwned(ctx, userId, "tripParticipants", row.id);
    return { ...toWire(fresh), isCurrentUser: fresh.isCurrentUser === 1 };
  },
});

export const updateParticipant = mutation({
  args: { id: v.string(), expectedSyncVersion: vExpectedVersion, name: v.optional(v.string()), colorHex: v.optional(vNullableString), isCurrentUser: v.optional(v.boolean()) },
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    const row = await requireOwnedLive(ctx, userId, "tripParticipants", args.id);
    assertExpectedVersion(row, args.expectedSyncVersion);
    const now = serverNow();
    const patch: Record<string, unknown> = {};
    if (args.name !== undefined) patch.name = assertText(args.name, "name", { min: 1, max: 60 });
    if (args.colorHex !== undefined) patch.colorHex = args.colorHex;
    if (args.isCurrentUser === true) {
      const others = (await listOwnedLive(ctx, userId, "tripParticipants")).filter((p: any) => p.tripId === row.tripId && p.id !== row.id && p.isCurrentUser === 1);
      for (const p of others) await patchOwned(ctx, userId, "tripParticipants", p, { isCurrentUser: 0 }, now);
      patch.isCurrentUser = 1;
    } else if (args.isCurrentUser === false && row.isCurrentUser === 1) {
      throw pwaError("STATE", "Pick another participant as you instead of unsetting the current user");
    }
    const updated = await patchOwned(ctx, userId, "tripParticipants", row, patch, now);
    await ensureExactlyOneCurrentUser(ctx, userId, row.tripId, now);
    return { ...updated, isCurrentUser: updated.isCurrentUser === 1 };
  },
});

export const removeParticipant = mutation({
  args: { id: v.string(), expectedSyncVersion: vExpectedVersion },
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    const row = await requireOwnedLive(ctx, userId, "tripParticipants", args.id);
    assertExpectedVersion(row, args.expectedSyncVersion);
    const now = serverNow();
    const participants = (await listOwnedLive(ctx, userId, "tripParticipants")).filter((p: any) => p.tripId === row.tripId);
    if (row.isCurrentUser === 1) {
      const others = participants.filter((p: any) => p.id !== row.id);
      if (others.length === 0) throw pwaError("STATE", "A group trip must keep one participant that is you");
      await patchOwned(ctx, userId, "tripParticipants", others[0], { isCurrentUser: 1 }, now);
    }
    const result = await softDeleteOwned(ctx, userId, "tripParticipants", row, now);
    await ensureExactlyOneCurrentUser(ctx, userId, row.tripId, now);
    return result;
  },
});

// ---------------------------------------------------------------------------
// Expenses (ledger transaction without account + tripExpense link)
// ---------------------------------------------------------------------------

async function liveParticipantsFor(ctx: any, userId: string, tripId: string) {
  return (await listOwnedLive(ctx, userId, "tripParticipants"))
    .filter((p: any) => p.tripId === tripId)
    .map((p: any) => ({ id: p.id, name: p.name, isCurrentUser: p.isCurrentUser === 1 }));
}

export const createExpense = mutation({
  args: {
    tripId: v.string(), amountCents: v.number(), date: v.number(), note: v.optional(vNullableString), categoryId: v.optional(vNullableString),
    paidByParticipantId: v.optional(vNullableString), splitType: vSplitType, splitData: v.optional(v.union(vSplitMap, v.null())),
    accountId: v.optional(vNullableString), // solo: charged account; group: "you paid" cashflow account
  },
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    const trip = await requireOwnedLive(ctx, userId, "trips", args.tripId);
    const amountCents = assertCents(args.amountCents, "amountCents");
    const date = assertDateMs(args.date, "date");
    const categoryId = await assertOwnedRef(ctx, userId, "categories", args.categoryId, "categoryId");
    const now = serverNow();
    const isGroup = trip.isGroup === 1;
    let splitData: Record<string, number> | undefined;
    let computedSplits: Record<string, number> | undefined;
    if (isGroup) {
      const participants = await liveParticipantsFor(ctx, userId, trip.id);
      if (!args.paidByParticipantId) throw pwaError("VALIDATION", "paidByParticipantId is required for group trips");
      const r = computeAndValidateSplits({ amountCents, splitType: args.splitType, participants, splitData: args.splitData ?? undefined, paidByParticipantId: args.paidByParticipantId });
      splitData = r.splitData; computedSplits = r.computedSplits;
    }
    // Group trip: ledger entry only (no account). Solo trip: normal expense on an account.
    const accountId = isGroup ? undefined : await assertOwnedRef(ctx, userId, "accounts", args.accountId, "accountId");
    const txId = newId();
    const linkId = newId();
    await insertOwned(ctx, userId, "transactions", txId, {
      amountCents, date, type: "expense", note: optionalText(args.note, "note"), categoryId, accountId, tripExpenseId: linkId, sourceType: "manual",
    }, now);
    const link = await insertOwned(ctx, userId, "tripExpenses", linkId, {
      tripId: trip.id, transactionId: txId, paidByParticipantId: isGroup ? args.paidByParticipantId ?? undefined : undefined,
      splitType: args.splitType, splitDataJson: splitData ? JSON.stringify(splitData) : undefined, computedSplitsJson: computedSplits ? JSON.stringify(computedSplits) : undefined,
    }, now);
    // Group trip: the chosen account becomes the "you paid" cashflow account (native parity).
    if (isGroup && args.accountId) {
      const chosen = await assertOwnedRef(ctx, userId, "accounts", args.accountId, "accountId");
      if (chosen) await setLocalTripCashflowAccount(ctx, userId, linkId, chosen);
    }
    const tx = await getOwned(ctx, userId, "transactions", txId);
    return { transaction: toWire(tx), tripExpense: { ...link, splitData, computedSplits } };
  },
});

/**
 * Link an existing owned transaction to a trip (native flow: create transaction,
 * then create the tripExpense link). Group trips clear the base account (ledger-only).
 */
export const linkExpense = mutation({
  args: {
    tripId: v.string(), transactionId: v.string(),
    paidByParticipantId: v.optional(vNullableString), splitType: vSplitType, splitData: v.optional(v.union(vSplitMap, v.null())),
    computedSplits: v.optional(v.union(vSplitMap, v.null())),
  },
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    const trip = await requireOwnedLive(ctx, userId, "trips", args.tripId);
    const tx = await requireOwnedLive(ctx, userId, "transactions", args.transactionId);
    const now = serverNow();
    const existingLinks = (await listOwnedLive(ctx, userId, "tripExpenses")).filter((e: any) => e.transactionId === tx.id);
    if (existingLinks.length) {
      const l = existingLinks[0];
      return { ...toWire(l), splitData: parseJson(l.splitDataJson), computedSplits: parseJson(l.computedSplitsJson) };
    }
    const isGroup = trip.isGroup === 1;
    let splitData: Record<string, number> | undefined;
    let computedSplits: Record<string, number> | undefined;
    if (isGroup) {
      const participants = await liveParticipantsFor(ctx, userId, trip.id);
      const r = computeAndValidateSplits({ amountCents: Math.abs(tx.amountCents), splitType: args.splitType, participants, splitData: args.splitData ?? undefined, paidByParticipantId: args.paidByParticipantId ?? null });
      splitData = r.splitData; computedSplits = r.computedSplits;
    }
    const linkId = newId();
    const link = await insertOwned(ctx, userId, "tripExpenses", linkId, {
      tripId: trip.id, transactionId: tx.id, paidByParticipantId: isGroup ? args.paidByParticipantId ?? undefined : undefined,
      splitType: args.splitType, splitDataJson: splitData ? JSON.stringify(splitData) : undefined, computedSplitsJson: computedSplits ? JSON.stringify(computedSplits) : undefined,
    }, now);
    // Group trips are ledger-only; keep the account the user picked as the cashflow account.
    if (isGroup && tx.accountId) await setLocalTripCashflowAccount(ctx, userId, linkId, tx.accountId);
    await patchOwned(ctx, userId, "transactions", tx, { tripExpenseId: linkId, ...(isGroup ? { accountId: null } : {}) }, now);
    return { ...link, splitData, computedSplits };
  },
});

export const updateExpense = mutation({
  args: {
    tripExpenseId: v.string(), expectedSyncVersion: vExpectedVersion,
    amountCents: v.optional(v.number()), date: v.optional(v.number()), note: v.optional(vNullableString), categoryId: v.optional(vNullableString),
    paidByParticipantId: v.optional(vNullableString), splitType: v.optional(vSplitType), splitData: v.optional(v.union(vSplitMap, v.null())),
  },
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    const link = await requireOwnedLive(ctx, userId, "tripExpenses", args.tripExpenseId);
    assertExpectedVersion(link, args.expectedSyncVersion);
    const trip = await requireOwnedLive(ctx, userId, "trips", link.tripId);
    const tx = await requireOwnedLive(ctx, userId, "transactions", link.transactionId);
    const now = serverNow();
    const txPatch: Record<string, unknown> = {};
    if (args.amountCents !== undefined) txPatch.amountCents = assertCents(args.amountCents, "amountCents");
    if (args.date !== undefined) txPatch.date = assertDateMs(args.date, "date");
    if (args.note !== undefined) txPatch.note = args.note === null ? null : optionalText(args.note, "note") ?? null;
    if (args.categoryId !== undefined) txPatch.categoryId = args.categoryId === null ? null : await assertOwnedRef(ctx, userId, "categories", args.categoryId, "categoryId");
    const amountCents = (txPatch.amountCents as number | undefined) ?? tx.amountCents;

    const linkPatch: Record<string, unknown> = {};
    if (trip.isGroup === 1) {
      const splitType = args.splitType ?? link.splitType;
      const splitData = args.splitData !== undefined ? (args.splitData ?? undefined) : parseJson(link.splitDataJson);
      const paidBy = args.paidByParticipantId !== undefined ? args.paidByParticipantId : link.paidByParticipantId;
      const participants = await liveParticipantsFor(ctx, userId, trip.id);
      const r = computeAndValidateSplits({ amountCents, splitType, participants, splitData, paidByParticipantId: paidBy ?? null });
      linkPatch.splitType = splitType;
      linkPatch.splitDataJson = r.splitData ? JSON.stringify(r.splitData) : null;
      linkPatch.computedSplitsJson = JSON.stringify(r.computedSplits);
      if (args.paidByParticipantId !== undefined) linkPatch.paidByParticipantId = args.paidByParticipantId;
    }
    const updatedTx = Object.keys(txPatch).length ? await patchOwned(ctx, userId, "transactions", tx, txPatch, now) : toWire(tx);
    const updatedLink = Object.keys(linkPatch).length ? await patchOwned(ctx, userId, "tripExpenses", link, linkPatch, now) : toWire(link);
    return { transaction: updatedTx, tripExpense: { ...updatedLink, splitData: parseJson(updatedLink.splitDataJson), computedSplits: parseJson(updatedLink.computedSplitsJson) } };
  },
});

export const deleteExpense = mutation({
  args: { tripExpenseId: v.string(), expectedSyncVersion: vExpectedVersion },
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    const link = await requireOwnedLive(ctx, userId, "tripExpenses", args.tripExpenseId);
    assertExpectedVersion(link, args.expectedSyncVersion);
    const now = serverNow();
    const tx = await getOwned(ctx, userId, "transactions", link.transactionId);
    if (tx && tx.deletedAtMs === undefined) await softDeleteOwned(ctx, userId, "transactions", tx, now);
    await cascadeDeleteTripExpenseForTransaction(ctx, userId, link.transactionId);
    const fresh = await getOwned(ctx, userId, "tripExpenses", link.id);
    return fresh && fresh.deletedAtMs !== undefined ? toWire(fresh) : softDeleteOwned(ctx, userId, "tripExpenses", link, now);
  },
});

/** Unlink a transaction from a trip (native "remove from trip"): tombstone the link, keep the transaction. */
export const unlinkExpense = mutation({
  args: { tripExpenseId: v.string(), expectedSyncVersion: vExpectedVersion },
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    const link = await requireOwnedLive(ctx, userId, "tripExpenses", args.tripExpenseId);
    assertExpectedVersion(link, args.expectedSyncVersion);
    const now = serverNow();
    const tx = await getOwned(ctx, userId, "transactions", link.transactionId);
    if (tx && tx.deletedAtMs === undefined && tx.tripExpenseId === link.id) await patchOwned(ctx, userId, "transactions", tx, { tripExpenseId: null }, now);
    return softDeleteOwned(ctx, userId, "tripExpenses", link, now);
  },
});

// ---------------------------------------------------------------------------
// Settlements (deterministic id, 5s idempotency window like native)
// ---------------------------------------------------------------------------

export const createSettlement = mutation({
  args: { tripId: v.string(), fromParticipantId: v.string(), toParticipantId: v.string(), amountCents: v.number(), date: v.number(), note: v.optional(vNullableString) },
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    await requireOwnedLive(ctx, userId, "trips", args.tripId);
    if (args.fromParticipantId === args.toParticipantId) throw pwaError("VALIDATION", "Choose two different participants");
    const participants = await liveParticipantsFor(ctx, userId, args.tripId);
    const ids = new Set(participants.map((p) => p.id));
    if (!ids.has(args.fromParticipantId) || !ids.has(args.toParticipantId)) throw pwaError("VALIDATION", "Participants must belong to this trip");
    const amountCents = assertCents(args.amountCents, "amountCents");
    const date = assertDateMs(args.date, "date");
    const note = optionalText(args.note, "note");
    const id = idempotentTripSettlementId({ tripId: args.tripId, fromParticipantId: args.fromParticipantId, toParticipantId: args.toParticipantId, amountCents, dateMs: date, note: note ?? null });
    const existing = await getOwned(ctx, userId, "tripSettlements", id);
    if (existing && existing.deletedAtMs === undefined) return toWire(existing);
    const data = { tripId: args.tripId, fromParticipantId: args.fromParticipantId, toParticipantId: args.toParticipantId, amountCents, date, note };
    if (existing) return patchOwned(ctx, userId, "tripSettlements", existing, { ...data, deletedAtMs: null });
    return insertOwned(ctx, userId, "tripSettlements", id, data);
  },
});

export const deleteSettlement = mutation({
  args: { id: v.string(), expectedSyncVersion: vExpectedVersion },
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    const row = await requireOwnedLive(ctx, userId, "tripSettlements", args.id);
    assertExpectedVersion(row, args.expectedSyncVersion);
    return softDeleteOwned(ctx, userId, "tripSettlements", row);
  },
});
