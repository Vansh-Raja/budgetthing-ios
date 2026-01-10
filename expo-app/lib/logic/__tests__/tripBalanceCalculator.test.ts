/**
 * TripBalanceCalculator tests - ported from TripBalanceCalculatorTests.swift
 * 
 * Tests balance calculation and debt simplification logic.
 * All amounts are in cents (e.g., 9000 = $90.00)
 */

import { v4 as uuidv4 } from 'uuid';
import {
  calculateBalances,
  simplifyDebts,
  currentUserSummary,
  detailedDebts,
  getDisplayName,
  getOwesOrGets,
} from '../tripBalanceCalculator';
import {
  TripParticipant,
  TripExpense,
  TripSettlement,
  Transaction,
  ParticipantBalance,
} from '../types';

// Test helpers
function makeParticipant(
  name: string,
  isCurrentUser: boolean = false,
  colorHex?: string
): TripParticipant {
  const now = Date.now();
  return {
    id: uuidv4(),
    tripId: uuidv4(),
    name,
    isCurrentUser,
    colorHex,
    createdAtMs: now,
    updatedAtMs: now,
  };
}

function makeTransaction(amountCents: number, note?: string): Transaction {
  const now = Date.now();
  return {
    id: uuidv4(),
    amountCents,
    date: now,
    note,
    type: 'expense',
    createdAtMs: now,
    updatedAtMs: now,
  };
}

function makeExpense(
  transaction: Transaction,
  paidByParticipant: TripParticipant,
  splitType: TripExpense['splitType'],
  computedSplits: Record<string, number>
): TripExpense {
  const now = Date.now();
  return {
    id: uuidv4(),
    tripId: paidByParticipant.tripId,
    transactionId: transaction.id,
    paidByParticipantId: paidByParticipant.id,
    splitType,
    computedSplits,
    transaction,
    paidByParticipant,
    createdAtMs: now,
    updatedAtMs: now,
  };
}

function makeSettlement(
  fromParticipant: TripParticipant,
  toParticipant: TripParticipant,
  amountCents: number
): TripSettlement {
  const now = Date.now();
  return {
    id: uuidv4(),
    tripId: fromParticipant.tripId,
    fromParticipantId: fromParticipant.id,
    toParticipantId: toParticipant.id,
    amountCents,
    date: now,
    fromParticipant,
    toParticipant,
    createdAtMs: now,
    updatedAtMs: now,
  };
}

