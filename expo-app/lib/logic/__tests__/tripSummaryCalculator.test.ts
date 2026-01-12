/**
 * TripSummaryCalculator tests - ported from TripSummaryCalculatorTests.swift
 * 
 * Tests trip summary statistics calculation.
 * All amounts are in cents (e.g., 10000 = $100.00)
 */

import { v4 as uuidv4 } from 'uuid';
import {
  calculate,
  categorySpending,
  getCategoryDisplayName,
  getCategoryEmoji,
  participantSpending,
  dailySpending,
  highestExpense,
  mostExpensiveDay,
} from '../tripSummaryCalculator';
import {
  Trip,
  TripExpense,
  TripParticipant,
  Transaction,
  Category,
} from '../types';

// Test helpers
function makeTrip(options: {
  name?: string;
  startDate?: number;
  endDate?: number;
  budgetCents?: number;
  participants?: TripParticipant[];
} = {}): Trip {
  const now = Date.now();
  return {
    id: uuidv4(),
    name: options.name ?? 'Test Trip',
    emoji: '🧳',
    sortIndex: 0,
    isGroup: true,
    isArchived: false,
    startDate: options.startDate,
    endDate: options.endDate,
    budgetCents: options.budgetCents,
    participants: options.participants ?? [],
    createdAtMs: now,
    updatedAtMs: now,
  };
}

function makeParticipant(name: string, tripId: string, isCurrentUser: boolean = false): TripParticipant {
  const now = Date.now();
  return {
    id: uuidv4(),
    tripId,
    name,
    isCurrentUser,
    createdAtMs: now,
    updatedAtMs: now,
  };
}

function makeTransaction(amountCents: number, options: {
  note?: string;
  categoryId?: string;
  date?: number;
} = {}): Transaction {
  const now = Date.now();
  return {
    id: uuidv4(),
    amountCents,
    date: options.date ?? now,
    note: options.note ?? 'Test',
    type: 'expense',
    categoryId: options.categoryId,
    createdAtMs: now,
    updatedAtMs: now,
  };
}

function makeExpense(
  trip: Trip,
  transaction: Transaction,
  payer: TripParticipant
): TripExpense {
  const now = Date.now();
  return {
    id: uuidv4(),
    tripId: trip.id,
    transactionId: transaction.id,
    paidByParticipantId: payer.id,
    splitType: 'equal',
    transaction,
    paidByParticipant: payer,
    createdAtMs: now,
    updatedAtMs: now,
  };
}

function makeCategory(name: string, emoji: string): Category {
  const now = Date.now();
  return {
    id: uuidv4(),
    name,
    emoji,
    sortIndex: 0,
    isSystem: false,
    createdAtMs: now,
    updatedAtMs: now,
  };
}

