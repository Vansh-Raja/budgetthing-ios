/**
 * TripSummaryCalculator - Calculates comprehensive trip statistics
 * 
 * This is a direct port of TripSummaryCalculator.swift with identical behavior.
 * All amounts are in cents (integers) to avoid floating-point issues.
 */

import { v4 as uuidv4 } from 'uuid';
import {
  Trip,
  TripExpense,
  TripParticipant,
  Transaction,
  Category,
  TripSummary,
  CategorySpending,
} from './types';

/**
 * Calculate comprehensive summary for a trip
 */
export function calculate(trip: Trip, expenses: TripExpense[]): TripSummary {
  const transactions = expenses
    .map(e => e.transaction)
    .filter((t): t is Transaction => t !== undefined);
  const participants = trip.participants ?? [];

  // Total spent
  const totalSpentCents = transactions.reduce((sum, tx) => sum + tx.amountCents, 0);

  // Days calculation
  const { daysCount, dailyAverageCents } = calculateDailyStats(
    trip,
    transactions,
    totalSpentCents
  );

  // Budget calculations
  let budgetRemainingCents: number | undefined;
  let budgetPercentUsed: number | undefined;

  if (trip.budgetCents !== undefined && trip.budgetCents > 0) {
    budgetRemainingCents = trip.budgetCents - totalSpentCents;
    budgetPercentUsed = (totalSpentCents / trip.budgetCents) * 100;
  }

  return {
    totalSpentCents,
    dailyAverageCents,
    daysCount,
    budgetRemainingCents,
    budgetPercentUsed,
    expenseCount: transactions.length,
    participantCount: participants.length,
  };
}

/**
 * Calculate spending breakdown by category
 */
export function categorySpending(
  expenses: TripExpense[],
  categoryLookup: Record<string, Category>
): CategorySpending[] {
  const transactions = expenses
    .map(e => e.transaction)
    .filter((t): t is Transaction => t !== undefined);

  const totalCents = transactions.reduce((sum, tx) => sum + tx.amountCents, 0);

  if (totalCents === 0) {
    return [];
  }

  // Group by category
  const categoryTotals: Record<string, { amountCents: number; count: number }> = {};

  for (const tx of transactions) {
    const catId = tx.categoryId ?? 'uncategorized';
    if (!categoryTotals[catId]) {
      categoryTotals[catId] = { amountCents: 0, count: 0 };
    }
    categoryTotals[catId].amountCents += tx.amountCents;
    categoryTotals[catId].count += 1;
  }

  return Object.entries(categoryTotals)
    .map(([catId, data]) => {
      const category = catId !== 'uncategorized' ? categoryLookup[catId] : undefined;
      const percentage = (data.amountCents / totalCents) * 100;

      return {
        id: category?.id ?? uuidv4(),
        category,
        amountCents: data.amountCents,
        percentage,
        transactionCount: data.count,
      };
    })
    .sort((a, b) => b.amountCents - a.amountCents);
}

/**
 * Get display name for a category spending entry
 */
export function getCategoryDisplayName(spending: CategorySpending): string {
  return spending.category?.name ?? 'Uncategorized';
}

/**
 * Get emoji for a category spending entry
 */
export function getCategoryEmoji(spending: CategorySpending): string {
  return spending.category?.emoji ?? '📝';
}

/**
 * Calculate spending by participant (what each person spent for the group)
 */
export function participantSpending(
  expenses: TripExpense[],
  participantLookup: Record<string, TripParticipant>
): Array<{ participant: TripParticipant; amountCents: number }> {
  const spending: Record<string, number> = {};

  for (const expense of expenses) {
    const participantId = expense.paidByParticipantId;
    const transaction = expense.transaction;

    if (!participantId || !transaction) continue;

    spending[participantId] = (spending[participantId] ?? 0) + transaction.amountCents;
  }

  return Object.entries(spending)
    .map(([participantId, amountCents]) => ({
      participant: participantLookup[participantId],
      amountCents,
    }))
    .filter(entry => entry.participant !== undefined)
    .sort((a, b) => b.amountCents - a.amountCents);
}

/**
 * Calculate daily spending breakdown
 */
export function dailySpending(
  expenses: TripExpense[]
): Array<{ dateMs: number; amountCents: number }> {
  const transactions = expenses
    .map(e => e.transaction)
    .filter((t): t is Transaction => t !== undefined);

  const dailyTotals: Record<string, number> = {};

  for (const tx of transactions) {
    // Get date at midnight (start of day)
    const date = new Date(tx.date);
    const dayKey = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime().toString();

    dailyTotals[dayKey] = (dailyTotals[dayKey] ?? 0) + tx.amountCents;
  }

  return Object.entries(dailyTotals)
    .map(([dateMs, amountCents]) => ({
      dateMs: parseInt(dateMs, 10),
      amountCents,
    }))
    .sort((a, b) => a.dateMs - b.dateMs);
}

/**
 * Find the highest expense in a trip
 */
export function highestExpense(
  expenses: TripExpense[]
): { transaction: Transaction; amountCents: number } | undefined {
  const transactions = expenses
    .map(e => e.transaction)
    .filter((t): t is Transaction => t !== undefined);

  if (transactions.length === 0) {
    return undefined;
  }

  const highest = transactions.reduce((max, tx) =>
    tx.amountCents > max.amountCents ? tx : max
  );

  return {
    transaction: highest,
    amountCents: highest.amountCents,
  };
}

/**
 * Find the most expensive day
 */
export function mostExpensiveDay(
  expenses: TripExpense[]
): { dateMs: number; amountCents: number } | undefined {
  const daily = dailySpending(expenses);

  if (daily.length === 0) {
    return undefined;
  }

  return daily.reduce((max, day) =>
    day.amountCents > max.amountCents ? day : max
  );
}

// Private helper

function calculateDailyStats(
  trip: Trip,
  transactions: Transaction[],
  totalCents: number
): { daysCount: number; dailyAverageCents: number } {
  // Determine date range
  const transactionDates = transactions.map(tx => tx.date);
  const minDate = transactionDates.length > 0
    ? Math.min(...transactionDates)
    : (trip.startDate ?? Date.now());
  const maxDate = transactionDates.length > 0
    ? Math.max(...transactionDates)
    : (trip.endDate ?? Date.now());

  // If trip has explicit dates, use those
  const startDate = trip.startDate ?? minDate;
  const endDate = trip.endDate ?? maxDate;

  // Calculate days (inclusive)
  const msPerDay = 24 * 60 * 60 * 1000;
  const days = Math.max(1, Math.floor((endDate - startDate) / msPerDay) + 1);

  const dailyAvg = Math.round(totalCents / days);

  return { daysCount: days, dailyAverageCents: dailyAvg };
}

// Export as namespace for compatibility
export const TripSummaryCalculator = {
  calculate,
  categorySpending,
  getCategoryDisplayName,
  getCategoryEmoji,
  participantSpending,
  dailySpending,
  highestExpense,
  mostExpensiveDay,
};
