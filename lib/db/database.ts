/**
 * Database connection and migration management
 * 
 * Handles opening the database, running migrations, and providing
 * a singleton connection for the app.
 */

import * as SQLite from 'expo-sqlite';
import { SCHEMA_VERSION, MIGRATIONS, TABLES } from './schema';
import { Events, GlobalEvents } from '../events';

const DATABASE_NAME = 'budgetthing.db';

let db: SQLite.SQLiteDatabase | null = null;
let dbInitPromise: Promise<SQLite.SQLiteDatabase> | null = null;
let isReady = false;

/**
 * Get the database instance, initializing if needed.
 * Uses a promise lock to prevent race conditions during initialization.
 */
export async function getDatabase(): Promise<SQLite.SQLiteDatabase> {
  // If already initialized, return immediately
  if (db && isReady) {
    return db;
  }

  // If initialization is in progress, wait for it
  if (dbInitPromise) {
    return dbInitPromise;
  }

  // Start initialization
  dbInitPromise = initializeDatabase();

  try {
    const database = await dbInitPromise;
    return database;
  } finally {
    // Keep the promise around so subsequent calls can use the result
  }
}

/**
 * Internal initialization function
 */
async function initializeDatabase(): Promise<SQLite.SQLiteDatabase> {
  if (db && isReady) {
    return db;
  }

  db = await SQLite.openDatabaseAsync(DATABASE_NAME);
  await runMigrations(db);

  // Mark DB as ready after migrations complete.
  isReady = true;

  // Seeding and sync bootstrap are handled by `SyncProvider`.

  return db;
}

/**
 * Wait for database to be ready
 */
export async function waitForDatabase(): Promise<void> {
  await getDatabase();
}

/**
 * Check if database is ready (non-blocking)
 */
export function isDatabaseReady(): boolean {
  return isReady;
}

/**
 * Close the database connection
 */
export async function closeDatabase(): Promise<void> {
  if (db) {
    await db.closeAsync();
    db = null;
    dbInitPromise = null;
    isReady = false;
  }
}

/**
 * Run pending migrations to bring database to current schema version
 */
async function runMigrations(database: SQLite.SQLiteDatabase): Promise<void> {
  // Enable WAL mode for better performance
  await database.execAsync('PRAGMA journal_mode = WAL');

  // Check if schema version table exists
  const tableCheck = await database.getFirstAsync<{ name: string }>(
    `SELECT name FROM sqlite_master WHERE type='table' AND name='${TABLES.SCHEMA_VERSION}'`
  );

  let currentVersion = 0;

  if (tableCheck) {
    // Get current version
    const versionRow = await database.getFirstAsync<{ version: number }>(
      `SELECT version FROM ${TABLES.SCHEMA_VERSION} WHERE id = 1`
    );
    currentVersion = versionRow?.version ?? 0;
  }

  // Run migrations from currentVersion + 1 to SCHEMA_VERSION
  for (let version = currentVersion + 1; version <= SCHEMA_VERSION; version++) {
    const statements = MIGRATIONS[version];
    if (!statements) {
      throw new Error(`Missing migration for version ${version}`);
    }

    // Run all statements in a transaction
    await database.withTransactionAsync(async () => {
      for (const sql of statements) {
        await database.execAsync(sql);
      }

      // Update or insert schema version
      if (currentVersion === 0 && version === 1) {
        await database.runAsync(
          `INSERT INTO ${TABLES.SCHEMA_VERSION} (id, version) VALUES (1, ?)`,
          version
        );
      } else {
        await database.runAsync(
          `UPDATE ${TABLES.SCHEMA_VERSION} SET version = ? WHERE id = 1`,
          version
        );
      }
    });

  }
}

/**
 * Reset database (for testing/debugging only)
 */
export async function resetDatabase(): Promise<void> {
  if (db) {
    await db.closeAsync();
    db = null;
    dbInitPromise = null;
    isReady = false;
  }

  // Delete the database file
  await SQLite.deleteDatabaseAsync(DATABASE_NAME);

  // Reopen with fresh migrations
  db = await SQLite.openDatabaseAsync(DATABASE_NAME);
  await runMigrations(db);
  isReady = true;
}

