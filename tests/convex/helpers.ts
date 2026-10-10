/// <reference types="vite/client" />
import { convexTest } from 'convex-test';
import schema from '../../convex/schema';

// API keys are hashed with a required pepper (the server fails closed without one).
process.env.IMPORT_API_KEY_PEPPER ??= 'test-pepper';

// Modules must include convex/_generated so convex-test can find the root.
const modules = import.meta.glob('../../convex/**/*.*s');

export function setup() {
  return convexTest(schema, modules);
}

export const USER_A = { subject: 'user_a', issuer: 'https://clerk.example', tokenIdentifier: 'https://clerk.example|user_a' };
export const USER_B = { subject: 'user_b', issuer: 'https://clerk.example', tokenIdentifier: 'https://clerk.example|user_b' };

/** A row exactly as the native SQLite outbox would push it (needsSync included, NULL for optional). */
export function nativeAccountRow(id: string, overrides: Record<string, unknown> = {}) {
  const now = Date.now();
  return {
    id, name: 'Native Cash', emoji: '💵', kind: 'cash', sortIndex: 0,
    openingBalanceCents: 10_000, limitAmountCents: null, billingCycleDay: null,
    createdAtMs: now, updatedAtMs: now, deletedAtMs: null, syncVersion: 1, needsSync: 1, ...overrides,
  };
}

export function nativeTransactionRow(id: string, overrides: Record<string, unknown> = {}) {
  const now = Date.now();
  return {
    id, amountCents: 1234, date: now, note: 'coffee', type: 'expense', systemType: null,
    accountId: null, categoryId: null, transferFromAccountId: null, transferToAccountId: null, tripExpenseId: null,
    sourceType: 'manual', sourceImportInboxItemId: null, createdAtMs: now, updatedAtMs: now, deletedAtMs: null,
    syncVersion: 1, needsSync: 1, ...overrides,
  };
}

export async function expectConvexError(promise: Promise<unknown>, code: string) {
  try {
    await promise;
  } catch (e: any) {
    let data = e?.data ?? e;
    if (typeof data === 'string') {
      try { data = JSON.parse(data); } catch { /* keep string */ }
    }
    if (data?.code === code) return data;
    throw new Error(`Expected ConvexError code ${code}, got: ${JSON.stringify(data)} / ${e?.message}`);
  }
  throw new Error(`Expected ConvexError code ${code}, but the call succeeded`);
}
