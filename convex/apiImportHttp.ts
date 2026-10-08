import { internalMutation } from "./_generated/server";
import { v } from "convex/values";
import {
  compactExternalIdLabel,
  hashApiKey,
  normalizeComparableText,
  parseRawApiKey,
  sha256Hex,
  shortHash,
  stableStringify,
} from "./apiImportShared";
import { recordUserChange } from "./userSyncSeq";

const MAX_ITEMS = 50;
const REQUEST_TTL_MS = 24 * 60 * 60 * 1000;
const DUPLICATE_WINDOW_MS = 10_000;

const FORBIDDEN_KEYS = new Set([
  "rawText",
  "emailBody",
  "ocrText",
  "attachment",
  "attachments",
  "cardNumber",
  "bankStatement",
  "receiptImage",
]);

const TOP_LEVEL_KEYS = new Set(["source", "items"]);
const ITEM_KEYS = new Set([
  "externalId",
  "type",
  "amountCents",
  "currencyCode",
  "occurredAt",
  "merchantName",
  "note",
  "accountId",
  "categoryId",
]);

type ApiResult = {
  statusCode: number;
  body: any;
  headers?: Record<string, string>;
};

function json(statusCode: number, body: any, headers?: Record<string, string>): ApiResult {
  return { statusCode, body, headers };
}

function containsForbiddenKey(value: unknown): string | null {
  if (!value || typeof value !== "object") return null;
  if (Array.isArray(value)) {
    for (const item of value) {
      const nested = containsForbiddenKey(item);
      if (nested) return nested;
    }
    return null;
  }

  for (const [key, nestedValue] of Object.entries(value as Record<string, unknown>)) {
    if (FORBIDDEN_KEYS.has(key)) return key;
    const nested = containsForbiddenKey(nestedValue);
    if (nested) return nested;
  }
  return null;
}

function assertKnownKeys(value: Record<string, unknown>, allowed: Set<string>, path: string) {
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) {
      throw new Error(`${path}.${key} is not supported`);
    }
  }
}

async function audit(ctx: any, input: {
  userId?: string;
  apiKeyId?: string;
  eventType: string;
  status: string;
  requestId?: string;
  detail?: Record<string, unknown>;
  ipHash?: string;
  userAgentHash?: string;
}) {
  const now = Date.now();
  await ctx.db.insert("apiImportAuditEvents", {
    id: `audit_${now}_${await shortHash(stableStringify(input), 12)}`,
    userId: input.userId,
    apiKeyId: input.apiKeyId,
    eventType: input.eventType,
    status: input.status,
    requestId: input.requestId,
    detailJson: input.detail ? JSON.stringify(input.detail) : undefined,
    ipHash: input.ipHash,
    userAgentHash: input.userAgentHash,
    createdAtMs: now,
  });
}

async function checkRateLimit(ctx: any, bucketKey: string, windowMs: number, limit: number) {
  const now = Date.now();
  const windowStartMs = Math.floor(now / windowMs) * windowMs;
  const id = `rate_${await shortHash(`${bucketKey}:${windowStartMs}`)}`;
  const existing = await ctx.db
    .query("apiImportRateLimits")
    .withIndex("by_client_id", (q: any) => q.eq("id", id))
    .first();

  if (existing) {
    if ((existing.count as number) >= limit) return false;
    await ctx.db.patch(existing._id, { count: (existing.count as number) + 1, updatedAtMs: now });
    return true;
  }

  await ctx.db.insert("apiImportRateLimits", {
    id,
    bucketKey,
    windowStartMs,
    count: 1,
    updatedAtMs: now,
  });
  return true;
}

