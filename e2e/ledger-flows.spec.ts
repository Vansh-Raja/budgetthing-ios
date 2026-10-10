import { expect, test } from '@playwright/test';
import { PRIMARY_TEST_EMAIL, signIn } from './helpers/clerk';
import { activePage, confirmPopup, convexMutation, convexQuery, nativePull, openTab, pressKeys, uniqueAmount } from './helpers/app';

/**
 * Core personal-ledger flows on phone web, verified against the canonical
 * server and the unchanged native pull protocol.
 */
test.describe('Personal ledger on phone web', () => {
  test.setTimeout(180_000);

  test('account + expense via calculator → transactions, detail edit, delete; native pull converges', async ({ page }) => {
    await signIn(page, PRIMARY_TEST_EMAIL);
    const run = Date.now().toString(36).slice(-5);

    // ---- Create an account through Settings › Accounts ----
    await page.goto('/settings/accounts');
    await page.getByRole('button', { name: 'Add account' }).click();
    await expect(page.getByText('New Account')).toBeVisible();
    await page.getByPlaceholder('Account Name').fill(`Bank ${run}`);
    await page.getByText('Savings', { exact: true }).click();
    await page.getByPlaceholder('0.00').first().fill('500');
    await page.getByText('Save', { exact: true }).click();
    await expect(page.getByText(`Bank ${run}`)).toBeVisible({ timeout: 15_000 });

    // Server has it with canonical fields; native pull sees it too.
    const accounts: any[] = await convexQuery(page, 'pwaPersonal:listAccounts');
    const bank = accounts.find((a) => a.name === `Bank ${run}`);
    expect(bank).toBeTruthy();
    expect(bank.kind).toBe('savings');
    expect(bank.openingBalanceCents).toBe(50_000);
    const pulled = await nativePull(page, 0);
    expect(pulled.accounts.some((a: any) => a.id === bank.id && a.syncVersion === 1)).toBe(true);

    // ---- Calculator: type a unique amount and save (default account = Cash) ----
    const amt = uniqueAmount();
    await openTab(page, 0);
    await activePage(page).getByLabel('C', { exact: true }).first().click();
    await pressKeys(page, amt.keys);
    await activePage(page).getByRole('button', { name: 'Save', exact: true }).first().click();
    await expect(page.getByText('Saved', { exact: true })).toBeVisible({ timeout: 10_000 });

    // ---- Transactions tab shows it; server row is canonical, integer cents, manual provenance ----
    await openTab(page, 1);
    // Scope to the visible page (hidden tab pages stay mounted); the month header also shows the total, the row is the last match.
    const row = activePage(page).getByText(amt.text).last();
    await expect(row).toBeVisible({ timeout: 15_000 });
    const snap: any = await convexQuery(page, 'pwaPersonal:getSnapshot');
    const tx = snap.transactions.find((t: any) => t.amountCents === amt.cents && t.type === 'expense');
    expect(tx).toBeTruthy();
    expect(tx.sourceType).toBe('manual');
    expect(tx.systemType ?? null).toBeNull();
    expect(Number.isInteger(tx.amountCents)).toBe(true);

    // ---- Detail: edit note, then delete ----
    await row.click();
    await expect(page.getByText('Edit', { exact: true })).toBeVisible({ timeout: 15_000 });
    await page.getByText('Edit', { exact: true }).click();
    await page.getByPlaceholder('Add a note...').fill(`coffee ${run}`);
    await page.getByText('Save', { exact: true }).click();
    await expect(page.getByText(`coffee ${run}`)).toBeVisible({ timeout: 10_000 });
    await page.getByText('Delete Transaction', { exact: true }).click();
    await expect(page.getByText('Delete Transaction?')).toBeVisible();
    await confirmPopup(page, 'Delete');
    await expect(page.getByText(`coffee ${run}`)).toHaveCount(0, { timeout: 15_000 });

    // Tombstone visible to native pull, and note edit bumped the version chain.
    const after = await nativePull(page, 0);
    const tomb = after.transactions.find((t: any) => t.id === tx.id);
    expect(tomb).toBeTruthy();
    expect(tomb.deletedAtMs).toBeGreaterThan(0);
    expect(tomb.syncVersion).toBeGreaterThanOrEqual(3);

    // cleanup: archive the account we created
    await convexMutation(page, 'pwaPersonal:archiveAccount', { id: bank.id });
  });

  test('transfer between accounts is one canonical row and balances move', async ({ page }) => {
    await signIn(page, PRIMARY_TEST_EMAIL);
    const run = Date.now().toString(36).slice(-5);
    const from: any = await convexMutation(page, 'pwaPersonal:createAccount', { name: `From ${run}`, emoji: '💵', kind: 'cash', openingBalanceCents: 10_000 });
    const to: any = await convexMutation(page, 'pwaPersonal:createAccount', { name: `To ${run}`, emoji: '🏦', kind: 'savings', openingBalanceCents: 0 });

    await page.goto('/transfer');
    await expect(page.getByText('Transfer Money')).toBeVisible();
    await page.getByText('From', { exact: true }).click();
    await expect(page.getByText('Select Source')).toBeVisible();
    await page.getByText(`From ${run}`, { exact: true }).click();
    await expect(page.getByText('Select Source')).toBeHidden({ timeout: 10_000 });
    await page.getByText('To', { exact: true }).click();
    await expect(page.getByText('Select Destination')).toBeVisible();
    await page.getByText(`To ${run}`, { exact: true }).click();
    await expect(page.getByText('Select Destination')).toBeHidden({ timeout: 10_000 });
    await page.waitForTimeout(400); // sheet close animation
    const amountInput = page.getByPlaceholder('0');
    await amountInput.click();
    await amountInput.pressSequentially('25');
    await expect(amountInput).toHaveValue('25');
    await page.getByPlaceholder('Note (optional)').pressSequentially(`move ${run}`);
    await page.getByText('Transfer', { exact: true }).click();

    await expect.poll(async () => {
      const accounts: any[] = await convexQuery(page, 'pwaPersonal:listAccounts');
      const a = accounts.find((x) => x.id === from.id);
      const b = accounts.find((x) => x.id === to.id);
      return a && b ? [a.balanceCents, b.balanceCents] : null;
    }, { timeout: 15_000 }).toEqual([7_500, 2_500]);

    const snap: any = await convexQuery(page, 'pwaPersonal:getSnapshot');
    const transfers = snap.transactions.filter((t: any) => t.systemType === 'transfer' && t.transferFromAccountId === from.id && t.transferToAccountId === to.id);
    expect(transfers).toHaveLength(1);
    expect(transfers[0].amountCents).toBe(2_500);

    // Accounts tab shows the moved balances.
    await openTab(page, 2);
    await expect(page.getByText(`To ${run}`)).toBeVisible({ timeout: 15_000 });

    await convexMutation(page, 'pwaLedger:deleteTransaction', { id: transfers[0].id });
    await convexMutation(page, 'pwaPersonal:archiveAccount', { id: from.id });
    await convexMutation(page, 'pwaPersonal:archiveAccount', { id: to.id });
  });

  test('categories: create through Settings, appears on calculator; currency switch is reflected', async ({ page }) => {
    await signIn(page, PRIMARY_TEST_EMAIL);
    const run = Date.now().toString(36).slice(-5);
    await page.goto('/settings/categories');
    await page.getByRole('button', { name: 'Add category' }).click();
    await expect(page.getByText('New Category')).toBeVisible();
    await page.getByPlaceholder('Category Name').fill(`Cat ${run}`);
    await page.getByText('Save', { exact: true }).click();
    await expect(page.getByText(`Cat ${run}`)).toBeVisible({ timeout: 15_000 });
    const cats: any[] = await convexQuery(page, 'pwaPersonal:listCategories');
    const cat = cats.find((c) => c.name === `Cat ${run}`);
    expect(cat).toBeTruthy();
    expect(cat.isSystem).toBe(0);

    // Currency: switch to USD and back, calculator symbol follows settings.
    await page.goto('/settings/currency');
    await page.getByPlaceholder('Search currencies...').fill('USD');
    await page.getByText('USD', { exact: true }).first().click();
    await expect.poll(async () => (await convexQuery(page, 'pwaPersonal:getSettings')).currencyCode, { timeout: 15_000 }).toBe('USD');
    await openTab(page, 0);
    await expect(page.getByText(/^\$0/).first()).toBeVisible({ timeout: 15_000 });
    await convexMutation(page, 'pwaPersonal:updateSettings', { currencyCode: 'INR' });
    await convexMutation(page, 'pwaPersonal:deleteCategory', { id: cat.id });
  });
});

