/**
 * PWA personal ledger read models + account/category/settings commands.
 */
import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { paginationOptsValidator } from "convex/server";
import { assertExpectedVersion, listOwnedLive, newId, pwaError, requireOwnedLive, requireUser, serverNow, toWire } from "./pwaAuth";
import { insertOwned, patchOwned, softDeleteOwned } from "./pwaWrite";
import {
  assertBillingCycleDay, assertCents, assertCurrencyCode, assertEmoji, assertOwnedRef, assertText,
  optionalText, vAccountKind, vExpectedVersion, vNullableNumber, vNullableString,
} from "./pwaValidation";
import { computeVirtualDerivedRows, excludePersistedDerivedRows, pinDerivedAccountsIfDefaultChanges } from "./pwaDerived";
import { computeAccountBalanceCents, computeAccountAvailableCents, computeAccountTileValueCents, getTransactionsForAccount } from "../lib/logic/accountBalance";

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

async function getSettingsRow(ctx: any, userId: string) {
  return ctx.db.query("userSettings").withIndex("by_user", (q: any) => q.eq("userId", userId)).first();
}

export function settingsToWire(row: any | null) {
  if (!row) {
    return { id: "local", currencyCode: "INR", hapticsEnabled: 1, defaultAccountId: undefined, hasSeenOnboarding: 1, syncTransactionFilters: 0, resetTransactionFiltersOnReopen: 0, transactionsFiltersJson: undefined, transactionsFiltersUpdatedAtMs: undefined, updatedAtMs: 0, syncVersion: 0, exists: false };
  }
  return { ...toWire(row), exists: true };
}

export const getSettings = query({
  args: {},
  handler: async (ctx) => {
    const userId = await requireUser(ctx);
    return settingsToWire(await getSettingsRow(ctx, userId));
  },
});

export const listAccounts = query({
  args: {},
  handler: async (ctx) => {
    const userId = await requireUser(ctx);
    return listAccountsWithBalances(ctx, userId);
  },
});

async function listAccountsWithBalances(ctx: any, userId: string) {
  const accounts = (await listOwnedLive(ctx, userId, "accounts")).sort((a: any, b: any) => a.sortIndex - b.sortIndex);
  const canonical = excludePersistedDerivedRows(await listOwnedLive(ctx, userId, "transactions"));
  const derived = await computeVirtualDerivedRows(ctx, userId, { accounts });
  const all = [...canonical, ...derived] as any[];
  return accounts.map((a: any) => {
    const acct = { ...a, openingBalanceCents: a.openingBalanceCents, limitAmountCents: a.limitAmountCents } as any;
    const txs = getTransactionsForAccount(all, a.id);
    return {
      ...toWire(a),
      balanceCents: computeAccountBalanceCents(acct, txs),
      availableCents: computeAccountAvailableCents(acct, txs),
      tileValueCents: computeAccountTileValueCents(acct, txs),
    };
  });
}

export const listCategories = query({
  args: {},
  handler: async (ctx) => {
    const userId = await requireUser(ctx);
    return (await listOwnedLive(ctx, userId, "categories")).sort((a: any, b: any) => a.sortIndex - b.sortIndex).map(toWire);
  },
});

/**
 * One realtime snapshot mirroring the native in-memory model: accounts (with
 * balances), categories, settings, canonical transactions, virtual derived rows,
 * and trip-expense links. Screens merge canonical + derived exactly like native.
 */
export const getSnapshot = query({
  args: {},
  handler: async (ctx) => {
    const userId = await requireUser(ctx);
    const accountsRaw = (await listOwnedLive(ctx, userId, "accounts")).sort((a: any, b: any) => a.sortIndex - b.sortIndex);
    const categories = (await listOwnedLive(ctx, userId, "categories")).sort((a: any, b: any) => a.sortIndex - b.sortIndex);
    const canonical = excludePersistedDerivedRows(await listOwnedLive(ctx, userId, "transactions"));
    const derived = await computeVirtualDerivedRows(ctx, userId, { accounts: accountsRaw, categories });
    const tripExpenses = await listOwnedLive(ctx, userId, "tripExpenses");
    const trips = await listOwnedLive(ctx, userId, "trips");
    const all = [...canonical, ...derived] as any[];
    const accounts = accountsRaw.map((a: any) => {
      const txs = getTransactionsForAccount(all, a.id);
      return { ...toWire(a), balanceCents: computeAccountBalanceCents(a, txs), availableCents: computeAccountAvailableCents(a, txs), tileValueCents: computeAccountTileValueCents(a, txs) };
    });
    const tripById = new Map(trips.map((t: any) => [t.id, t]));
    const tripExpenseLinks = tripExpenses.map((e: any) => ({
      id: e.id, tripId: e.tripId, transactionId: e.transactionId, paidByParticipantId: e.paidByParticipantId,
      splitType: e.splitType, tripEmoji: tripById.get(e.tripId)?.emoji ?? null, tripName: tripById.get(e.tripId)?.name ?? null,
    }));
    return {
      accounts,
      categories: categories.map(toWire),
      settings: settingsToWire(await getSettingsRow(ctx, userId)),
      transactions: canonical.sort((a: any, b: any) => b.date - a.date).map(toWire),
      derivedRows: derived,
      tripExpenseLinks,
      pendingImportCount: (await ctx.db.query("importInboxItems").withIndex("by_user_status", (q: any) => q.eq("userId", userId).eq("status", "pending")).collect()).filter((i: any) => i.deletedAtMs === undefined).length,
      serverTimeMs: serverNow(),
    };
  },
});

