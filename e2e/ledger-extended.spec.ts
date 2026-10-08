import { expect, test, type Page } from '@playwright/test';
import { PRIMARY_TEST_EMAIL, signIn } from './helpers/clerk';
import { activePage, convexMutation, convexQuery, nativePull, openTab, pressKeys, uniqueAmount } from './helpers/app';

/**
 * Phase 4 coverage beyond the core flows: income, balance adjustment (with the
 * native system category), and the Transactions filter sheet.
 *
 * Each test cleans up in `finally` so a failure never leaves the shared test
 * user with stray rows or a changed default account.
 */

/** Best-effort cleanup: run every step even if an earlier one fails. */
async function cleanup(steps: Array<() => Promise<unknown>>) {
  for (const step of steps) await step().catch(() => undefined);
}

async function deleteTx(page: Page, id?: string) {
  if (id) await convexMutation(page, 'pwaLedger:deleteTransaction', { id });
}

test.describe('Personal ledger: income, adjustment, filters', () => {
  test.setTimeout(180_000);

  test('income via calculator raises the default account balance', async ({ page }) => {
    await signIn(page, PRIMARY_TEST_EMAIL);
    const run = Date.now().toString(36).slice(-5);
    // Own account as the default for this test; restore the previous default afterwards.
    const prevDefault = (await convexQuery(page, 'pwaPersonal:getSettings')).defaultAccountId ?? null;
    const acct: any = await convexMutation(page, 'pwaPersonal:createAccount', { name: `Inc ${run}`, emoji: '💵', kind: 'cash', openingBalanceCents: 1_000 });
    const accountId = acct.id;
    const accountTxs = async () => ((await convexQuery(page, 'pwaPersonal:getSnapshot')).transactions as any[])
      .filter((t) => t.accountId === accountId)
      .map((t) => ({ id: t.id, type: t.type, amountCents: t.amountCents, systemType: t.systemType ?? null, categoryId: t.categoryId }));
    try {
      await convexMutation(page, 'pwaPersonal:updateSettings', { defaultAccountId: accountId });
      const before = 1_000;

      const amt = uniqueAmount();
      await openTab(page, 0);
      // Wait until the calculator has loaded this test's default account before switching mode.
      await expect(activePage(page).getByText(`Inc ${run}`)).toBeVisible({ timeout: 15_000 });
      await activePage(page).getByRole('button', { name: 'Income mode' }).click();
      await activePage(page).getByLabel('C', { exact: true }).first().click();
      await pressKeys(page, amt.keys);
      await activePage(page).getByRole('button', { name: 'Save', exact: true }).first().click();
      await expect(page.getByText('Added', { exact: true })).toBeVisible({ timeout: 10_000 });

      // Exactly one transaction on this fresh account: the income we typed.
      await expect.poll(accountTxs, { timeout: 15_000 }).toHaveLength(1);
      const [income] = await accountTxs();
      expect(income, JSON.stringify(await accountTxs())).toMatchObject({ type: 'income', amountCents: amt.cents, systemType: null });
      expect(income.categoryId).toBeUndefined(); // income never carries a category
      expect((await convexQuery(page, 'pwaPersonal:listAccounts')).find((a: any) => a.id === accountId).balanceCents).toBe(before + amt.cents);
    } finally {
      await cleanup([
        async () => { for (const tx of await accountTxs()) await deleteTx(page, tx.id); },
        () => convexMutation(page, 'pwaPersonal:updateSettings', { defaultAccountId: prevDefault }),
        () => convexMutation(page, 'pwaPersonal:archiveAccount', { id: accountId }),
      ]);
    }
  });

  test('editing current balance records one adjustment under the hidden system category', async ({ page }) => {
    await signIn(page, PRIMARY_TEST_EMAIL);
    const run = Date.now().toString(36).slice(-5);
    const acct: any = await convexMutation(page, 'pwaPersonal:createAccount', { name: `Adj ${run}`, emoji: '💵', kind: 'cash', openingBalanceCents: 10_000 });
    const adjustmentsFor = async () => ((await convexQuery(page, 'pwaPersonal:getSnapshot')).transactions as any[])
      .filter((t) => t.accountId === acct.id && t.systemType === 'adjustment');
    try {
      await page.goto('/settings/accounts');
      await page.getByText(`Adj ${run}`, { exact: true }).click();
      await expect(page.getByText('Current Balance')).toBeVisible({ timeout: 15_000 });
      await page.getByPlaceholder('0.00').first().fill('123.45');
      await page.getByText('Save', { exact: true }).click();

      await expect.poll(async () => (await convexQuery(page, 'pwaPersonal:listAccounts')).find((a: any) => a.id === acct.id).balanceCents, { timeout: 15_000 })
        .toBe(12_345);
      const adjustments = await adjustmentsFor();
      expect(adjustments).toHaveLength(1);
      expect(adjustments[0]).toMatchObject({ amountCents: 2_345, type: 'income' });
      const snap: any = await convexQuery(page, 'pwaPersonal:getSnapshot');
      const sysCat = snap.categories.find((c: any) => c.id === adjustments[0].categoryId);
      expect(sysCat).toMatchObject({ name: 'System · Adjustment', isSystem: 1 });

      // The system category never shows in the calculator's category row.
      await openTab(page, 0);
      await expect(activePage(page).getByRole('button', { name: 'System · Adjustment', exact: true })).toHaveCount(0);

      // Native pull receives the adjustment with its category.
      const pulled = await nativePull(page, 0);
      expect(pulled.transactions.find((t: any) => t.id === adjustments[0].id)?.categoryId).toBe(sysCat.id);
    } finally {
      await cleanup([
        async () => { for (const tx of await adjustmentsFor()) await deleteTx(page, tx.id); },
        () => convexMutation(page, 'pwaPersonal:archiveAccount', { id: acct.id }),
      ]);
    }
  });

  test('filter sheet hides adjustments and Clear brings them back', async ({ page }) => {
    await signIn(page, PRIMARY_TEST_EMAIL);
    const run = Date.now().toString(36).slice(-5);
    const acct: any = await convexMutation(page, 'pwaPersonal:createAccount', { name: `Flt ${run}`, emoji: '💵', kind: 'cash', openingBalanceCents: 0 });
    let adjId: string | undefined;
    try {
      const amt = uniqueAmount();
      const adj: any = await convexMutation(page, 'pwaLedger:createAdjustment', { accountId: acct.id, amountCents: amt.cents, date: Date.now(), note: `adj ${run}` });
      adjId = adj.id;

      await openTab(page, 1);
      const list = activePage(page);
      // Adjustment rows show the 🛠 icon and the amount, not the note. Another transaction of the
      // shared test user could have the same amount, so assert that exactly our one row disappears.
      const rows = list.getByText(amt.text);
      await expect(rows.first()).toBeVisible({ timeout: 15_000 });
      const shown = await rows.count();

      await list.getByRole('button', { name: 'Filter transactions' }).click();
      await expect(page.getByText('Filters', { exact: true })).toBeVisible();
      await page.getByText('Adjustments', { exact: true }).click();
      await page.getByText('Done', { exact: true }).click();
      await expect(rows).toHaveCount(shown - 1, { timeout: 10_000 });

      await list.getByRole('button', { name: 'Filter transactions' }).click();
      await page.getByText('Clear', { exact: true }).click();
      await page.getByText('Done', { exact: true }).click().catch(() => undefined);
      await expect(rows).toHaveCount(shown, { timeout: 10_000 });
    } finally {
      await cleanup([
        () => deleteTx(page, adjId),
        () => convexMutation(page, 'pwaPersonal:archiveAccount', { id: acct.id }),
      ]);
    }
  });
});
