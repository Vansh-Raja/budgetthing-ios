import { stableStringify } from './stableStringify';
import { hashStringToBase36 } from './hash';

export const IMPORT_API_MAX_ITEMS = 50;

const FORBIDDEN_IMPORT_KEYS = new Set([
  'rawText',
  'emailBody',
  'ocrText',
  'attachment',
  'attachments',
  'cardNumber',
  'bankStatement',
  'receiptImage',
]);

const TOP_LEVEL_KEYS = new Set(['source', 'items']);
const ITEM_KEYS = new Set([
  'externalId',
  'type',
  'amountCents',
  'currencyCode',
  'occurredAt',
  'merchantName',
  'note',
  'accountId',
  'categoryId',
]);

export type ImportApiValidationResult =
  | { ok: true }
  | { ok: false; error: string };

function containsForbiddenKey(value: unknown): string | null {
  if (!value || typeof value !== 'object') return null;
  if (Array.isArray(value)) {
    for (const item of value) {
      const nested = containsForbiddenKey(item);
      if (nested) return nested;
    }
    return null;
  }

  for (const [key, nestedValue] of Object.entries(value as Record<string, unknown>)) {
    if (FORBIDDEN_IMPORT_KEYS.has(key)) return key;
    const nested = containsForbiddenKey(nestedValue);
    if (nested) return nested;
  }
  return null;
}

function hasOnlyAllowedKeys(value: Record<string, unknown>, allowed: Set<string>) {
  return Object.keys(value).every((key) => allowed.has(key));
}

export function validateStructuredImportPayload(body: unknown, expectedCurrencyCode: string): ImportApiValidationResult {
  const forbidden = containsForbiddenKey(body);
  if (forbidden) return { ok: false, error: `raw field not allowed: ${forbidden}` };

  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { ok: false, error: 'body must be an object' };
  }

  const input = body as Record<string, unknown>;
  if (!hasOnlyAllowedKeys(input, TOP_LEVEL_KEYS)) return { ok: false, error: 'unsupported top-level field' };
  if (typeof input.source !== 'string' || input.source.trim().length === 0) return { ok: false, error: 'source is required' };
  if (!Array.isArray(input.items) || input.items.length === 0) return { ok: false, error: 'items are required' };
  if (input.items.length > IMPORT_API_MAX_ITEMS) return { ok: false, error: 'too many items' };

  for (const item of input.items) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return { ok: false, error: 'item must be an object' };
    const row = item as Record<string, unknown>;
    if (!hasOnlyAllowedKeys(row, ITEM_KEYS)) return { ok: false, error: 'unsupported item field' };
    if (typeof row.externalId !== 'string' || row.externalId.trim().length === 0) return { ok: false, error: 'externalId is required' };
    if (row.type !== 'expense' && row.type !== 'income') return { ok: false, error: 'type must be expense or income' };
    if (!Number.isInteger(row.amountCents) || (row.amountCents as number) <= 0) return { ok: false, error: 'amountCents must be positive integer' };
    if (row.currencyCode !== expectedCurrencyCode) return { ok: false, error: 'currencyCode mismatch' };
    if (typeof row.occurredAt !== 'string' || Number.isNaN(Date.parse(row.occurredAt))) return { ok: false, error: 'occurredAt is invalid' };
  }

  return { ok: true };
}

export function importRequestHash(body: unknown): string {
  return hashStringToBase36(stableStringify(body as any));
}
