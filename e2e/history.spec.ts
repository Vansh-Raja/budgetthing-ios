import { expect, test } from '@playwright/test';
import { PRIMARY_TEST_EMAIL, signIn } from './helpers/clerk';
import { confirmPopup, convexMutation, convexQuery } from './helpers/app';

/** Item 2: version history and undo, driven through the web UI. */
test.describe('History & undo', () => {
  test.setTimeout(180_000);

  test('an edit shows in History & undo; Undo restores the previous amount as a new version', async ({ page }) => {
    await signIn(page, PRIMARY_TEST_EMAIL);
    const run = Date.now().toString(36).slice(-5);
    const acct: any = await convexMutation(page, 'pwaPersonal:createAccount', { name: `Hist ${run}`, emoji: '💵', kind: 'cash', openingBalanceCents: 0 });
    let txId: string | undefined;
    try {
      const tx: any = await convexMutation(page, 'pwaLedger:createTransaction', { amountCents: 1111, date: Date.now(), type: 'expense', accountId: acct.id, note: `hist ${run}` });
      txId = tx.id;
      await convexMutation(page, 'pwaLedger:updateTransaction', { id: tx.id, amountCents: 2222 });

      await page.goto('/settings/history');
      await expect(page.getByTestId('history-screen')).toBeVisible({ timeout: 30_000 });
      const editEntry = page.getByTestId('history-entry').filter({ hasText: `hist ${run}` }).filter({ hasText: 'Edited' }).first();
      await expect(editEntry).toBeVisible({ timeout: 20_000 });
      await expect(editEntry).toContainText('Web app');
      await editEntry.getByRole('button', { name: 'Undo this change' }).click();
      await confirmPopup(page, 'Undo');

      await expect.poll(async () => ((await convexQuery(page, 'pwaPersonal:getSnapshot')).transactions as any[]).find((x) => x.id === tx.id)?.amountCents, { timeout: 15_000 }).toBe(1111);
      const history: any[] = await convexQuery(page, 'history:forEntity', { entityTable: 'transactions', entityId: tx.id });
      expect(history.map((h) => h.action)).toEqual(['update', 'update', 'create']);
      expect(history[0].reason).toMatch(/^restore state before update/);
    } finally {
      if (txId) await convexMutation(page, 'pwaLedger:deleteTransaction', { id: txId }).catch(() => undefined);
      await convexMutation(page, 'pwaPersonal:archiveAccount', { id: acct.id }).catch(() => undefined);
    }
  });
});
