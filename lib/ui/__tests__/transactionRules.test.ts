import { describe, expect, it } from '@jest/globals';

import type { Transaction } from '../../logic/types';
import {
  formatTripShareAmountInline,
  isSelectableInBulkMode,
  shouldCountInMonthlySpentTotals,
  shouldRenderInTransactions,
} from '../transactionRules';

function tx(partial: Partial<Transaction>): Transaction {
  return {
    id: 't1',
    amountCents: 123,
    date: Date.now(),
    type: 'expense',
    accountId: undefined,
    categoryId: undefined,
    tripExpenseId: undefined,
    transferFromAccountId: undefined,
    transferToAccountId: undefined,
    systemType: undefined,
    sourceTripExpenseId: undefined,
    sourceTripSettlementId: undefined,
    createdAtMs: Date.now(),
    updatedAtMs: Date.now(),
    deletedAtMs: undefined,
    ...partial,
  };
}

describe('transactionRules', () => {
  it('hides trip_cashflow in Transactions tab', () => {
    expect(shouldRenderInTransactions(tx({ systemType: 'trip_cashflow' }))).toBe(false);
    expect(shouldRenderInTransactions(tx({ systemType: 'trip_share' }))).toBe(true);
  });

  it('excludes settlements from monthly spent totals', () => {
    expect(shouldCountInMonthlySpentTotals(tx({ systemType: 'trip_settlement', type: 'expense' }))).toBe(false);
    expect(shouldCountInMonthlySpentTotals(tx({ systemType: 'transfer' }))).toBe(false);
    expect(shouldCountInMonthlySpentTotals(tx({ type: 'income' }))).toBe(false);
    expect(shouldCountInMonthlySpentTotals(tx({ type: 'expense' }))).toBe(true);
  });

  it('disables bulk selection for derived rows', () => {
    expect(isSelectableInBulkMode(tx({ systemType: 'trip_share' }))).toBe(false);
    expect(isSelectableInBulkMode(tx({ systemType: 'trip_cashflow' }))).toBe(false);
    expect(isSelectableInBulkMode(tx({ systemType: 'trip_settlement' }))).toBe(false);
    expect(isSelectableInBulkMode(tx({ systemType: undefined }))).toBe(true);
  });

  it('formats trip share inline amount structure', () => {
    const fmt = formatTripShareAmountInline({ shareText: '250', totalText: '500' });
    expect(fmt.primaryText).toBe('250');
    expect(fmt.dotText).toContain('·');
    expect(fmt.secondaryText).toBe('500');
    expect(fmt.secondaryStyleToken).toBe('blueMuted');
  });
});