/** Paginated canonical transactions (newest first). Derived rows are not included here. */
export const listTransactions = query({
  args: { paginationOpts: paginationOptsValidator },
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    const page = await ctx.db
      .query("transactions")
      .withIndex("by_user_date", (q: any) => q.eq("userId", userId))
      .order("desc")
      .filter((q: any) => q.eq(q.field("deletedAtMs"), undefined))
      .paginate(args.paginationOpts);
    return { ...page, page: excludePersistedDerivedRows(page.page).map(toWire) };
  },
});

/** Dashboard: recent transactions + account tiles + month totals inputs. */
export const listDashboard = query({
  args: { recentLimit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    const limit = Math.min(Math.max(args.recentLimit ?? 20, 1), 100);
    const accounts = await listAccountsWithBalances(ctx, userId);
    const recent = await ctx.db
      .query("transactions")
      .withIndex("by_user_date", (q: any) => q.eq("userId", userId))
      .order("desc")
      .filter((q: any) => q.eq(q.field("deletedAtMs"), undefined))
      .take(limit * 2);
    return { accounts, recent: excludePersistedDerivedRows(recent).slice(0, limit).map(toWire) };
  },
});

// ---------------------------------------------------------------------------
// Account commands
// ---------------------------------------------------------------------------

export const createAccount = mutation({
  args: {
    name: v.string(), emoji: v.string(), kind: vAccountKind,
    openingBalanceCents: v.optional(vNullableNumber), limitAmountCents: v.optional(vNullableNumber), billingCycleDay: v.optional(vNullableNumber),
  },
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    const existing = await listOwnedLive(ctx, userId, "accounts");
    const sortIndex = existing.reduce((m: number, a: any) => Math.max(m, a.sortIndex ?? -1), -1) + 1;
    return insertOwned(ctx, userId, "accounts", newId(), {
      name: assertText(args.name, "name", { min: 1, max: 80 }),
      emoji: assertEmoji(args.emoji),
      kind: args.kind,
      sortIndex,
      openingBalanceCents: args.openingBalanceCents == null ? undefined : assertCents(args.openingBalanceCents, "openingBalanceCents", { allowZero: true, allowNegative: true }),
      limitAmountCents: args.limitAmountCents == null ? undefined : assertCents(args.limitAmountCents, "limitAmountCents", { allowZero: true }),
      billingCycleDay: assertBillingCycleDay(args.billingCycleDay),
    });
  },
});

export const updateAccount = mutation({
  args: {
    id: v.string(), expectedSyncVersion: vExpectedVersion,
    name: v.optional(v.string()), emoji: v.optional(v.string()), kind: v.optional(vAccountKind),
    openingBalanceCents: v.optional(vNullableNumber), limitAmountCents: v.optional(vNullableNumber), billingCycleDay: v.optional(vNullableNumber),
  },
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    const row = await requireOwnedLive(ctx, userId, "accounts", args.id);
    assertExpectedVersion(row, args.expectedSyncVersion);
    const patch: Record<string, unknown> = {};
    if (args.name !== undefined) patch.name = assertText(args.name, "name", { min: 1, max: 80 });
    if (args.emoji !== undefined) patch.emoji = assertEmoji(args.emoji);
    if (args.kind !== undefined) patch.kind = args.kind;
    if (args.openingBalanceCents !== undefined) patch.openingBalanceCents = args.openingBalanceCents === null ? null : assertCents(args.openingBalanceCents, "openingBalanceCents", { allowZero: true, allowNegative: true });
    if (args.limitAmountCents !== undefined) patch.limitAmountCents = args.limitAmountCents === null ? null : assertCents(args.limitAmountCents, "limitAmountCents", { allowZero: true });
    if (args.billingCycleDay !== undefined) patch.billingCycleDay = args.billingCycleDay === null ? null : assertBillingCycleDay(args.billingCycleDay);
    return patchOwned(ctx, userId, "accounts", row, patch);
  },
});

