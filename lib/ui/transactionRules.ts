import type { Transaction } from '../logic/types';

export type TripShareAmountFormat = {
  primaryText: string;
  dotText: string;
  secondaryText: string;
  secondaryStyleToken: 'blueMuted';
};

export function isDerivedTripSystemType(systemType: string | null | undefined): boolean {
  return systemType === 'trip_share' || systemType === 'trip_cashflow' || systemType === 'trip_settlement';
}

export function shouldRenderInTransactions(tx: Transaction): boolean {
  // Payer cashflow rows are shown in Accounts, not the Transactions tab.
  if (tx.systemType === 'trip_cashflow') return false;
  return true;
}

export function shouldCountInMonthlySpentTotals(tx: Transaction): boolean {
  // Totals represent "spending", not transfers/cash movements.
  if (tx.type === 'income') return false;
  if (tx.systemType === 'transfer') return false;
  if (tx.systemType === 'trip_cashflow') return false;
  if (tx.systemType === 'trip_settlement') return false;
  return true;
}

export function isSelectableInBulkMode(tx: Transaction): boolean {
  // Derived rows are local-only views.
  return !isDerivedTripSystemType(tx.systemType);
}

export function formatTripShareAmountInline(args: {
  shareText: string;
  totalText: string;
}): TripShareAmountFormat {
  return {
    primaryText: args.shareText,
    dotText: '  ·  ',
    secondaryText: args.totalText,
    secondaryStyleToken: 'blueMuted',
  };
}