async function authenticate(ctx: any, rawKey: string, ipHash?: string, userAgentHash?: string) {
  const parsed = parseRawApiKey(rawKey);
  // Failed auth is rate-limited per client: past the limit the request is still
  // rejected, but no further audit rows are written (bounds unauthenticated writes).
  const failedAuthAllowed = () => checkRateLimit(ctx, `invalid:${ipHash ?? "unknown"}`, 60_000, 20);
  if (!parsed) {
    if (await failedAuthAllowed()) {
      await audit(ctx, { eventType: "auth_failed", status: "bad_key_format", ipHash, userAgentHash });
    }
    return null;
  }

  const row = await ctx.db
    .query("apiImportKeys")
    .withIndex("by_key_id", (q: any) => q.eq("keyId", parsed.keyId))
    .first();

  if (!row || row.keyHash !== await hashApiKey(rawKey)) {
    if (await failedAuthAllowed()) {
      await audit(ctx, { eventType: "auth_failed", status: "key_not_found", ipHash, userAgentHash });
    }
    return null;
  }

  const now = Date.now();
  if (row.revokedAtMs !== undefined || (row.expiresAtMs !== undefined && row.expiresAtMs <= now)) {
    if (!(await failedAuthAllowed())) return null;
    await audit(ctx, {
      userId: row.userId,
      apiKeyId: row.id,
      eventType: "auth_failed",
      status: row.revokedAtMs !== undefined ? "revoked" : "expired",
      ipHash,
      userAgentHash,
    });
    return null;
  }

  await ctx.db.patch(row._id, { lastUsedAtMs: now, updatedAtMs: now });
  return {
    userId: row.userId as string,
    apiKeyId: row.id as string,
    keyId: row.keyId as string,
  };
}

async function getCurrencyCode(ctx: any, userId: string) {
  const settings = await ctx.db
    .query("userSettings")
    .withIndex("by_user", (q: any) => q.eq("userId", userId))
    .first();
  return (settings?.currencyCode as string | undefined) ?? "INR";
}

async function findPossibleDuplicate(ctx: any, userId: string, item: {
  type: string;
  amountCents: number;
  dateMs: number;
  note?: string | null;
  merchantName?: string | null;
  categoryId?: string | null;
}) {
  const start = item.dateMs - DUPLICATE_WINDOW_MS;
  const end = item.dateMs + DUPLICATE_WINDOW_MS;
  const targetText = normalizeComparableText(item.note || item.merchantName);
  const signals = new Set<string>();

  const txs = await ctx.db
    .query("transactions")
    .withIndex("by_user_date", (q: any) => q.eq("userId", userId).gte("date", start).lte("date", end))
    .collect();

  for (const tx of txs) {
    if (tx.deletedAtMs !== undefined) continue;
    if (tx.type !== item.type) continue;
    if (tx.amountCents !== item.amountCents) continue;

    signals.add("same_amount");
    signals.add("same_time_window");

    const txText = normalizeComparableText(tx.note);
    if (targetText && txText && targetText === txText) signals.add("same_note_or_merchant");
    if (item.categoryId && tx.categoryId && item.categoryId === tx.categoryId) signals.add("same_category");

    if (signals.has("same_note_or_merchant") || signals.has("same_category")) {
      return Array.from(signals);
    }
  }

  return [];
}