test.describe('Cross-client convergence', () => {
  test('a native-protocol push appears live in the web session without duplicates; web edit pulls back', async ({ page }) => {
    test.setTimeout(120_000);
    await signIn(page, PRIMARY_TEST_EMAIL);
    const run = Date.now().toString(36).slice(-5);
    const cash: any = await convexMutation(page, 'pwaPersonal:createAccount', { name: `Native ${run}`, emoji: '💵', kind: 'cash', openingBalanceCents: 10_000 });
    await openTab(page, 1);

    // Simulate the native outbox pushing a SQLite-shaped row (NULLs, needsSync).
    const now = Date.now();
    const id = `native-${run}`;
    await convexMutation(page, 'sync:push', {
      transactions: [{
        id, amountCents: 777, date: now, note: `native ${run}`, type: 'expense', systemType: null, accountId: cash.id, categoryId: null,
        transferFromAccountId: null, transferToAccountId: null, tripExpenseId: null, sourceType: 'manual', sourceImportInboxItemId: null,
        createdAtMs: now, updatedAtMs: now, deletedAtMs: null, syncVersion: 1, needsSync: 1,
      }],
    });

    // Live subscription updates the visible Transactions page (no reload).
    const rows = activePage(page).getByText(/7\.77/);
    await expect(rows.last()).toBeVisible({ timeout: 20_000 });
    const snap: any = await convexQuery(page, 'pwaPersonal:getSnapshot');
    expect(snap.transactions.filter((t: any) => t.id === id)).toHaveLength(1);

    // Web edits the native row; native pull sees the same id with a bumped version.
    await convexMutation(page, 'pwaLedger:updateTransaction', { id, amountCents: 888 });
    await expect(activePage(page).getByText(/8\.88/).last()).toBeVisible({ timeout: 20_000 });
    const pulled = await nativePull(page, 0);
    const mine = pulled.transactions.filter((t: any) => t.id === id);
    expect(mine).toHaveLength(1);
    expect(mine[0].amountCents).toBe(888);
    expect(mine[0].syncVersion).toBe(2);

    await convexMutation(page, 'pwaLedger:deleteTransaction', { id });
    await convexMutation(page, 'pwaPersonal:archiveAccount', { id: cash.id });
  });
});
