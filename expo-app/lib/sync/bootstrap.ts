import { queryAll, queryFirst, run, withTransaction } from '../db/database';
import { TABLES } from '../db/schema';
import { Events, GlobalEvents } from '../events';

export interface LocalCounts {
  accounts: number;
  categories: number;
  transactions: number;
  trips: number;
}

const DEFAULT_CATEGORY_NAMES = [
  'Food',
  'Groceries',
  'Transport',
  'Rent',
  'Fun',
] as const;

const SYSTEM_CATEGORY_NAMES = [
  'System · Adjustment',
  'System · Transfer',
] as const;

const DEFAULT_ACCOUNT_NAMES = [
  'Cash',
] as const;

export async function getLocalCounts(): Promise<LocalCounts> {
  const [accounts, categories, transactions, trips] = await Promise.all([
    queryFirst<{ count: number }>(`SELECT COUNT(*) as count FROM ${TABLES.ACCOUNTS} WHERE deletedAtMs IS NULL`),
    queryFirst<{ count: number }>(`SELECT COUNT(*) as count FROM ${TABLES.CATEGORIES} WHERE deletedAtMs IS NULL`),
    queryFirst<{ count: number }>(`SELECT COUNT(*) as count FROM ${TABLES.TRANSACTIONS} WHERE deletedAtMs IS NULL`),
    queryFirst<{ count: number }>(`SELECT COUNT(*) as count FROM ${TABLES.TRIPS} WHERE deletedAtMs IS NULL`),
  ]);

  return {
    accounts: accounts?.count ?? 0,
    categories: categories?.count ?? 0,
    transactions: transactions?.count ?? 0,
    trips: trips?.count ?? 0,
  };
}

function isKnownDefaultCategoryName(name: string) {
  return (DEFAULT_CATEGORY_NAMES as readonly string[]).includes(name) || (SYSTEM_CATEGORY_NAMES as readonly string[]).includes(name);
}

function isKnownDefaultAccountName(name: string) {
  return (DEFAULT_ACCOUNT_NAMES as readonly string[]).includes(name);
}

async function getRefCountForCategory(categoryId: string): Promise<number> {
  const row = await queryFirst<{ count: number }>(
    `SELECT COUNT(*) as count FROM ${TABLES.TRANSACTIONS} WHERE deletedAtMs IS NULL AND categoryId = ?`,
    [categoryId]
  );
  return row?.count ?? 0;
}

async function getRefCountsForAccount(accountId: string): Promise<{ account: number; transferFrom: number; transferTo: number }>{
  const [account, transferFrom, transferTo] = await Promise.all([
    queryFirst<{ count: number }>(
      `SELECT COUNT(*) as count FROM ${TABLES.TRANSACTIONS} WHERE deletedAtMs IS NULL AND accountId = ?`,
      [accountId]
    ),
    queryFirst<{ count: number }>(
      `SELECT COUNT(*) as count FROM ${TABLES.TRANSACTIONS} WHERE deletedAtMs IS NULL AND transferFromAccountId = ?`,
      [accountId]
    ),
    queryFirst<{ count: number }>(
      `SELECT COUNT(*) as count FROM ${TABLES.TRANSACTIONS} WHERE deletedAtMs IS NULL AND transferToAccountId = ?`,
      [accountId]
    ),
  ]);

  return {
    account: account?.count ?? 0,
    transferFrom: transferFrom?.count ?? 0,
    transferTo: transferTo?.count ?? 0,
  };
}

/**
 * Dedupe strategy (SAFE + conservative):
 * Only dedupes known seeded defaults + system categories/accounts.
 *
 * - Preserves all transactions by remapping references.
 * - Soft-deletes duplicate records (tombstones), which sync correctly.
 */
