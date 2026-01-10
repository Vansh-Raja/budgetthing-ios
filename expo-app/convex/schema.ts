import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

// This schema is designed to accept the raw SQLite rows that the client sync
// layer sends (minus `needsSync`).
//
// Note: Several "boolean" fields are stored as 0/1 integers locally in SQLite.
// To avoid conversion bugs in the initial sync engine, they are modeled as
// numbers here as well.

export default defineSchema({
  accounts: defineTable({
    id: v.string(), // client UUID
    userId: v.string(),
    name: v.string(),
    emoji: v.string(),
    kind: v.string(),
    sortIndex: v.number(),
    openingBalanceCents: v.optional(v.number()),
    limitAmountCents: v.optional(v.number()),
    billingCycleDay: v.optional(v.number()),
    createdAtMs: v.number(),
    updatedAtMs: v.number(),
    deletedAtMs: v.optional(v.number()),
    syncVersion: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_client_id", ["id"]),

  categories: defineTable({
    id: v.string(),
    userId: v.string(),
    name: v.string(),
    emoji: v.string(),
    sortIndex: v.number(),
    monthlyBudgetCents: v.optional(v.number()),
    isSystem: v.number(), // 0/1
    createdAtMs: v.number(),
    updatedAtMs: v.number(),
    deletedAtMs: v.optional(v.number()),
    syncVersion: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_client_id", ["id"]),

  transactions: defineTable({
    id: v.string(),
    userId: v.string(),
    amountCents: v.number(),
    date: v.number(),
    note: v.optional(v.string()),
    type: v.string(),
    systemType: v.optional(v.string()),
    accountId: v.optional(v.string()),
    categoryId: v.optional(v.string()),
    transferFromAccountId: v.optional(v.string()),
    transferToAccountId: v.optional(v.string()),
    tripExpenseId: v.optional(v.string()),
    createdAtMs: v.number(),
    updatedAtMs: v.number(),
    deletedAtMs: v.optional(v.number()),
    syncVersion: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_client_id", ["id"])
    .index("by_user_date", ["userId", "date"]),

  trips: defineTable({
    id: v.string(),
    userId: v.string(),
    name: v.string(),
    emoji: v.string(),
    isGroup: v.number(), // 0/1
    isArchived: v.number(), // 0/1
    startDate: v.optional(v.number()),
    endDate: v.optional(v.number()),
    budgetCents: v.optional(v.number()),
    createdAtMs: v.number(),
    updatedAtMs: v.number(),
    deletedAtMs: v.optional(v.number()),
    syncVersion: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_client_id", ["id"]),

  tripParticipants: defineTable({
    id: v.string(),
    userId: v.string(),
    tripId: v.string(),
    name: v.string(),
    isCurrentUser: v.number(), // 0/1
    colorHex: v.optional(v.string()),
    createdAtMs: v.number(),
    updatedAtMs: v.number(),
    deletedAtMs: v.optional(v.number()),
    syncVersion: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_client_id", ["id"])
    .index("by_user_trip", ["userId", "tripId"])
    .index("by_trip", ["tripId"]),

  tripExpenses: defineTable({
    id: v.string(),
    userId: v.string(),
    tripId: v.string(),
    transactionId: v.string(),
    paidByParticipantId: v.optional(v.string()),
    splitType: v.string(),
    splitDataJson: v.optional(v.string()),
    computedSplitsJson: v.optional(v.string()),
    createdAtMs: v.number(),
    updatedAtMs: v.number(),
    deletedAtMs: v.optional(v.number()),
    syncVersion: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_client_id", ["id"])
    .index("by_user_trip", ["userId", "tripId"])
    .index("by_trip", ["tripId"]),

  tripSettlements: defineTable({
    id: v.string(),
    userId: v.string(),
    tripId: v.string(),
    fromParticipantId: v.string(),
    toParticipantId: v.string(),
    amountCents: v.number(),
    date: v.number(),
    note: v.optional(v.string()),
    createdAtMs: v.number(),
    updatedAtMs: v.number(),
    deletedAtMs: v.optional(v.number()),
    syncVersion: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_client_id", ["id"])
    .index("by_user_trip", ["userId", "tripId"])
    .index("by_trip", ["tripId"]),

  userSettings: defineTable({
    id: v.string(),
    userId: v.string(),
    currencyCode: v.string(),
    hapticsEnabled: v.number(), // 0/1
    defaultAccountId: v.optional(v.string()),
    hasSeenOnboarding: v.number(), // 0/1
    updatedAtMs: v.number(),
    syncVersion: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_client_id", ["id"]),

  // For efficient sync: track all changes per user with monotonic sequence
  changeLog: defineTable({
    userId: v.string(),
    entityType: v.string(), // "accounts" | "categories" | "transactions" | ...
    entityId: v.string(),
    action: v.string(), // "upsert" | "delete"
    updatedAtMs: v.number(),
    seq: v.number(), // monotonic sequence per user
  })
    .index("by_user_seq", ["userId", "seq"])
    .index("by_user_entity", ["userId", "entityType", "entityId"]),
});
