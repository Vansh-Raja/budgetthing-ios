import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

async function getLastSeqFromChangeLog(ctx: any, userId: string): Promise<number> {
  const lastEntry = await ctx.db
    .query("changeLog")
    .withIndex("by_user_seq", (q: any) => q.eq("userId", userId))
    .order("desc")
    .first();
  return lastEntry?.seq ?? 0;
}

async function getOrCreateUserSyncState(ctx: any, userId: string) {
  // Always pick the oldest state doc if duplicates exist.
  const existing = await ctx.db
    .query("userSyncState")
    .withIndex("by_client_id", (q: any) => q.eq("id", userId))
    .order("asc")
    .first();
  if (existing) return existing;

  const lastSeq = await getLastSeqFromChangeLog(ctx, userId);
  await ctx.db.insert("userSyncState", { id: userId, userId, lastSeq });

  return ctx.db
    .query("userSyncState")
    .withIndex("by_client_id", (q: any) => q.eq("id", userId))
    .order("asc")
    .first();
}

async function allocateUserSeq(ctx: any, userId: string): Promise<number> {
  const state = await getOrCreateUserSyncState(ctx, userId);
  const nextSeq = ((state?.lastSeq as number | undefined) ?? 0) + 1;
  await ctx.db.patch(state._id, { lastSeq: nextSeq });
  return nextSeq;
}

const NULL_CLEARS_OPTIONAL_FIELDS_BY_TABLE: Record<string, Set<string>> = {
  accounts: new Set(["openingBalanceCents", "limitAmountCents", "billingCycleDay", "deletedAtMs"]),
  categories: new Set(["monthlyBudgetCents", "deletedAtMs"]),
  transactions: new Set([
    "note",
    "systemType",
    "accountId",
    "categoryId",
    "transferFromAccountId",
    "transferToAccountId",
    "tripExpenseId",
    "deletedAtMs",
  ]),
  trips: new Set(["startDate", "endDate", "budgetCents", "deletedAtMs"]),
  tripParticipants: new Set(["colorHex", "deletedAtMs"]),
  tripExpenses: new Set(["paidByParticipantId", "splitDataJson", "computedSplitsJson", "deletedAtMs"]),
  tripSettlements: new Set(["note", "deletedAtMs"]),
  userSettings: new Set(["defaultAccountId"]),
};

/**
 * Helper: Sanitize incoming SQLite records for Convex.
 * - Removes local-only fields.
 * - Interprets NULL for certain optional fields as "unset".
 */
function sanitizeRecord(tableName: string, input: Record<string, unknown>) {
  const { needsSync: _needsSync, ...rest } = input as any;
  const output: Record<string, unknown> = {};
  const unsetKeys: string[] = [];
  const nullClears = NULL_CLEARS_OPTIONAL_FIELDS_BY_TABLE[tableName] ?? new Set<string>();

  for (const [key, value] of Object.entries(rest)) {
    if (value === undefined) continue;

    if (value === null) {
      if (nullClears.has(key)) {
        unsetKeys.push(key);
      }
      continue;
    }

    output[key] = value;
  }

  return { data: output, unsetKeys };
}

/**
 * Push mutation: accepts batches of local changes and applies them to Convex.
 * Uses last-write-wins conflict resolution based on updatedAtMs.
 * Records all changes in the changeLog for pull sync.
 */