export async function dedupeSeededDefaults(): Promise<{ didChange: boolean }> {
  const now = Date.now();
  let didChange = false;

  await withTransaction(async () => {
    // -------------------------------
    // Categories
    // -------------------------------
    const categories = await queryAll<{ id: string; name: string; updatedAtMs: number; deletedAtMs: number | null }>(
      `SELECT id, name, updatedAtMs, deletedAtMs FROM ${TABLES.CATEGORIES} WHERE deletedAtMs IS NULL`
    );

    const categoriesByName = new Map<string, { id: string; updatedAtMs: number }[]>();
    for (const c of categories) {
      if (!isKnownDefaultCategoryName(c.name)) continue;
      const list = categoriesByName.get(c.name) ?? [];
      list.push({ id: c.id, updatedAtMs: c.updatedAtMs });
      categoriesByName.set(c.name, list);
    }

    for (const [name, list] of categoriesByName.entries()) {
      if (list.length <= 1) continue;

      // Pick canonical: most tx references, tie-breaker by updatedAtMs (newest)
      const candidates = await Promise.all(list.map(async (c) => ({
        ...c,
        refCount: await getRefCountForCategory(c.id),
      })));

      candidates.sort((a, b) => {
        if (b.refCount !== a.refCount) return b.refCount - a.refCount;
        return b.updatedAtMs - a.updatedAtMs;
      });

      const keep = candidates[0];
      const duplicates = candidates.slice(1);

      for (const dup of duplicates) {
        // Remap transaction references
        await run(
          `UPDATE ${TABLES.TRANSACTIONS} SET categoryId = ?, updatedAtMs = ?, needsSync = 1, syncVersion = syncVersion + 1 WHERE categoryId = ?`,
          [keep.id, now, dup.id]
        );

        // Soft delete duplicate category
        await run(
          `UPDATE ${TABLES.CATEGORIES} SET deletedAtMs = ?, updatedAtMs = ?, needsSync = 1, syncVersion = syncVersion + 1 WHERE id = ?`,
          [now, now, dup.id]
        );

        didChange = true;
      }
    }

    // -------------------------------
    // Accounts
    // -------------------------------
    const accounts = await queryAll<{ id: string; name: string; kind: string; updatedAtMs: number; deletedAtMs: number | null }>(
      `SELECT id, name, kind, updatedAtMs, deletedAtMs FROM ${TABLES.ACCOUNTS} WHERE deletedAtMs IS NULL`
    );

    const accountsByNameKind = new Map<string, { id: string; updatedAtMs: number; kind: string; name: string }[]>();
    for (const a of accounts) {
      if (!isKnownDefaultAccountName(a.name)) continue;
      const key = `${a.name}::${a.kind}`;
      const list = accountsByNameKind.get(key) ?? [];
      list.push({ id: a.id, updatedAtMs: a.updatedAtMs, kind: a.kind, name: a.name });
      accountsByNameKind.set(key, list);
    }

    for (const [_key, list] of accountsByNameKind.entries()) {
      if (list.length <= 1) continue;

      const candidates = await Promise.all(list.map(async (a) => {
        const refs = await getRefCountsForAccount(a.id);
        const refCount = refs.account + refs.transferFrom + refs.transferTo;
        return { ...a, refCount };
      }));

      candidates.sort((a, b) => {
        if (b.refCount !== a.refCount) return b.refCount - a.refCount;
        return b.updatedAtMs - a.updatedAtMs;
      });

      const keep = candidates[0];
      const duplicates = candidates.slice(1);

      for (const dup of duplicates) {
        // Remap transaction references (primary + transfers)
        await run(
          `UPDATE ${TABLES.TRANSACTIONS} SET accountId = ?, updatedAtMs = ?, needsSync = 1, syncVersion = syncVersion + 1 WHERE accountId = ?`,
          [keep.id, now, dup.id]
        );
        await run(
          `UPDATE ${TABLES.TRANSACTIONS} SET transferFromAccountId = ?, updatedAtMs = ?, needsSync = 1, syncVersion = syncVersion + 1 WHERE transferFromAccountId = ?`,
          [keep.id, now, dup.id]
        );
        await run(
          `UPDATE ${TABLES.TRANSACTIONS} SET transferToAccountId = ?, updatedAtMs = ?, needsSync = 1, syncVersion = syncVersion + 1 WHERE transferToAccountId = ?`,
          [keep.id, now, dup.id]
        );

        // Update user settings default account
        await run(
          `UPDATE ${TABLES.USER_SETTINGS} SET defaultAccountId = ?, updatedAtMs = ?, needsSync = 1, syncVersion = syncVersion + 1 WHERE id = 'local' AND defaultAccountId = ?`,
          [keep.id, now, dup.id]
        );

        // Soft delete duplicate account
        await run(
          `UPDATE ${TABLES.ACCOUNTS} SET deletedAtMs = ?, updatedAtMs = ?, needsSync = 1, syncVersion = syncVersion + 1 WHERE id = ?`,
          [now, now, dup.id]
        );

        didChange = true;
      }
    }

    if (didChange) {
      GlobalEvents.emit(Events.transactionsChanged);
      GlobalEvents.emit(Events.categoriesChanged);
      GlobalEvents.emit(Events.accountsChanged);
      GlobalEvents.emit(Events.userSettingsChanged);
    }
  });

  return { didChange };
}
