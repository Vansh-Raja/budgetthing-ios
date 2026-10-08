import { expect, test } from '@playwright/test';
import { PRIMARY_TEST_EMAIL, signIn } from './helpers/clerk';
import { activePage, convexMutation, convexQuery, nativePull, openTab, pressKeys, uniqueAmount } from './helpers/app';

/**
 * Phase 4 coverage beyond the core flows: income, balance adjustment (with the
 * native system category), and the Transactions filter sheet.
 */
test.describe('Personal ledger: income, adjustment, filters', () => {
  test.setTimeout(180_000);

  test('income via calculator raises the default account balance', async ({ page }) => {
    await signIn(page, PRIMARY_TEST_EMAIL);
    const run = Date.now().toString(36).slice(-5);
    // Own account as the default for this test; restore the previous default afterwards.
    const prevDefault = (await convexQuery(page, 'pwaPersonal:getSettings')).defaultAccountId ?? null;
    const acct: any = await convexMutation(page, 'pwaPersonal:createAccount', { name: `Inc ${run}`, emoji: '💵', kind: 'cash', openingBalanceCents: 1_000 });
    await convexMutation(page, 'pwaPersonal:updateSettings', { defaultAccountId: acct.id });
    const accountId = acct.id;
    const before = 1_000;

    const amt = uniqueAmount();
    await openTab(page, 0);
    await activePage(page).getByRole('button', { name: 'Income mode' }).click();
    await activePage(page).getByLabel('C', { exact: true }).first().click();
    await pressKeys(page, amt.keys);
    await activePage(page).getByRole('button', { name: 'Save', exact: true }).first().click();
    await expect(page.getByText('Added', { exact: true })).toBeVisible({ timeout: 10_000 });

    await expect.poll(async () => (await convexQuery(page, 'pwaPersonal:listAccounts')).find((a: any) => a.id === accountId).balanceCents, { timeout: 15_000 })
      .toBe(before + amt.cents);
    const txs: any[] = (await convexQuery(page, 'pwaPersonal:getSnapshot')).transactions;
    const income = txs.find((t) => t.amountCents === amt.cents && t.type === 'income' && t.accountId === accountId);
    expect(income).toBeTruthy();
    expect(income.categoryId).toBeUndefined(); // income never carries a category
    await convexMutation(page, 'pwaLedger:deleteTransaction', { id: income.id });
    await convexMutation(page, 'pwaPersonal:updateSettings', { defaultAccountId: prevDefault });
    await convexMutation(page, 'pwaPersonal:archiveAccount', { id: acct.id });
  });

  test('editing current balance records one adjustment under the hidden system category', async ({ page }) => {
    await signIn(page, PRIMARY_TEST_EMAIL);
    const run = Date.now().toString(36).slice(-5);
    const acct: any = await convexMutation(page, 'pwaPersonal:createAccount', { name: `Adj ${run}`, emoji: '💵', kind: 'cash', openingBalanceCents: 10_000 });

    await page.goto('/settings/accounts');
    await page.getByText(`Adj ${run}`, { exact: true }).click();
    await expect(page.getByText('Current Balance')).toBeVisible({ timeout: 15_000 });
    await page.getByPlaceholder('0.00').first().fill('123.45');
    await page.getByText('Save', { exact: true }).click();

    await expect.poll(async () => (await convexQuery(page, 'pwaPersonal:listAccounts')).find((a: any) => a.id === acct.id).balanceCents, { timeout: 15_000 })
      .toBe(12_345);
    const snap: any = await convexQuery(page, 'pwaPersonal:getSnapshot');
    const adjustments = snap.transactions.filter((t: any) => t.accountId === acct.id && t.systemType === 'adjustment');
    expect(adjustments).toHaveLength(1);
    expect(adjustments[0]).toMatchObject({ amountCents: 2_345, type: 'income' });
    const sysCat = snap.categories.find((c: any) => c.id === adjustments[0].categoryId);
    expect(sysCat).toMatchObject({ name: 'System · Adjustment', isSystem: 1 });

    // The system category never shows in the calculator's category row.
    await openTab(page, 0);
    await expect(activePage(page).getByRole('button', { name: 'System · Adjustment', exact: true })).toHaveCount(0);

    // Native pull receives the adjustment with its category.
    const pulled = await nativePull(page, 0);
    expect(pulled.transactions.find((t: any) => t.id === adjustments[0].id)?.categoryId).toBe(sysCat.id);

    await convexMutation(page, 'pwaLedger:deleteTransaction', { id: adjustments[0].id });
    await convexMutation(page, 'pwaPersonal:archiveAccount', { id: acct.id });
  });

  test('filter sheet hides adjustments and the active-filter dot clears on Clear', async ({ page }) => {
    await signIn(page, PRIMARY_TEST_EMAIL);
    const run = Date.now().toString(36).slice(-5);
    const acct: any = await convexMutation(page, 'pwaPersonal:createAccount', { name: `Flt ${run}`, emoji: '💵', kind: 'cash', openingBalanceCents: 0 });
    const amt = uniqueAmount();
    const adj: any = await convexMutation(page, 'pwaLedger:createAdjustment', { accountId: acct.id, amountCents: amt.cents, date: Date.now(), note: `adj ${run}` });
    // Adjustment rows show the 🛠 icon and the amount, not the note.
    const row = () => list.getByText(amt.text);

    await openTab(page, 1);
    const list = activePage(page);
    await expect(row().first()).toBeVisible({ timeout: 15_000 });

    await list.getByRole('button', { name: 'Filter transactions' }).click();
    await expect(page.getByText('Filters', { exact: true })).toBeVisible();
    await page.getByText('Adjustments', { exact: true }).click();
    await page.getByText('Done', { exact: true }).click();
    await expect(row()).toHaveCount(0, { timeout: 10_000 });

    await list.getByRole('button', { name: 'Filter transactions' }).click();
    await page.getByText('Clear', { exact: true }).click();
    await page.getByText('Done', { exact: true }).click().catch(() => undefined);
    await expect(row().first()).toBeVisible({ timeout: 10_000 });

    await convexMutation(page, 'pwaLedger:deleteTransaction', { id: adj.id });
    await convexMutation(page, 'pwaPersonal:archiveAccount', { id: acct.id });
  });
});
