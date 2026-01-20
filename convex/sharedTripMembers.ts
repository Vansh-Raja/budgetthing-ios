import { query } from "./_generated/server";
import { v } from "convex/values";

async function getUserIdOrNull(ctx: any): Promise<string | null> {
  const identity = await ctx.auth.getUserIdentity();
  return identity ? identity.subject : null;
}

export const mine = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getUserIdOrNull(ctx);
    if (!userId) return [];

    const rows = await ctx.db
      .query("sharedTripMembers")
      .withIndex("by_user", (q: any) => q.eq("userId", userId))
      .collect();

    // Return all memberships including deletions so clients can revoke local access.
    return rows;
  },
});

export const get = query({
  args: {
    tripId: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = await getUserIdOrNull(ctx);
    if (!userId) return null;

    const row = await ctx.db
      .query("sharedTripMembers")
      .withIndex("by_user_trip", (q: any) => q.eq("userId", userId).eq("tripId", args.tripId))
      .first();

    if (!row || row.deletedAtMs !== undefined) return null;
    return row;
  },
});
