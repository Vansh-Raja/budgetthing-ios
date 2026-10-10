import { expect, test } from '@playwright/test';
import { PRIMARY_TEST_EMAIL, SECONDARY_TEST_EMAIL, signIn } from './helpers/clerk';
import { activePage, convexMutation, convexQuery, nativePull, openTab, pressKeys } from './helpers/app';

/**
 * Trip accounting on phone web. Ledger vs cashflow rules (rules.md) are
 * verified against the canonical server and the native pull protocol; derived
 * rows must never be persisted.
 */
test.describe('Local group trips', () => {
  test.setTimeout(240_000);

  test('create group trip → add split expense → ledger share + cashflow virtual → settlement → delete', async ({ page }) => {
    await signIn(page, PRIMARY_TEST_EMAIL);
    const run = Date.now().toString(36).slice(-5);
    const settingsBefore: any = await convexQuery(page, 'pwaPersonal:getSettings');
    let defaultAccountId: string = settingsBefore.defaultAccountId;
    if (!defaultAccountId) {
      const acct: any = await convexMutation(page, 'pwaPersonal:createAccount', { name: `Cash ${run}`, emoji: '💵', kind: 'cash', openingBalanceCents: 100_000 });
      await convexMutation(page, 'pwaPersonal:updateSettings', { defaultAccountId: acct.id });
      defaultAccountId = acct.id;
    }
    const balanceBefore = (await convexQuery(page, 'pwaPersonal:listAccounts')).find((a: any) => a.id === defaultAccountId).balanceCents;

    // ---- New local group trip through the UI ----
    await openTab(page, 3);
    await activePage(page).getByRole('button', { name: 'New trip' }).click();
    await page.getByText('Local Trip', { exact: true }).click();
    await expect(page.getByText('New Trip', { exact: true })).toBeVisible();
    await page.getByPlaceholder('e.g., Goa 2026').fill(`Trip ${run}`);
    await page.getByText('Group', { exact: true }).click();
    await page.getByPlaceholder('Add participant...').fill('Sam');
    await page.getByRole('button', { name: 'Add participant' }).click();
    await page.getByText('Save', { exact: true }).click();
    await expect(activePage(page).getByText(`Trip ${run}`)).toBeVisible({ timeout: 15_000 });

    const trips: any[] = await convexQuery(page, 'pwaTrips:listTrips', { includeArchived: true });
    const trip = trips.find((t) => t.name === `Trip ${run}`);
    expect(trip).toBeTruthy();
    expect(trip.isGroup).toBe(true);
    expect(trip.participants.filter((p: any) => p.isCurrentUser)).toHaveLength(1); // LOCAL_TRIP_HAS_CURRENT_USER
    expect(trip.participants.map((p: any) => p.name).sort()).toEqual(['Sam', 'You']);
    const me = trip.participants.find((p: any) => p.isCurrentUser);
    const sam = trip.participants.find((p: any) => !p.isCurrentUser);

    // ---- Add an equal-split expense paid by me from the calculator with this trip selected ----
    await openTab(page, 0);
    await activePage(page).getByRole('button', { name: `Trip ${run}`, exact: true }).click();
    await activePage(page).getByLabel('C', { exact: true }).first().click();
    await pressKeys(page, '30');
    await activePage(page).getByRole('button', { name: 'Save', exact: true }).first().click();
    await expect(page.getByText('Split Options')).toBeVisible({ timeout: 15_000 });
    await page.getByText('Done', { exact: true }).click();

    // ---- Server: base ledger tx has no account; virtual rows only; balance charged by cashflow ----
    await expect.poll(async () => {
      const snap: any = await convexQuery(page, 'pwaPersonal:getSnapshot');
      return snap.derivedRows.filter((r: any) => r.tripId === trip.id).map((r: any) => r.systemType).sort();
    }, { timeout: 20_000 }).toEqual(['trip_cashflow', 'trip_share']);
    const snap: any = await convexQuery(page, 'pwaPersonal:getSnapshot');
    const link = snap.tripExpenseLinks.find((l: any) => l.tripId === trip.id);
    const baseTx = snap.transactions.find((t: any) => t.id === link.transactionId);
    expect(baseTx.amountCents).toBe(3000);
    expect(baseTx.accountId).toBeUndefined(); // TRIP_SHARE_LEDGER_ONLY
    const share = snap.derivedRows.find((r: any) => r.tripId === trip.id && r.systemType === 'trip_share');
    const cashflow = snap.derivedRows.find((r: any) => r.tripId === trip.id && r.systemType === 'trip_cashflow');
    expect(share.amountCents).toBe(1500);
    expect(cashflow.amountCents).toBe(3000); // CASHFLOW_ON_PAY
    expect(cashflow.accountId).toBe(defaultAccountId);
    const balanceAfterExpense = (await convexQuery(page, 'pwaPersonal:listAccounts')).find((a: any) => a.id === defaultAccountId).balanceCents;
    expect(balanceAfterExpense).toBe(balanceBefore - 3000);

    // Native pull: canonical trip rows present, no derived rows persisted.
    const pulled = await nativePull(page, 0);
    expect(pulled.trips.some((t: any) => t.id === trip.id)).toBe(true);
    expect(pulled.tripExpenses.some((e: any) => e.id === link.id)).toBe(true);
    expect(pulled.transactions.every((t: any) => !String(t.systemType ?? '').startsWith('trip_'))).toBe(true);

    // ---- Transactions tab shows the share row as "share · total" and hides payer cashflow ----
    await openTab(page, 1);
    await expect(activePage(page).getByText(/15\.00/).first()).toBeVisible({ timeout: 15_000 });
    await expect(activePage(page).getByText(/30\.00/).first()).toBeVisible();

    // ---- Settlement: Sam pays me → income on my account (SETTLEMENT_MOVES_MONEY) ----
    await convexMutation(page, 'pwaTrips:createSettlement', { tripId: trip.id, fromParticipantId: sam.id, toParticipantId: me.id, amountCents: 1500, date: Date.now() });
    await expect.poll(async () => (await convexQuery(page, 'pwaPersonal:listAccounts')).find((a: any) => a.id === defaultAccountId).balanceCents, { timeout: 20_000 })
      .toBe(balanceBefore - 3000 + 1500);
    // Repeating the same settlement within the idempotency window creates nothing new.
    await convexMutation(page, 'pwaTrips:createSettlement', { tripId: trip.id, fromParticipantId: sam.id, toParticipantId: me.id, amountCents: 1500, date: Date.now() });
    const after: any = await convexQuery(page, 'pwaTrips:getTrip', { id: trip.id });
    expect(after.settlements).toHaveLength(1);

    // ---- Delete the trip: derived rows vanish, base transaction survives unlinked, balance restored ----
    await convexMutation(page, 'pwaTrips:deleteTrip', { id: trip.id });
    await expect.poll(async () => {
      const s: any = await convexQuery(page, 'pwaPersonal:getSnapshot');
      return s.derivedRows.filter((r: any) => r.tripId === trip.id).length;
    }, { timeout: 20_000 }).toBe(0);
    const finalSnap: any = await convexQuery(page, 'pwaPersonal:getSnapshot');
    const survivor = finalSnap.transactions.find((t: any) => t.id === baseTx.id);
    expect(survivor).toBeTruthy();
    expect(survivor.tripExpenseId).toBeUndefined();
    expect(finalSnap.accounts.find((a: any) => a.id === defaultAccountId).balanceCents).toBe(balanceBefore);
    await convexMutation(page, 'pwaLedger:deleteTransaction', { id: baseTx.id });
  });
});

