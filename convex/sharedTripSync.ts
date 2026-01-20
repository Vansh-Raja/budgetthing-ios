import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { recordTripChange } from "./sharedTripSeq";

async function requireUserId(ctx: any): Promise<string> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) throw new Error("Unauthorized");
  return identity.subject;
}

async function requireTripMember(ctx: any, tripId: string, userId: string) {
  const member = await ctx.db
    .query("sharedTripMembers")
    .withIndex("by_user_trip", (q: any) => q.eq("userId", userId).eq("tripId", tripId))
    .first();

  if (!member || member.deletedAtMs !== undefined) {
    throw new Error("Forbidden: not a trip member");
  }

  return member;
}

const NULL_CLEARS_OPTIONAL_FIELDS = new Set<string>([
  // sharedTrips
  'startDateMs',
  'endDateMs',
  'budgetCents',

  // sharedTripParticipants
  'colorHex',
  'linkedUserId',

  // sharedTripExpenses
  'note',
  'paidByParticipantId',
  'splitDataJson',
  'computedSplitsJson',
  'categoryName',
  'categoryEmoji',

  // sharedTripSettlements
  'note',
]);

function sanitizeRecord(input: Record<string, unknown>) {
  const { needsSync: _needsSync, _id: __id, _creationTime: __ct, ...rest } = input as any;
  const output: Record<string, unknown> = {};
  const unsetKeys: string[] = [];

  for (const [key, value] of Object.entries(rest)) {
    if (value === undefined) continue;

    // Client uses NULL to mean "clear this optional field".
    // Convex optional fields should be removed (set to undefined) rather than storing null.
    if (value === null) {
      if (NULL_CLEARS_OPTIONAL_FIELDS.has(key)) {
        unsetKeys.push(key);
      }
      continue;
    }

    output[key] = value;
  }

  return { data: output, unsetKeys };
}

type SharedTripTableName =
  | "sharedTrips"
  | "sharedTripParticipants"
  | "sharedTripExpenses"
  | "sharedTripSettlements";

// recordTripChange imported

export const push = mutation({
  args: {
    tripId: v.string(),
    sharedTrips: v.optional(v.array(v.any())),
    sharedTripParticipants: v.optional(v.array(v.any())),
    sharedTripExpenses: v.optional(v.array(v.any())),
    sharedTripSettlements: v.optional(v.array(v.any())),
  },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    await requireTripMember(ctx, args.tripId, userId);

    const processTable = async (tableName: SharedTripTableName, records?: any[]) => {
      if (!records || records.length === 0) return;

      for (const record of records) {
        if (!record || typeof record !== "object") continue;

        const { id, ...raw } = record as any;
        if (!id) continue;

        const { data, unsetKeys } = sanitizeRecord(raw);
        const incomingUpdatedAtMs = (data.updatedAtMs as number | undefined) ?? 0;

        // Ensure writes stay scoped to the declared tripId.
        if (tableName === "sharedTrips") {
          if (id !== args.tripId) continue;
          data.currencyCode = "INR";
        } else {
          const recordTripId = data.tripId as string | undefined;
          if (!recordTripId || recordTripId !== args.tripId) continue;
        }

        const existing = await ctx.db
          .query(tableName as any)
          .withIndex("by_client_id", (q: any) => q.eq("id", id))
          .first();

        let didChange = false;

        if (existing) {
          if (incomingUpdatedAtMs >= (existing.updatedAtMs as number)) {
            const patch: any = { ...data, id };
            for (const key of unsetKeys) patch[key] = undefined;

            await ctx.db.patch(existing._id, patch);
            didChange = true;
          }
        } else {
          await ctx.db.insert(tableName as any, { id, ...data });
          didChange = true;
        }

        if (didChange) {
          const isDelete = data.deletedAtMs !== undefined && data.deletedAtMs !== null;
          await recordTripChange(
            ctx,
            args.tripId,
            tableName,
            id,
            incomingUpdatedAtMs,
            isDelete ? "delete" : "upsert"
          );
        }
      }
    };

    await processTable("sharedTrips", args.sharedTrips);
    await processTable("sharedTripParticipants", args.sharedTripParticipants);
    await processTable("sharedTripExpenses", args.sharedTripExpenses);
    await processTable("sharedTripSettlements", args.sharedTripSettlements);

    return { status: "ok" };
  },
});

export const pull = query({
  args: {
    tripId: v.string(),
    lastSeq: v.number(),
  },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    await requireTripMember(ctx, args.tripId, userId);

    const changes = await ctx.db
      .query("sharedTripChangeLog")
      .withIndex("by_trip_seq", (q: any) => q.eq("tripId", args.tripId))
      .filter((q: any) => q.gt(q.field("seq"), args.lastSeq))
      .order("asc")
      .collect();

    if (changes.length === 0) {
      return {
        sharedTrips: [],
        sharedTripParticipants: [],
        sharedTripExpenses: [],
        sharedTripSettlements: [],
        latestSeq: args.lastSeq,
      };
    }

    const entityMap: Record<string, Set<string>> = {};
    for (const change of changes) {
      if (!entityMap[change.entityType]) entityMap[change.entityType] = new Set();
      entityMap[change.entityType].add(change.entityId);
    }

    const fetchEntities = async (tableName: SharedTripTableName, ids: Set<string>) => {
      const results: any[] = [];
      for (const id of ids) {
        const entity = await ctx.db
          .query(tableName as any)
          .withIndex("by_client_id", (q: any) => q.eq("id", id))
          .first();
        if (entity) results.push(entity);
      }
      return results;
    };

    const latestSeq = changes[changes.length - 1].seq;

    return {
      sharedTrips: entityMap.sharedTrips ? await fetchEntities("sharedTrips", entityMap.sharedTrips) : [],
      sharedTripParticipants: entityMap.sharedTripParticipants
        ? await fetchEntities("sharedTripParticipants", entityMap.sharedTripParticipants)
        : [],
      sharedTripExpenses: entityMap.sharedTripExpenses
        ? await fetchEntities("sharedTripExpenses", entityMap.sharedTripExpenses)
        : [],
      sharedTripSettlements: entityMap.sharedTripSettlements
        ? await fetchEntities("sharedTripSettlements", entityMap.sharedTripSettlements)
        : [],
      latestSeq,
    };
  },
});

export const latestSeq = query({
  args: {
    tripId: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    await requireTripMember(ctx, args.tripId, userId);

    const state = await ctx.db
      .query('sharedTripSyncState')
      .withIndex('by_client_id', (q: any) => q.eq('id', args.tripId))
      .order('asc')
      .first();
    if (state) return state.lastSeq ?? 0;

    const lastEntry = await ctx.db
      .query('sharedTripChangeLog')
      .withIndex('by_trip_seq', (q: any) => q.eq('tripId', args.tripId))
      .order('desc')
      .first();
    return lastEntry?.seq ?? 0;
  },
});
