import { expect, test } from '@playwright/test';
import { PRIMARY_TEST_EMAIL, signIn } from './helpers/clerk';
import { convexMutation, convexQuery, uniqueAmount } from './helpers/app';

/** Desktop browser layout: sidebar shell, keyboard calculator, framed modals. */
test.describe('Desktop browser', () => {
  test.setTimeout(180_000);

  test('sidebar navigation, keyboard calculator, and modals as dialogs', async ({ page }, info) => {
    // Desktop layout needs a fine pointer (hover), so phone projects don't apply.
    test.skip(!!info.project.use.isMobile, 'desktop-only');
    await page.setViewportSize({ width: 1440, height: 900 });
    await signIn(page, PRIMARY_TEST_EMAIL);
    await page.goto('/?tab=0');
    await expect(page.getByTestId('desktop-sidebar')).toBeVisible({ timeout: 30_000 });
    // The mobile floating pill is replaced by the sidebar.
    await expect(page.getByRole('tab', { name: 'Calculator' })).toHaveCount(1);

    // Wait for the ledger (the account picker shows the default account), then type and save with Enter.
    await expect(page.getByTestId('pager-page-active').getByText('₹0').first()).toBeVisible({ timeout: 20_000 });
    await expect.poll(async () => ((await convexQuery(page, 'pwaPersonal:getSnapshot')).accounts as any[]).length, { timeout: 20_000 }).toBeGreaterThan(0);
    await expect(page.getByTestId('pager-page-active').getByText('No accounts')).toHaveCount(0, { timeout: 20_000 });
    const amt = uniqueAmount();
    await page.keyboard.press('Escape');
    await page.keyboard.type(amt.keys);
    await expect(page.getByTestId('pager-page-active').getByText(amt.text).first()).toBeVisible();
    await page.keyboard.press('Enter');
    await expect(page.getByText('Saved', { exact: true })).toBeVisible({ timeout: 10_000 });
    let txId: string | undefined;
    await expect.poll(async () => {
      const tx = ((await convexQuery(page, 'pwaPersonal:getSnapshot')).transactions as any[]).find((t) => t.amountCents === amt.cents && t.type === 'expense');
      txId = tx?.id;
      return !!tx;
    }, { timeout: 15_000 }).toBe(true);

    try {
      // Arithmetic from the keyboard: 12 * 3 = 36.
      await page.keyboard.type('12*3=');
      await expect(page.getByTestId('pager-page-active').getByText('₹36').first()).toBeVisible();
      await page.keyboard.press('Escape');

      // Mixed mouse + keyboard: a clicked key keeps focus, but Enter saves (it doesn't re-press 7).
      const idsBefore = new Set(((await convexQuery(page, 'pwaPersonal:getSnapshot')).transactions as any[]).map((x) => x.id));
      await page.getByTestId('pager-page-active').getByLabel('7', { exact: true }).first().click();
      await page.keyboard.type('.43');
      await page.keyboard.press('Enter');
      let tx2: string | undefined;
      await expect.poll(async () => {
        // Only transactions this test created: exactly one, and it's 7.43 (not 7.437 or 77.43).
        const created = ((await convexQuery(page, 'pwaPersonal:getSnapshot')).transactions as any[]).filter((x) => !idsBefore.has(x.id));
        tx2 = created[0]?.id;
        return created.map((x) => [x.amountCents, x.type]);
      }, { timeout: 15_000 }).toEqual([[743, 'expense']]);
      if (tx2) await convexMutation(page, 'pwaLedger:deleteTransaction', { id: tx2 }).catch(() => undefined);

      // Option/Alt + number switches section; typing digits elsewhere doesn't touch the calculator.
      await page.keyboard.press('Alt+Digit2');
      await expect(page.getByRole('tab', { name: 'Transactions', selected: true })).toBeVisible();
      await page.keyboard.type('777');
      await page.keyboard.press('Alt+Digit1');
      await expect(page.getByTestId('pager-page-active').getByText('₹0').first()).toBeVisible();

      // A full-screen modal opens as a centred dialog.
      await page.keyboard.press('Alt+Digit2');
      await page.getByTestId('pager-page-active').getByText(amt.text).last().click();
      const sheet = page.locator('.bt-sheet > div').first();
      await expect(sheet).toBeVisible({ timeout: 10_000 });
      const box = await sheet.boundingBox();
      expect(box!.width).toBeLessThanOrEqual(760);
      expect(box!.x).toBeGreaterThan(200);
    } finally {
      if (txId) await convexMutation(page, 'pwaLedger:deleteTransaction', { id: txId }).catch(() => undefined);
    }
  });
});
