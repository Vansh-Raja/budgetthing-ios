/**
 * PWA import inbox: review-first. Confirm/ignore are authoritative server
 * transitions using the same deterministic transaction id as native so both
 * runtimes converge on exactly one canonical transaction per inbox item.
 */
import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { getOwned, listOwnedLive, pwaError, requireOwnedLive, requireUser, serverNow, toWire } from "./pwaAuth";
import { insertOwned, patchOwned } from "./pwaWrite";
import { assertCents, assertDateMs, assertOwnedRef, optionalText, vExpectedVersion, vNullableString, vTransactionType } from "./pwaValidation";
import { deterministicImportTransactionId } from "../lib/logic/importProvenance";

function itemToWire(row: any) {
  return { ...toWire(row), possibleDuplicate: row.possibleDuplicate === 1, duplicateSignals: parseSignals(row.duplicateSignalsJson) };
}

function parseSignals(value: string | null | undefined): string[] | null {
  if (!value) return null;
  try { const parsed = JSON.parse(value); return Array.isArray(parsed) ? parsed : null; } catch { return null; }
}

export const listPending = query({
  args: {},
  handler: async (ctx) => {
    const userId = await requireUser(ctx);
    const rows = await ctx.db.query("importInboxItems").withIndex("by_user_status", (q: any) => q.eq("userId", userId).eq("status", "pending")).collect();
    return rows.filter((r: any) => r.deletedAtMs === undefined).sort((a: any, b: any) => b.createdAtMs - a.createdAtMs).map(itemToWire);
  },
});

export const countPending = query({
  args: {},
  handler: async (ctx) => {
    const userId = await requireUser(ctx);
    const rows = await ctx.db.query("importInboxItems").withIndex("by_user_status", (q: any) => q.eq("userId", userId).eq("status", "pending")).collect();
    return rows.filter((r: any) => r.deletedAtMs === undefined).length;
  },
});

export const ignore = mutation({
  args: { id: v.string(), expectedSyncVersion: vExpectedVersion },
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    const item = await requireOwnedLive(ctx, userId, "importInboxItems", args.id);
    if (args.expectedSyncVersion !== undefined && item.syncVersion !== args.expectedSyncVersion) throw pwaError("CONFLICT", "Item changed", { row: itemToWire(item) });
    if (item.status === "ignored") return itemToWire(item);
    if (item.status !== "pending") throw pwaError("STATE", "Import is no longer pending", { row: itemToWire(item) });
    const now = serverNow();
    return itemToWire(await patchOwned(ctx, userId, "importInboxItems", item, { status: "ignored", ignoredAtMs: now }, now));
  },
});

export const confirm = mutation({
  args: {
    id: v.string(), expectedSyncVersion: vExpectedVersion,
    amountCents: v.optional(v.number()), dateMs: v.optional(v.number()), note: v.optional(vNullableString),
    accountId: v.optional(vNullableString), categoryId: v.optional(vNullableString), type: v.optional(vTransactionType),
  },
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    const item = await requireOwnedLive(ctx, userId, "importInboxItems", args.id);
    if (args.expectedSyncVersion !== undefined && item.syncVersion !== args.expectedSyncVersion) throw pwaError("CONFLICT", "Item changed", { row: itemToWire(item) });

    const txId = deterministicImportTransactionId(item.id);
    if (item.status === "confirmed") {
      const existing = await getOwned(ctx, userId, "transactions", item.confirmedTransactionId ?? txId);
      return { item: itemToWire(item), transaction: existing ? toWire(existing) : null, alreadyConfirmed: true };
    }
    if (item.status !== "pending") throw pwaError("STATE", "Import is no longer pending", { row: itemToWire(item) });

    const accountId = args.accountId !== undefined ? args.accountId : item.accountId;
    if (!accountId) throw pwaError("VALIDATION", "Account is required to confirm this import");
    await assertOwnedRef(ctx, userId, "accounts", accountId, "accountId");
    const categoryRaw = args.categoryId !== undefined ? args.categoryId : item.categoryId;
    let categoryId: string | undefined;
    if (categoryRaw) {
      const cat = await getOwned(ctx, userId, "categories", categoryRaw);
      categoryId = cat && cat.deletedAtMs === undefined ? categoryRaw : undefined;
    }
    const amountCents = assertCents(args.amountCents ?? item.amountCents, "amountCents");
    const dateMs = assertDateMs(args.dateMs ?? item.dateMs, "dateMs");
    const type = args.type ?? item.type;
    const note = args.note !== undefined ? optionalText(args.note, "note") : (item.note ?? undefined);
    const now = serverNow();

    const existingTx = await getOwned(ctx, userId, "transactions", txId);
    let transaction: any;
    if (existingTx && existingTx.deletedAtMs === undefined) {
      transaction = toWire(existingTx);
    } else if (existingTx) {
      throw pwaError("CONFLICT", "This import was previously confirmed and its transaction deleted", { row: itemToWire(item), transaction: toWire(existingTx) });
    } else {
      transaction = await insertOwned(ctx, userId, "transactions", txId, {
        amountCents, date: dateMs, note, type, accountId, categoryId, sourceType: "api_import", sourceImportInboxItemId: item.id,
      }, now);
    }
    const updated = await patchOwned(ctx, userId, "importInboxItems", item, { status: "confirmed", confirmedTransactionId: txId, confirmedAtMs: now }, now);
    return { item: itemToWire(updated), transaction, alreadyConfirmed: false };
  },
});

/** Accounts and categories a reviewer can pick while confirming. */
export const reviewOptions = query({
  args: {},
  handler: async (ctx) => {
    const userId = await requireUser(ctx);
    return {
      accounts: (await listOwnedLive(ctx, userId, "accounts")).sort((a: any, b: any) => a.sortIndex - b.sortIndex).map(toWire),
      categories: (await listOwnedLive(ctx, userId, "categories")).sort((a: any, b: any) => a.sortIndex - b.sortIndex).map(toWire),
    };
  },
});
