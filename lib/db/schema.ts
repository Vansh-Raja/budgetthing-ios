/**
 * Database Schema and Migrations for BudgetThing
 * 
 * Uses expo-sqlite with a migration system that tracks schema versions.
 * All amounts stored as integer cents to avoid floating-point issues.
 */

// Schema version - increment when adding new migrations
export const SCHEMA_VERSION = 5;

/**
 * Initial schema creation - version 1
 */
export const MIGRATIONS: Record<number, string[]> = {
  1: [
    // Accounts table
    `CREATE TABLE IF NOT EXISTS accounts (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      emoji TEXT NOT NULL DEFAULT '💵',
      kind TEXT NOT NULL DEFAULT 'cash',
      sortIndex INTEGER NOT NULL DEFAULT 0,
      openingBalanceCents INTEGER,
      limitAmountCents INTEGER,
      billingCycleDay INTEGER,
      createdAtMs INTEGER NOT NULL,
      updatedAtMs INTEGER NOT NULL,
      deletedAtMs INTEGER,
      syncVersion INTEGER NOT NULL DEFAULT 1,
      needsSync INTEGER NOT NULL DEFAULT 1
    )`,

    // Categories table
    `CREATE TABLE IF NOT EXISTS categories (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      emoji TEXT NOT NULL,
      sortIndex INTEGER NOT NULL DEFAULT 0,
      monthlyBudgetCents INTEGER,
      isSystem INTEGER NOT NULL DEFAULT 0,
      createdAtMs INTEGER NOT NULL,
      updatedAtMs INTEGER NOT NULL,
      deletedAtMs INTEGER,
      syncVersion INTEGER NOT NULL DEFAULT 1,
      needsSync INTEGER NOT NULL DEFAULT 1
    )`,

    // Transactions table
    `CREATE TABLE IF NOT EXISTS transactions (
      id TEXT PRIMARY KEY,
      amountCents INTEGER NOT NULL,
      date INTEGER NOT NULL,
      note TEXT,
      type TEXT NOT NULL DEFAULT 'expense',
      systemType TEXT,
      accountId TEXT,
      categoryId TEXT,
      transferFromAccountId TEXT,
      transferToAccountId TEXT,
      tripExpenseId TEXT,
      createdAtMs INTEGER NOT NULL,
      updatedAtMs INTEGER NOT NULL,
      deletedAtMs INTEGER,
      syncVersion INTEGER NOT NULL DEFAULT 1,
      needsSync INTEGER NOT NULL DEFAULT 1
    )`,

    // Trips table
    `CREATE TABLE IF NOT EXISTS trips (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      emoji TEXT NOT NULL DEFAULT '✈️',
      isGroup INTEGER NOT NULL DEFAULT 0,
      isArchived INTEGER NOT NULL DEFAULT 0,
      startDate INTEGER,
      endDate INTEGER,
      budgetCents INTEGER,
      createdAtMs INTEGER NOT NULL,
      updatedAtMs INTEGER NOT NULL,
      deletedAtMs INTEGER,
      syncVersion INTEGER NOT NULL DEFAULT 1,
      needsSync INTEGER NOT NULL DEFAULT 1
    )`,

    // Trip Participants table
    `CREATE TABLE IF NOT EXISTS tripParticipants (
      id TEXT PRIMARY KEY,
      tripId TEXT NOT NULL,
      name TEXT NOT NULL,
      isCurrentUser INTEGER NOT NULL DEFAULT 0,
      colorHex TEXT,
      createdAtMs INTEGER NOT NULL,
      updatedAtMs INTEGER NOT NULL,
      deletedAtMs INTEGER,
      syncVersion INTEGER NOT NULL DEFAULT 1,
      needsSync INTEGER NOT NULL DEFAULT 1
    )`,

    // Trip Expenses table
    `CREATE TABLE IF NOT EXISTS tripExpenses (
      id TEXT PRIMARY KEY,
      tripId TEXT NOT NULL,
      transactionId TEXT NOT NULL,
      paidByParticipantId TEXT,
      splitType TEXT NOT NULL DEFAULT 'equal',
      splitDataJson TEXT,
      computedSplitsJson TEXT,
      createdAtMs INTEGER NOT NULL,
      updatedAtMs INTEGER NOT NULL,
      deletedAtMs INTEGER,
      syncVersion INTEGER NOT NULL DEFAULT 1,
      needsSync INTEGER NOT NULL DEFAULT 1
    )`,

    // Trip Settlements table
    `CREATE TABLE IF NOT EXISTS tripSettlements (
      id TEXT PRIMARY KEY,
      tripId TEXT NOT NULL,
      fromParticipantId TEXT NOT NULL,
      toParticipantId TEXT NOT NULL,
      amountCents INTEGER NOT NULL,
      date INTEGER NOT NULL,
      note TEXT,
      createdAtMs INTEGER NOT NULL,
      updatedAtMs INTEGER NOT NULL,
      deletedAtMs INTEGER,
      syncVersion INTEGER NOT NULL DEFAULT 1,
      needsSync INTEGER NOT NULL DEFAULT 1
    )`,

    // User Settings table (single row)
    `CREATE TABLE IF NOT EXISTS userSettings (
      id TEXT PRIMARY KEY DEFAULT 'local',
      currencyCode TEXT NOT NULL DEFAULT 'INR',
      hapticsEnabled INTEGER NOT NULL DEFAULT 1,
      defaultAccountId TEXT,
      hasSeenOnboarding INTEGER NOT NULL DEFAULT 0,
      updatedAtMs INTEGER NOT NULL,
      syncVersion INTEGER NOT NULL DEFAULT 1,
      needsSync INTEGER NOT NULL DEFAULT 1
    )`,

    // Schema version tracking
    `CREATE TABLE IF NOT EXISTS _schema_version (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      version INTEGER NOT NULL
    )`,

    // Indexes for common queries
    `CREATE INDEX IF NOT EXISTS idx_transactions_date ON transactions(date)`,
    `CREATE INDEX IF NOT EXISTS idx_transactions_accountId ON transactions(accountId)`,
    `CREATE INDEX IF NOT EXISTS idx_transactions_categoryId ON transactions(categoryId)`,
    `CREATE INDEX IF NOT EXISTS idx_transactions_needsSync ON transactions(needsSync) WHERE needsSync = 1`,
    `CREATE INDEX IF NOT EXISTS idx_tripExpenses_tripId ON tripExpenses(tripId)`,
    `CREATE INDEX IF NOT EXISTS idx_tripExpenses_transactionId ON tripExpenses(transactionId)`,
    `CREATE INDEX IF NOT EXISTS idx_tripParticipants_tripId ON tripParticipants(tripId)`,
    `CREATE INDEX IF NOT EXISTS idx_tripSettlements_tripId ON tripSettlements(tripId)`,
    `CREATE INDEX IF NOT EXISTS idx_accounts_needsSync ON accounts(needsSync) WHERE needsSync = 1`,
    `CREATE INDEX IF NOT EXISTS idx_categories_needsSync ON categories(needsSync) WHERE needsSync = 1`,
    `CREATE INDEX IF NOT EXISTS idx_trips_needsSync ON trips(needsSync) WHERE needsSync = 1`,
  ],
  
  2: [
    // Trips: add sortIndex for user-defined ordering
    `ALTER TABLE trips ADD COLUMN sortIndex INTEGER NOT NULL DEFAULT 0`,

    // Initialize sortIndex based on the existing UI order (newest first) and mark rows for sync.
    `WITH ordered AS (
      SELECT
        id,
        (ROW_NUMBER() OVER (ORDER BY createdAtMs DESC) - 1) AS newSortIndex
      FROM trips
      WHERE deletedAtMs IS NULL
    )
    UPDATE trips
    SET
      sortIndex = (SELECT newSortIndex FROM ordered WHERE ordered.id = trips.id),
      needsSync = 1,
      syncVersion = syncVersion + 1
    WHERE id IN (SELECT id FROM ordered)`,

    `CREATE INDEX IF NOT EXISTS idx_trips_sortIndex ON trips(sortIndex)`,
  ],

  3: [
    // Transactions: link derived trip rows to shared sources
    `ALTER TABLE transactions ADD COLUMN sourceTripExpenseId TEXT`,
    `ALTER TABLE transactions ADD COLUMN sourceTripSettlementId TEXT`,

    `CREATE INDEX IF NOT EXISTS idx_transactions_sourceTripExpenseId ON transactions(sourceTripExpenseId)`,
    `CREATE INDEX IF NOT EXISTS idx_transactions_sourceTripSettlementId ON transactions(sourceTripSettlementId)`,

    // Shared trips (v1 scaffolding): local mirror tables for trip-scoped sync
    `CREATE TABLE IF NOT EXISTS sharedTrips (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      emoji TEXT NOT NULL,
      currencyCode TEXT NOT NULL DEFAULT 'INR',
      createdAtMs INTEGER NOT NULL,
      updatedAtMs INTEGER NOT NULL,
      deletedAtMs INTEGER,
      syncVersion INTEGER NOT NULL DEFAULT 1,
      needsSync INTEGER NOT NULL DEFAULT 1
    )`,

    `CREATE TABLE IF NOT EXISTS sharedTripMembers (
      id TEXT PRIMARY KEY,
      tripId TEXT NOT NULL,
      userId TEXT NOT NULL,
      participantId TEXT NOT NULL,
      joinedAtMs INTEGER NOT NULL,
      updatedAtMs INTEGER NOT NULL,
      deletedAtMs INTEGER,
      syncVersion INTEGER NOT NULL DEFAULT 1,
      needsSync INTEGER NOT NULL DEFAULT 1
    )`,

    `CREATE TABLE IF NOT EXISTS sharedTripParticipants (
      id TEXT PRIMARY KEY,
      tripId TEXT NOT NULL,
      name TEXT NOT NULL,
      colorHex TEXT,
      linkedUserId TEXT,
      createdAtMs INTEGER NOT NULL,
      updatedAtMs INTEGER NOT NULL,
      deletedAtMs INTEGER,
      syncVersion INTEGER NOT NULL DEFAULT 1,
      needsSync INTEGER NOT NULL DEFAULT 1
    )`,

    `CREATE TABLE IF NOT EXISTS sharedTripExpenses (
      id TEXT PRIMARY KEY,
      tripId TEXT NOT NULL,
      amountCents INTEGER NOT NULL,
      dateMs INTEGER NOT NULL,
      note TEXT,
      paidByParticipantId TEXT,
      splitType TEXT NOT NULL DEFAULT 'equal',
      splitDataJson TEXT,
      computedSplitsJson TEXT,
      categoryName TEXT,
      categoryEmoji TEXT,
      createdAtMs INTEGER NOT NULL,
      updatedAtMs INTEGER NOT NULL,
      deletedAtMs INTEGER,
      syncVersion INTEGER NOT NULL DEFAULT 1,
      needsSync INTEGER NOT NULL DEFAULT 1
    )`,

    `CREATE TABLE IF NOT EXISTS sharedTripSettlements (
      id TEXT PRIMARY KEY,
      tripId TEXT NOT NULL,
      fromParticipantId TEXT NOT NULL,
      toParticipantId TEXT NOT NULL,
      amountCents INTEGER NOT NULL,
      dateMs INTEGER NOT NULL,
      note TEXT,
      createdAtMs INTEGER NOT NULL,
      updatedAtMs INTEGER NOT NULL,
      deletedAtMs INTEGER,
      syncVersion INTEGER NOT NULL DEFAULT 1,
      needsSync INTEGER NOT NULL DEFAULT 1
    )`,

    `CREATE INDEX IF NOT EXISTS idx_sharedTripMembers_userId ON sharedTripMembers(userId)`,
    `CREATE INDEX IF NOT EXISTS idx_sharedTripMembers_tripId ON sharedTripMembers(tripId)`,
    `CREATE INDEX IF NOT EXISTS idx_sharedTripParticipants_tripId ON sharedTripParticipants(tripId)`,
    `CREATE INDEX IF NOT EXISTS idx_sharedTripExpenses_tripId ON sharedTripExpenses(tripId)`,
    `CREATE INDEX IF NOT EXISTS idx_sharedTripSettlements_tripId ON sharedTripSettlements(tripId)`,
    `CREATE INDEX IF NOT EXISTS idx_sharedTrips_needsSync ON sharedTrips(needsSync) WHERE needsSync = 1`,
    `CREATE INDEX IF NOT EXISTS idx_sharedTripMembers_needsSync ON sharedTripMembers(needsSync) WHERE needsSync = 1`,
    `CREATE INDEX IF NOT EXISTS idx_sharedTripParticipants_needsSync ON sharedTripParticipants(needsSync) WHERE needsSync = 1`,
    `CREATE INDEX IF NOT EXISTS idx_sharedTripExpenses_needsSync ON sharedTripExpenses(needsSync) WHERE needsSync = 1`,
    `CREATE INDEX IF NOT EXISTS idx_sharedTripSettlements_needsSync ON sharedTripSettlements(needsSync) WHERE needsSync = 1`,
  ],

  4: [
    // Shared trips: add optional trip metadata
    `ALTER TABLE sharedTrips ADD COLUMN startDateMs INTEGER`,
    `ALTER TABLE sharedTrips ADD COLUMN endDateMs INTEGER`,
    `ALTER TABLE sharedTrips ADD COLUMN budgetCents INTEGER`,
  ],

  5: [
    // UserSettings: transactions filter preferences + optional sync payload
    `ALTER TABLE userSettings ADD COLUMN syncTransactionFilters INTEGER NOT NULL DEFAULT 0`,
    `ALTER TABLE userSettings ADD COLUMN resetTransactionFiltersOnReopen INTEGER NOT NULL DEFAULT 0`,
    `ALTER TABLE userSettings ADD COLUMN transactionsFiltersJson TEXT`,
    `ALTER TABLE userSettings ADD COLUMN transactionsFiltersUpdatedAtMs INTEGER`,
  ],
};

/**
 * Table names for type safety
 */
export const TABLES = {
  ACCOUNTS: 'accounts',
  CATEGORIES: 'categories',
  TRANSACTIONS: 'transactions',
  TRIPS: 'trips',
  TRIP_PARTICIPANTS: 'tripParticipants',
  TRIP_EXPENSES: 'tripExpenses',
  TRIP_SETTLEMENTS: 'tripSettlements',
  SHARED_TRIPS: 'sharedTrips',
  SHARED_TRIP_MEMBERS: 'sharedTripMembers',
  SHARED_TRIP_PARTICIPANTS: 'sharedTripParticipants',
  SHARED_TRIP_EXPENSES: 'sharedTripExpenses',
  SHARED_TRIP_SETTLEMENTS: 'sharedTripSettlements',
  USER_SETTINGS: 'userSettings',
  SCHEMA_VERSION: '_schema_version',
} as const;

export type TableName = typeof TABLES[keyof typeof TABLES];
