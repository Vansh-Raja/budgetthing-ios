/**
 * TripBalanceCalculator - Calculates balances and debts for group trips
 * 
 * Ported from the Swift app (with settlement behavior adapted for “settle up”).
 * All amounts are in cents (integers) to avoid floating-point issues.
 */

import { v4 as uuidv4 } from 'uuid';
import {
  TripParticipant,
  TripExpense,
  TripSettlement,
  ParticipantBalance,
  DebtRelation,
} from './types';

/**
 * Calculate net balance for each participant
 * 
 * @param participants - All participants in the trip
 * @param expenses - All trip expenses with their splits
 * @param settlements - All recorded settlements
 * @returns Array of participant balances
 */
export function calculateBalances(
  participants: TripParticipant[],
  expenses: TripExpense[],
  settlements: TripSettlement[]
): ParticipantBalance[] {
  const paidByParticipant: Record<string, number> = {};
  const owedByParticipant: Record<string, number> = {};

  // Initialize all participants with zero
  for (const participant of participants) {
    paidByParticipant[participant.id] = 0;
    owedByParticipant[participant.id] = 0;
  }

  // Process expenses
  for (const expense of expenses) {
    const transaction = expense.transaction;
    const payerId = expense.paidByParticipantId;

    if (!transaction || !payerId) {
      continue;
    }

    const amountCents = Math.abs(transaction.amountCents);

    // The payer paid for the group
    paidByParticipant[payerId] = (paidByParticipant[payerId] ?? 0) + amountCents;

    // Each participant owes their share
    if (expense.computedSplits) {
      for (const [participantId, owedAmount] of Object.entries(expense.computedSplits)) {
        owedByParticipant[participantId] = (owedByParticipant[participantId] ?? 0) + owedAmount;
      }
    }
  }

  // Process settlements - recorded payments reduce outstanding balances
  for (const settlement of settlements) {
    const fromId = settlement.fromParticipantId;
    const toId = settlement.toParticipantId;

    if (!fromId || !toId) {
      continue;
    }

    // Settlement reduces the debt:
    // Payer (from) has paid more
    paidByParticipant[fromId] = (paidByParticipant[fromId] ?? 0) + settlement.amountCents;

    // Receiver (to) has been reimbursed, so their effective "paid" amount decreases
    paidByParticipant[toId] = (paidByParticipant[toId] ?? 0) - settlement.amountCents;
  }

  // Calculate net balances
  return participants.map(participant => {
    const paid = paidByParticipant[participant.id] ?? 0;
    const owed = owedByParticipant[participant.id] ?? 0;
    const net = paid - owed;

    return {
      id: uuidv4(),
      participantId: participant.id,
      participantName: participant.name,
      isCurrentUser: participant.isCurrentUser,
      colorHex: participant.colorHex,
      totalPaidCents: paid,
      totalOwedCents: owed,
      netBalanceCents: net,
    };
  });
}

/**
 * Debt simplification algorithm (greedy approach)
 * Minimizes the number of transactions needed to settle all debts
 * 
 * @param participants - All trip participants
 * @param balances - Current balance for each participant
 * @returns Minimal set of settlements to balance all debts
 */
export function simplifyDebts(
  participants: TripParticipant[],
  balances: ParticipantBalance[]
): DebtRelation[] {
  // Build participant lookup
  const participantLookup = new Map(participants.map(p => [p.id, p]));

  // Separate into creditors (positive balance = owed money) and debtors (negative balance = owes money)
  const creditors: Array<{ participantId: string; amount: number }> = [];
  const debtors: Array<{ participantId: string; amount: number }> = [];

  for (const balance of balances) {
    if (balance.netBalanceCents > 0) {
      creditors.push({ participantId: balance.participantId, amount: balance.netBalanceCents });
    } else if (balance.netBalanceCents < 0) {
      debtors.push({ participantId: balance.participantId, amount: -balance.netBalanceCents }); // Store as positive
    }
  }

  // Sort by amount descending for more efficient matching
  creditors.sort((a, b) => b.amount - a.amount);
  debtors.sort((a, b) => b.amount - a.amount);

  const settlements: DebtRelation[] = [];
  let creditorIndex = 0;
  let debtorIndex = 0;

  // Greedy matching: pair largest debtor with largest creditor
  while (creditorIndex < creditors.length && debtorIndex < debtors.length) {
    const creditor = creditors[creditorIndex];
    const debtor = debtors[debtorIndex];

    const transferAmount = Math.min(creditor.amount, debtor.amount);

    if (transferAmount > 0) {
      const fromParticipant = participantLookup.get(debtor.participantId);
      const toParticipant = participantLookup.get(creditor.participantId);

      if (fromParticipant && toParticipant) {
        settlements.push({
          id: uuidv4(),
          fromParticipant,
          toParticipant,
          amountCents: transferAmount,
        });
      }
    }

    // Update remaining balances
    creditors[creditorIndex].amount -= transferAmount;
    debtors[debtorIndex].amount -= transferAmount;

    // Move to next creditor/debtor if their balance is settled
    if (creditors[creditorIndex].amount === 0) {
      creditorIndex++;
    }
    if (debtors[debtorIndex].amount === 0) {
      debtorIndex++;
    }
  }

  return settlements;
}

/**
 * Calculate what the current user owes or is owed
 */
export function currentUserSummary(
  balances: ParticipantBalance[]
): { owesCents: number; getsBackCents: number } {
  const currentUserBalance = balances.find(b => b.isCurrentUser);

  if (!currentUserBalance) {
    return { owesCents: 0, getsBackCents: 0 };
  }

  if (currentUserBalance.netBalanceCents < 0) {
    return { owesCents: -currentUserBalance.netBalanceCents, getsBackCents: 0 };
  } else if (currentUserBalance.netBalanceCents > 0) {
    return { owesCents: 0, getsBackCents: currentUserBalance.netBalanceCents };
  }

  return { owesCents: 0, getsBackCents: 0 };
}

/**
 * Get detailed breakdown of who owes whom for display
 * @returns Record<creditorId, Record<debtorId, amountCents>>
 */
export function detailedDebts(
  participants: TripParticipant[],
  expenses: TripExpense[]
): Record<string, Record<string, number>> {
  const debts: Record<string, Record<string, number>> = {};

  for (const expense of expenses) {
    const transaction = expense.transaction;
    const payerId = expense.paidByParticipantId;
    const splits = expense.computedSplits;

    if (!transaction || !payerId || !splits) {
      continue;
    }

    for (const [participantId, owedAmount] of Object.entries(splits)) {
      // Skip if participant is the payer (they don't owe themselves)
      if (participantId === payerId) continue;
      if (owedAmount <= 0) continue;

      // participantId owes payerId
      if (!debts[payerId]) {
        debts[payerId] = {};
      }
      debts[payerId][participantId] = (debts[payerId][participantId] ?? 0) + owedAmount;
    }
  }

  return debts;
}

/**
 * Get display name for a participant
 */
export function getDisplayName(balance: ParticipantBalance): string {
  return balance.isCurrentUser ? 'You' : balance.participantName;
}

/**
 * Get owes/gets back status string
 */
export function getOwesOrGets(balance: ParticipantBalance): string {
  if (balance.netBalanceCents > 0) {
    return 'gets back';
  } else if (balance.netBalanceCents < 0) {
    return 'owes';
  } else {
    return 'settled';
  }
}

// Export as namespace for compatibility
export const TripBalanceCalculator = {
  calculateBalances,
  simplifyDebts,
  currentUserSummary,
  detailedDebts,
  getDisplayName,
  getOwesOrGets,
};
