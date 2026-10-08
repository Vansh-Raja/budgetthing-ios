import { expect, test, type Page } from '@playwright/test';
import { PRIMARY_TEST_EMAIL, signIn } from './helpers/clerk';

/**
 * Screen smoke: every tab and nested route renders on phone web without page
 * errors or an error boundary, and produces a screenshot for the visual review.
 */
const TARGETS: Array<{ name: string; path: string; expectText?: RegExp }> = [
  { name: 'tab-calculator', path: '/?tab=0' },
  { name: 'tab-transactions', path: '/?tab=1' },
  { name: 'tab-accounts', path: '/?tab=2' },
  { name: 'tab-trips', path: '/?tab=3' },
  { name: 'tab-settings', path: '/?tab=4' },
  { name: 'settings-accounts', path: '/settings/accounts' },
  { name: 'settings-categories', path: '/settings/categories' },
  { name: 'settings-currency', path: '/settings/currency' },
  { name: 'transfer', path: '/transfer' },
  { name: 'import-inbox', path: '/import-inbox' },
  { name: 'settings-api-import', path: '/settings/api-import' },
];

// Known-benign noise:
// - WebKit reports fetches aborted by a full navigation as "access control checks" (Clerk token refresh in flight).
// - react-native-draggable-flatlist reads element.ref (React 19 deprecation warning), non-fatal.
const IGNORED = [
  /Require cycle/, /shadow\*/, /development keys/, /clerk-telemetry/, /Download the React DevTools/, /ERR_ABORTED/, /favicon/,
  /tokens\/convex.*due to access control checks/, /Accessing element\.ref was removed in React 19/,
];

function collectErrors(page: Page) {
  const errors: string[] = [];
  page.on('pageerror', (e) => {
    if (IGNORED.some((re) => re.test(e.message))) return;
    errors.push(`pageerror: ${e.message}`);
  });
  page.on('console', (m) => {
    if (m.type() !== 'error') return;
    const text = m.text();
    if (IGNORED.some((re) => re.test(text))) return;
    errors.push(`console: ${text}`);
  });
  return errors;
}

test.describe('Ported screens render on phone web', () => {
  test('all tabs and nested routes render without errors', async ({ page }, testInfo) => {
    test.setTimeout(240_000);
    const errors = collectErrors(page);
    await signIn(page, PRIMARY_TEST_EMAIL);
    const failures: string[] = [];
    for (const target of TARGETS) {
      const before = errors.length;
      await page.goto(target.path);
      await page.waitForTimeout(1500);
      const boundary = await page.getByText(/something went wrong|unhandled|error boundary/i).count();
      await page.screenshot({ path: `reports/screens/${testInfo.project.name}-${target.name}.png`, fullPage: false });
      const fresh = errors.slice(before);
      if (fresh.length || boundary) failures.push(`${target.name}: ${boundary ? 'error boundary shown; ' : ''}${fresh.join(' | ')}`);
    }
    expect(failures, failures.join('\n')).toEqual([]);
  });
});
