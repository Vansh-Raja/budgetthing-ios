/**
 * PWA ledger commands: transactions, transfers, adjustments, bulk edits.
 * Transfers and adjustments keep the native deterministic-ID idempotency.
 */
import { mutation } from "./_generated/server";
import { v } from "convex/values";
import { setLocalTripCashflowAccount } from "./pwaDerived";
import { assertExpectedVersion, getOwned, newId, pwaError, requireOwnedLive, requireUser, serverNow, toWire } from "./pwaAuth";
import { insertOwned, patchOwned, softDeleteOwned } from "./pwaWrite";
import { assertCents, assertDateMs, assertOwnedRef, optionalText, vExpectedVersion, vNullableString, vTransactionType } from "./pwaValidation";
import { idempotentAdjustmentTransactionId, idempotentTransferTransactionId } from "../lib/logic/idempotency";
import { isDerivedTripSystemType } from "../lib/logic/syncGuards";

export const createTransaction = mutation({
  args: {
    amountCents: v.number(), date: v.number(), type: vTransactionType,
    note: v.optional(vNullableString), accountId: v.optional(vNullableString), categoryId: v.optional(vNullableString),
  },
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    return insertOwned(ctx, userId, "transactions", newId(), {
      amountCents: assertCents(args.amountCents, "amountCents"),
      date: assertDateMs(args.date, "date"),
      type: args.type,
      note: optionalText(args.note, "note"),
      accountId: await assertOwnedRef(ctx, userId, "accounts", args.accountId, "accountId"),
      categoryId: await assertOwnedRef(ctx, userId, "categories", args.categoryId, "categoryId"),
      sourceType: "manual",
    });
  },
});

export const updateTransaction = mutation({
  args: {
    id: v.string(), expectedSyncVersion: vExpectedVersion,
    amountCents: v.optional(v.number()), date: v.optional(v.number()), type: v.optional(vTransactionType),
    note: v.optional(vNullableString), accountId: v.optional(vNullableString), categoryId: v.optional(vNullableString),
  },
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    const row = await requireOwnedLive(ctx, userId, "transactions", args.id);
    assertExpectedVersion(row, args.expectedSyncVersion);
    if (isDerivedTripSystemType(row.systemType)) throw pwaError("STATE", "Derived rows cannot be edited");
    const patch: Record<string, unknown> = {};
    if (args.amountCents !== undefined) patch.amountCents = assertCents(args.amountCents, "amountCents");
    if (args.date !== undefined) patch.date = assertDateMs(args.date, "date");
    if (args.type !== undefined) {
      if (row.systemType === "transfer" || row.systemType === "adjustment") throw pwaError("STATE", "Cannot change the type of a transfer or adjustment");
      patch.type = args.type;
    }
    if (args.note !== undefined) patch.note = args.note === null ? null : optionalText(args.note, "note") ?? null;
    if (args.accountId !== undefined && row.systemType !== "transfer") {
      // Transfers use from/to accounts, so a generic accountId is ignored (the detail
      // screen always sends one). Local group-trip expenses stay account-less ledger
      // rows; like native, a chosen account becomes their "you paid" cashflow account.
      const accountId = args.accountId === null ? null : await assertOwnedRef(ctx, userId, "accounts", args.accountId, "accountId");
      const link = row.tripExpenseId ? await getOwned(ctx, userId, "tripExpenses", row.tripExpenseId) : null;
      const trip = link && link.deletedAtMs === undefined ? await getOwned(ctx, userId, "trips", link.tripId) : null;
      if (trip && trip.deletedAtMs === undefined && trip.isGroup === 1) {
        if (accountId) await setLocalTripCashflowAccount(ctx, userId, link.id, accountId);
      } else {
        patch.accountId = accountId;
      }
    }
    if (args.categoryId !== undefined) patch.categoryId = args.categoryId === null ? null : await assertOwnedRef(ctx, userId, "categories", args.categoryId, "categoryId");
    return patchOwned(ctx, userId, "transactions", row, patch);
  },
});

/** Soft-delete a transaction; if it is a local trip expense, also tombstone the tripExpense link (native parity). */
export const deleteTransaction = mutation({
  args: { id: v.string(), expectedSyncVersion: vExpectedVersion },
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    const row = await requireOwnedLive(ctx, userId, "transactions", args.id);
    assertExpectedVersion(row, args.expectedSyncVersion);
    if (isDerivedTripSystemType(row.systemType)) throw pwaError("STATE", "Derived rows cannot be deleted");
    await cascadeDeleteTripExpenseForTransaction(ctx, userId, row.id);
    return softDeleteOwned(ctx, userId, "transactions", row);
  },
});

