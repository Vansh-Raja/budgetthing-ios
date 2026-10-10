import { expect, type Page } from '@playwright/test';

/** Wait for the main tab shell to be interactive on a given tab. */
export async function openTab(page: Page, index: 0 | 1 | 2 | 3 | 4) {
  await page.goto(`/?tab=${index}`);
  await expect(page.getByTestId('web-shell')).toBeVisible({ timeout: 30_000 });
}

/** The currently visible pager page (other tab pages stay mounted but hidden). */
export function activePage(page: Page) {
  return page.getByTestId('pager-page-active');
}

/** Press calculator keys by their accessibility labels (digits, '.', 'C', '⌫', operators). */
export async function pressKeys(page: Page, keys: string) {
  for (const k of keys) {
    // Keypad keys carry accessibilityLabel (aria-label) but no button role.
    await activePage(page).getByLabel(k, { exact: true }).first().click();
  }
}

/** Run a legacy native-protocol query through the dev-exposed Convex client. */
export async function nativePull(page: Page, lastSeq = 0): Promise<any> {
  return page.evaluate(async (seq) => {
    const c = (window as any).__budgetthingConvex;
    if (!c) throw new Error('Convex client not exposed');
    return c.query('sync:pull', { lastSeq: seq });
  }, lastSeq);
}

export async function convexQuery(page: Page, name: string, args: Record<string, unknown> = {}): Promise<any> {
  return page.evaluate(async ({ name, args }) => (window as any).__budgetthingConvex.query(name, args), { name, args });
}

export async function convexMutation(page: Page, name: string, args: Record<string, unknown> = {}): Promise<any> {
  return page.evaluate(async ({ name, args }) => (window as any).__budgetthingConvex.mutation(name, args), { name, args });
}

/** Unique amount for this run: 3 digits with a distinctive cents part (e.g. 4.37). */
export function uniqueAmount(): { keys: string; cents: number; text: RegExp } {
  const cents = 100 + Math.floor(Math.random() * 850);
  const whole = Math.floor(cents / 100);
  const frac = cents % 100;
  const keys = `${whole}.${String(frac).padStart(2, '0')}`;
  const text = new RegExp(`${whole}\\.${String(frac).padStart(2, '0')}`);
  return { keys, cents, text };
}

/** Confirm a CustomPopup by exact button text. */
export async function confirmPopup(page: Page, buttonText: string) {
  // CustomPopup buttons are touchables without a button role; match by exact text (last = topmost popup).
  const btn = page.getByText(buttonText, { exact: true }).last();
  await expect(btn).toBeVisible({ timeout: 10_000 });
  await btn.click();
}
