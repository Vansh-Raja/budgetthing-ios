import { Trip, TripExpense, TripParticipant, Transaction, TripSettlement } from '../logic/types';

// Mock Participants
export const PARTICIPANTS: Record<string, TripParticipant[]> = {
  't1': [
    { id: 'p1', tripId: 't1', name: 'Me', isCurrentUser: true, colorHex: 'FF9500', createdAtMs: 0, updatedAtMs: 0 },
    { id: 'p2', tripId: 't1', name: 'Rahul', isCurrentUser: false, colorHex: '5856D6', createdAtMs: 0, updatedAtMs: 0 },
    { id: 'p3', tripId: 't1', name: 'Sneha', isCurrentUser: false, colorHex: 'FF2D55', createdAtMs: 0, updatedAtMs: 0 },
  ]
};

// Mock Transactions for Expenses
const TX_1: Transaction = { id: 'tx1', amountCents: -150000, date: Date.now() - 86400000 * 2, type: 'expense', note: 'Flight Booking', createdAtMs: 0, updatedAtMs: 0 }; // ₹1,500
const TX_2: Transaction = { id: 'tx2', amountCents: -450000, date: Date.now() - 86400000, type: 'expense', note: 'Airbnb', createdAtMs: 0, updatedAtMs: 0 }; // ₹4,500
const TX_3: Transaction = { id: 'tx3', amountCents: -120000, date: Date.now(), type: 'expense', note: 'Dinner', createdAtMs: 0, updatedAtMs: 0 }; // ₹1,200

// Mock Expenses
export const EXPENSES: Record<string, TripExpense[]> = {
  't1': [
    {
      id: 'e1', tripId: 't1', transactionId: 'tx1', splitType: 'equal', 
      transaction: TX_1, 
      paidByParticipant: PARTICIPANTS['t1'][0], // Me paid
      createdAtMs: 0, updatedAtMs: 0 
    },
    {
      id: 'e2', tripId: 't1', transactionId: 'tx2', splitType: 'equal', 
      transaction: TX_2, 
      paidByParticipant: PARTICIPANTS['t1'][1], // Rahul paid
      createdAtMs: 0, updatedAtMs: 0 
    },
    {
      id: 'e3', tripId: 't1', transactionId: 'tx3', splitType: 'equal', 
      transaction: TX_3, 
      paidByParticipant: PARTICIPANTS['t1'][0], // Me paid
      createdAtMs: 0, updatedAtMs: 0 
    },
  ]
};

export const MOCK_TRIPS: Trip[] = [
  {
    id: 't1',
    name: 'Goa 2026',
    emoji: '🌴',
    isGroup: true,
    isArchived: false,
    startDate: Date.now() - 86400000 * 2,
    endDate: Date.now() + 86400000 * 5,
    budgetCents: 5000000, // ₹50,000
    createdAtMs: 0,
    updatedAtMs: 0,
    participants: PARTICIPANTS['t1'],
    expenses: EXPENSES['t1'],
    settlements: [],
  },
  {
    id: 't2',
    name: 'Manali Weekend',
    emoji: '🏔️',
    isGroup: false,
    isArchived: false,
    budgetCents: 1500000, // ₹15,000
    createdAtMs: 0,
    updatedAtMs: 0,
    expenses: [],
  },
  {
    id: 't3',
    name: 'Thailand Trip',
    emoji: '🇹🇭',
    isGroup: true,
    isArchived: true,
    startDate: Date.now() - 86400000 * 365,
    endDate: Date.now() - 86400000 * 360,
    budgetCents: 8000000, // ₹80,000
    createdAtMs: 0,
    updatedAtMs: 0,
    expenses: [],
  },
];
