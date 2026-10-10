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
      await expect(page.getByText('Stop logging')).toBeVisible();
      await page.waitForTimeout(2800);
      await shot('1-hook');

      const next = page.getByTestId('onboarding-primary');
      await next.click();
      await expect(page.getByText('Your agent reads')).toBeVisible();
      await expect(page.getByText('OpenClaw').first()).toBeVisible();
      await page.waitForTimeout(3200);
      await shot('2-agents');

      await next.click();
      await expect(page.getByText('Tap to pay.')).toBeVisible();
      await page.waitForTimeout(3000);
      await shot('3-applepay');

      // Swipe demo: right confirms, left opens the editor; buttons do the same.
      await next.click();
      await expect(page.getByText('Swipe to approve.')).toBeVisible();
      await page.waitForTimeout(500);
      await shot('4-swipe');
      await drag(page, 'onboarding-swipe-card', 240);
      await expect(page.getByText('Swiggy: added to your books')).toBeVisible();
      await drag(page, 'onboarding-swipe-card', -240);
      await expect(page.getByText('Blue Tokai: opened in the editor')).toBeVisible();
      await page.getByRole('button', { name: 'Confirm Amazon' }).click();
      await expect(page.getByText("That's the whole job.")).toBeVisible();

      await next.click();
      await expect(page.getByText('Do it yourself,')).toBeVisible();
      await page.waitForTimeout(1200);
      await shot('5-diy');

      // Setup: add an account.
      await next.click();
      await expect(page.getByText('Make it yours.')).toBeVisible();
      await page.getByRole('button', { name: 'Add Credit card' }).click();
      await expect(page.getByRole('button', { name: 'Add Credit card' })).toHaveCount(0, { timeout: 15_000 });
      await shot('6-setup');

      // Connect: create a key, then a real import arrives while the page waits.
      await next.click();
      await expect(page.getByText('Connect your helpers.')).toBeVisible();
      await page.getByRole('button', { name: 'Create my agent key' }).click();
      await expect(page.getByText(/Set up BudgetThing for me\./)).toBeVisible({ timeout: 15_000 });
      await expect(page.getByText(/Waiting for your first import/)).toBeVisible();
      await shot('7-connect');

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
      await shot('8-arrived');

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
      for (const a of (after?.accounts ?? []) as any[]) {
        if (!accountsBefore.has(a.id)) await convexMutation(page, 'pwaPersonal:archiveAccount', { id: a.id }).catch(() => undefined);
      }
    }
  });
});
