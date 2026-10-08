/**
 * Web adapter for the SQLite database module. The PWA is online-only: there is
 * no local database. `withTransaction` simply runs the callback (each server
 * mutation is already atomic), and raw SQL helpers are unavailable.
 */
import { WebNotAvailableError } from '../web/runtime';
import { GlobalEvents } from '../events';

export async function waitForDatabase(): Promise<void> {}
export function isDatabaseReady(): boolean { return true; }
export async function getDatabase(): Promise<never> { throw new WebNotAvailableError('SQLite'); }
export async function queryAll<T>(_sql: string, _params?: unknown[]): Promise<T[]> { throw new WebNotAvailableError('SQLite queries'); }
export async function queryFirst<T>(_sql: string, _params?: unknown[]): Promise<T | null> { throw new WebNotAvailableError('SQLite queries'); }
export async function run(_sql: string, _params?: unknown[]): Promise<void> { throw new WebNotAvailableError('SQLite writes'); }
export async function execRaw(_sql: string): Promise<void> { throw new WebNotAvailableError('SQLite writes'); }

export async function withTransaction<T>(fn: () => Promise<T>): Promise<T> {
  GlobalEvents.beginBatch();
  try {
    const result = await fn();
    GlobalEvents.endBatch(true);
    return result;
  } catch (e) {
    GlobalEvents.endBatch(false);
    throw e;
  }
}

export async function closeDatabase(): Promise<void> {}
export async function resetDatabase(): Promise<void> {}
export async function clearAllData(): Promise<void> {}