describe('TripBalanceCalculator', () => {
  describe('calculateBalances', () => {
    test('Single expense - payer gets back their share from others', () => {
      const alice = makeParticipant('Alice', true);
      const bob = makeParticipant('Bob');
      const charlie = makeParticipant('Charlie');
      const participants = [alice, bob, charlie];

      // Alice pays $90 (9000 cents)
      const transaction = makeTransaction(9000, 'Dinner');
      
      // Equal split - each owes $30 (3000 cents)
      const expense = makeExpense(transaction, alice, 'equal', {
        [alice.id]: 3000,
        [bob.id]: 3000,
        [charlie.id]: 3000,
      });

      const balances = calculateBalances(participants, [expense], []);

      expect(balances.length).toBe(3);

      // Alice paid $90, owes $30 → net = +$60 (gets back 6000 cents)
      const aliceBalance = balances.find(b => b.participantId === alice.id);
      expect(aliceBalance?.totalPaidCents).toBe(9000);
      expect(aliceBalance?.totalOwedCents).toBe(3000);
      expect(aliceBalance?.netBalanceCents).toBe(6000);

      // Bob paid $0, owes $30 → net = -$30 (owes 3000 cents)
      const bobBalance = balances.find(b => b.participantId === bob.id);
      expect(bobBalance?.totalPaidCents).toBe(0);
      expect(bobBalance?.totalOwedCents).toBe(3000);
      expect(bobBalance?.netBalanceCents).toBe(-3000);

      // Charlie paid $0, owes $30 → net = -$30 (owes 3000 cents)
      const charlieBalance = balances.find(b => b.participantId === charlie.id);
      expect(charlieBalance?.netBalanceCents).toBe(-3000);
    });

    test('Multiple expenses - different payers', () => {
      const alice = makeParticipant('Alice', true);
      const bob = makeParticipant('Bob');
      const participants = [alice, bob];

      // Alice pays $100, split equally ($50 each)
      const tx1 = makeTransaction(10000, 'Dinner');
      const expense1 = makeExpense(tx1, alice, 'equal', {
        [alice.id]: 5000,
        [bob.id]: 5000,
      });

      // Bob pays $60, split equally ($30 each)
      const tx2 = makeTransaction(6000, 'Taxi');
      const expense2 = makeExpense(tx2, bob, 'equal', {
        [alice.id]: 3000,
        [bob.id]: 3000,
      });

      const balances = calculateBalances(participants, [expense1, expense2], []);

      // Alice: paid $100, owes $80 ($50 + $30) → net = +$20 (2000 cents)
      const aliceBalance = balances.find(b => b.participantId === alice.id);
      expect(aliceBalance?.totalPaidCents).toBe(10000);
      expect(aliceBalance?.totalOwedCents).toBe(8000);
      expect(aliceBalance?.netBalanceCents).toBe(2000);

      // Bob: paid $60, owes $80 → net = -$20 (-2000 cents)
      const bobBalance = balances.find(b => b.participantId === bob.id);
      expect(bobBalance?.totalPaidCents).toBe(6000);
      expect(bobBalance?.totalOwedCents).toBe(8000);
      expect(bobBalance?.netBalanceCents).toBe(-2000);
    });

    test('Balances with settlements - settlement adds to paid and owed equally', () => {
      const alice = makeParticipant('Alice', true);
      const bob = makeParticipant('Bob');
      const participants = [alice, bob];

      // Alice pays $100, split equally
      const tx1 = makeTransaction(10000, 'Dinner');
      const expense1 = makeExpense(tx1, alice, 'equal', {
        [alice.id]: 5000,
        [bob.id]: 5000,
      });

      // Bob settles $30 with Alice
      const settlement = makeSettlement(bob, alice, 3000);

      const balances = calculateBalances(participants, [expense1], [settlement]);

      // Alice: paid $100, owes $50 → net = +$50 (unchanged by settlement)
      const aliceBalance = balances.find(b => b.participantId === alice.id);
      expect(aliceBalance?.netBalanceCents).toBe(5000);

      // Bob: paid $0 + $30 (settlement) = $30, owes $50 + $30 (settlement) = $80
      // Net = -$50 (unchanged by settlement)
      const bobBalance = balances.find(b => b.participantId === bob.id);
      expect(bobBalance?.totalPaidCents).toBe(3000);
      expect(bobBalance?.totalOwedCents).toBe(8000);
      expect(bobBalance?.netBalanceCents).toBe(-5000);
    });

    test('Empty expenses returns zero balances', () => {
      const alice = makeParticipant('Alice');
      const bob = makeParticipant('Bob');
      const participants = [alice, bob];

      const balances = calculateBalances(participants, [], []);

      expect(balances.length).toBe(2);
      for (const balance of balances) {
        expect(balance.totalPaidCents).toBe(0);
        expect(balance.totalOwedCents).toBe(0);
        expect(balance.netBalanceCents).toBe(0);
      }
    });

    test('All settled - settlement tracking (net unchanged)', () => {
      const alice = makeParticipant('Alice');
      const bob = makeParticipant('Bob');
      const participants = [alice, bob];

      // Alice pays $100, split equally ($50 each)
      const tx1 = makeTransaction(10000, 'Dinner');
      const expense1 = makeExpense(tx1, alice, 'equal', {
        [alice.id]: 5000,
        [bob.id]: 5000,
      });

      // Bob settles fully - pays $50 to Alice
      const settlement = makeSettlement(bob, alice, 5000);

      const balances = calculateBalances(participants, [expense1], [settlement]);

      // Bob: paid $50 (settlement), owes $50 + $50 (settlement) = $100
      // Net = -$50 (unchanged)
      const bobBalance = balances.find(b => b.participantId === bob.id);
      expect(bobBalance?.totalPaidCents).toBe(5000);
      expect(bobBalance?.totalOwedCents).toBe(10000);
      expect(bobBalance?.netBalanceCents).toBe(-5000);
    });

    test('Large group with many expenses', () => {
      // Create 10 participants
      const participants: TripParticipant[] = [];
      for (let i = 0; i < 10; i++) {
        participants.push(makeParticipant(`Person ${i}`));
      }

      // Create 20 expenses, each paid by a different person
      const expenses: TripExpense[] = [];
      for (let i = 0; i < 20; i++) {
        const payer = participants[i % 10];
        const tx = makeTransaction(10000, `Expense ${i}`); // $100

        // Equal split among all 10 ($10 each = 1000 cents)
        const splits: Record<string, number> = {};
        for (const p of participants) {
          splits[p.id] = 1000;
        }

        const expense = makeExpense(tx, payer, 'equal', splits);
        expenses.push(expense);
      }

      const balances = calculateBalances(participants, expenses, []);

      expect(balances.length).toBe(10);

      // Each person pays 2 expenses ($200) and owes $200 (20 expenses × $10)
      // So everyone should be balanced
      for (const balance of balances) {
        expect(balance.totalPaidCents).toBe(20000);
        expect(balance.totalOwedCents).toBe(20000);
        expect(balance.netBalanceCents).toBe(0);
      }
    });

    test('Decimal precision with small amounts', () => {
      const alice = makeParticipant('Alice');
      const bob = makeParticipant('Bob');
      const charlie = makeParticipant('Charlie');
      const participants = [alice, bob, charlie];

      // $0.01 (1 cent) - with "split" where only Alice owes
      const tx = makeTransaction(1, 'Penny');
      const expense = makeExpense(tx, alice, 'equal', {
        [alice.id]: 1,
        [bob.id]: 0,
        [charlie.id]: 0,
      });

      const balances = calculateBalances(participants, [expense], []);

      // Should handle small amounts without precision errors
      const aliceBalance = balances.find(b => b.participantId === alice.id);
      expect(aliceBalance?.totalPaidCents).toBe(1);
    });
  });

  describe('simplifyDebts', () => {
    test('Simple two-person case', () => {
      const alice = makeParticipant('Alice', true);
      const bob = makeParticipant('Bob');
      const participants = [alice, bob];

      const balances: ParticipantBalance[] = [
        {
          id: uuidv4(),
          participantId: alice.id,
          participantName: 'Alice',
          isCurrentUser: true,
          totalPaidCents: 10000,
          totalOwedCents: 5000,
          netBalanceCents: 5000, // Alice is owed $50
        },
        {
          id: uuidv4(),
          participantId: bob.id,
          participantName: 'Bob',
          isCurrentUser: false,
          totalPaidCents: 0,
          totalOwedCents: 5000,
          netBalanceCents: -5000, // Bob owes $50
        },
      ];

      const debts = simplifyDebts(participants, balances);

      expect(debts.length).toBe(1);
      expect(debts[0].fromParticipant.id).toBe(bob.id);
      expect(debts[0].toParticipant.id).toBe(alice.id);
      expect(debts[0].amountCents).toBe(5000);
    });

    test('Three person chain', () => {
      const alice = makeParticipant('Alice');
      const bob = makeParticipant('Bob');
      const charlie = makeParticipant('Charlie');
      const participants = [alice, bob, charlie];

      // Alice is owed $60, Bob is owed $20, Charlie owes $80
      const balances: ParticipantBalance[] = [
        {
          id: uuidv4(),
          participantId: alice.id,
          participantName: 'Alice',
          isCurrentUser: false,
          totalPaidCents: 10000,
          totalOwedCents: 4000,
          netBalanceCents: 6000,
        },
        {
          id: uuidv4(),
          participantId: bob.id,
          participantName: 'Bob',
          isCurrentUser: false,
          totalPaidCents: 5000,
          totalOwedCents: 3000,
          netBalanceCents: 2000,
        },
        {
          id: uuidv4(),
          participantId: charlie.id,
          participantName: 'Charlie',
          isCurrentUser: false,
          totalPaidCents: 0,
          totalOwedCents: 8000,
          netBalanceCents: -8000,
        },
      ];

      const debts = simplifyDebts(participants, balances);

      // Charlie owes $80 total
      // Should be simplified to 2 payments max: Charlie → Alice ($60), Charlie → Bob ($20)
      expect(debts.length).toBeLessThanOrEqual(2);

      const totalOwed = debts.reduce((sum, d) => sum + d.amountCents, 0);
      expect(totalOwed).toBe(8000);
    });

    test('All balanced returns empty', () => {
      const alice = makeParticipant('Alice');
      const bob = makeParticipant('Bob');
      const participants = [alice, bob];

      const balances: ParticipantBalance[] = [
        {
          id: uuidv4(),
          participantId: alice.id,
          participantName: 'Alice',
          isCurrentUser: false,
          totalPaidCents: 5000,
          totalOwedCents: 5000,
          netBalanceCents: 0,
        },
        {
          id: uuidv4(),
          participantId: bob.id,
          participantName: 'Bob',
          isCurrentUser: false,
          totalPaidCents: 5000,
          totalOwedCents: 5000,
          netBalanceCents: 0,
        },
      ];

      const debts = simplifyDebts(participants, balances);

      expect(debts.length).toBe(0);
    });

    test('Four person complex case', () => {
      const p1 = makeParticipant('P1');
      const p2 = makeParticipant('P2');
      const p3 = makeParticipant('P3');
      const p4 = makeParticipant('P4');
      const participants = [p1, p2, p3, p4];

      // P1: +40, P2: +10, P3: -30, P4: -20
      const balances: ParticipantBalance[] = [
        {
          id: uuidv4(),
          participantId: p1.id,
          participantName: 'P1',
          isCurrentUser: false,
          totalPaidCents: 8000,
          totalOwedCents: 4000,
          netBalanceCents: 4000,
        },
        {
          id: uuidv4(),
          participantId: p2.id,
          participantName: 'P2',
          isCurrentUser: false,
          totalPaidCents: 3000,
          totalOwedCents: 2000,
          netBalanceCents: 1000,
        },
        {
          id: uuidv4(),
          participantId: p3.id,
          participantName: 'P3',
          isCurrentUser: false,
          totalPaidCents: 1000,
          totalOwedCents: 4000,
          netBalanceCents: -3000,
        },
        {
          id: uuidv4(),
          participantId: p4.id,
          participantName: 'P4',
          isCurrentUser: false,
          totalPaidCents: 0,
          totalOwedCents: 2000,
          netBalanceCents: -2000,
        },
      ];

      const debts = simplifyDebts(participants, balances);

      // Should minimize transactions - at most 3 transactions for 4 people
      expect(debts.length).toBeLessThanOrEqual(3);

      // Total debt should equal total credit (30 + 20 = 50)
      const totalDebts = debts.reduce((sum, d) => sum + d.amountCents, 0);
      expect(totalDebts).toBe(5000);
    });
  });

  describe('currentUserSummary', () => {
    test('User owes money', () => {
      const balances: ParticipantBalance[] = [
        {
          id: uuidv4(),
          participantId: uuidv4(),
          participantName: 'Me',
          isCurrentUser: true,
          totalPaidCents: 1000,
          totalOwedCents: 5000,
          netBalanceCents: -4000,
        },
      ];

      const summary = currentUserSummary(balances);

      expect(summary.owesCents).toBe(4000);
      expect(summary.getsBackCents).toBe(0);
    });

    test('User gets back money', () => {
      const balances: ParticipantBalance[] = [
        {
          id: uuidv4(),
          participantId: uuidv4(),
          participantName: 'Me',
          isCurrentUser: true,
          totalPaidCents: 10000,
          totalOwedCents: 3000,
          netBalanceCents: 7000,
        },
      ];

      const summary = currentUserSummary(balances);

      expect(summary.owesCents).toBe(0);
      expect(summary.getsBackCents).toBe(7000);
    });

    test('User is settled', () => {
      const balances: ParticipantBalance[] = [
        {
          id: uuidv4(),
          participantId: uuidv4(),
          participantName: 'Me',
          isCurrentUser: true,
          totalPaidCents: 5000,
          totalOwedCents: 5000,
          netBalanceCents: 0,
        },
      ];

      const summary = currentUserSummary(balances);

      expect(summary.owesCents).toBe(0);
      expect(summary.getsBackCents).toBe(0);
    });

    test('No current user returns zeros', () => {
      const balances: ParticipantBalance[] = [
        {
          id: uuidv4(),
          participantId: uuidv4(),
          participantName: 'Alice',
          isCurrentUser: false,
          totalPaidCents: 10000,
          totalOwedCents: 3000,
          netBalanceCents: 7000,
        },
      ];

      const summary = currentUserSummary(balances);

      expect(summary.owesCents).toBe(0);
      expect(summary.getsBackCents).toBe(0);
    });
  });

  describe('getDisplayName', () => {
    test('Returns "You" for current user', () => {
      const balance: ParticipantBalance = {
        id: uuidv4(),
        participantId: uuidv4(),
        participantName: 'Alice',
        isCurrentUser: true,
        totalPaidCents: 0,
        totalOwedCents: 0,
        netBalanceCents: 0,
      };

      expect(getDisplayName(balance)).toBe('You');
    });

    test('Returns name for non-current user', () => {
      const balance: ParticipantBalance = {
        id: uuidv4(),
        participantId: uuidv4(),
        participantName: 'Bob',
        isCurrentUser: false,
        totalPaidCents: 0,
        totalOwedCents: 0,
        netBalanceCents: 0,
      };

      expect(getDisplayName(balance)).toBe('Bob');
    });
  });

  describe('getOwesOrGets', () => {
    test('Returns "owes" for negative balance', () => {
      const balance: ParticipantBalance = {
        id: uuidv4(),
        participantId: uuidv4(),
        participantName: 'A',
        isCurrentUser: false,
        totalPaidCents: 0,
        totalOwedCents: 5000,
        netBalanceCents: -5000,
      };

      expect(getOwesOrGets(balance)).toBe('owes');
    });

    test('Returns "gets back" for positive balance', () => {
      const balance: ParticipantBalance = {
        id: uuidv4(),
        participantId: uuidv4(),
        participantName: 'B',
        isCurrentUser: false,
        totalPaidCents: 10000,
        totalOwedCents: 5000,
        netBalanceCents: 5000,
      };

      expect(getOwesOrGets(balance)).toBe('gets back');
    });

    test('Returns "settled" for zero balance', () => {
      const balance: ParticipantBalance = {
        id: uuidv4(),
        participantId: uuidv4(),
        participantName: 'C',
        isCurrentUser: false,
        totalPaidCents: 5000,
        totalOwedCents: 5000,
        netBalanceCents: 0,
      };

      expect(getOwesOrGets(balance)).toBe('settled');
    });
  });

  describe('detailedDebts', () => {
    test('Returns correct debt breakdown', () => {
      const alice = makeParticipant('Alice');
      const bob = makeParticipant('Bob');
      const charlie = makeParticipant('Charlie');
      const participants = [alice, bob, charlie];

      // Alice pays $90, split equally
      const tx = makeTransaction(9000, 'Dinner');
      const expense = makeExpense(tx, alice, 'equal', {
        [alice.id]: 3000,
        [bob.id]: 3000,
        [charlie.id]: 3000,
      });

      const debts = detailedDebts(participants, [expense]);

      // Bob and Charlie each owe Alice $30
      expect(debts[alice.id]).toBeDefined();
      expect(debts[alice.id][bob.id]).toBe(3000);
      expect(debts[alice.id][charlie.id]).toBe(3000);
      // Alice doesn't owe herself
      expect(debts[alice.id][alice.id]).toBeUndefined();
    });

    test('Aggregates multiple expenses', () => {
      const alice = makeParticipant('Alice');
      const bob = makeParticipant('Bob');
      const participants = [alice, bob];

      // Alice pays $100 first
      const tx1 = makeTransaction(10000, 'Dinner');
      const expense1 = makeExpense(tx1, alice, 'equal', {
        [alice.id]: 5000,
        [bob.id]: 5000,
      });

      // Alice pays $50 second
      const tx2 = makeTransaction(5000, 'Drinks');
      const expense2 = makeExpense(tx2, alice, 'equal', {
        [alice.id]: 2500,
        [bob.id]: 2500,
      });

      const debts = detailedDebts(participants, [expense1, expense2]);

      // Bob owes Alice $50 + $25 = $75 (7500 cents)
      expect(debts[alice.id][bob.id]).toBe(7500);
    });

    test('Returns empty for no expenses', () => {
      const alice = makeParticipant('Alice');
      const debts = detailedDebts([alice], []);

      expect(Object.keys(debts).length).toBe(0);
    });
  });
});