export const archiveAccount = mutation({
  args: { id: v.string(), expectedSyncVersion: vExpectedVersion },
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    const row = await requireOwnedLive(ctx, userId, "accounts", args.id);
    assertExpectedVersion(row, args.expectedSyncVersion);
    const settings = await getSettingsRow(ctx, userId);
    if (settings?.defaultAccountId === args.id) {
      await patchOwned(ctx, userId, "userSettings", settings, { defaultAccountId: null });
    }
    return softDeleteOwned(ctx, userId, "accounts", row);
  },
});

export const reorderAccounts = mutation({
  args: { idsInOrder: v.array(v.string()) },
  handler: async (ctx, args) => reorderOwned(ctx, await requireUser(ctx), "accounts", args.idsInOrder),
});

async function reorderOwned(ctx: any, userId: string, table: "accounts" | "categories" | "trips", idsInOrder: string[]) {
  const live = await listOwnedLive(ctx, userId, table);
  const byId = new Map(live.map((r: any) => [r.id, r]));
  const now = serverNow();
  let changed = 0;
  // Sequential so changeLog ordering stays deterministic.
  for (const [index, id] of idsInOrder.entries()) {
    const row = byId.get(id);
    if (row && row.sortIndex !== index) {
      await patchOwned(ctx, userId, table, row, { sortIndex: index }, now);
      changed += 1;
    }
  }
  return { changed };
}

// ---------------------------------------------------------------------------
// Category commands
// ---------------------------------------------------------------------------

export const createCategory = mutation({
  args: { name: v.string(), emoji: v.string(), monthlyBudgetCents: v.optional(vNullableNumber), isSystem: v.optional(v.boolean()) },
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    const existing = await listOwnedLive(ctx, userId, "categories");
    // System categories (e.g. "System · Adjustment") sit at 9999 like native and the first-run seed.
    const sortIndex = args.isSystem ? 9999 : existing.reduce((m: number, c: any) => Math.max(m, c.sortIndex ?? -1), -1) + 1;
    return insertOwned(ctx, userId, "categories", newId(), {
      name: assertText(args.name, "name", { min: 1, max: 80 }),
      emoji: assertEmoji(args.emoji),
      sortIndex,
      monthlyBudgetCents: args.monthlyBudgetCents == null ? undefined : assertCents(args.monthlyBudgetCents, "monthlyBudgetCents", { allowZero: true }),
      isSystem: args.isSystem ? 1 : 0,
    });
  },
});

export const updateCategory = mutation({
  args: { id: v.string(), expectedSyncVersion: vExpectedVersion, name: v.optional(v.string()), emoji: v.optional(v.string()), monthlyBudgetCents: v.optional(vNullableNumber) },
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    const row = await requireOwnedLive(ctx, userId, "categories", args.id);
    assertExpectedVersion(row, args.expectedSyncVersion);
    const patch: Record<string, unknown> = {};
    if (args.name !== undefined) patch.name = assertText(args.name, "name", { min: 1, max: 80 });
    if (args.emoji !== undefined) patch.emoji = assertEmoji(args.emoji);
    if (args.monthlyBudgetCents !== undefined) patch.monthlyBudgetCents = args.monthlyBudgetCents === null ? null : assertCents(args.monthlyBudgetCents, "monthlyBudgetCents", { allowZero: true });
    return patchOwned(ctx, userId, "categories", row, patch);
  },
});

export const deleteCategory = mutation({
  args: { id: v.string(), expectedSyncVersion: vExpectedVersion },
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    const row = await requireOwnedLive(ctx, userId, "categories", args.id);
    assertExpectedVersion(row, args.expectedSyncVersion);
    return softDeleteOwned(ctx, userId, "categories", row);
  },
});

export const reorderCategories = mutation({
  args: { idsInOrder: v.array(v.string()) },
  handler: async (ctx, args) => reorderOwned(ctx, await requireUser(ctx), "categories", args.idsInOrder),
});

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

