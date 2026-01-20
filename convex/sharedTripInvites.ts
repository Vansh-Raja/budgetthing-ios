import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

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

async function getLastTripSeq(ctx: any, tripId: string): Promise<number> {
  const lastEntry = await ctx.db
    .query("sharedTripChangeLog")
    .withIndex("by_trip_seq", (q: any) => q.eq("tripId", tripId))
    .order("desc")
    .first();
  return lastEntry?.seq ?? 0;
}

async function recordTripChange(
  ctx: any,
  tripId: string,
  entityType: string,
  entityId: string,
  updatedAtMs: number,
  action: "upsert" | "delete"
) {
  const lastSeq = await getLastTripSeq(ctx, tripId);
  await ctx.db.insert("sharedTripChangeLog", {
    tripId,
    entityType,
    entityId,
    action,
    updatedAtMs,
    seq: lastSeq + 1,
  });
}

function nowMs() {
  return Date.now();
}

function randomCode(length = 8) {
  // Avoid ambiguous chars (0/O, 1/I)
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "";
  for (let i = 0; i < length; i++) {
    out += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return out;
}

async function findActiveInviteByCode(ctx: any, code: string) {
  const invite = await ctx.db
    .query("sharedTripInvites")
    .withIndex("by_code", (q: any) => q.eq("code", code))
    .first();

  if (!invite) return null;
  if (invite.deletedAtMs !== undefined) return null;

  const now = nowMs();
  if (invite.expiresAtMs !== undefined && invite.expiresAtMs <= now) return null;
  if (invite.uses >= invite.maxUses) return null;

  return invite;
}

export const rotate = mutation({
  args: {
    tripId: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    await requireTripMember(ctx, args.tripId, userId);

    const now = nowMs();

    // Expire existing invites for this trip.
    const existing = await ctx.db
      .query("sharedTripInvites")
      .withIndex("by_trip", (q: any) => q.eq("tripId", args.tripId))
      .collect();

    for (const inv of existing) {
      if (inv.deletedAtMs !== undefined) continue;
      if (inv.expiresAtMs !== undefined && inv.expiresAtMs <= now) continue;
      await ctx.db.patch(inv._id, {
        expiresAtMs: now,
        updatedAtMs: now,
      });
    }

    // Create a new code (no expiry in v1).
    let code = "";
    for (let i = 0; i < 8; i++) {
      const candidate = randomCode(8);
      const collision = await ctx.db
        .query("sharedTripInvites")
        .withIndex("by_code", (q: any) => q.eq("code", candidate))
        .first();
      if (!collision) {
        code = candidate;
        break;
      }
    }

    if (!code) {
      throw new Error("Failed to generate join code");
    }

    await ctx.db.insert("sharedTripInvites", {
      id: code,
      tripId: args.tripId,
      code,
      createdByUserId: userId,
      createdAtMs: now,
      updatedAtMs: now,
      uses: 0,
      maxUses: 1_000_000,
    });

    return { code };
  },
});

export const getActiveForTrip = query({
  args: {
    tripId: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    await requireTripMember(ctx, args.tripId, userId);

    const now = nowMs();

    const invites = await ctx.db
      .query("sharedTripInvites")
      .withIndex("by_trip", (q: any) => q.eq("tripId", args.tripId))
      .collect();

    const active = invites
      .filter((inv: any) => inv.deletedAtMs === undefined)
      .filter((inv: any) => inv.expiresAtMs === undefined || inv.expiresAtMs > now)
      .filter((inv: any) => inv.uses < inv.maxUses)
      .sort((a: any, b: any) => (b.createdAtMs ?? 0) - (a.createdAtMs ?? 0))[0];

    return active ? { code: active.code, expiresAtMs: active.expiresAtMs, uses: active.uses, maxUses: active.maxUses } : null;
  },
});

export const joinByCode = mutation({
  args: {
    code: v.string(),
    participantId: v.optional(v.string()),
    participantName: v.optional(v.string()),
    colorHex: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);

    const invite = await findActiveInviteByCode(ctx, args.code);
    if (!invite) {
      throw new Error("Invalid or expired join code");
    }

    const tripId = invite.tripId as string;

    // Ensure trip exists.
    const trip = await ctx.db
      .query("sharedTrips")
      .withIndex("by_client_id", (q: any) => q.eq("id", tripId))
      .first();
    if (!trip || trip.deletedAtMs !== undefined) {
      throw new Error("Trip not found");
    }

    // If already a member, return early.
    const existingMember = await ctx.db
      .query("sharedTripMembers")
      .withIndex("by_user_trip", (q: any) => q.eq("userId", userId).eq("tripId", tripId))
      .first();

    const now = nowMs();

    // Resolve participant mapping.
    let participantId: string | null = null;

    if (args.participantId) {
      const participant = await ctx.db
        .query("sharedTripParticipants")
        .withIndex("by_client_id", (q: any) => q.eq("id", args.participantId))
        .first();

      if (!participant || participant.deletedAtMs !== undefined || participant.tripId !== tripId) {
        throw new Error("Invalid participant");
      }

      if (participant.linkedUserId !== undefined && participant.linkedUserId !== userId) {
        throw new Error("Participant already linked");
      }

      await ctx.db.patch(participant._id, {
        linkedUserId: userId,
        updatedAtMs: now,
        syncVersion: (participant.syncVersion ?? 1) + 1,
      });

      await recordTripChange(ctx, tripId, "sharedTripParticipants", participant.id, now, "upsert");

      participantId = participant.id;
    } else {
      // Reuse a participant already linked to this user if it exists.
      const linked = await ctx.db
        .query("sharedTripParticipants")
        .withIndex("by_trip_linkedUser", (q: any) => q.eq("tripId", tripId).eq("linkedUserId", userId))
        .first();

      if (linked && linked.deletedAtMs === undefined) {
        participantId = linked.id;
      } else {
        participantId = `${tripId}:p:${userId}`;
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
      }
    }

    if (!participantId) {
      throw new Error("Failed to assign participant");
    }

    const memberId = `${tripId}:${userId}`;

    if (existingMember) {
      if (existingMember.deletedAtMs !== undefined) {
        await ctx.db.patch(existingMember._id, {
          participantId,
          deletedAtMs: undefined,
          updatedAtMs: now,
          syncVersion: (existingMember.syncVersion ?? 1) + 1,
        });
      }
      // Do not increment invite uses for re-joins.
      return { tripId, participantId, memberId };
    }

    await ctx.db.insert("sharedTripMembers", {
      id: memberId,
      tripId,
      userId,
      participantId,
      joinedAtMs: now,
      updatedAtMs: now,
      syncVersion: 1,
    });

    await ctx.db.patch(invite._id, {
      uses: invite.uses + 1,
      updatedAtMs: now,
    });

    return { tripId, participantId, memberId };
  },
});
