import { Account, Transaction } from './types';

export type AccountBalanceMode = 'balance' | 'available';

export interface AccountFlowTotals {
  expensesCents: number;
  incomesCents: number;
}

export function isTransactionForAccount(tx: Transaction, accountId: string): boolean {
  return (
    tx.accountId === accountId ||
    tx.transferFromAccountId === accountId ||
    tx.transferToAccountId === accountId
  );
}

export function getTransactionsForAccount(transactions: Transaction[], accountId: string): Transaction[] {
  return transactions.filter((tx) => isTransactionForAccount(tx, accountId));
}

export function summarizeAccountFlows(account: Account, transactions: Transaction[]): AccountFlowTotals {
  let expensesCents = 0;
  let incomesCents = 0;

  for (const tx of transactions) {
    const amountCents = Math.abs(tx.amountCents);

    if (tx.systemType === 'transfer') {
      if (tx.transferFromAccountId === account.id) {
        expensesCents += amountCents;
      }
      if (tx.transferToAccountId === account.id) {
        incomesCents += amountCents;
      }
      continue;
    }

    if (tx.type === 'income') {
      incomesCents += amountCents;
    } else {
      expensesCents += amountCents;
    }
  }

  return { expensesCents, incomesCents };
}

export function computeAccountBalanceCents(account: Account, transactions: Transaction[]): number {
  const { expensesCents, incomesCents } = summarizeAccountFlows(account, transactions);
  return (account.openingBalanceCents ?? 0) + incomesCents - expensesCents;
}

export function computeAccountAvailableCents(account: Account, transactions: Transaction[]): number | null {
  const { expensesCents, incomesCents } = summarizeAccountFlows(account, transactions);
  if (account.limitAmountCents === undefined) return null;
  return account.limitAmountCents - expensesCents + incomesCents;
}

/**
 * Matches Swift AccountsView card tile behavior:
 * - cash/savings: show balance
 * - card: show available only if a limit is set, otherwise hide
 */
export function computeAccountTileValueCents(account: Account, transactions: Transaction[]): number | null {
  if (account.kind === 'card') {
    return computeAccountAvailableCents(account, transactions);
  }
  return computeAccountBalanceCents(account, transactions);
}

/**
 * Matches Swift AccountDetailView header behavior:
 * - cash/savings: show balance
 * - card: show available if a limit is set, otherwise show outstanding (spent - added)
 */
export function computeAccountHeaderValueCents(account: Account, transactions: Transaction[]): number | null {
  if (account.kind === 'card') {
    const available = computeAccountAvailableCents(account, transactions);
    if (available !== null) return available;

    const { expensesCents, incomesCents } = summarizeAccountFlows(account, transactions);
    return expensesCents - incomesCents;
  }

  return computeAccountBalanceCents(account, transactions);
}