export const updateSettings = mutation({
  args: {
    currencyCode: v.optional(v.string()),
    hapticsEnabled: v.optional(v.boolean()),
    defaultAccountId: v.optional(vNullableString),
    hasSeenOnboarding: v.optional(v.boolean()),
    syncTransactionFilters: v.optional(v.boolean()),
    resetTransactionFiltersOnReopen: v.optional(v.boolean()),
    transactionsFiltersJson: v.optional(vNullableString),
    transactionsFiltersUpdatedAtMs: v.optional(vNullableNumber),
  },
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    const patch: Record<string, unknown> = {};
    if (args.currencyCode !== undefined) patch.currencyCode = assertCurrencyCode(args.currencyCode);
    if (args.hapticsEnabled !== undefined) patch.hapticsEnabled = args.hapticsEnabled ? 1 : 0;
    if (args.defaultAccountId !== undefined) patch.defaultAccountId = args.defaultAccountId === null ? null : await assertOwnedRef(ctx, userId, "accounts", args.defaultAccountId, "defaultAccountId");
    if (args.hasSeenOnboarding !== undefined) patch.hasSeenOnboarding = args.hasSeenOnboarding ? 1 : 0;
    if (args.syncTransactionFilters !== undefined) patch.syncTransactionFilters = args.syncTransactionFilters ? 1 : 0;
    if (args.resetTransactionFiltersOnReopen !== undefined) patch.resetTransactionFiltersOnReopen = args.resetTransactionFiltersOnReopen ? 1 : 0;
    if (args.transactionsFiltersJson !== undefined) {
      if (args.transactionsFiltersJson !== null && args.transactionsFiltersJson.length > 20_000) throw pwaError("VALIDATION", "filters too large");
      patch.transactionsFiltersJson = args.transactionsFiltersJson;
    }
    if (args.transactionsFiltersUpdatedAtMs !== undefined) patch.transactionsFiltersUpdatedAtMs = args.transactionsFiltersUpdatedAtMs;

    if (patch.defaultAccountId !== undefined) {
      await pinDerivedAccountsIfDefaultChanges(ctx, userId, (patch.defaultAccountId as string | null) ?? null);
    }
    const existing = await getSettingsRow(ctx, userId);
    if (existing) return patchOwned(ctx, userId, "userSettings", existing, patch);
    const base = { currencyCode: "INR", hapticsEnabled: 1, hasSeenOnboarding: 1, syncTransactionFilters: 0, resetTransactionFiltersOnReopen: 0 };
    const merged: Record<string, unknown> = { ...base };
    for (const [k, val] of Object.entries(patch)) if (val !== null) merged[k] = val;
    // Native uses the fixed client id "local" for the settings row.
    return insertOwned(ctx, userId, "userSettings", "local", merged);
  },
});

// ---------------------------------------------------------------------------
// First-run defaults (mirrors native bootstrap: only when the account is completely empty)
// ---------------------------------------------------------------------------

const DEFAULT_CATEGORIES = [
  { emoji: "🍔", name: "Food" },
  { emoji: "🛒", name: "Groceries" },
  { emoji: "🚕", name: "Transport" },
  { emoji: "🏠", name: "Rent" },
  { emoji: "🎉", name: "Fun" },
];

export const seedDefaultsIfEmpty = mutation({
  args: {},
  handler: async (ctx) => {
    const userId = await requireUser(ctx);
    const [accounts, categories, transactions, trips] = await Promise.all([
      listOwnedLive(ctx, userId, "accounts"), listOwnedLive(ctx, userId, "categories"), listOwnedLive(ctx, userId, "transactions"), listOwnedLive(ctx, userId, "trips"),
    ]);
    if (accounts.length || categories.length || transactions.length || trips.length) return { seeded: false };
    const now = serverNow();
    for (const [index, c] of DEFAULT_CATEGORIES.entries()) {
      await insertOwned(ctx, userId, "categories", newId(), { name: c.name, emoji: c.emoji, sortIndex: index, isSystem: 0 }, now);
    }
    await insertOwned(ctx, userId, "categories", newId(), { name: "System · Adjustment", emoji: "🛠", sortIndex: 9999, isSystem: 1 }, now);
    await insertOwned(ctx, userId, "categories", newId(), { name: "System · Transfer", emoji: "⇅", sortIndex: 9999, isSystem: 1 }, now);
    const cash = await insertOwned(ctx, userId, "accounts", newId(), { name: "Cash", emoji: "💵", kind: "cash", sortIndex: 0 }, now);
    const existing = await getSettingsRow(ctx, userId);
    if (existing) await patchOwned(ctx, userId, "userSettings", existing, { defaultAccountId: cash.id }, now);
    else await insertOwned(ctx, userId, "userSettings", "local", { currencyCode: "INR", hapticsEnabled: 1, hasSeenOnboarding: 1, syncTransactionFilters: 0, resetTransactionFiltersOnReopen: 0, defaultAccountId: cash.id }, now);
    return { seeded: true, defaultAccountId: cash.id };
  },
});