export const push = mutation({
  args: {
    accounts: v.optional(v.array(v.any())),
    categories: v.optional(v.array(v.any())),
    transactions: v.optional(v.array(v.any())),
    trips: v.optional(v.array(v.any())),
    tripParticipants: v.optional(v.array(v.any())),
    tripExpenses: v.optional(v.array(v.any())),
    tripSettlements: v.optional(v.array(v.any())),
    userSettings: v.optional(v.array(v.any())),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthorized");
    const userId = identity.subject;

    const processTable = async (tableName: string, records?: any[]) => {
      if (!records || records.length === 0) return;

      for (const record of records) {
        if (!record || typeof record !== "object") continue;

        const { id, ...raw } = record as any;
        if (!id) continue;

        const { data, unsetKeys } = sanitizeRecord(tableName, raw);
        const incomingUpdatedAtMs = (data.updatedAtMs as number | undefined) ?? 0;
        const incomingSyncVersion = (data.syncVersion as number | undefined) ?? 0;

        const existing = await ctx.db
          .query(tableName as any)
          .withIndex("by_client_id", (q) => q.eq("id", id))
          .filter((q) => q.eq(q.field("userId"), userId))
          .first();

        let didChange = false;

        if (existing) {
          const existingUpdatedAtMs = (existing.updatedAtMs as number) ?? 0;
          const existingSyncVersion = (existing.syncVersion as number) ?? 0;

          // Last-write-wins with a tie-breaker on syncVersion.
          const shouldApply =
            incomingUpdatedAtMs > existingUpdatedAtMs ||
            (incomingUpdatedAtMs === existingUpdatedAtMs && incomingSyncVersion > existingSyncVersion);

          if (shouldApply) {
            const patch: any = { ...data, userId };
            for (const key of unsetKeys) patch[key] = undefined;
            await ctx.db.patch(existing._id, patch);
            didChange = true;
          }
        } else {
          await ctx.db.insert(tableName as any, { id, ...data, userId });
          didChange = true;
        }

        // Record in changeLog if we made a change
        if (didChange) {
          const seq = await allocateUserSeq(ctx, userId);
          const isDelete = data.deletedAtMs !== undefined && data.deletedAtMs !== null;

          await ctx.db.insert("changeLog", {
            userId,
            entityType: tableName,
            entityId: id,
            action: isDelete ? "delete" : "upsert",
            updatedAtMs: incomingUpdatedAtMs,
            seq,
          });
        }
      }
    };

    await processTable("accounts", args.accounts);
    await processTable("categories", args.categories);
    await processTable("transactions", args.transactions);
    await processTable("trips", args.trips);
    await processTable("tripParticipants", args.tripParticipants);
    await processTable("tripExpenses", args.tripExpenses);
    await processTable("tripSettlements", args.tripSettlements);
    await processTable("userSettings", args.userSettings);

    return { status: "ok" };
  },
});

/**
 * Pull query: fetches changes since a given sequence number.
 * Returns the changes grouped by entity type, plus the latest sequence.
 */
export const pull = query({
  args: {
    lastSeq: v.number() // Client's last known sequence number
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;
    const userId = identity.subject;

    // Fetch all changelog entries since lastSeq
    const changes = await ctx.db
      .query("changeLog")
      .withIndex("by_user_seq", (q) => q.eq("userId", userId))
      .filter((q) => q.gt(q.field("seq"), args.lastSeq))
      .order("asc")
      .collect();

    if (changes.length === 0) {
      return {
        accounts: [],
        categories: [],
        transactions: [],
        trips: [],
        tripParticipants: [],
        tripExpenses: [],
        tripSettlements: [],
        userSettings: [],
        latestSeq: args.lastSeq,
      };
    }

    // Group entityIds by type
    const entityMap: Record<string, Set<string>> = {};
    for (const change of changes) {
      if (!entityMap[change.entityType]) {
        entityMap[change.entityType] = new Set();
      }
      entityMap[change.entityType].add(change.entityId);
    }

    // Fetch actual entity data for each type
    const fetchEntities = async (tableName: string, ids: Set<string>) => {
      const results = [];
      for (const id of ids) {
        const entity = await ctx.db
          .query(tableName as any)
          .withIndex("by_client_id", (q) => q.eq("id", id))
          .filter((q) => q.eq(q.field("userId"), userId))
          .first();
        if (entity) {
          results.push(entity);
        }
      }
      return results;
    };

    const latestSeq = changes[changes.length - 1].seq;

    return {
      accounts: entityMap.accounts ? await fetchEntities("accounts", entityMap.accounts) : [],
      categories: entityMap.categories ? await fetchEntities("categories", entityMap.categories) : [],
      transactions: entityMap.transactions ? await fetchEntities("transactions", entityMap.transactions) : [],
      trips: entityMap.trips ? await fetchEntities("trips", entityMap.trips) : [],
      tripParticipants: entityMap.tripParticipants ? await fetchEntities("tripParticipants", entityMap.tripParticipants) : [],
      tripExpenses: entityMap.tripExpenses ? await fetchEntities("tripExpenses", entityMap.tripExpenses) : [],
      tripSettlements: entityMap.tripSettlements ? await fetchEntities("tripSettlements", entityMap.tripSettlements) : [],
      userSettings: entityMap.userSettings ? await fetchEntities("userSettings", entityMap.userSettings) : [],
      latestSeq,
    };
  },
});

/**
 * Latest sequence number for this user's changelog.
 *
 * Used as a lightweight realtime "poke" signal so clients can pull immediately
 * when any other device writes.
 */
export const latestSeq = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;
    const userId = identity.subject;

    const state = await ctx.db
      .query("userSyncState")
      .withIndex("by_client_id", (q: any) => q.eq("id", userId))
      .order("asc")
      .first();
    if (state) return state.lastSeq ?? 0;

    return await getLastSeqFromChangeLog(ctx, userId);
  },
});

/**
 * Whoami query: useful for testing auth integration
 */
export const whoami = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    return identity;
  },
});
