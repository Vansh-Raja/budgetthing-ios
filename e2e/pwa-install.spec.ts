import { expect, test } from '@playwright/test';
import { appendFileSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { PRIMARY_TEST_EMAIL, signIn } from './helpers/clerk';

/**
 * Phase 7: installable PWA against a PRODUCTION export (service workers are never
 * registered under the Metro dev server). Run with:
 *   npm run web:export && npx expo serve dist --port 8090
 *   E2E_PROD=1 E2E_BASE_URL=http://localhost:8090 npx playwright test e2e/pwa-install.spec.ts
 */
test.skip(!process.env.E2E_PROD, 'needs a production export (set E2E_PROD=1 and E2E_BASE_URL)');

const DIST_SW = resolve(process.cwd(), 'dist/sw.js');

async function cachedUrls(page: import('@playwright/test').Page): Promise<string[]> {
  return page.evaluate(async () => {
    const out: string[] = [];
    for (const key of await caches.keys()) {
      const cache = await caches.open(key);
      for (const req of await cache.keys()) out.push(req.url);
    }
    return out;
  });
}

async function waitForController(page: import('@playwright/test').Page) {
  await page.waitForFunction(() => !!navigator.serviceWorker?.controller, undefined, { timeout: 30_000 }).catch(async () => {
    await page.reload();
    await page.waitForFunction(() => !!navigator.serviceWorker?.controller, undefined, { timeout: 30_000 });
  });
}

test.describe('Installable PWA (production build)', () => {
  test.setTimeout(240_000);

  test('manifest, icons and iOS metadata are served and valid', async ({ page, request }) => {
    const res = await request.get('/manifest.webmanifest');
    expect(res.ok()).toBe(true);
    const manifest = await res.json();
    expect(manifest).toMatchObject({ name: 'BudgetThing', start_url: '/', scope: '/', display: 'standalone', background_color: '#000000', theme_color: '#000000' });
    const sizes = manifest.icons.map((i: any) => `${i.sizes}:${i.purpose}`).sort();
    expect(sizes).toEqual(['192x192:any', '512x512:any', '512x512:maskable']);
    for (const icon of manifest.icons) expect((await request.get(icon.src)).ok()).toBe(true);
    expect((await request.get('/icons/apple-touch-icon.png')).ok()).toBe(true);

    await page.goto('/sign-in');
    await expect(page.locator('link[rel="manifest"]')).toHaveAttribute('href', '/manifest.webmanifest');
    await expect(page.locator('meta[name="apple-mobile-web-app-capable"]')).toHaveAttribute('content', 'yes');
    await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute('content', '#000000');
  });

  test('service worker controls the app but never caches finance, auth or API traffic', async ({ page }) => {
    await page.goto('/sign-in');
    await waitForController(page);
    await signIn(page, PRIMARY_TEST_EMAIL);
    // Load data-heavy screens so any (wrongly) cacheable traffic would have happened.
    for (const path of ['/?tab=1', '/?tab=2', '/?tab=3', '/settings/accounts']) {
      await page.goto(path);
      await page.waitForTimeout(2_500);
    }
    const urls = await cachedUrls(page);
    expect(urls.length).toBeGreaterThan(0);
    const origin = new URL(page.url()).origin;
    for (const url of urls) {
      const u = new URL(url);
      expect(u.origin, url).toBe(origin);
      expect(u.pathname === '/' || /^\/(_expo\/static|assets|icons)\/|^\/manifest\.webmanifest$|^\/favicon\.ico$/.test(u.pathname), url).toBe(true);
    }
    expect(urls.some((u) => /convex|clerk|\/v1\//i.test(u))).toBe(false);
  });

  test('install precaches the shell (HTML + hashed JS/CSS)', async ({ page }) => {
    await page.goto('/sign-in');
    await waitForController(page);
    const urls = await cachedUrls(page);
    expect(urls.some((u) => /\/_expo\/static\/.+\.js/.test(u)), urls.join('\n')).toBe(true);
    expect(urls.some((u) => new URL(u).pathname === '/'), urls.join('\n')).toBe(true);
  });

  test('an offline launch renders the cached app with the offline banner', async ({ page, context, browserName }) => {
    // Playwright's WebKit cannot navigate under setOffline when a service worker serves the
    // page ("internal error" in page.reload); Chromium exercises the same worker logic.
    test.skip(browserName === 'webkit', 'WebKit offline emulation does not support SW-served navigations');
    await page.goto('/sign-in');
    await waitForController(page);

    await context.setOffline(true);
    try {
      await page.reload();
      await expect(page.getByTestId('web-connection-banner')).toBeVisible({ timeout: 30_000 });
      await expect(page.getByText('You are offline', { exact: false })).toBeVisible();
    } finally {
      await context.setOffline(false);
    }
  });

  test('a new build shows "update available" and Reload switches to it', async ({ page }) => {
    await page.goto('/sign-in');
    await waitForController(page);
    const original = readFileSync(DIST_SW, 'utf8');
    try {
      appendFileSync(DIST_SW, `\n// e2e-update ${Date.now()}\n`); // a byte-different worker = a new build
      await page.evaluate(async () => (await navigator.serviceWorker.getRegistration())?.update());
      await expect(page.getByTestId('web-update-banner')).toBeVisible({ timeout: 30_000 });
      await page.getByRole('button', { name: 'Reload to update' }).click();
      await page.waitForLoadState('load');
      await expect(page.getByTestId('web-update-banner')).toHaveCount(0, { timeout: 30_000 });
      const swSource = await page.evaluate(async () => (await fetch('/sw.js', { cache: 'no-store' })).text());
      expect(swSource).toContain('e2e-update');
    } finally {
      writeFileSync(DIST_SW, original);
    }
  });
});
