/**
 * How a transaction counts in the personal ledger views (list rows, month totals, the
 * desktop summary): the user's share for solo trip expenses, hidden rows for local group
 * trip base expenses (derived rows show those), full amounts otherwise.
 * Extracted verbatim from TransactionsScreen so every view uses the same rules.
 */
import { formatCents } from '../logic/currencyUtils';
import { TripSplitCalculator } from '../logic/tripSplitCalculator';
import type { Transaction } from '../logic/types';

// Same values as Colors.success / Colors.accent; kept local so this module stays pure (no RN import).
const Colors = { success: '#34C759', accent: '#FF9500' } as const;

export interface TripExpenseInfo {
  tripId: string;
  tripName: string;
  tripEmoji: string;
  isGroup: boolean;
  paidByParticipantId?: string;
  splitType: string;
  computedSplits?: Record<string, number>;
  participants: any[];
}

export interface EffectiveDisplayInfo {
  amount: number;
  isIncome: boolean;
  shouldHide: boolean;
  netInfo?: { text: string; color: string };
}

export function buildTripExpenseMap(trips: any[]): Map<string, TripExpenseInfo> {
  const map = new Map<string, TripExpenseInfo>();
  trips.forEach(trip => {
    trip.expenses?.forEach((exp: any) => {
      if (exp.transactionId) {
        map.set(exp.transactionId, {
          tripId: trip.id,
          tripName: trip.name,
          tripEmoji: trip.emoji,
          isGroup: trip.isGroup,
          paidByParticipantId: exp.paidByParticipantId,
          splitType: exp.splitType,
          computedSplits: exp.computedSplits,
          participants: trip.participants || []
        });
      }
    });
  });
  return map;
}

export function getEffectiveDisplayInfo(tx: Transaction, tripExpenseMap: Map<string, TripExpenseInfo>): EffectiveDisplayInfo {

// Income: always show full amount as income
if (tx.type === 'income') {
  return { amount: Math.abs(tx.amountCents), isIncome: true, shouldHide: false };
}

// Transfers and adjustments: show full amount
if (tx.systemType === 'transfer' || tx.systemType === 'adjustment') {
  return { amount: Math.abs(tx.amountCents), isIncome: false, shouldHide: false };
}

// Check if this is a trip expense
const tripInfo = tripExpenseMap.get(tx.id);
if (tripInfo?.isGroup) {
  // Local group trip expense rows are ledger-only; derived rows handle display.
  return { amount: 0, isIncome: false, shouldHide: true };
}
if (!tripInfo) {
  // Regular expense: show full amount
  return { amount: Math.abs(tx.amountCents), isIncome: false, shouldHide: false };
}

// Find current user in trip participants
const currentUser = tripInfo.participants.find((p: any) => p.isCurrentUser);
if (!currentUser) {
  return { amount: Math.abs(tx.amountCents), isIncome: false, shouldHide: false };
}

// Get computed splits (use stored or calculate)
const splits = tripInfo.computedSplits || TripSplitCalculator.calculateSplits(
  Math.abs(tx.amountCents),
  tripInfo.splitType as any,
  tripInfo.participants,
  undefined
);

const totalAmount = Math.abs(tx.amountCents);
const myShare = splits[currentUser.id] ?? 0;
const iPaid = tripInfo.paidByParticipantId === currentUser.id;
const payer = tripInfo.participants.find((p: any) => p.id === tripInfo.paidByParticipantId);
const payerName = payer?.name || 'them';

if (myShare <= 0) {
  if (iPaid) {
    // I paid but not included in split - effectively income (getting all money back)
    return {
      amount: totalAmount,
      isIncome: true,
      shouldHide: false,
      netInfo: { text: `You get back ${formatCents(totalAmount)}`, color: Colors.success }
    };
  } else {
    // Someone else paid and I'm not included - hide
    return { amount: 0, isIncome: false, shouldHide: true };
  }
} else {
  // I have a share
  if (iPaid) {
    // I paid, so I get back (total - myShare)
    const netBack = totalAmount - myShare;
    if (netBack <= 0) {
      // No net change or I owe more (shouldn't happen normally)
      return {
        amount: myShare,
        isIncome: false,
        shouldHide: false,
        netInfo: { text: 'Settled', color: 'rgba(255, 255, 255, 0.4)' }
      };
    }
    return {
      amount: myShare,
      isIncome: false,
      shouldHide: false,
      netInfo: { text: `You get back ${formatCents(netBack)}`, color: Colors.success }
    };
  } else {
    // Someone else paid, I owe them my share
    return {
      amount: myShare,
      isIncome: false,
      shouldHide: false,
      netInfo: { text: `You owe ${payerName} ${formatCents(myShare)}`, color: Colors.accent }
    };
  }
}
}
