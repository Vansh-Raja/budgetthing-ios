/**
 * TripSplitCalculator Tests
 * 
 * Ported from TripSplitCalculatorTests.swift with identical test cases.
 * All amounts are in cents.
 */

import { v4 as uuidv4 } from 'uuid';
import {
  calculateSplits,
  validatePercentages,
  validateExactAmounts,
  validateSelectedParticipants,
} from '../tripSplitCalculator';
import { TripParticipant } from '../types';

// Helper to create test participants
function makeParticipant(name: string = 'Test', id?: string): TripParticipant {
  const now = Date.now();
  return {
    id: id ?? uuidv4(),
    tripId: 'test-trip',
    name,
    isCurrentUser: false,
    createdAtMs: now,
    updatedAtMs: now,
  };
}

describe('TripSplitCalculator', () => {
  describe('Equal Split', () => {
    it('should split equally with 2 participants', () => {
      const p1 = makeParticipant('Alice');
      const p2 = makeParticipant('Bob');
      const participants = [p1, p2];

      const result = calculateSplits(10000, 'equal', participants); // $100.00

      expect(Object.keys(result)).toHaveLength(2);
      expect(result[p1.id]).toBe(5000);
      expect(result[p2.id]).toBe(5000);
    });

    it('should handle rounding with 3 participants', () => {
      const p1 = makeParticipant('Alice');
      const p2 = makeParticipant('Bob');
      const p3 = makeParticipant('Charlie');
      const participants = [p1, p2, p3];

      const result = calculateSplits(10000, 'equal', participants); // $100.00

      expect(Object.keys(result)).toHaveLength(3);

      // Sum should equal exactly 10000
      const sum = Object.values(result).reduce((acc, val) => acc + val, 0);
      expect(sum).toBe(10000);

      // Each share should be approximately 3333
      for (const amount of Object.values(result)) {
        expect(amount).toBeGreaterThanOrEqual(3333);
        expect(amount).toBeLessThanOrEqual(3334);
      }
    });

    it('should give full amount to single participant', () => {
      const p1 = makeParticipant('Alice');
      const participants = [p1];

      const result = calculateSplits(10000, 'equal', participants);

      expect(Object.keys(result)).toHaveLength(1);
      expect(result[p1.id]).toBe(10000);
    });

    it('should return empty for zero total', () => {
      const p1 = makeParticipant('Alice');
      const p2 = makeParticipant('Bob');
      const participants = [p1, p2];

      const result = calculateSplits(0, 'equal', participants);

      expect(result).toEqual({});
    });

    it('should return empty for no participants', () => {
      const result = calculateSplits(10000, 'equal', []);

      expect(result).toEqual({});
    });

    it('should handle odd amount with 4 participants', () => {
      const p1 = makeParticipant('A');
      const p2 = makeParticipant('B');
      const p3 = makeParticipant('C');
      const p4 = makeParticipant('D');
      const participants = [p1, p2, p3, p4];

      const result = calculateSplits(9999, 'equal', participants); // $99.99

      // Sum must equal exactly 9999
      const sum = Object.values(result).reduce((acc, val) => acc + val, 0);
      expect(sum).toBe(9999);
    });
  });

  describe('Equal Selected Split', () => {
    it('should split among selected participants only', () => {
      const p1 = makeParticipant('Alice');
      const p2 = makeParticipant('Bob');
      const p3 = makeParticipant('Charlie');
      const p4 = makeParticipant('Diana');

      // Only p1 and p3 selected (value > 0 means selected)
      const splitData: Record<string, number> = {
        [p1.id]: 1,
        [p2.id]: 0,
        [p3.id]: 1,
        [p4.id]: 0,
      };

      const result = calculateSplits(10000, 'equalSelected', [p1, p2, p3, p4], splitData);

      expect(Object.keys(result)).toHaveLength(2);
      expect(result[p1.id]).toBe(5000);
      expect(result[p3.id]).toBe(5000);
      expect(result[p2.id]).toBeUndefined();
      expect(result[p4.id]).toBeUndefined();
    });

    it('should return empty when none selected', () => {
      const p1 = makeParticipant('Alice');
      const splitData: Record<string, number> = { [p1.id]: 0 };

      const result = calculateSplits(10000, 'equalSelected', [p1], splitData);

      expect(result).toEqual({});
    });

    it('should return empty with nil splitData', () => {
      const p1 = makeParticipant('Alice');

      const result = calculateSplits(10000, 'equalSelected', [p1], undefined);

      expect(result).toEqual({});
    });
  });

  describe('Percentage Split', () => {
    it('should split by percentages', () => {
      const p1 = makeParticipant('Alice');
      const p2 = makeParticipant('Bob');

      const splitData: Record<string, number> = {
        [p1.id]: 60,
        [p2.id]: 40,
      };

      const result = calculateSplits(10000, 'percentage', [p1, p2], splitData);

      const sum = Object.values(result).reduce((acc, val) => acc + val, 0);
      expect(sum).toBe(10000);
    });

    it('should handle three-way percentage with rounding', () => {
      const p1 = makeParticipant('A');
      const p2 = makeParticipant('B');
      const p3 = makeParticipant('C');

      const splitData: Record<string, number> = {
        [p1.id]: 33.33,
        [p2.id]: 33.33,
        [p3.id]: 33.34,
      };

      const result = calculateSplits(10000, 'percentage', [p1, p2, p3], splitData);

      // Sum must equal exactly 10000
      const sum = Object.values(result).reduce((acc, val) => acc + val, 0);
      expect(sum).toBe(10000);
    });

    it('should return empty with nil data', () => {
      const result = calculateSplits(10000, 'percentage', [], undefined);

      expect(result).toEqual({});
    });
  });

  describe('Shares Split', () => {
    it('should split by shares ratio 2:1:1', () => {
      const p1 = makeParticipant('Alice');
      const p2 = makeParticipant('Bob');
      const p3 = makeParticipant('Charlie');

      const splitData: Record<string, number> = {
        [p1.id]: 2,
        [p2.id]: 1,
        [p3.id]: 1,
      };

      const result = calculateSplits(10000, 'shares', [p1, p2, p3], splitData);

      // Sum must equal exactly 10000
      const sum = Object.values(result).reduce((acc, val) => acc + val, 0);
      expect(sum).toBe(10000);

      // p1 should get 50% (2/4 shares)
      expect(result[p1.id]).toBe(5000);
    });

    it('should handle odd amounts with shares', () => {
      const p1 = makeParticipant('A');
      const p2 = makeParticipant('B');
      const p3 = makeParticipant('C');

      const splitData: Record<string, number> = {
        [p1.id]: 3,
        [p2.id]: 2,
        [p3.id]: 1,
      };

      const result = calculateSplits(9999, 'shares', [p1, p2, p3], splitData);

      // Sum must equal exactly 9999
      const sum = Object.values(result).reduce((acc, val) => acc + val, 0);
      expect(sum).toBe(9999);
    });

    it('should return empty with zero shares', () => {
      const p1 = makeParticipant('Alice');
      const splitData: Record<string, number> = { [p1.id]: 0 };

      const result = calculateSplits(10000, 'shares', [p1], splitData);

      expect(result).toEqual({});
    });
  });

  describe('Exact Split', () => {
    it('should pass through exact amounts', () => {
      const p1 = makeParticipant('Alice');
      const p2 = makeParticipant('Bob');

      const splitData: Record<string, number> = {
        [p1.id]: 7500,
        [p2.id]: 2500,
      };

      const result = calculateSplits(10000, 'exact', [p1, p2], splitData);

      expect(result[p1.id]).toBe(7500);
      expect(result[p2.id]).toBe(2500);
    });

    it('should return empty with nil data', () => {
      const result = calculateSplits(10000, 'exact', [], undefined);

      expect(result).toEqual({});
    });
  });

  describe('Validation', () => {
    it('should validate percentages summing to 100', () => {
      const valid = { a: 60, b: 40 };
      const invalid = { a: 60, b: 30 };
      const over100 = { a: 60, b: 50 };

      expect(validatePercentages(valid)).toBe(true);
      expect(validatePercentages(invalid)).toBe(false);
      expect(validatePercentages(over100)).toBe(false);
    });

    it('should validate exact amounts', () => {
      const valid = { a: 7500, b: 2500 };
      const invalid = { a: 7500, b: 2000 };

      expect(validateExactAmounts(valid, 10000)).toBe(true);
      expect(validateExactAmounts(invalid, 10000)).toBe(false);
    });

    it('should validate selected participants', () => {
      const valid = { a: 1, b: 0 };
      const noneSelected = { a: 0, b: 0 };

      expect(validateSelectedParticipants(valid)).toBe(true);
      expect(validateSelectedParticipants(noneSelected)).toBe(false);
      expect(validateSelectedParticipants(undefined)).toBe(false);
    });
  });

  describe('Edge Cases', () => {
    it('should handle large amounts correctly', () => {
      const p1 = makeParticipant('A');
      const p2 = makeParticipant('B');
      const participants = [p1, p2];

      const largeAmount = 99999999; // $999,999.99

      const result = calculateSplits(largeAmount, 'equal', participants);

      const sum = Object.values(result).reduce((acc, val) => acc + val, 0);
      expect(sum).toBe(largeAmount);
    });

    it('should handle very small amounts correctly', () => {
      const p1 = makeParticipant('A');
      const p2 = makeParticipant('B');
      const participants = [p1, p2];

      const smallAmount = 1; // $0.01

      const result = calculateSplits(smallAmount, 'equal', participants);

      const sum = Object.values(result).reduce((acc, val) => acc + val, 0);
      expect(sum).toBe(smallAmount);
    });

    it('should return empty for negative amounts', () => {
      const p1 = makeParticipant('A');

      const result = calculateSplits(-10000, 'equal', [p1]);

      expect(result).toEqual({});
    });
  });
});
