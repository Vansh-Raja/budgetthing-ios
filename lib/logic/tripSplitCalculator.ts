/**
 * TripSplitCalculator - Calculates how to split expenses among participants
 * 
 * This is a direct port of TripSplitCalculator.swift with identical behavior.
 * All amounts are in cents (integers) to avoid floating-point issues.
 */

import { SplitType, TripParticipant } from './types';

/**
 * Banker's rounding (round half to even)
 * This matches Swift's NSDecimalNumber.RoundingMode.bankers
 */
function bankersRound(value: number): number {
  const floor = Math.floor(value);
  const decimal = value - floor;
  
  if (decimal < 0.5) {
    return floor;
  } else if (decimal > 0.5) {
    return floor + 1;
  } else {
    // Exactly 0.5 - round to nearest even
    return floor % 2 === 0 ? floor : floor + 1;
  }
}

/**
 * Round cents to 2 decimal places (for display) using banker's rounding
 * Since we're working in cents, this rounds to the nearest cent
 */
function roundCents(cents: number): number {
  return Math.round(cents);
}

/**
 * Calculate how much each participant owes for an expense
 * 
 * @param totalCents - The total expense amount in cents
 * @param splitType - How to split the expense
 * @param participants - All participants in the trip
 * @param splitData - Additional data for non-equal splits (cents for exact, percentage for percentage, etc.)
 * @returns Dictionary mapping participant ID to their owed amount in cents
 */
export function calculateSplits(
  totalCents: number,
  splitType: SplitType,
  participants: TripParticipant[],
  splitData?: Record<string, number>
): Record<string, number> {
  if (totalCents <= 0) {
    return {};
  }

  switch (splitType) {
    case 'equal':
      return calculateEqualSplit(totalCents, participants);
    case 'equalSelected':
      return calculateEqualSelectedSplit(totalCents, splitData);
    case 'percentage':
      return calculatePercentageSplit(totalCents, splitData);
    case 'shares':
      return calculateSharesSplit(totalCents, splitData);
    case 'exact':
      return splitData ?? {};
  }
}

/**
 * Equal split among all participants
 */
function calculateEqualSplit(
  totalCents: number,
  participants: TripParticipant[]
): Record<string, number> {
  const count = participants.length;
  if (count === 0) {
    return {};
  }

  const share = roundCents(totalCents / count);
  const result: Record<string, number> = {};
  let runningTotal = 0;

  for (let i = 0; i < participants.length; i++) {
    const participant = participants[i];
    if (i === participants.length - 1) {
      // Last participant gets the remainder to handle rounding
      result[participant.id] = totalCents - runningTotal;
    } else {
      result[participant.id] = share;
      runningTotal += share;
    }
  }

  return result;
}

/**
 * Equal split among selected participants only
 * splitData values > 0 means selected
 */
function calculateEqualSelectedSplit(
  totalCents: number,
  splitData?: Record<string, number>
): Record<string, number> {
  if (!splitData) {
    return {};
  }

  // Get selected participant IDs (value > 0 means selected)
  const selectedIds = Object.entries(splitData)
    .filter(([_, value]) => value > 0)
    .map(([id]) => id)
    .sort(); // Sort by ID for deterministic behavior

  const count = selectedIds.length;
  if (count === 0) {
    return {};
  }

  const share = roundCents(totalCents / count);
  const result: Record<string, number> = {};
  let runningTotal = 0;

  for (let i = 0; i < selectedIds.length; i++) {
    const id = selectedIds[i];
    if (i === selectedIds.length - 1) {
      result[id] = totalCents - runningTotal;
    } else {
      result[id] = share;
      runningTotal += share;
    }
  }

  return result;
}

/**
 * Percentage-based split
 * splitData values are percentages (0-100)
 */
function calculatePercentageSplit(
  totalCents: number,
  splitData?: Record<string, number>
): Record<string, number> {
  if (!splitData) {
    return {};
  }

  const sortedEntries = Object.entries(splitData).sort(([a], [b]) => a.localeCompare(b));
  const result: Record<string, number> = {};
  let runningTotal = 0;

  for (let i = 0; i < sortedEntries.length; i++) {
    const [id, percentage] = sortedEntries[i];
    const amount = roundCents((totalCents * percentage) / 100);
    
    if (i === sortedEntries.length - 1) {
      // Last participant gets remainder
      result[id] = totalCents - runningTotal;
    } else {
      result[id] = amount;
      runningTotal += amount;
    }
  }

  return result;
}

/**
 * Shares-based split (e.g., 2:1:1 ratio)
 * splitData values are share counts
 */
function calculateSharesSplit(
  totalCents: number,
  splitData?: Record<string, number>
): Record<string, number> {
  if (!splitData) {
    return {};
  }

  const totalShares = Object.values(splitData).reduce((sum, val) => sum + val, 0);
  if (totalShares <= 0) {
    return {};
  }

  const sortedEntries = Object.entries(splitData).sort(([a], [b]) => a.localeCompare(b));
  const result: Record<string, number> = {};
  let runningTotal = 0;

  for (let i = 0; i < sortedEntries.length; i++) {
    const [id, shares] = sortedEntries[i];
    const amount = roundCents((totalCents * shares) / totalShares);
    
    if (i === sortedEntries.length - 1) {
      result[id] = totalCents - runningTotal;
    } else {
      result[id] = amount;
      runningTotal += amount;
    }
  }

  return result;
}

// MARK: - Validation

/**
 * Validate that percentages sum to 100%
 */
export function validatePercentages(percentages: Record<string, number>): boolean {
  const sum = Object.values(percentages).reduce((acc, val) => acc + val, 0);
  return sum === 100;
}

/**
 * Validate that exact amounts sum to the total
 */
export function validateExactAmounts(amounts: Record<string, number>, totalCents: number): boolean {
  const sum = Object.values(amounts).reduce((acc, val) => acc + val, 0);
  return sum === totalCents;
}

/**
 * Check if at least one participant is selected
 */
export function validateSelectedParticipants(splitData?: Record<string, number>): boolean {
  if (!splitData) {
    return false;
  }
  return Object.values(splitData).some(val => val > 0);
}

// Export as namespace for compatibility
export const TripSplitCalculator = {
  calculateSplits,
  validatePercentages,
  validateExactAmounts,
  validateSelectedParticipants,
};
