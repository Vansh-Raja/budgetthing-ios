/**
 * Core type definitions for BudgetThing
 * These mirror the SwiftData models from the iOS app
 */

// Split types for group trips
export type SplitType = 'equal' | 'equalSelected' | 'percentage' | 'shares' | 'exact';

// Transaction types
export type TransactionType = 'expense' | 'income';

// System transaction types
// Note: "trip_*" types are local-only derived rows for shared trips.
export type SystemType = 'transfer' | 'adjustment' | 'trip_share' | 'trip_cashflow' | 'trip_settlement' | null;

// Account kinds
export type AccountKind = 'cash' | 'card' | 'savings';

/**
 * Participant in a group trip
 */
export interface TripParticipant {
  id: string; // UUID
  tripId: string;
  name: string;
  isCurrentUser: boolean;
  colorHex?: string;
  linkedUserId?: string;
  createdAtMs: number;
  updatedAtMs: number;
  deletedAtMs?: number;
}

/**
 * Account for tracking money
 */
export interface Account {
  id: string;
  name: string;
  emoji: string;
  kind: AccountKind;
  sortIndex: number;
  openingBalanceCents?: number;
  limitAmountCents?: number;
  billingCycleDay?: number;
  createdAtMs: number;
  updatedAtMs: number;
  deletedAtMs?: number;
}

/**
 * Category for expenses
 */
export interface Category {
  id: string;
  name: string;
  emoji: string;
  sortIndex: number;
  monthlyBudgetCents?: number;
  isSystem: boolean;
  createdAtMs: number;
  updatedAtMs: number;
  deletedAtMs?: number;
}

/**
 * Financial transaction
 */
export interface Transaction {
  id: string;
  amountCents: number;
  date: number; // epoch ms
  note?: string;
  type: TransactionType;
  systemType?: SystemType;
  accountId?: string;
  categoryId?: string;
  transferFromAccountId?: string;
  transferToAccountId?: string;
  tripExpenseId?: string;
  sourceTripExpenseId?: string;
  sourceTripSettlementId?: string;
  createdAtMs: number;
  updatedAtMs: number;
  deletedAtMs?: number;
}

/**
 * Trip for tracking travel/event budgets
 */
export interface Trip {
  id: string;
  name: string;
  emoji: string;
  sortIndex: number;
  isGroup: boolean;
  isArchived: boolean;
  startDate?: number; // epoch ms
  endDate?: number;
  budgetCents?: number;
  createdAtMs: number;
  updatedAtMs: number;
  deletedAtMs?: number;
  // Runtime associations (not stored, computed)
  participants?: TripParticipant[];
  expenses?: TripExpense[];
  settlements?: TripSettlement[];
}

/**
 * Links a transaction to a trip with split info
 */
export interface TripExpense {
  id: string;
  tripId: string;
  transactionId: string;
  paidByParticipantId?: string;
  splitType: SplitType;
  splitData?: Record<string, number>; // participantId -> value (cents or percentage or shares)
  computedSplits?: Record<string, number>; // participantId -> cents owed
  createdAtMs: number;
  updatedAtMs: number;
  deletedAtMs?: number;

  // Shared trip category snapshot (v1)
  categoryName?: string;
  categoryEmoji?: string;

  // Runtime associations
  transaction?: Transaction;
  paidByParticipant?: TripParticipant;
  trip?: Trip;
}

/**
 * Settlement between participants
 */
export interface TripSettlement {
  id: string;
  tripId: string;
  fromParticipantId: string;
  toParticipantId: string;
  amountCents: number;
  date: number;
  note?: string;
  createdAtMs: number;
  updatedAtMs: number;
  deletedAtMs?: number;
  // Runtime associations
  fromParticipant?: TripParticipant;
  toParticipant?: TripParticipant;
}

/**
 * User settings (synced across devices)
 */
export interface UserSettings {
  currencyCode: string;
  hapticsEnabled: boolean;
  defaultAccountId?: string;
  hasSeenOnboarding: boolean;
  updatedAtMs: number;
}

/**
 * Balance info for a participant
 */
export interface ParticipantBalance {
  id: string;
  participantId: string;
  participantName: string;
  isCurrentUser: boolean;
  colorHex?: string;
  totalPaidCents: number;
  totalOwedCents: number;
  netBalanceCents: number; // Positive = owed money, Negative = owes money
}

/**
 * Debt relation between two participants
 */
export interface DebtRelation {
  id: string;
  fromParticipant: TripParticipant;
  toParticipant: TripParticipant;
  amountCents: number;
}

/**
 * Effective display info for a transaction
 */
export interface EffectiveDisplayInfo {
  amountCents: number;
  isIncome: boolean;
  shouldHide: boolean;
}

/**
 * Category spending breakdown
 */
export interface CategorySpending {
  id: string;
  category?: Category;
  amountCents: number;
  percentage: number;
  transactionCount: number;
}

/**
 * Trip summary statistics
 */
export interface TripSummary {
  totalSpentCents: number;
  dailyAverageCents: number;
  daysCount: number;
  budgetRemainingCents?: number;
  budgetPercentUsed?: number;
  expenseCount: number;
  participantCount: number;
}
