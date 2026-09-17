import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { apiKeyHashVersion, createRawApiKey, hashApiKey } from "./apiImportShared";

async function requireUserId(ctx: any): Promise<string> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) throw new Error("Unauthorized");
  return identity.subject;
}

function expiryToMs(expiresIn: "30d" | "6m" | "1y" | "never", now: number): number | undefined {
  if (expiresIn === "never") return undefined;
  if (expiresIn === "30d") return now + 30 * 86400000;
  if (expiresIn === "6m") return now + 183 * 86400000;
  return now + 365 * 86400000;
}

export const list = query({
  args: {},
  handler: async (ctx) => {
    const userId = await requireUserId(ctx);
    const rows = await ctx.db
      .query("apiImportKeys")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();

    return rows
      .sort((a, b) => (b.createdAtMs as number) - (a.createdAtMs as number))
      .map((row) => ({
        id: row.id,
        name: row.name,
        keyId: row.keyId,
        createdAtMs: row.createdAtMs,
        updatedAtMs: row.updatedAtMs,
        lastUsedAtMs: row.lastUsedAtMs ?? null,
        expiresAtMs: row.expiresAtMs ?? null,
        revokedAtMs: row.revokedAtMs ?? null,
      }));
  },
});

export const create = mutation({
  args: {
    name: v.string(),
    expiresIn: v.union(v.literal("30d"), v.literal("6m"), v.literal("1y"), v.literal("never")),
  },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const now = Date.now();
    const name = args.name.trim().slice(0, 80) || "API key";
    const { keyId, rawKey } = createRawApiKey();
    const id = `api_key_${keyId}`;

    await ctx.db.insert("apiImportKeys", {
      id,
      userId,
      name,
      keyId,
      keyHash: await hashApiKey(rawKey),
      hashVersion: apiKeyHashVersion(),
      createdAtMs: now,
      updatedAtMs: now,
      expiresAtMs: expiryToMs(args.expiresIn, now),
    });

    await ctx.db.insert("apiImportAuditEvents", {
      id: `audit_${now}_${keyId}`,
      userId,
      apiKeyId: id,
      eventType: "api_key_created",
      status: "ok",
      createdAtMs: now,
    });

    return {
      rawKey,
      key: {
        id,
        name,
        keyId,
        createdAtMs: now,
        updatedAtMs: now,
        lastUsedAtMs: null,
        expiresAtMs: expiryToMs(args.expiresIn, now) ?? null,
        revokedAtMs: null,
      },
    };
  },
});

export const revoke = mutation({
  args: {
    id: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const row = await ctx.db
      .query("apiImportKeys")
      .withIndex("by_client_id", (q) => q.eq("id", args.id))
      .first();

    if (!row || row.userId !== userId) throw new Error("API key not found");
    if (row.revokedAtMs !== undefined) return { status: "ok" };

    const now = Date.now();
    await ctx.db.patch(row._id, {
      revokedAtMs: now,
      updatedAtMs: now,
    });

    await ctx.db.insert("apiImportAuditEvents", {
      id: `audit_${now}_${row.keyId}`,
      userId,
      apiKeyId: row.id,
      eventType: "api_key_revoked",
      status: "ok",
      createdAtMs: now,
    });

    return { status: "ok" };
  },
});
