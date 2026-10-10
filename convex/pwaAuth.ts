/**
 * PWA server kernel: identity, ownership, revision checks, structured errors.
 *
 * Every PWA query/mutation goes through `requireUser`. Ownership is by Clerk
 * subject (`userId`), exactly like the legacy sync protocol.
 */
import { ConvexError } from "convex/values";
import type { MutationCtx, QueryCtx } from "./_generated/server";

export type Ctx = QueryCtx | MutationCtx;

export type PwaErrorCode = "UNAUTHENTICATED" | "FORBIDDEN" | "NOT_FOUND" | "CONFLICT" | "VALIDATION" | "STATE";

export function pwaError(code: PwaErrorCode, message: string, extra?: Record<string, unknown>): ConvexError<any> {
  return new ConvexError({ code, message, ...(extra ?? {}) });
}

export async function requireUser(ctx: Ctx): Promise<string> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) throw pwaError("UNAUTHENTICATED", "Sign in required");
  return identity.subject;
}

export async function getUserOrNull(ctx: Ctx): Promise<string | null> {
  const identity = await ctx.auth.getUserIdentity();
  return identity ? identity.subject : null;
}

export type OwnedTable =
  | "accounts"
  | "categories"
  | "transactions"
  | "trips"
  | "tripParticipants"
  | "tripExpenses"
  | "tripSettlements"
  | "importInboxItems"
  | "userSettings";

/** Fetch a row by client id scoped to the user (any state, including tombstoned). */
export async function getOwned(ctx: Ctx, userId: string, table: OwnedTable, id: string): Promise<any | null> {
  const row = await ctx.db
    .query(table as any)
    .withIndex("by_client_id", (q: any) => q.eq("id", id))
    .filter((q: any) => q.eq(q.field("userId"), userId))
    .first();
  return row ?? null;
}

/** Fetch a live (non-tombstoned) owned row or throw NOT_FOUND. */
export async function requireOwnedLive(ctx: Ctx, userId: string, table: OwnedTable, id: string): Promise<any> {
  const row = await getOwned(ctx, userId, table, id);
  if (!row || row.deletedAtMs !== undefined) {
    throw pwaError("NOT_FOUND", `${table} ${id} not found`);
  }
  return row;
}

/** Optional optimistic concurrency: the client may pass the syncVersion it last saw. */
export function assertExpectedVersion(row: { syncVersion?: number; id?: string }, expected?: number | null) {
  if (expected === undefined || expected === null) return;
  const current = row.syncVersion ?? 0;
  if (current !== expected) {
    throw pwaError("CONFLICT", "Row changed since you loaded it", { row, expectedSyncVersion: expected, currentSyncVersion: current });
  }
}

export function serverNow(): number {
  return Date.now();
}

export function newId(): string {
  return crypto.randomUUID();
}

/** Collect all live rows of an owned table for a user. */
export async function listOwnedLive(ctx: Ctx, userId: string, table: OwnedTable): Promise<any[]> {
  const rows = await ctx.db
    .query(table as any)
    .withIndex("by_user", (q: any) => q.eq("userId", userId))
    .collect();
  return rows.filter((r: any) => r.deletedAtMs === undefined);
}

/** Strip Convex system fields so rows match the native wire shape. */
export function toWire(row: Record<string, any>): any {
  const { _id, _creationTime, ...rest } = row;
  return rest;
}
