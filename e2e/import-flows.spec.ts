import { expect, test, type Page } from '@playwright/test';
import { PRIMARY_TEST_EMAIL, signIn } from './helpers/clerk';
import { confirmPopup, convexMutation, convexQuery, nativePull } from './helpers/app';

/**
 * Phase 6: agent import API → web inbox → confirm/ignore, end to end against the
 * real dev HTTP endpoint (convex.site), with the inbox updating live.
 */
const SITE_URL = (process.env.EXPO_PUBLIC_CONVEX_URL ?? '').replace('.convex.cloud', '.convex.site');

async function postImport(page: Page, rawKey: string, externalId: string, merchantName: string, amountCents: number, accountId: string) {
  const res = await page.request.post(`${SITE_URL}/v1/imports`, {
    headers: { Authorization: `Bearer ${rawKey}`, 'Idempotency-Key': `e2e-${externalId}`, 'Content-Type': 'application/json' },
    data: { source: 'e2e', items: [{ externalId, type: 'expense', amountCents, currencyCode: 'INR', occurredAt: new Date().toISOString(), merchantName, accountId }] },
  });
  expect(res.status(), await res.text()).toBe(200);
}

/** Inbox cards are swipe-only (native parity): drag the card horizontally with the pointer. */
async function swipeCard(page: Page, text: string, dx: number) {
  const card = page.getByText(text).first();
  await card.scrollIntoViewIfNeeded();
  const box = await card.boundingBox();
  if (!box) throw new Error(`card ${text} not found`);
  const y = box.y + box.height / 2;
  const x = box.x + box.width / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  for (let i = 1; i <= 12; i++) await page.mouse.move(x + (dx * i) / 12, y + 1);
  await page.mouse.up();
}

/** Ignore leftover pending test imports (from interrupted runs) so they never crowd the inbox. */
async function ignoreLeftoverTestImports(page: Page) {
  const pending: any[] = await convexQuery(page, 'pwaImports:listPending').catch(() => []);
  for (const item of pending ?? []) {
    if (/^(Cafe|Kiosk) /.test(item.merchantName ?? '')) await convexMutation(page, 'pwaImports:ignore', { id: item.id }).catch(() => undefined);
  }
}

test.describe('Agent import inbox on phone web', () => {
  test.setTimeout(240_000);

  test('API import → live web inbox → confirm creates one provenance transaction; ignore is terminal', async ({ page }) => {
    test.skip(!SITE_URL, 'EXPO_PUBLIC_CONVEX_URL not set');
    await signIn(page, PRIMARY_TEST_EMAIL);
    const run = Date.now().toString(36).slice(-5);
    const acct: any = await convexMutation(page, 'pwaPersonal:createAccount', { name: `Imp ${run}`, emoji: '💵', kind: 'cash', openingBalanceCents: 10_000 });
    await ignoreLeftoverTestImports(page);
    const key: any = await convexMutation(page, 'apiImportKeys:create', { name: `e2e ${run}`, expiresIn: '30d' });
    const created: string[] = [];
    try {
      await postImport(page, key.rawKey, `${run}-a`, `Cafe ${run}`, 1234, acct.id);

      await page.goto('/import-inbox');
      await expect(page.getByText(`Cafe ${run}`)).toBeVisible({ timeout: 30_000 });

      // A second import arrives while the inbox is open: it appears without a reload.
      await postImport(page, key.rawKey, `${run}-b`, `Kiosk ${run}`, 555, acct.id);
      await expect(page.getByText(`Kiosk ${run}`)).toBeVisible({ timeout: 30_000 });

      // Confirm the first by swiping right (the card's primary gesture).
      await swipeCard(page, `Cafe ${run}`, 260);
      await expect(page.getByText(`Cafe ${run}`)).toHaveCount(0, { timeout: 20_000 });

      // Swipe the second left to open the review sheet, then ignore it.
      await swipeCard(page, `Kiosk ${run}`, -260);
      await expect(page.getByText('Review Import', { exact: true })).toBeVisible({ timeout: 15_000 });
      await page.getByText('Ignore Import', { exact: true }).click();
      await confirmPopup(page, 'Ignore');
      await expect(page.getByText(`Kiosk ${run}`)).toHaveCount(0, { timeout: 20_000 });

      // Server: exactly one api_import transaction on this account, with provenance; balance moved once.
      const txs: any[] = ((await convexQuery(page, 'pwaPersonal:getSnapshot')).transactions as any[]).filter((t) => t.accountId === acct.id);
      created.push(...txs.map((t) => t.id));
      expect(txs).toHaveLength(1);
      expect(txs[0]).toMatchObject({ amountCents: 1234, sourceType: 'api_import' });
      expect(txs[0].id).toMatch(/^api_import_/);
      expect((await convexQuery(page, 'pwaPersonal:listAccounts')).find((a: any) => a.id === acct.id).balanceCents).toBe(10_000 - 1234);
      expect(await convexQuery(page, 'pwaImports:countPending')).toBe(0);

      // Native pull sees the confirmed and ignored inbox rows and the provenance transaction.
      const pulled = await nativePull(page, 0);
      const mine = pulled.importInboxItems.filter((i: any) => [`Cafe ${run}`, `Kiosk ${run}`].includes(i.merchantName));
      expect(mine.map((i: any) => i.status).sort()).toEqual(['confirmed', 'ignored']);
      expect(pulled.transactions.find((t: any) => t.id === txs[0].id)?.sourceImportInboxItemId).toBeTruthy();
    } finally {
      await ignoreLeftoverTestImports(page);
      for (const id of created) await convexMutation(page, 'pwaLedger:deleteTransaction', { id }).catch(() => undefined);
      await convexMutation(page, 'apiImportKeys:revoke', { id: key.key.id }).catch(() => undefined);
      await convexMutation(page, 'pwaPersonal:archiveAccount', { id: acct.id }).catch(() => undefined);
    }
  });
});
