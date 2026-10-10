/**
 * Mutation builders used by every Convex function in this project.
 *
 * They wrap Convex's raw `mutation` / `internalMutation` with convex-helpers Triggers,
 * so every insert, patch, replace and delete on an audited table is recorded in
 * `auditLog` atomically with the write itself, no matter which code path made it
 * (web API, native sync push, import HTTP API, shared trips, system jobs).
 *
 * Callers can label the origin of their writes with `setAuditSource(ctx, ...)`
 * (and optionally a human-readable `reason`); the default is "app" for public
 * mutations and "system" for internal ones.
 */
import {
  internalMutation as rawInternalMutation,
  mutation as rawMutation,
} from "./_generated/server";
import type { DataModel, TableNames } from "./_generated/dataModel";
import { customCtx, customMutation } from "convex-helpers/server/customFunctions";
import { Triggers } from "convex-helpers/server/triggers";

export type AuditSource = "web" | "native_sync" | "import_api" | "app" | "system";
export type AuditMeta = { source: AuditSource; reason?: string; actor?: string | null };

/** Tables whose rows are user data and get a full version history. */
export const AUDITED_TABLES = [
  "accounts",
  "categories",
  "transactions",
  "trips",
  "tripParticipants",
  "tripExpenses",
  "tripSettlements",
  "userSettings",
  "importInboxItems",
  "derivedAccountOverrides",
  "apiImportKeys",
  "sharedTrips",
  "sharedTripMembers",
  "sharedTripParticipants",
  "sharedTripExpenses",
  "sharedTripSettlements",
  "sharedTripInvites",
] as const satisfies readonly TableNames[];

/** Bookkeeping-only fields: a write that changes nothing else is not a new version. */
const BOOKKEEPING = new Set(["_id", "_creationTime", "updatedAtMs", "syncVersion", "revision", "needsSync"]);
/** Never copied into the audit log. */
const SECRET_FIELDS = new Set(["keyHash"]);

function snapshot(doc: Record<string, any> | null): Record<string, any> | null {
  if (!doc) return null;
  const out: Record<string, any> = {};
  for (const [k, v] of Object.entries(doc)) {
    if (k === "_id" || k === "_creationTime" || SECRET_FIELDS.has(k)) continue;
    out[k] = v;
  }
  return out;
}

function changedFields(before: Record<string, any> | null, after: Record<string, any> | null): string[] {
  const keys = new Set([...Object.keys(before ?? {}), ...Object.keys(after ?? {})]);
  const changed: string[] = [];
  for (const k of keys) {
    if (BOOKKEEPING.has(k)) continue;
    if (JSON.stringify(before?.[k]) !== JSON.stringify(after?.[k])) changed.push(k);
  }
  return changed.sort();
}

function actionFor(before: Record<string, any> | null, after: Record<string, any> | null): string {
  if (!before) return "create";
  if (!after) return "purge";
  const wasDeleted = before.deletedAtMs !== undefined && before.deletedAtMs !== null;
  const isDeleted = after.deletedAtMs !== undefined && after.deletedAtMs !== null;
  if (!wasDeleted && isDeleted) return "delete";
  if (wasDeleted && !isDeleted) return "restore";
  return "update";
}

const triggers = new Triggers<DataModel, any>();

for (const table of AUDITED_TABLES) {
  triggers.register(table, async (ctx: any, change: any) => {
    const before = snapshot(change.oldDoc);
    const after = snapshot(change.newDoc);
    const fields = changedFields(before, after);
    if (change.operation === "update" && fields.length === 0) return; // bookkeeping-only touch
    const meta: AuditMeta = ctx.audit ?? { source: "app" };
    if (meta.actor === undefined) {
      const identity = await ctx.auth?.getUserIdentity?.().catch?.(() => null);
      meta.actor = identity?.subject ?? null;
    }
    const doc = (change.newDoc ?? change.oldDoc) as Record<string, any>;
    const owner = (doc.userId as string | undefined) ?? meta.actor ?? "unknown";
    // Shared-trip rows have no single owner: tag them with their trip so members can read them.
    const tripId = table === "sharedTrips" ? (doc.id as string) : table.startsWith("sharedTrip") ? (doc.tripId as string | undefined) : undefined;
    await ctx.innerDb.insert("auditLog", {
      userId: owner,
      actorUserId: meta.actor ?? undefined,
      entityTable: table,
      entityId: typeof doc.id === "string" ? doc.id : String(change.id),
      action: actionFor(before, after),
      source: meta.source,
      reason: meta.reason,
      changedFields: change.operation === "insert" ? [] : fields,
      beforeJson: before ? JSON.stringify(before) : undefined,
      afterJson: after ? JSON.stringify(after) : undefined,
      tripId,
      atMs: Date.now(),
    });
  });
}

/** Label the origin of writes made by this function invocation (and an optional reason). */
export function setAuditSource(ctx: any, source: AuditSource, reason?: string) {
  if (ctx?.audit) {
    ctx.audit.source = source;
    if (reason !== undefined) ctx.audit.reason = reason;
  }
}

/** Temporarily set a reason for writes inside `fn`, then restore the previous one. */
export async function withAuditReason<T>(ctx: any, reason: string, fn: () => Promise<T>): Promise<T> {
  const previous = ctx?.audit?.reason;
  if (ctx?.audit) ctx.audit.reason = reason;
  try {
    return await fn();
  } finally {
    if (ctx?.audit) ctx.audit.reason = previous;
  }
}

export const mutation = customMutation(
  rawMutation,
  customCtx((ctx) => triggers.wrapDB({ ...ctx, audit: { source: "app" } as AuditMeta }))
);

export const internalMutation = customMutation(
  rawInternalMutation,
  customCtx((ctx) => triggers.wrapDB({ ...ctx, audit: { source: "system" } as AuditMeta }))
);
