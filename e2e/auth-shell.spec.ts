import { expect, test } from '@playwright/test';
import { PRIMARY_TEST_EMAIL, SECONDARY_TEST_EMAIL, openSettings, signIn, signOut } from './helpers/clerk';

test.describe('Web runtime: authenticated-only shell', () => {
  test('signed-out visitor is sent to sign-in and sees no ledger UI', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveURL(/\/sign-in/);
    await expect(page.getByTestId('web-sign-in')).toBeVisible();
    await expect(page.getByTestId('web-shell')).toHaveCount(0);
  });

  test('deep link while signed out is also gated', async ({ page }) => {
    await page.goto('/settings/accounts');
    await expect(page).toHaveURL(/\/sign-in/);
    await expect(page.getByTestId('web-placeholder')).toHaveCount(0);
  });

  test('no native-only runtime errors on boot', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => {
      if (m.type() === 'error') errors.push(m.text());
    });
    await page.goto('/');
    await expect(page.getByTestId('web-sign-in')).toBeVisible();
    const nativeErrors = errors.filter((e) => /native module|codegenNativeCommands|expo-sqlite|SecureStore|PagerView/i.test(e));
    expect(nativeErrors, nativeErrors.join('\n')).toEqual([]);
  });

  test('sign in → authenticated realtime read → sign out clears private UI', async ({ page }) => {
    await signIn(page, PRIMARY_TEST_EMAIL);
    // Tab order is preserved: Calculator, Transactions, Accounts, Trips, Settings.
    await page.goto('/?tab=1');
    await expect(page.getByTestId('web-shell')).toBeVisible({ timeout: 30_000 });
    const tabs = page.getByRole('tab');
    await expect(tabs).toHaveCount(5);
    await expect(tabs.nth(0)).toHaveAttribute('aria-label', 'Calculator');
    await expect(tabs.nth(3)).toHaveAttribute('aria-label', 'Trips');
    await expect(tabs.nth(4)).toHaveAttribute('aria-label', 'Settings');
    await openSettings(page);
    await expect(page.getByTestId('web-identity')).toContainText(PRIMARY_TEST_EMAIL.split('+')[0]);
    await expect(page.getByTestId('web-server-subject')).toHaveText(/^user_/, { timeout: 30_000 });
    await expect(page.getByTestId('web-connection')).toHaveText(/Connected/, { timeout: 30_000 });
    await expect(page.getByTestId('web-sync-seq')).toHaveText(/^\d+$/, { timeout: 30_000 });

    await signOut(page);
    await expect(page.getByTestId('web-identity')).toHaveCount(0);

    // Browser back must not resurrect private content.
    await page.goBack().catch(() => {});
    await expect(page.getByTestId('web-identity')).toHaveCount(0);
    await expect(page.getByTestId('web-sign-in')).toBeVisible();
  });

  test('switching accounts never shows the previous user', async ({ page }) => {
    await signIn(page, PRIMARY_TEST_EMAIL);
    await openSettings(page);
    await expect(page.getByTestId('web-server-subject')).toHaveText(/^user_/, { timeout: 30_000 });
    const firstSubject = await page.getByTestId('web-server-subject').textContent();
    await signOut(page);

    await signIn(page, SECONDARY_TEST_EMAIL);
    await openSettings(page);
    await expect(page.getByTestId('web-identity')).toContainText('secondary');
    await expect(page.getByTestId('web-server-subject')).toHaveText(/^user_/, { timeout: 30_000 });
    const secondSubject = await page.getByTestId('web-server-subject').textContent();
    expect(secondSubject).not.toEqual(firstSubject);
    await signOut(page);
  });

  test('session survives reload', async ({ page }) => {
    await signIn(page, PRIMARY_TEST_EMAIL);
    await page.reload();
    await expect(page.getByTestId('web-shell')).toBeVisible({ timeout: 30_000 });
    await openSettings(page);
    await expect(page.getByTestId('web-server-subject')).toHaveText(/^user_/, { timeout: 30_000 });
    await signOut(page);
  });
});
