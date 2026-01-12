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

        return {
            success: true,
            deletedCount: totalDeleted,
            message: "Account and all data deleted successfully",
        };
    },
});