/**
 * Clear all user data (for sign-out "Remove Data" option)
 * Keeps the schema and migrations intact, just removes data.
 */
export async function clearAllData(): Promise<void> {
  const database = await getDatabase();

  // Batch GlobalEvents so subscribers only refresh after commit.
  GlobalEvents.beginBatch();
  try {
    await database.withTransactionAsync(async () => {
      // Delete all user data from each table
      // Order matters for foreign key constraints (if we had them)
      await database.execAsync(`DELETE FROM ${TABLES.TRIP_SETTLEMENTS}`);
      await database.execAsync(`DELETE FROM ${TABLES.TRIP_EXPENSES}`);
      await database.execAsync(`DELETE FROM ${TABLES.TRIP_PARTICIPANTS}`);
      await database.execAsync(`DELETE FROM ${TABLES.TRIPS}`);

      // Shared trips v1 tables
      await database.execAsync(`DELETE FROM ${TABLES.SHARED_TRIP_SETTLEMENTS}`);
      await database.execAsync(`DELETE FROM ${TABLES.SHARED_TRIP_EXPENSES}`);
      await database.execAsync(`DELETE FROM ${TABLES.SHARED_TRIP_PARTICIPANTS}`);
      await database.execAsync(`DELETE FROM ${TABLES.SHARED_TRIP_MEMBERS}`);
      await database.execAsync(`DELETE FROM ${TABLES.SHARED_TRIPS}`);

      await database.execAsync(`DELETE FROM ${TABLES.TRANSACTIONS}`);
      await database.execAsync(`DELETE FROM ${TABLES.CATEGORIES}`);
      await database.execAsync(`DELETE FROM ${TABLES.ACCOUNTS}`);
      await database.execAsync(`DELETE FROM ${TABLES.USER_SETTINGS}`);
    });

    // Emit changes for all affected entities.
    GlobalEvents.emit(Events.tripSettlementsChanged);
    GlobalEvents.emit(Events.tripExpensesChanged);
    GlobalEvents.emit(Events.tripParticipantsChanged);
    GlobalEvents.emit(Events.tripsChanged);
    GlobalEvents.emit(Events.transactionsChanged);
    GlobalEvents.emit(Events.categoriesChanged);
    GlobalEvents.emit(Events.accountsChanged);
    GlobalEvents.emit(Events.userSettingsChanged);

    GlobalEvents.endBatch(true);
  } catch (error) {
    GlobalEvents.endBatch(false);
    throw error;
  }
}

/**
 * Execute a raw SQL query (for debugging)
 */
export async function execRaw(sql: string): Promise<void> {
  const database = await getDatabase();
  await database.execAsync(sql);
}

// Type for SQLite bind parameters
export type SQLiteBindValue = string | number | null | Uint8Array;

/**
 * Get all rows from a query
 */
export async function queryAll<T>(
  sql: string,
  params: SQLiteBindValue[] = []
): Promise<T[]> {
  const database = await getDatabase();
  return database.getAllAsync<T>(sql, params);
}

/**
 * Get first row from a query
 */
export async function queryFirst<T>(
  sql: string,
  params: SQLiteBindValue[] = []
): Promise<T | null> {
  const database = await getDatabase();
  return database.getFirstAsync<T>(sql, params);
}

/**
 * Run an insert/update/delete
 */
export async function run(
  sql: string,
  params: SQLiteBindValue[] = []
): Promise<SQLite.SQLiteRunResult> {
  const database = await getDatabase();
  return database.runAsync(sql, params);
}

/**
 * Execute multiple statements in a transaction.
 * Important: Avoid calling this from within another transaction!
 */
export async function withTransaction<T>(
  fn: () => Promise<T>
): Promise<T> {
  const database = await getDatabase();
  let result: T;

  // Batch GlobalEvents until the transaction commits.
  // This prevents subscribers from re-querying before changes are visible.
  GlobalEvents.beginBatch();
  try {
    await database.withTransactionAsync(async () => {
      result = await fn();
    });

    GlobalEvents.endBatch(true);
    return result!;
  } catch (error) {
    GlobalEvents.endBatch(false);
    throw error;
  }
}