async function validateAndNormalizeItem(ctx: any, userId: string, userCurrencyCode: string, raw: any) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error("Each item must be an object");
  assertKnownKeys(raw, ITEM_KEYS, "item");

  const externalId = typeof raw.externalId === "string" ? raw.externalId.trim() : "";
  if (!externalId) throw new Error("item.externalId is required");
  if (externalId.length > 256) throw new Error("item.externalId is too long");

  if (raw.type !== "expense" && raw.type !== "income") {
    throw new Error("item.type must be expense or income");
  }
  if (!Number.isInteger(raw.amountCents) || raw.amountCents <= 0) {
    throw new Error("item.amountCents must be a positive integer");
  }
  if (raw.currencyCode !== userCurrencyCode) {
    throw new Error(`item.currencyCode must match ${userCurrencyCode}`);
  }
  if (typeof raw.occurredAt !== "string") {
    throw new Error("item.occurredAt must be an ISO timestamp");
  }
  const dateMs = Date.parse(raw.occurredAt);
  if (!Number.isFinite(dateMs)) throw new Error("item.occurredAt is invalid");

  const accountId = typeof raw.accountId === "string" && raw.accountId.trim() ? raw.accountId.trim() : undefined;
  const categoryId = typeof raw.categoryId === "string" && raw.categoryId.trim() ? raw.categoryId.trim() : undefined;

  if (accountId) {
    const account = await ctx.db
      .query("accounts")
      .withIndex("by_client_id", (q: any) => q.eq("id", accountId))
      .filter((q: any) => q.eq(q.field("userId"), userId))
      .first();
    if (!account || account.deletedAtMs !== undefined) throw new Error(`Unknown accountId: ${accountId}`);
  }

  if (categoryId) {
    const category = await ctx.db
      .query("categories")
      .withIndex("by_client_id", (q: any) => q.eq("id", categoryId))
      .filter((q: any) => q.eq(q.field("userId"), userId))
      .first();
    if (!category || category.deletedAtMs !== undefined || category.isSystem !== 0) {
      throw new Error(`Unknown categoryId: ${categoryId}`);
    }
  }

  const merchantName = typeof raw.merchantName === "string" ? raw.merchantName.trim().slice(0, 120) : undefined;
  const note = typeof raw.note === "string" ? raw.note.trim().slice(0, 200) : undefined;

  return {
    externalId,
    type: raw.type as "expense" | "income",
    amountCents: raw.amountCents as number,
    currencyCode: raw.currencyCode as string,
    dateMs,
    merchantName: merchantName || undefined,
    note: note || undefined,
    accountId,
    categoryId,
  };
}

