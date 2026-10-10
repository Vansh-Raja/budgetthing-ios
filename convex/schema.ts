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
    sourceType: v.optional(v.string()),
    sourceImportInboxItemId: v.optional(v.string()),
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
    sortIndex: v.optional(v.number()),
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

    // Transactions filters (optional; synced via userSettings)
    syncTransactionFilters: v.optional(v.number()), // 0/1
    resetTransactionFiltersOnReopen: v.optional(v.number()), // 0/1
    transactionsFiltersJson: v.optional(v.string()),
    transactionsFiltersUpdatedAtMs: v.optional(v.number()),

    updatedAtMs: v.number(),
    syncVersion: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_client_id", ["id"]),

  apiImportKeys: defineTable({
    id: v.string(),
    userId: v.string(),
    name: v.string(),
    keyId: v.string(),
    keyHash: v.string(),
    hashVersion: v.number(),
    createdAtMs: v.number(),
    updatedAtMs: v.number(),
    lastUsedAtMs: v.optional(v.number()),
    expiresAtMs: v.optional(v.number()),
    revokedAtMs: v.optional(v.number()),
  })
    .index("by_user", ["userId"])
    .index("by_client_id", ["id"])
    .index("by_key_id", ["keyId"]),

  apiImportRequests: defineTable({
    id: v.string(),
    userId: v.string(),
    apiKeyId: v.string(),
    idempotencyKeyHash: v.string(),
    requestHash: v.string(),
    responseJson: v.string(),
    statusCode: v.number(),
    createdAtMs: v.number(),
    expiresAtMs: v.number(),
  })
    .index("by_client_id", ["id"])
    .index("by_user", ["userId"])
    .index("by_key_idempotency", ["apiKeyId", "idempotencyKeyHash"]),

  importInboxItems: defineTable({
    id: v.string(),
    userId: v.string(),
    source: v.string(),
    externalIdHash: v.string(),
    externalIdLabel: v.optional(v.string()),
    apiKeyId: v.optional(v.string()),
    idempotencyKeyHash: v.optional(v.string()),
    payloadHash: v.optional(v.string()),
    status: v.string(),
    type: v.string(),
    amountCents: v.number(),
    currencyCode: v.string(),
    dateMs: v.number(),
    merchantName: v.optional(v.string()),
    note: v.optional(v.string()),
    accountId: v.optional(v.string()),
    categoryId: v.optional(v.string()),
    possibleDuplicate: v.number(),
    duplicateSignalsJson: v.optional(v.string()),
    confirmedTransactionId: v.optional(v.string()),
    confirmedAtMs: v.optional(v.number()),
    ignoredAtMs: v.optional(v.number()),
    createdAtMs: v.number(),
    updatedAtMs: v.number(),
    deletedAtMs: v.optional(v.number()),
    syncVersion: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_client_id", ["id"])
    .index("by_user_status", ["userId", "status"])
    .index("by_user_external", ["userId", "source", "externalIdHash"])
    .index("by_user_date", ["userId", "dateMs"]),

  apiImportAuditEvents: defineTable({
    id: v.string(),
    userId: v.optional(v.string()),
    apiKeyId: v.optional(v.string()),
    eventType: v.string(),
    status: v.string(),
    requestId: v.optional(v.string()),
    detailJson: v.optional(v.string()),
    ipHash: v.optional(v.string()),
    userAgentHash: v.optional(v.string()),
    createdAtMs: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_api_key", ["apiKeyId"]),

  apiImportRateLimits: defineTable({
    id: v.string(),
    bucketKey: v.string(),
    windowStartMs: v.number(),
    count: v.number(),
    updatedAtMs: v.number(),
  })
    .index("by_client_id", ["id"])
    .index("by_bucket", ["bucketKey"]),

  // PWA-only: per-user account choice for virtual derived trip rows.
  // Native keeps this choice device-local; this table is never emitted through
  // the legacy changeLog/sync protocol until a versioned native adapter exists.
  derivedAccountOverrides: defineTable({
    userId: v.string(),
    sourceKind: v.string(), // "trip_expense" | "trip_settlement" | "shared_trip_expense" | "shared_trip_settlement"
    sourceId: v.string(),
    direction: v.string(), // "cashflow" | "in" | "out"
    accountId: v.string(),
    updatedAtMs: v.number(),
    deletedAtMs: v.optional(v.number()),
    revision: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_user_source", ["userId", "sourceKind", "sourceId", "direction"]),

  // Monotonic sequence state for user-scoped changeLog.
  // Used to allocate unique seq values under concurrent pushes.
  userSyncState: defineTable({
    id: v.string(), // == userId
    userId: v.string(),
    lastSeq: v.number(),
  })
    .index("by_client_id", ["id"])
    .index("by_user", ["userId"]),

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

  // ---------------------------------------------------------------------------
  // Shared Trips v1 (INR-only)
  // ---------------------------------------------------------------------------

  sharedTrips: defineTable({
    id: v.string(),
    name: v.string(),
    emoji: v.string(),
    currencyCode: v.string(), // v1: always "INR"
    startDateMs: v.optional(v.number()),
    endDateMs: v.optional(v.number()),
    budgetCents: v.optional(v.number()),
    createdAtMs: v.number(),
    updatedAtMs: v.number(),
    deletedAtMs: v.optional(v.number()),
    syncVersion: v.number(),
  })
    .index("by_client_id", ["id"]),

  sharedTripMembers: defineTable({
    id: v.string(), // recommended: `${tripId}:${userId}`
    tripId: v.string(),
    userId: v.string(),
    participantId: v.string(),
    joinedAtMs: v.number(),
    updatedAtMs: v.number(),
    deletedAtMs: v.optional(v.number()),
    syncVersion: v.number(),
  })
    .index("by_client_id", ["id"])
    .index("by_user", ["userId"])
    .index("by_trip", ["tripId"])
    .index("by_user_trip", ["userId", "tripId"]),

  sharedTripParticipants: defineTable({
    id: v.string(),
    tripId: v.string(),
    name: v.string(),
    colorHex: v.optional(v.string()),
    linkedUserId: v.optional(v.string()),
    createdAtMs: v.number(),
    updatedAtMs: v.number(),
    deletedAtMs: v.optional(v.number()),
    syncVersion: v.number(),
  })
    .index("by_client_id", ["id"])
    .index("by_trip", ["tripId"])
    .index("by_trip_linkedUser", ["tripId", "linkedUserId"]),

  sharedTripExpenses: defineTable({
    id: v.string(),
    tripId: v.string(),
    amountCents: v.number(),
    dateMs: v.number(),
    note: v.optional(v.string()),
    paidByParticipantId: v.optional(v.string()),
    splitType: v.string(),
    splitDataJson: v.optional(v.string()),
    computedSplitsJson: v.optional(v.string()),
    categoryName: v.optional(v.string()),
    categoryEmoji: v.optional(v.string()),
    createdAtMs: v.number(),
    updatedAtMs: v.number(),
    deletedAtMs: v.optional(v.number()),
    syncVersion: v.number(),
  })
    .index("by_client_id", ["id"])
    .index("by_trip", ["tripId"])
    .index("by_trip_date", ["tripId", "dateMs"]),

  sharedTripSettlements: defineTable({
    id: v.string(),
    tripId: v.string(),
    fromParticipantId: v.string(),
    toParticipantId: v.string(),
    amountCents: v.number(),
    dateMs: v.number(),
    note: v.optional(v.string()),
    createdAtMs: v.number(),
    updatedAtMs: v.number(),
    deletedAtMs: v.optional(v.number()),
    syncVersion: v.number(),
  })
    .index("by_client_id", ["id"])
    .index("by_trip", ["tripId"])
    .index("by_trip_date", ["tripId", "dateMs"]),

  sharedTripInvites: defineTable({
    id: v.string(), // can equal `code`
    tripId: v.string(),
    code: v.string(),
    createdByUserId: v.string(),
    createdAtMs: v.number(),
    updatedAtMs: v.number(),
    expiresAtMs: v.optional(v.number()),
    uses: v.number(),
    maxUses: v.number(),
    deletedAtMs: v.optional(v.number()),
  })
    .index("by_client_id", ["id"])
    .index("by_code", ["code"])
    .index("by_trip", ["tripId"]),

  // Monotonic sequence state for shared trip changelog.
  // Used to allocate unique seq values under concurrent writes.
  sharedTripSyncState: defineTable({
    id: v.string(), // == tripId
    tripId: v.string(),
    lastSeq: v.number(),
  })
    .index("by_client_id", ["id"])
    .index("by_trip", ["tripId"]),

  // Trip-scoped changelog for shared trip sync
  sharedTripChangeLog: defineTable({
    tripId: v.string(),
    entityType: v.string(),
    entityId: v.string(),
    action: v.string(), // "upsert" | "delete"
    updatedAtMs: v.number(),
    seq: v.number(), // monotonic sequence per trip
  })
    .index("by_trip_seq", ["tripId", "seq"])
    .index("by_trip_entity", ["tripId", "entityType", "entityId"]),

  // Append-only audit trail / version history for every user-data write (any source).
  // Written by the trigger in convex/functions.ts; never updated or deleted.
  auditLog: defineTable({
    userId: v.string(),            // owner of the record (or acting user for shared-trip rows)
    actorUserId: v.optional(v.string()), // authenticated caller, when known
    entityTable: v.string(),
    entityId: v.string(),          // client id (`id` field) when present, else the Convex _id
    action: v.string(),            // create | update | delete | restore | purge
    source: v.string(),            // web | native_sync | import_api | app | system
    reason: v.optional(v.string()),
    changedFields: v.array(v.string()),
    beforeJson: v.optional(v.string()),
    afterJson: v.optional(v.string()),
    tripId: v.optional(v.string()), // shared-trip rows: readable by every active member
    atMs: v.number(),
  })
    .index("by_user_time", ["userId", "atMs"])
    .index("by_user_entity", ["userId", "entityTable", "entityId", "atMs"])
    .index("by_trip_time", ["tripId", "atMs"]),
});
