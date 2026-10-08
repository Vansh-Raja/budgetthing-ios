import { hashStringToBase36 } from './hash';

/**
 * Deterministic transaction ID for a confirmed API import.
 *
 * Shared by the native SQLite confirm flow and the PWA server confirm command so
 * both runtimes converge on exactly one canonical transaction per inbox item.
 */
export function deterministicImportTransactionId(importInboxItemId: string): string {
  return `api_import_${hashStringToBase36(importInboxItemId)}`;
}

export function isDeterministicImportTransactionId(id: string): boolean {
  return /^api_import_[0-9a-z]+$/.test(id);
}
