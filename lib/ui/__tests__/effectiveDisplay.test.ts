import { buildTripExpenseMap, getEffectiveDisplayInfo } from '../effectiveDisplay';

const tx = (over: any) => ({ id: 't1', amountCents: -9000, type: 'expense', date: 0, createdAtMs: 0, updatedAtMs: 0, ...over });
const people = [
  { id: 'me', name: 'Me', isCurrentUser: true },
  { id: 'bob', name: 'Bob', isCurrentUser: false },
  { id: 'ann', name: 'Ann', isCurrentUser: false },
];

describe('effective display rules (shared by Transactions and the desktop pane)', () => {
  it('regular expenses and income keep their full amount', () => {
    const map = buildTripExpenseMap([]);
    expect(getEffectiveDisplayInfo(tx({}) as any, map)).toEqual({ amount: 9000, isIncome: false, shouldHide: false });
    expect(getEffectiveDisplayInfo(tx({ type: 'income', amountCents: 500 }) as any, map)).toEqual({ amount: 500, isIncome: true, shouldHide: false });
  });

  it('hides local group-trip base expenses (derived rows show them)', () => {
    const map = buildTripExpenseMap([{ id: 'g', name: 'G', emoji: '✈️', isGroup: true, participants: people, expenses: [{ transactionId: 't1', splitType: 'equal' }] }]);
    expect(getEffectiveDisplayInfo(tx({}) as any, map).shouldHide).toBe(true);
  });

  it('a solo-trip-style split shows only my share and what I get back', () => {
    const map = buildTripExpenseMap([{ id: 's', name: 'S', emoji: '🏖', isGroup: false, participants: people, expenses: [{ transactionId: 't1', splitType: 'equal', paidByParticipantId: 'me' }] }]);
    const info = getEffectiveDisplayInfo(tx({}) as any, map);
    expect(info.amount).toBe(3000);
    expect(info.isIncome).toBe(false);
    expect(info.netInfo?.text).toMatch(/get back/);
  });

  it("someone else's expense that excludes me is hidden", () => {
    const map = buildTripExpenseMap([{ id: 's', name: 'S', emoji: '🏖', isGroup: false, participants: people, expenses: [{ transactionId: 't1', splitType: 'exact', paidByParticipantId: 'bob', computedSplits: { bob: 4500, ann: 4500, me: 0 } }] }]);
    expect(getEffectiveDisplayInfo(tx({}) as any, map).shouldHide).toBe(true);
  });
});