export const metadataForToken = internalMutation({
  args: {
    rawKey: v.string(),
    ipHash: v.optional(v.string()),
    userAgentHash: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<ApiResult> => {
    const auth = await authenticate(ctx, args.rawKey, args.ipHash, args.userAgentHash);
    if (!auth) return json(401, { error: "unauthorized" });

    if (!await checkRateLimit(ctx, `metadata:${auth.apiKeyId}`, 60_000, 120)) {
      await audit(ctx, { userId: auth.userId, apiKeyId: auth.apiKeyId, eventType: "metadata_read", status: "rate_limited" });
      return json(429, { error: "rate_limited" }, { "Retry-After": "60" });
    }

    const [accounts, categories, settings] = await Promise.all([
      ctx.db.query("accounts").withIndex("by_user", (q: any) => q.eq("userId", auth.userId)).collect(),
      ctx.db.query("categories").withIndex("by_user", (q: any) => q.eq("userId", auth.userId)).collect(),
      ctx.db.query("userSettings").withIndex("by_user", (q: any) => q.eq("userId", auth.userId)).first(),
    ]);

    await audit(ctx, { userId: auth.userId, apiKeyId: auth.apiKeyId, eventType: "metadata_read", status: "ok" });

    return json(200, {
      currencyCode: settings?.currencyCode ?? "INR",
      defaultAccountId: settings?.defaultAccountId ?? null,
      accounts: accounts
        .filter((a: any) => a.deletedAtMs === undefined)
        .sort((a: any, b: any) => (a.sortIndex ?? 0) - (b.sortIndex ?? 0))
        .map((a: any) => ({ id: a.id, name: a.name, emoji: a.emoji, kind: a.kind })),
      categories: categories
        .filter((c: any) => c.deletedAtMs === undefined && c.isSystem === 0)
        .sort((a: any, b: any) => (a.sortIndex ?? 0) - (b.sortIndex ?? 0))
        .map((c: any) => ({ id: c.id, name: c.name, emoji: c.emoji })),
    });
  },
});

export const statusForToken = internalMutation({
  args: {
    rawKey: v.string(),
    source: v.string(),
    externalId: v.string(),
    ipHash: v.optional(v.string()),
    userAgentHash: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<ApiResult> => {
    const auth = await authenticate(ctx, args.rawKey, args.ipHash, args.userAgentHash);
    if (!auth) return json(401, { error: "unauthorized" });

    const externalIdHash = await sha256Hex(`${args.source}:${args.externalId}`);
    const item = await ctx.db
      .query("importInboxItems")
      .withIndex("by_user_external", (q: any) => q.eq("userId", auth.userId).eq("source", args.source).eq("externalIdHash", externalIdHash))
      .first();

    if (!item) return json(404, { error: "not_found" });

    await audit(ctx, { userId: auth.userId, apiKeyId: auth.apiKeyId, eventType: "import_status_read", status: "ok" });

    return json(200, {
      id: item.id,
      source: item.source,
      status: item.status,
      possibleDuplicate: item.possibleDuplicate === 1,
      duplicateSignals: item.duplicateSignalsJson ? JSON.parse(item.duplicateSignalsJson as string) : [],
      createdAtMs: item.createdAtMs,
      updatedAtMs: item.updatedAtMs,
    });
  },
});

export const createImportsForToken = internalMutation({
  args: {
    rawKey: v.string(),
    idempotencyKey: v.string(),
    body: v.any(),
    ipHash: v.optional(v.string()),
    userAgentHash: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<ApiResult> => {
    const auth = await authenticate(ctx, args.rawKey, args.ipHash, args.userAgentHash);
    if (!auth) return json(401, { error: "unauthorized" });

    if (!args.idempotencyKey.trim()) return json(400, { error: "missing_idempotency_key" });

    if (!await checkRateLimit(ctx, `imports:${auth.apiKeyId}`, 60_000, 60)) {
      await audit(ctx, { userId: auth.userId, apiKeyId: auth.apiKeyId, eventType: "import_create", status: "rate_limited" });
      return json(429, { error: "rate_limited" }, { "Retry-After": "60" });
    }

    const forbidden = containsForbiddenKey(args.body);
    if (forbidden) return json(400, { error: "raw_payload_not_allowed", field: forbidden });
    if (!args.body || typeof args.body !== "object" || Array.isArray(args.body)) {
      return json(400, { error: "body_must_be_object" });
    }

    try {
      assertKnownKeys(args.body, TOP_LEVEL_KEYS, "body");
    } catch (e: any) {
      return json(400, { error: "unsupported_field", message: e.message });
    }

    const source = typeof args.body.source === "string" ? args.body.source.trim() : "";
    if (!source || source.length > 80) return json(400, { error: "invalid_source" });
    if (!Array.isArray(args.body.items) || args.body.items.length === 0) return json(400, { error: "items_required" });
    if (args.body.items.length > MAX_ITEMS) return json(400, { error: "too_many_items", maxItems: MAX_ITEMS });

    const requestHash = await sha256Hex(stableStringify(args.body));
    const idempotencyKeyHash = await sha256Hex(`${auth.apiKeyId}:${args.idempotencyKey}`);
    const requestId = `import_req_${await shortHash(`${auth.apiKeyId}:${idempotencyKeyHash}`)}`;
    const existingRequest = await ctx.db
      .query("apiImportRequests")
      .withIndex("by_client_id", (q: any) => q.eq("id", requestId))
      .first();

    if (existingRequest) {
      if (existingRequest.requestHash !== requestHash) {
        await audit(ctx, { userId: auth.userId, apiKeyId: auth.apiKeyId, requestId, eventType: "import_create", status: "idempotency_conflict" });
        return json(409, { error: "idempotency_conflict" });
      }
      await audit(ctx, { userId: auth.userId, apiKeyId: auth.apiKeyId, requestId, eventType: "import_create", status: "idempotent_replay" });
      return json(existingRequest.statusCode as number, {
        ...JSON.parse(existingRequest.responseJson as string),
        idempotentReplayed: true,
      }, { "Idempotent-Replayed": "true" });
    }

    const now = Date.now();
    const currencyCode = await getCurrencyCode(ctx, auth.userId);
    const responseItems: any[] = [];

    // Validate the whole batch before writing anything: a 400 must leave no partial inbox rows.
    const normalizedItems: Array<Awaited<ReturnType<typeof validateAndNormalizeItem>>> = [];
    for (const rawItem of args.body.items) {
      try {
        normalizedItems.push(await validateAndNormalizeItem(ctx, auth.userId, currencyCode, rawItem));
      } catch (e: any) {
        await audit(ctx, { userId: auth.userId, apiKeyId: auth.apiKeyId, requestId, eventType: "import_create", status: "rejected", detail: { message: e.message } });
        return json(400, { error: "invalid_item", message: e.message });
      }
    }

    for (const normalized of normalizedItems) {
      const externalIdHash = await sha256Hex(`${source}:${normalized.externalId}`);
      const existing = await ctx.db
        .query("importInboxItems")
        .withIndex("by_user_external", (q: any) => q.eq("userId", auth.userId).eq("source", source).eq("externalIdHash", externalIdHash))
        .first();

      if (existing) {
        responseItems.push({
          id: existing.id,
          externalId: normalized.externalId,
          status: existing.status,
          existing: true,
          possibleDuplicate: existing.possibleDuplicate === 1,
          duplicateSignals: existing.duplicateSignalsJson ? JSON.parse(existing.duplicateSignalsJson as string) : [],
        });
        continue;
      }

      const duplicateSignals = await findPossibleDuplicate(ctx, auth.userId, normalized);
      const itemId = `import_${await shortHash(`${auth.userId}:${source}:${normalized.externalId}`)}`;
      const payloadHash = await sha256Hex(stableStringify(normalized));

      await ctx.db.insert("importInboxItems", {
        id: itemId,
        userId: auth.userId,
        source,
        externalIdHash,
        externalIdLabel: compactExternalIdLabel(normalized.externalId),
        apiKeyId: auth.apiKeyId,
        idempotencyKeyHash,
        payloadHash,
        status: "pending",
        type: normalized.type,
        amountCents: normalized.amountCents,
        currencyCode: normalized.currencyCode,
        dateMs: normalized.dateMs,
        merchantName: normalized.merchantName,
        note: normalized.note,
        accountId: normalized.accountId,
        categoryId: normalized.categoryId,
        possibleDuplicate: duplicateSignals.length > 0 ? 1 : 0,
        duplicateSignalsJson: duplicateSignals.length > 0 ? JSON.stringify(duplicateSignals) : undefined,
        createdAtMs: now,
        updatedAtMs: now,
        syncVersion: 1,
      });

      await recordUserChange(ctx, auth.userId, "importInboxItems", itemId, now, "upsert");

      responseItems.push({
        id: itemId,
        externalId: normalized.externalId,
        status: "pending",
        existing: false,
        possibleDuplicate: duplicateSignals.length > 0,
        duplicateSignals,
      });
    }

    const responseBody = {
      status: "ok",
      requestId,
      importedCount: responseItems.length,
      items: responseItems,
    };

    await ctx.db.insert("apiImportRequests", {
      id: requestId,
      userId: auth.userId,
      apiKeyId: auth.apiKeyId,
      idempotencyKeyHash,
      requestHash,
      responseJson: JSON.stringify(responseBody),
      statusCode: 200,
      createdAtMs: now,
      expiresAtMs: now + REQUEST_TTL_MS,
    });

    await audit(ctx, {
      userId: auth.userId,
      apiKeyId: auth.apiKeyId,
      requestId,
      eventType: "import_create",
      status: "ok",
      detail: { importedCount: responseItems.length },
    });

    return json(200, responseBody);
  },
});
