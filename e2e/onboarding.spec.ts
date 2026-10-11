import { expect, test, type Page } from '@playwright/test';
import { PRIMARY_TEST_EMAIL, signIn } from './helpers/clerk';
import { convexMutation, convexQuery } from './helpers/app';

/**
 * Onboarding ("Stop logging expenses"): first-run redirect, the story pages, the
 * swipe demo, setup, and the live "first import" moment with a real agent key.
 */
const SITE_URL = (process.env.EXPO_PUBLIC_CONVEX_URL ?? '').replace('.convex.cloud', '.convex.site');
const SHOTS = 'test-results/onboarding';

async function drag(page: Page, testId: string, dx: number) {
  const box = await page.getByTestId(testId).boundingBox();
  if (!box) throw new Error(`${testId} not found`);
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  for (let i = 1; i <= 12; i++) await page.mouse.move(x + (dx * i) / 12, y + 1);
  await page.mouse.up();
}

test.describe('Onboarding', () => {
  test.setTimeout(240_000);

  test('first run walks the story, sets up, and catches the first agent import live', async ({ page }, info) => {
    test.skip(!SITE_URL, 'EXPO_PUBLIC_CONVEX_URL not set');
    await signIn(page, PRIMARY_TEST_EMAIL);
    const run = Date.now().toString(36).slice(-5);
    const before: any = await convexQuery(page, 'pwaPersonal:getSnapshot');
    const accountsBefore = new Set((before.accounts as any[]).map((a) => a.id));
    const keysBefore = new Set(((await convexQuery(page, 'apiImportKeys:list')) as any[]).map((k) => k.id));
    const shot = (name: string) => page.screenshot({ path: `${SHOTS}/${info.project.name}-${name}.png` });

    await convexMutation(page, 'pwaPersonal:updateSettings', { hasSeenOnboarding: false });
    try {
      // First run: the app sends a new account to onboarding.
      await page.goto('/');
      await expect(page.getByTestId('onboarding')).toBeVisible({ timeout: 30_000 });
      await expect(page.getByRole('heading', { name: /Stop logging/ })).toBeVisible();
      await page.waitForTimeout(2800);
      await shot('1-hook');

      const next = page.getByTestId('onboarding-primary');
      await next.click();
      await expect(page.getByRole('heading', { name: /Your agent reads/ })).toBeVisible();
      await expect(page.getByText('OpenClaw').first()).toBeVisible();
      await page.waitForTimeout(3200);
      await shot('2-agents');

      await next.click();
      await expect(page.getByRole('heading', { name: /Tap to pay/ })).toBeVisible();
      await page.waitForTimeout(3000);
      await shot('3-applepay');

      // Swipe demo: right confirms, left opens the editor; buttons do the same.
      await next.click();
      await expect(page.getByRole('heading', { name: /Swipe to approve/ })).toBeVisible();
      await page.waitForTimeout(500);
      await shot('4-swipe');
      await drag(page, 'onboarding-swipe-card', 240);
      await expect(page.getByText('Swiggy: added to your books')).toBeVisible();
      await drag(page, 'onboarding-swipe-card', -240);
      await expect(page.getByText('Blue Tokai: opened in the editor')).toBeVisible();
      await page.getByRole('button', { name: 'Confirm Amazon' }).click();
      await expect(page.getByText("That's the whole job.")).toBeVisible();

      await next.click();
      await expect(page.getByRole('heading', { name: /Do it yourself/ })).toBeVisible();
      await page.waitForTimeout(1500);
      await shot('5a-diy');
      await page.waitForTimeout(2800);
      await shot('5-diy');

      // "Set me up" → currency → categories → accounts.
      await next.click();
      await expect(page.getByRole('heading', { name: /Let's make it/ })).toBeVisible();
      await page.waitForTimeout(900);
      await shot('6-ask');
      await page.getByTestId('onboarding-setup-yes').click();
      await expect(page.getByRole('heading', { name: /Your currency/ })).toBeVisible();
      await expect(page.getByRole('button', { name: `Currency ${before.settings?.currencyCode ?? 'INR'}` })).toBeVisible();
      await page.waitForTimeout(900);
      await shot('7-currency');
      // Picking a currency is only saved on Continue: Back leaves the setting untouched.
      const myCurrency = before.settings?.currencyCode ?? 'INR';
      const other = myCurrency === 'USD' ? 'EUR' : 'USD';
      await page.getByRole('button', { name: `Currency ${other}` }).click();
      await page.getByRole('button', { name: 'Back' }).click();
      await expect(page.getByTestId('onboarding-setup-yes')).toBeVisible();
      expect((await convexQuery(page, 'pwaPersonal:getSnapshot')).settings.currencyCode).toBe(myCurrency);
      await page.getByTestId('onboarding-setup-yes').click();
      await expect(page.getByRole('heading', { name: /Your currency/ })).toBeVisible();

      await next.click();
      await expect(page.getByRole('heading', { name: /What do you usually/ })).toBeVisible();
      const newCat = ['Pets', 'Gifts', 'Education', 'Fitness', 'Coffee'].find((n) => !(before.categories as any[]).some((c) => !c.deletedAtMs && c.name === n))!;
      await page.getByRole('button', { name: `Category ${newCat}` }).click();
      // Existing categories can be unselected too (they'd be removed on Continue); re-select to keep the data.
      const existing = (before.categories as any[]).find((c) => !c.deletedAtMs && !c.isSystem);
      if (existing) {
        const chip = page.getByRole('button', { name: `Category ${existing.name}` });
        await chip.click();
        await expect(page.getByText(/1 will be removed/)).toBeVisible();
        await chip.click();
        await expect(page.getByText(/will be removed/)).toHaveCount(0);
      }
      await page.waitForTimeout(900);
      await shot('8-spend');
      await next.click();
      await expect(page.getByRole('heading', { name: /Where does your/ })).toBeVisible({ timeout: 15_000 });
      await expect.poll(async () => ((await convexQuery(page, 'pwaPersonal:getSnapshot')).categories as any[]).some((c) => !c.deletedAtMs && c.name === newCat)).toBe(true);

      // Several accounts of the same type, plus a card with limit and statement day.
      await page.getByRole('button', { name: 'Add Bank account' }).click();
      await page.getByRole('button', { name: 'Add Bank account' }).click();
      const bankNames = page.getByLabel('Bank account name');
      await bankNames.nth(-2).fill(`Onb bank A ${run}`);
      await bankNames.nth(-1).fill(`Onb bank B ${run}`);
      await page.getByLabel(`Onb bank B ${run} balance`).fill('1,234.50');
      await page.getByRole('button', { name: 'Add Credit card' }).click();
      await page.getByLabel('Credit card name').last().fill(`Onb card ${run}`);
      await page.getByLabel(`Onb card ${run} credit limit`).fill('50000');
      await page.getByLabel(`Onb card ${run} statement day`).fill('12');
      await page.waitForTimeout(600);
      await shot('9-accounts');
      await next.click();
      await expect.poll(async () => ((await convexQuery(page, 'pwaPersonal:getSnapshot')).accounts as any[]).find((a) => a.name === `Onb card ${run}`)?.limitAmountCents, { timeout: 15_000 }).toBe(5_000_000);
      const accts: any[] = (await convexQuery(page, 'pwaPersonal:getSnapshot')).accounts;
      expect(accts.find((a) => a.name === `Onb card ${run}`).billingCycleDay).toBe(12);
      expect(accts.find((a) => a.name === `Onb bank A ${run}`)).toBeTruthy();
      expect(accts.find((a) => a.name === `Onb bank B ${run}`).openingBalanceCents).toBe(123_450);

      // Connect: create a key, then a real import arrives while the page waits.
      await expect(page.getByRole('heading', { name: /Connect your/ })).toBeVisible();
      await page.getByRole('button', { name: 'Create my agent key' }).click();
      await expect(page.getByText(/Set up BudgetThing for me\./)).toBeVisible({ timeout: 15_000 });
      await expect(page.getByText(/Waiting for your first import/)).toBeVisible();
      await shot('10-connect');

      const message = await page.getByText(/Set up BudgetThing for me\./).innerText();
      const rawKey = message.match(/BUDGETTHING_API_KEY \(keep it secret\): (\S+)/)?.[1];
      expect(rawKey).toBeTruthy();
      const meta = await page.request.get(`${SITE_URL}/v1/import/metadata`, { headers: { Authorization: `Bearer ${rawKey}` } });
      expect(meta.status()).toBe(200);
      const { currencyCode } = await meta.json();
      const res = await page.request.post(`${SITE_URL}/v1/imports`, {
        headers: { Authorization: `Bearer ${rawKey}`, 'Idempotency-Key': `onb-${run}`, 'Content-Type': 'application/json' },
        data: { source: 'e2e-onboarding', items: [{ externalId: `onb-${run}`, type: 'expense', amountCents: 24000, currencyCode, occurredAt: new Date().toISOString(), merchantName: `Onboard ${run}` }] },
      });
      expect(res.status(), await res.text()).toBe(200);
      await expect(page.getByText('🎉 Your first import arrived')).toBeVisible({ timeout: 20_000 });
      await shot('11-arrived');

      await next.click();
      await expect(page.getByRole('heading', { name: /You're all set/ })).toBeVisible();
      await page.waitForTimeout(1400);
      await shot('12-done');
      await page.getByRole('button', { name: 'Open my Inbox' }).click();
      await expect(page.getByText(`Onboard ${run}`)).toBeVisible({ timeout: 20_000 });
      const settings: any = (await convexQuery(page, 'pwaPersonal:getSnapshot')).settings;
      expect(settings.hasSeenOnboarding).toBe(1);

      // Once complete, the app no longer redirects.
      await page.goto('/');
      await page.waitForTimeout(2000);
      await expect(page.getByTestId('onboarding')).toHaveCount(0);
    } finally {
      await convexMutation(page, 'pwaPersonal:updateSettings', { hasSeenOnboarding: true }).catch(() => undefined);
      for (const item of ((await convexQuery(page, 'pwaImports:listPending').catch(() => [])) as any[])) {
        if (item.merchantName === `Onboard ${run}`) await convexMutation(page, 'pwaImports:ignore', { id: item.id }).catch(() => undefined);
      }
      for (const k of ((await convexQuery(page, 'apiImportKeys:list').catch(() => [])) as any[])) {
        if (!keysBefore.has(k.id) && k.revokedAtMs == null) await convexMutation(page, 'apiImportKeys:revoke', { id: k.id }).catch(() => undefined);
      }
      const after: any = await convexQuery(page, 'pwaPersonal:getSnapshot').catch(() => null);
      const catsBefore = new Set((before.categories as any[]).map((c) => c.id));
      for (const c of (after?.categories ?? []) as any[]) {
        if (!catsBefore.has(c.id) && !c.deletedAtMs) await convexMutation(page, 'pwaPersonal:deleteCategory', { id: c.id }).catch(() => undefined);
      }
      for (const a of (after?.accounts ?? []) as any[]) {
        if (!accountsBefore.has(a.id)) await convexMutation(page, 'pwaPersonal:archiveAccount', { id: a.id }).catch(() => undefined);
      }
    }
  });
});