test.describe('Shared trips (two members)', () => {
  test.setTimeout(240_000);

  test('member A creates + invites, member B joins; expense splits, ACLs, and native trip pull converge', async ({ browser }) => {
    const ctxA = await browser.newContext({ colorScheme: 'dark' });
    const ctxB = await browser.newContext({ colorScheme: 'dark' });
    const a = await ctxA.newPage();
    const b = await ctxB.newPage();
    try {
      await signIn(a, PRIMARY_TEST_EMAIL);
      await signIn(b, SECONDARY_TEST_EMAIL);
      const run = Date.now().toString(36).slice(-5);

      const created: any = await convexMutation(a, 'sharedTrips:create', { name: `Shared ${run}`, emoji: '🏔️', participantName: 'Alice' });
      const invite: any = await convexMutation(a, 'sharedTripInvites:rotate', { tripId: created.tripId });
      expect(invite.code ?? invite).toBeTruthy();
      const code = typeof invite === 'string' ? invite : invite.code;

      // B cannot read before joining.
      await expect(convexQuery(b, 'pwaSharedTrips:getTrip', { tripId: created.tripId })).rejects.toThrow();
      await convexMutation(b, 'sharedTripInvites:joinByCode', { code, participantName: 'Bob' });

      // Both see the trip live in the Trips tab.
      await openTab(a, 3);
      await expect(activePage(a).getByText(`Shared ${run}`)).toBeVisible({ timeout: 20_000 });
      await openTab(b, 3);
      await expect(activePage(b).getByText(`Shared ${run}`)).toBeVisible({ timeout: 20_000 });

      const detailB: any = await convexQuery(b, 'pwaSharedTrips:getTrip', { tripId: created.tripId });
      const bob = detailB.participants.find((p: any) => p.id === detailB.myParticipantId);
      const alice = detailB.participants.find((p: any) => p.id !== detailB.myParticipantId);

      // A pays 40.00 split equally.
      const exp: any = await convexMutation(a, 'pwaSharedTrips:addExpense', { tripId: created.tripId, amountCents: 4000, dateMs: Date.now(), paidByParticipantId: alice.id, splitType: 'equal', note: `dinner ${run}` });
      expect(exp.computedSplits ?? JSON.parse(exp.computedSplitsJson)[bob.id]).toBeTruthy();

      // B's derived view: share only (non-payer); A's: share + cashflow.
      await expect.poll(async () => ((await convexQuery(b, 'pwaPersonal:getSnapshot')).derivedRows.filter((r: any) => r.tripId === created.tripId).map((r: any) => r.systemType).sort()), { timeout: 20_000 }).toEqual(['trip_share']);
      await expect.poll(async () => ((await convexQuery(a, 'pwaPersonal:getSnapshot')).derivedRows.filter((r: any) => r.tripId === created.tripId).map((r: any) => r.systemType).sort()), { timeout: 20_000 }).toEqual(['trip_cashflow', 'trip_share']);

      // Open the shared trip detail in B's browser; tabs render.
      await activePage(b).getByText(`Shared ${run}`).click();
      await expect(b.getByText('Balances', { exact: true })).toBeVisible({ timeout: 20_000 });

      // Native shared-trip protocol sees the web-created expense.
      const pulled: any = await convexQuery(a, 'sharedTripSync:pull', { tripId: created.tripId, lastSeq: 0 });
      expect(pulled.sharedTripExpenses.some((e: any) => e.id === exp.id)).toBe(true);
      expect(pulled.sharedTripParticipants.length).toBe(2);

      // Cleanup: A deletes the trip; B's view empties.
      await convexMutation(a, 'sharedTrips:deleteTrip', { tripId: created.tripId });
      await expect.poll(async () => (await convexQuery(b, 'pwaSharedTrips:listMine')).some((t: any) => t.id === created.tripId), { timeout: 20_000 }).toBe(false);
    } finally {
      await ctxA.close();
      await ctxB.close();
    }
  });
});