describe('TripSummaryCalculator', () => {
  describe('calculate', () => {
    test('Total spent - single expense', () => {
      const trip = makeTrip();
      const alice = makeParticipant('Alice', trip.id, true);
      trip.participants = [alice];

      const tx = makeTransaction(10000); // $100
      const expense = makeExpense(trip, tx, alice);

      const summary = calculate(trip, [expense]);

      expect(summary.totalSpentCents).toBe(10000);
      expect(summary.expenseCount).toBe(1);
    });

    test('Total spent - multiple expenses', () => {
      const trip = makeTrip();
      const alice = makeParticipant('Alice', trip.id);
      const bob = makeParticipant('Bob', trip.id);
      trip.participants = [alice, bob];

      const tx1 = makeTransaction(10000); // $100
      const tx2 = makeTransaction(5000);  // $50
      const tx3 = makeTransaction(2500);  // $25

      const expenses = [
        makeExpense(trip, tx1, alice),
        makeExpense(trip, tx2, bob),
        makeExpense(trip, tx3, alice),
      ];

      const summary = calculate(trip, expenses);

      expect(summary.totalSpentCents).toBe(17500); // $175
      expect(summary.expenseCount).toBe(3);
    });

    test('Total spent - empty trip', () => {
      const trip = makeTrip();

      const summary = calculate(trip, []);

      expect(summary.totalSpentCents).toBe(0);
      expect(summary.expenseCount).toBe(0);
    });

    test('Budget remaining calculated correctly', () => {
      const trip = makeTrip({ budgetCents: 50000 }); // $500 budget
      const alice = makeParticipant('Alice', trip.id);
      trip.participants = [alice];

      const tx = makeTransaction(15000); // $150
      const expense = makeExpense(trip, tx, alice);

      const summary = calculate(trip, [expense]);

      expect(summary.budgetRemainingCents).toBe(35000); // $350
    });

    test('Budget percent used calculated correctly', () => {
      const trip = makeTrip({ budgetCents: 20000 }); // $200 budget
      const alice = makeParticipant('Alice', trip.id);
      trip.participants = [alice];

      const tx = makeTransaction(10000); // $100
      const expense = makeExpense(trip, tx, alice);

      const summary = calculate(trip, [expense]);

      expect(summary.budgetPercentUsed).toBe(50.0);
    });

    test('Budget over 100% when overspent', () => {
      const trip = makeTrip({ budgetCents: 10000 }); // $100 budget
      const alice = makeParticipant('Alice', trip.id);
      trip.participants = [alice];

      const tx = makeTransaction(15000); // $150
      const expense = makeExpense(trip, tx, alice);

      const summary = calculate(trip, [expense]);

      expect(summary.budgetRemainingCents).toBe(-5000); // -$50
      expect(summary.budgetPercentUsed).toBe(150.0);
    });

    test('No budget returns undefined', () => {
      const trip = makeTrip(); // No budget
      const alice = makeParticipant('Alice', trip.id);
      trip.participants = [alice];

      const tx = makeTransaction(10000);
      const expense = makeExpense(trip, tx, alice);

      const summary = calculate(trip, [expense]);

      expect(summary.budgetRemainingCents).toBeUndefined();
      expect(summary.budgetPercentUsed).toBeUndefined();
    });

    test('Daily average with trip dates', () => {
      const now = Date.now();
      const msPerDay = 24 * 60 * 60 * 1000;
      const startDate = now - (4 * msPerDay); // 5 days ago
      const endDate = now;

      const trip = makeTrip({ startDate, endDate });
      const alice = makeParticipant('Alice', trip.id);
      trip.participants = [alice];

      // 5 days total (inclusive), $100 spent
      const tx = makeTransaction(10000);
      const expense = makeExpense(trip, tx, alice);

      const summary = calculate(trip, [expense]);

      expect(summary.daysCount).toBe(5);
      expect(summary.dailyAverageCents).toBe(2000); // $20/day
    });

    test('Days count is at least 1', () => {
      const today = Date.now();
      const trip = makeTrip({ startDate: today, endDate: today });
      const alice = makeParticipant('Alice', trip.id);
      trip.participants = [alice];

      const tx = makeTransaction(10000);
      const expense = makeExpense(trip, tx, alice);

      const summary = calculate(trip, [expense]);

      expect(summary.daysCount).toBeGreaterThanOrEqual(1);
    });

    test('Participant count', () => {
      const trip = makeTrip();
      const alice = makeParticipant('Alice', trip.id);
      const bob = makeParticipant('Bob', trip.id);
      const charlie = makeParticipant('Charlie', trip.id);
      trip.participants = [alice, bob, charlie];

      const summary = calculate(trip, []);

      expect(summary.participantCount).toBe(3);
    });
  });

  describe('categorySpending', () => {
    test('Category spending breakdown', () => {
      const trip = makeTrip();
      const alice = makeParticipant('Alice', trip.id);

      const foodCategory = makeCategory('Food', '🍕');
      const transportCategory = makeCategory('Transport', '🚗');

      const tx1 = makeTransaction(10000, { categoryId: foodCategory.id });
      const tx2 = makeTransaction(5000, { categoryId: foodCategory.id });
      const tx3 = makeTransaction(5000, { categoryId: transportCategory.id });

      const expenses = [
        makeExpense(trip, tx1, alice),
        makeExpense(trip, tx2, alice),
        makeExpense(trip, tx3, alice),
      ];

      const categoryLookup = {
        [foodCategory.id]: foodCategory,
        [transportCategory.id]: transportCategory,
      };

      const spending = categorySpending(expenses, categoryLookup);

      // Food should be $150 (75%), Transport $50 (25%)
      expect(spending.length).toBe(2);

      const foodSpending = spending.find(s => s.category?.name === 'Food');
      expect(foodSpending?.amountCents).toBe(15000);
      expect(foodSpending?.transactionCount).toBe(2);

      const transportSpending = spending.find(s => s.category?.name === 'Transport');
      expect(transportSpending?.amountCents).toBe(5000);
      expect(transportSpending?.transactionCount).toBe(1);
    });

    test('Category spending sorted by amount descending', () => {
      const trip = makeTrip();
      const alice = makeParticipant('Alice', trip.id);

      const smallCat = makeCategory('Small', '📌');
      const largeCat = makeCategory('Large', '📦');

      const tx1 = makeTransaction(1000, { categoryId: smallCat.id });
      const tx2 = makeTransaction(10000, { categoryId: largeCat.id });

      const expenses = [
        makeExpense(trip, tx1, alice),
        makeExpense(trip, tx2, alice),
      ];

      const categoryLookup = {
        [smallCat.id]: smallCat,
        [largeCat.id]: largeCat,
      };

      const spending = categorySpending(expenses, categoryLookup);

      // Larger amount should come first
      expect(spending[0].category?.name).toBe('Large');
    });

    test('Category spending empty trip returns empty', () => {
      const spending = categorySpending([], {});
      expect(spending.length).toBe(0);
    });

    test('Uncategorized transactions grouped', () => {
      const trip = makeTrip();
      const alice = makeParticipant('Alice', trip.id);

      const tx1 = makeTransaction(5000); // No category
      const tx2 = makeTransaction(3000); // No category

      const expenses = [
        makeExpense(trip, tx1, alice),
        makeExpense(trip, tx2, alice),
      ];

      const spending = categorySpending(expenses, {});

      expect(spending.length).toBe(1);
      expect(spending[0].category).toBeUndefined();
      expect(spending[0].amountCents).toBe(8000);
    });
  });

  describe('getCategoryDisplayName and getCategoryEmoji', () => {
    test('Returns category name when present', () => {
      const category = makeCategory('Food', '🍕');
      const spending = {
        id: uuidv4(),
        category,
        amountCents: 5000,
        percentage: 50,
        transactionCount: 1,
      };

      expect(getCategoryDisplayName(spending)).toBe('Food');
      expect(getCategoryEmoji(spending)).toBe('🍕');
    });

    test('Returns defaults for uncategorized', () => {
      const spending = {
        id: uuidv4(),
        category: undefined,
        amountCents: 5000,
        percentage: 50,
        transactionCount: 1,
      };

      expect(getCategoryDisplayName(spending)).toBe('Uncategorized');
      expect(getCategoryEmoji(spending)).toBe('📝');
    });
  });

  describe('participantSpending', () => {
    test('Participant spending breakdown', () => {
      const trip = makeTrip();
      const alice = makeParticipant('Alice', trip.id);
      const bob = makeParticipant('Bob', trip.id);

      const tx1 = makeTransaction(10000);
      const tx2 = makeTransaction(5000);
      const tx3 = makeTransaction(7500);

      const expenses = [
        makeExpense(trip, tx1, alice),
        makeExpense(trip, tx2, alice),
        makeExpense(trip, tx3, bob),
      ];

      const participantLookup = {
        [alice.id]: alice,
        [bob.id]: bob,
      };

      const spending = participantSpending(expenses, participantLookup);

      expect(spending.length).toBe(2);

      // Alice paid $150, Bob paid $75
      expect(spending[0].participant.name).toBe('Alice');
      expect(spending[0].amountCents).toBe(15000);

      expect(spending[1].participant.name).toBe('Bob');
      expect(spending[1].amountCents).toBe(7500);
    });
  });

  describe('dailySpending', () => {
    test('Daily spending breakdown', () => {
      const trip = makeTrip();
      const alice = makeParticipant('Alice', trip.id);

      const now = Date.now();
      const msPerDay = 24 * 60 * 60 * 1000;
      const yesterday = now - msPerDay;

      const tx1 = makeTransaction(10000, { date: now });
      const tx2 = makeTransaction(5000, { date: now });
      const tx3 = makeTransaction(7500, { date: yesterday });

      const expenses = [
        makeExpense(trip, tx1, alice),
        makeExpense(trip, tx2, alice),
        makeExpense(trip, tx3, alice),
      ];

      const spending = dailySpending(expenses);

      expect(spending.length).toBe(2);

      // Yesterday should come first (sorted by date ascending)
      expect(spending[0].amountCents).toBe(7500);
      expect(spending[1].amountCents).toBe(15000);
    });

    test('Daily spending sorted by date ascending', () => {
      const trip = makeTrip();
      const alice = makeParticipant('Alice', trip.id);

      const now = Date.now();
      const msPerDay = 24 * 60 * 60 * 1000;
      const day1 = now - (3 * msPerDay);
      const day2 = now - msPerDay;

      const tx1 = makeTransaction(5000, { date: day2 });
      const tx2 = makeTransaction(10000, { date: day1 });

      const expenses = [
        makeExpense(trip, tx1, alice),
        makeExpense(trip, tx2, alice),
      ];

      const spending = dailySpending(expenses);

      // Earlier date should come first
      expect(spending[0].dateMs).toBeLessThan(spending[1].dateMs);
    });
  });

  describe('highestExpense', () => {
    test('Highest expense identified', () => {
      const trip = makeTrip();
      const alice = makeParticipant('Alice', trip.id);

      const tx1 = makeTransaction(5000);
      const tx2 = makeTransaction(20000);
      const tx3 = makeTransaction(7500);

      const expenses = [
        makeExpense(trip, tx1, alice),
        makeExpense(trip, tx2, alice),
        makeExpense(trip, tx3, alice),
      ];

      const highest = highestExpense(expenses);

      expect(highest?.amountCents).toBe(20000);
    });

    test('Highest expense undefined for empty trip', () => {
      const highest = highestExpense([]);
      expect(highest).toBeUndefined();
    });
  });

  describe('mostExpensiveDay', () => {
    test('Most expensive day identified', () => {
      const trip = makeTrip();
      const alice = makeParticipant('Alice', trip.id);

      const now = Date.now();
      const msPerDay = 24 * 60 * 60 * 1000;
      const yesterday = now - msPerDay;

      // Yesterday: $75
      const tx1 = makeTransaction(7500, { date: yesterday });

      // Today: $100 + $50 = $150
      const tx2 = makeTransaction(10000, { date: now });
      const tx3 = makeTransaction(5000, { date: now });

      const expenses = [
        makeExpense(trip, tx1, alice),
        makeExpense(trip, tx2, alice),
        makeExpense(trip, tx3, alice),
      ];

      const most = mostExpensiveDay(expenses);

      expect(most?.amountCents).toBe(15000);
    });

    test('Most expensive day undefined for empty trip', () => {
      const most = mostExpensiveDay([]);
      expect(most).toBeUndefined();
    });
  });

  describe('Edge cases', () => {
    test('Large number of expenses', () => {
      const trip = makeTrip();
      const alice = makeParticipant('Alice', trip.id);
      trip.participants = [alice];

      // Create 100 expenses
      const expenses: TripExpense[] = [];
      for (let i = 0; i < 100; i++) {
        const tx = makeTransaction((i + 1) * 100); // 100, 200, 300, ... 10000 cents
        expenses.push(makeExpense(trip, tx, alice));
      }

      const summary = calculate(trip, expenses);

      // Sum of 1 to 100 = 5050, in cents = 505000
      expect(summary.totalSpentCents).toBe(505000);
      expect(summary.expenseCount).toBe(100);

      const highest = highestExpense(expenses);
      expect(highest?.amountCents).toBe(10000);
    });

    test('Integer precision maintained', () => {
      const trip = makeTrip();
      const alice = makeParticipant('Alice', trip.id);
      trip.participants = [alice];

      // Three amounts that sum to exactly $100.00 (10000 cents)
      const tx1 = makeTransaction(3333);
      const tx2 = makeTransaction(3333);
      const tx3 = makeTransaction(3334);

      const expenses = [
        makeExpense(trip, tx1, alice),
        makeExpense(trip, tx2, alice),
        makeExpense(trip, tx3, alice),
      ];

      const summary = calculate(trip, expenses);

      expect(summary.totalSpentCents).toBe(10000);
    });
  });
});