export async function cascadeDeleteTripExpenseForTransaction(ctx: any, userId: string, transactionId: string) {
  const links = await ctx.db.query("tripExpenses").withIndex("by_user", (q: any) => q.eq("userId", userId)).collect();
  for (const link of links) {
    if (link.transactionId === transactionId && link.deletedAtMs === undefined) {
      await softDeleteOwned(ctx, userId, "tripExpenses", link);
    }
  }
}

export const bulkSetCategory = mutation({
  args: { ids: v.array(v.string()), categoryId: vNullableString },
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    const categoryId = args.categoryId === null ? null : await assertOwnedRef(ctx, userId, "categories", args.categoryId, "categoryId");
    let changed = 0;
    for (const id of dedupe(args.ids)) {
      const row = await getOwned(ctx, userId, "transactions", id);
      if (!row || row.deletedAtMs !== undefined || isDerivedTripSystemType(row.systemType)) continue;
      await patchOwned(ctx, userId, "transactions", row, { categoryId });
      changed += 1;
    }
    return { changed };
  },
});

export const bulkDelete = mutation({
  args: { ids: v.array(v.string()) },
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    let changed = 0;
    for (const id of dedupe(args.ids)) {
      const row = await getOwned(ctx, userId, "transactions", id);
      if (!row || row.deletedAtMs !== undefined || isDerivedTripSystemType(row.systemType)) continue;
      await cascadeDeleteTripExpenseForTransaction(ctx, userId, row.id);
      await softDeleteOwned(ctx, userId, "transactions", row);
      changed += 1;
    }
    return { changed };
  },
});

/** One canonical transfer row with from/to account IDs and a deterministic id (5s idempotency window). */
export const createTransfer = mutation({
  args: { fromAccountId: v.string(), toAccountId: v.string(), amountCents: v.number(), date: v.number(), note: v.optional(vNullableString) },
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    if (args.fromAccountId === args.toAccountId) throw pwaError("VALIDATION", "Choose two different accounts");
    const fromAccountId = (await assertOwnedRef(ctx, userId, "accounts", args.fromAccountId, "fromAccountId"))!;
    const toAccountId = (await assertOwnedRef(ctx, userId, "accounts", args.toAccountId, "toAccountId"))!;
    const amountCents = assertCents(args.amountCents, "amountCents");
    const date = assertDateMs(args.date, "date");
    const note = optionalText(args.note, "note");
    const id = idempotentTransferTransactionId({ transferFromAccountId: fromAccountId, transferToAccountId: toAccountId, amountCents, dateMs: date, note: note ?? null });
    const existing = await getOwned(ctx, userId, "transactions", id);
    if (existing && existing.deletedAtMs === undefined) return toWire(existing);
    if (existing) {
      return patchOwned(ctx, userId, "transactions", existing, { deletedAtMs: null, amountCents, date, note: note ?? null, transferFromAccountId: fromAccountId, transferToAccountId: toAccountId });
    }
    return insertOwned(ctx, userId, "transactions", id, {
      amountCents, date, note, type: "expense", systemType: "transfer", transferFromAccountId: fromAccountId, transferToAccountId: toAccountId, sourceType: "manual",
    });
  },
});

/** Balance adjustment: signed cents, deterministic id. Positive = income, negative = expense. */
export const createAdjustment = mutation({
  args: { accountId: v.string(), amountCents: v.number(), date: v.number(), note: v.optional(vNullableString), categoryId: v.optional(vNullableString) },
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    const accountId = (await assertOwnedRef(ctx, userId, "accounts", args.accountId, "accountId"))!;
    // Native files adjustments under its "System · Adjustment" category; keep that link.
    const categoryId = await assertOwnedRef(ctx, userId, "categories", args.categoryId, "categoryId");
    const signed = assertCents(args.amountCents, "amountCents", { allowNegative: true });
    const date = assertDateMs(args.date, "date");
    const note = optionalText(args.note, "note");
    const id = idempotentAdjustmentTransactionId({ accountId, amountCents: signed, dateMs: date, note: note ?? null });
    const existing = await getOwned(ctx, userId, "transactions", id);
    if (existing && existing.deletedAtMs === undefined) return toWire(existing);
    const data = { amountCents: Math.abs(signed), date, note, type: signed >= 0 ? "income" : "expense", systemType: "adjustment", accountId, categoryId, sourceType: "manual" };
    if (existing) return patchOwned(ctx, userId, "transactions", existing, { ...data, deletedAtMs: null });
    return insertOwned(ctx, userId, "transactions", id, data);
  },
});

function dedupe(ids: string[]): string[] {
  return Array.from(new Set(ids.filter(Boolean)));
}

export { serverNow };
