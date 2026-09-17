import { importRequestHash, validateStructuredImportPayload } from '../importApiValidation';

const validPayload = {
  source: 'gmail-agent',
  items: [
    {
      externalId: 'message-1:line-1',
      type: 'expense',
      amountCents: 1299,
      currencyCode: 'INR',
      occurredAt: '2026-05-24T10:30:00+05:30',
      merchantName: 'Blue Tokai',
      note: 'Coffee',
    },
  ],
};

describe('import API validation', () => {
  test('accepts structured expense and income payloads', () => {
    expect(validateStructuredImportPayload(validPayload, 'INR')).toEqual({ ok: true });
    expect(validateStructuredImportPayload({
      ...validPayload,
      items: [{ ...validPayload.items[0], type: 'income' }],
    }, 'INR')).toEqual({ ok: true });
  });

  test('rejects raw message fields anywhere in the payload', () => {
    expect(validateStructuredImportPayload({
      ...validPayload,
      items: [{ ...validPayload.items[0], emailBody: 'full email text' }],
    }, 'INR')).toEqual({ ok: false, error: 'raw field not allowed: emailBody' });

    expect(validateStructuredImportPayload({
      ...validPayload,
      rawText: 'upi transaction text',
    }, 'INR')).toEqual({ ok: false, error: 'raw field not allowed: rawText' });
  });

  test('rejects transfers and currency mismatches', () => {
    expect(validateStructuredImportPayload({
      ...validPayload,
      items: [{ ...validPayload.items[0], type: 'transfer' }],
    }, 'INR')).toEqual({ ok: false, error: 'type must be expense or income' });

    expect(validateStructuredImportPayload(validPayload, 'USD')).toEqual({ ok: false, error: 'currencyCode mismatch' });
  });

  test('request hash is deterministic regardless of object key order', () => {
    const a = {
      source: 'gmail-agent',
      items: [{ externalId: '1', type: 'expense', amountCents: 100, currencyCode: 'INR', occurredAt: '2026-05-24T00:00:00Z' }],
    };
    const b = {
      items: [{ currencyCode: 'INR', amountCents: 100, occurredAt: '2026-05-24T00:00:00Z', type: 'expense', externalId: '1' }],
      source: 'gmail-agent',
    };
    expect(importRequestHash(a)).toBe(importRequestHash(b));
  });
});
