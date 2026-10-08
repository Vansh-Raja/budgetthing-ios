import { filterOutboundRows, isDerivedTripSystemType, isTransactionOutboundSyncable } from '../syncGuards';
import { deterministicImportTransactionId, isDeterministicImportTransactionId } from '../importProvenance';

describe('sync guards: derived rows never leave a runtime', () => {
  it('recognizes derived trip system types', () => {
    expect(isDerivedTripSystemType('trip_share')).toBe(true);
    expect(isDerivedTripSystemType('trip_cashflow')).toBe(true);
    expect(isDerivedTripSystemType('trip_settlement')).toBe(true);
    expect(isDerivedTripSystemType('transfer')).toBe(false);
    expect(isDerivedTripSystemType(null)).toBe(false);
    expect(isDerivedTripSystemType(undefined)).toBe(false);
  });

  it('excludes derived upserts and tombstones from the outbound transactions batch', () => {
    const rows = [
      { id: 'a', systemType: null },
      { id: 'b', systemType: 'transfer' },
      { id: 'c', systemType: 'trip_share' },
      { id: 'd', systemType: 'trip_cashflow', deletedAtMs: 123 },
      { id: 'e', systemType: 'trip_settlement' },
    ];
    expect(filterOutboundRows('transactions', rows).map((r) => r.id)).toEqual(['a', 'b']);
    expect(isTransactionOutboundSyncable({ systemType: 'trip_cashflow' })).toBe(false);
  });

  it('leaves other tables untouched', () => {
    const rows = [{ id: 'x', systemType: 'trip_share' }];
    expect(filterOutboundRows('accounts', rows)).toEqual(rows);
  });
});

describe('import provenance id', () => {
  it('is deterministic and recognizable', () => {
    const a = deterministicImportTransactionId('item-1');
    expect(a).toBe(deterministicImportTransactionId('item-1'));
    expect(a).not.toBe(deterministicImportTransactionId('item-2'));
    expect(isDeterministicImportTransactionId(a)).toBe(true);
    expect(isDeterministicImportTransactionId('uuid-like')).toBe(false);
  });
});
