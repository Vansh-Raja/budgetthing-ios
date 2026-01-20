import { query } from "./_generated/server";

async function getUserIdOrNull(ctx: any): Promise<string | null> {
  const identity = await ctx.auth.getUserIdentity();
  return identity ? identity.subject : null;
}

async function getLastTripChangeUpdatedAtMs(ctx: any, tripId: string): Promise<number> {
  const lastEntry = await ctx.db
    .query("sharedTripChangeLog")
    .withIndex("by_trip_seq", (q: any) => q.eq("tripId", tripId))
    .order("desc")
    .first();

  return (lastEntry?.updatedAtMs as number | undefined) ?? 0;
}

/**
 * Realtime "poke" signal for shared trips.
 *
 * Returns a monotonically non-decreasing timestamp that changes when:
 * - Any membership row for the current user changes (join/leave)
 * - Any trip-scoped changelog entry changes for trips the user is currently a member of
 *
 * Client uses this to trigger an immediate pull (shared trip sync is run inside the normal pull).
 */
export const latestUpdatedAtMs = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getUserIdOrNull(ctx);
    if (!userId) return null;

    const memberships = await ctx.db
      .query("sharedTripMembers")
      .withIndex("by_user", (q: any) => q.eq("userId", userId))
      .collect();

    let maxMemberUpdatedAtMs = 0;
    const activeTripIds: string[] = [];

    for (const m of memberships) {
      const updatedAtMs = (m.updatedAtMs as number | undefined) ?? 0;
      if (updatedAtMs > maxMemberUpdatedAtMs) maxMemberUpdatedAtMs = updatedAtMs;

      if (m.deletedAtMs === undefined) {
        activeTripIds.push(m.tripId as string);
      }
    }

    // Cap work: shared trips count is expected to be small in v1.
    // Still, we dedupe tripIds.
    const uniqueTripIds = Array.from(new Set(activeTripIds));

    let maxTripChangeUpdatedAtMs = 0;
    for (const tripId of uniqueTripIds) {
      const tripUpdated = await getLastTripChangeUpdatedAtMs(ctx, tripId);
      if (tripUpdated > maxTripChangeUpdatedAtMs) maxTripChangeUpdatedAtMs = tripUpdated;
    }

    return Math.max(maxMemberUpdatedAtMs, maxTripChangeUpdatedAtMs);
  },
});
