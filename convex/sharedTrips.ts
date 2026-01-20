import { mutation } from "./_generated/server";
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

// recordTripChange imported

function randomSuffix() {
  return Math.random().toString(36).slice(2, 10);
}

/**
 * Create a new shared trip.
 *
 * v1: currency is always INR and immutable.
 */
export const create = mutation({
  args: {
    name: v.string(),
    emoji: v.string(),
    startDateMs: v.optional(v.number()),
    endDateMs: v.optional(v.number()),
    budgetCents: v.optional(v.number()),
    participantName: v.optional(v.string()),
    colorHex: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const now = Date.now();

    const tripId = `t_${now}_${randomSuffix()}`;
    const participantId = `${tripId}:p:${userId}`;
    const memberId = `${tripId}:${userId}`;

    const startDateMs = args.startDateMs ?? now;
    const endDateMs = args.endDateMs ?? (now + 7 * 86400000);

    await ctx.db.insert("sharedTrips", {
      id: tripId,
      name: args.name,
      emoji: args.emoji,
      currencyCode: "INR",
      startDateMs,
      endDateMs,
      budgetCents: args.budgetCents,
      createdAtMs: now,
      updatedAtMs: now,
      syncVersion: 1,
    });

    await recordTripChange(ctx, tripId, "sharedTrips", tripId, now, "upsert");

    await ctx.db.insert("sharedTripParticipants", {
      id: participantId,
      tripId,
      name: args.participantName ?? "You",
      colorHex: args.colorHex,
      linkedUserId: userId,
      createdAtMs: now,
      updatedAtMs: now,
      syncVersion: 1,
    });

    await recordTripChange(ctx, tripId, "sharedTripParticipants", participantId, now, "upsert");

    await ctx.db.insert("sharedTripMembers", {
      id: memberId,
      tripId,
      userId,
      participantId,
      joinedAtMs: now,
      updatedAtMs: now,
      syncVersion: 1,
    });

    return {
      tripId,
      memberId,
      participantId,
      currencyCode: "INR",
    };
  },
});

/**
 * Global delete: marks the trip as deleted for everyone.
 *
 * v1: any member can delete.
 */
export const deleteTrip = mutation({
  args: {
    tripId: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    await requireTripMember(ctx, args.tripId, userId);

    const now = Date.now();

    const trip = await ctx.db
      .query("sharedTrips")
      .withIndex("by_client_id", (q: any) => q.eq("id", args.tripId))
      .first();

    if (!trip) throw new Error("Trip not found");

    await ctx.db.patch(trip._id, {
      deletedAtMs: now,
      updatedAtMs: now,
      syncVersion: (trip.syncVersion ?? 1) + 1,
    });

    await recordTripChange(ctx, args.tripId, "sharedTrips", args.tripId, now, "delete");

    return { status: "ok" };
  },
});

/**
 * Remove a member from a trip.
 *
 * v1: any member can remove any member.
 */
export const removeMember = mutation({
  args: {
    tripId: v.string(),
    userIdToRemove: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    await requireTripMember(ctx, args.tripId, userId);

    const now = Date.now();

    const member = await ctx.db
      .query("sharedTripMembers")
      .withIndex("by_user_trip", (q: any) => q.eq("userId", args.userIdToRemove).eq("tripId", args.tripId))
      .first();

    if (!member || member.deletedAtMs !== undefined) {
      return { status: "ok" };
    }

    await ctx.db.patch(member._id, {
      deletedAtMs: now,
      updatedAtMs: now,
      syncVersion: (member.syncVersion ?? 1) + 1,
    });

    // Turn their participant back into a guest so it can be re-claimed later.
    const participant = await ctx.db
      .query("sharedTripParticipants")
      .withIndex("by_client_id", (q: any) => q.eq("id", member.participantId))
      .first();

    if (participant && participant.linkedUserId === args.userIdToRemove) {
      await ctx.db.patch(participant._id, {
        linkedUserId: undefined,
        updatedAtMs: now,
        syncVersion: (participant.syncVersion ?? 1) + 1,
      });

      await recordTripChange(ctx, args.tripId, "sharedTripParticipants", participant.id, now, "upsert");
    }

    return { status: "ok" };
  },
});
