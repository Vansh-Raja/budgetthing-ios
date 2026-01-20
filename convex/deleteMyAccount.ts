import { mutation } from "./_generated/server";

/**
 * Delete all data for the authenticated user.
 * 
 * This mutation permanently removes all user data from Convex, including:
 * - accounts, categories, transactions
 * - trips, tripParticipants, tripExpenses, tripSettlements
 * - userSettings, changeLog
 * 
 * Required by Apple App Store guidelines for apps that support account creation.
 */
export const deleteMyAccount = mutation({
    args: {},
    handler: async (ctx) => {
        const identity = await ctx.auth.getUserIdentity();
        if (!identity) {
            throw new Error("Unauthorized: Must be signed in to delete account");
        }

        const userId = identity.subject;

        let totalDeleted = 0;

        // Tables with "by_user" index
        const userIndexedTables = [
            "accounts",
            "categories",
            "transactions",
            "trips",
            "tripParticipants",
            "tripExpenses",
            "tripSettlements",
            "userSettings",
        ] as const;

        // Delete all records from tables with by_user index
        for (const tableName of userIndexedTables) {
            const records = await ctx.db
                .query(tableName)
                .withIndex("by_user", (q) => q.eq("userId", userId))
                .collect();

            for (const record of records) {
                await ctx.db.delete(record._id);
                totalDeleted++;
            }
        }

        // Delete changeLog entries (uses by_user_seq index)
        const changeLogRecords = await ctx.db
            .query("changeLog")
            .withIndex("by_user_seq", (q) => q.eq("userId", userId))
            .collect();

        for (const record of changeLogRecords) {
            await ctx.db.delete(record._id);
            totalDeleted++;
        }

        // Shared trips v1: remove memberships and unlink participant mapping.
        // Do NOT delete shared trip data; other members keep it.
        const now = Date.now();

        const memberships = await ctx.db
            .query("sharedTripMembers")
            .withIndex("by_user", (q) => q.eq("userId", userId))
            .collect();

        for (const member of memberships) {
            // Soft-remove membership
            await ctx.db.patch(member._id, {
                deletedAtMs: now,
                updatedAtMs: now,
                syncVersion: (member.syncVersion ?? 1) + 1,
            });

            // Unlink participant, turning them back into a guest in that trip.
            const participant = await ctx.db
                .query("sharedTripParticipants")
                .withIndex("by_client_id", (q) => q.eq("id", member.participantId))
                .first();

            if (participant && participant.linkedUserId === userId) {
                await ctx.db.patch(participant._id, {
                    linkedUserId: undefined,
                    updatedAtMs: now,
                    syncVersion: (participant.syncVersion ?? 1) + 1,
                });
            }
        }

        return {
            success: true,
            deletedCount: totalDeleted,
            message: "Account and all data deleted successfully",
        };
    },
});
