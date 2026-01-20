import { describe, expect, it } from '@jest/globals';

import type { TripParticipant } from '../types';
import {
  normalizeCurrentUserFlags,
  pickSingleCurrentUserParticipantId,
} from '../tripAccounting/currentUserParticipant';

function p(id: string, name: string, isCurrentUser: boolean): TripParticipant {
  return { id, tripId: 't', name, isCurrentUser, createdAtMs: 0, updatedAtMs: 0 };
}

describe('local trip current user invariant', () => {
  it('picks existing single current user', () => {
    const list = [p('a', 'You', true), p('b', 'Bob', false)];
    expect(pickSingleCurrentUserParticipantId(list)).toBe('a');
  });

  it('repairs missing current user by preferring name "You"', () => {
    const list = [p('a', 'You', false), p('b', 'Bob', false)];
    expect(pickSingleCurrentUserParticipantId(list)).toBe('a');
    const repaired = normalizeCurrentUserFlags(list);
    expect(repaired.filter((x) => x.isCurrentUser).map((x) => x.id)).toEqual(['a']);
  });

  it('repairs multiple current users by keeping one', () => {
    const list = [p('a', 'You', true), p('b', 'Bob', true)];
    const repaired = normalizeCurrentUserFlags(list);
    expect(repaired.filter((x) => x.isCurrentUser).length).toBe(1);
  });
});
