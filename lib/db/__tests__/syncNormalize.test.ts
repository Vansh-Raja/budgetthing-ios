jest.mock('../database', () => ({ queryAll: jest.fn(), run: jest.fn(), withTransaction: jest.fn() }));

import { normalizeOptionalFields } from '../sync';
import { TABLES } from '../schema';

describe('normalizeOptionalFields', () => {
  it('defaults a missing sourceType to manual for legacy server transactions (column is NOT NULL)', () => {
    const legacy = { id: 'tx1', amountCents: 100, date: 1, type: 'expense' };
    expect(normalizeOptionalFields(TABLES.TRANSACTIONS, legacy).sourceType).toBe('manual');
    expect(normalizeOptionalFields(TABLES.TRANSACTIONS, { ...legacy, sourceType: null }).sourceType).toBe('manual');
  });

  it('keeps an explicit sourceType and still nulls other absent optional columns', () => {
    const out = normalizeOptionalFields(TABLES.TRANSACTIONS, { id: 'tx2', sourceType: 'api_import' });
    expect(out.sourceType).toBe('api_import');
    expect(out.note).toBeNull();
    expect(out.sourceImportInboxItemId).toBeNull();
  });
});
