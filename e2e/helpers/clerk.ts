import { expect, test, type Page } from '@playwright/test';
import { setupClerkTestingToken } from '@clerk/testing/playwright';
import { hasClerkSecret } from '../env';

/**
 * Clerk development instances accept any `local+clerk_test@domain` address and
 * verify it with the fixed code below. No email is sent, no real user is involved.
 * See https://clerk.com/docs/testing/test-emails-and-phones
 */
export const CLERK_TEST_CODE = '424242';

export function testEmail(suffix: string) {
  const base = process.env.E2E_CLERK_TEST_EMAIL_BASE ?? 'budgetthing-e2e@example.com';
  const [local, domain] = base.split('@');
  return `${local}+clerk_test_${suffix}@${domain}`;
}

export const PRIMARY_TEST_EMAIL = testEmail('primary');
export const SECONDARY_TEST_EMAIL = testEmail('secondary');
const TEST_PASSWORD = process.env.E2E_CLERK_TEST_PASSWORD ?? 'BudgetThing-e2e-Passw0rd!';

/** Bypass Clerk bot protection when a secret key is configured locally; otherwise no-op. */
export async function prepareClerk(page: Page) {
  if (hasClerkSecret()) {
    await setupClerkTestingToken({ page });
  }
}

const MISSING_USER_REASON =
  'Clerk test user does not exist and the dev instance has bot protection on sign-up. ' +
  'Provide CLERK_SECRET_KEY in .env.local (enables the Clerk testing token) or create the ' +
  'test users once in the Clerk dashboard.';

/** Sign-up is only automatable with a testing token; otherwise skip with a precise reason. */
async function signUpOrSkip(page: Page, email: string) {
  if (!hasClerkSecret()) test.skip(true, MISSING_USER_REASON);
  await signUp(page, email);
}

/** Clerk's primary form submit button (never the social "Continue with …" buttons). */
function primaryButton(page: Page) {
  return page.getByRole('button', { name: /^(Continue|Sign in|Sign up)$/, exact: true }).first();
}

async function fillEmailCode(page: Page) {
  const codeInput = page.locator('input[name="code"], input[autocomplete="one-time-code"]').first();
  await expect(codeInput).toBeVisible({ timeout: 20_000 });
  await codeInput.fill(CLERK_TEST_CODE);
  // Clerk's "new device" check can reject a code typed before its own send finished.
  // Recover by resending once the resend countdown allows it, then re-entering the code.
  const notSent = page.getByText(/need to send a verification code/i);
  const shell = page.getByTestId('web-shell');
  const result = await Promise.race([
    shell.waitFor({ state: 'visible', timeout: 30_000 }).then(() => 'shell' as const),
    notSent.waitFor({ state: 'visible', timeout: 30_000 }).then(() => 'resend' as const),
  ]).catch(() => 'unknown' as const);
  if (result !== 'resend') return;
  const resend = page.getByRole('button', { name: /resend/i });
  await expect(resend).toBeEnabled({ timeout: 60_000 });
  await resend.click();
  await codeInput.fill('');
  await codeInput.fill(CLERK_TEST_CODE);
}

/** Signs in with email (+ password if Clerk shows it), creating the test user via sign-up on first use. */
export async function signIn(page: Page, email = PRIMARY_TEST_EMAIL) {
  await prepareClerk(page);
  await page.goto('/sign-in');
  await expect(page.getByTestId('web-sign-in')).toBeVisible();

  const identifier = page.locator('input[name="identifier"]');
  await expect(identifier).toBeVisible({ timeout: 30_000 });
  await identifier.fill(email);
  const passwordInput = page.locator('input[name="password"]');
  if (await passwordInput.isVisible().catch(() => false)) await passwordInput.fill(TEST_PASSWORD);
  await primaryButton(page).click();

  const outcome = await waitForOutcome(page);
  if (outcome === 'missing' || outcome === 'unknown') {
    await signUpOrSkip(page, email);
    return;
  }
  if (outcome === 'password') {
    await passwordInput.fill(TEST_PASSWORD);
    await primaryButton(page).click();
    const next = await waitForOutcome(page);
    if (next === 'code') await fillEmailCode(page);
    if (next === 'missing') {
      await signUpOrSkip(page, email);
      return;
    }
  } else if (outcome === 'code') {
    await fillEmailCode(page);
  }
  await expect(page.getByTestId('web-shell')).toBeVisible({ timeout: 30_000 });
}

type Outcome = 'shell' | 'code' | 'password' | 'missing' | 'unknown';

/** Resolves with whichever Clerk step appears next after a submit. */
async function waitForOutcome(page: Page): Promise<Outcome> {
  const shell = page.getByTestId('web-shell');
  const codeInput = page.locator('input[name="code"], input[autocomplete="one-time-code"]').first();
  const passwordInput = page.locator('input[name="password"]');
  const notFound = page.getByText(/couldn't find your account|no account found|not found/i);
  const passwordStep = page.getByRole('heading', { name: /enter your password|password/i });
  return Promise.race<Outcome>([
    shell.waitFor({ state: 'visible', timeout: 30_000 }).then(() => 'shell' as const),
    codeInput.waitFor({ state: 'visible', timeout: 30_000 }).then(() => 'code' as const),
    notFound.waitFor({ state: 'visible', timeout: 30_000 }).then(() => 'missing' as const),
    passwordStep.waitFor({ state: 'visible', timeout: 30_000 }).then(async () => {
      await passwordInput.waitFor({ state: 'visible', timeout: 5_000 });
      return 'password' as const;
    }),
  ]).catch(() => 'unknown' as const);
}

export async function signUp(page: Page, email: string) {
  await page.goto('/sign-up');
  await expect(page.getByTestId('web-sign-up')).toBeVisible();
  const emailInput = page.locator('input[name="emailAddress"]');
  await expect(emailInput).toBeVisible({ timeout: 30_000 });
  await emailInput.fill(email);
  const passwordInput = page.locator('input[name="password"]');
  if (await passwordInput.isVisible().catch(() => false)) await passwordInput.fill(TEST_PASSWORD);
  await primaryButton(page).click();
  await fillEmailCode(page);
  await expect(page.getByTestId('web-shell')).toBeVisible({ timeout: 30_000 });
}

export async function signOut(page: Page) {
  if (!(await page.getByTestId('web-sign-out').isVisible().catch(() => false))) await openSettings(page);
  await page.getByTestId('web-sign-out').click();
  await expect(page.getByTestId('web-sign-in')).toBeVisible({ timeout: 30_000 });
}

/** Switch to the Settings tab (the web runtime status card lives there). */
export async function openSettings(page: Page) {
  await page.goto('/?tab=4');
  await expect(page.getByTestId('web-shell')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId('web-runtime-status')).toBeVisible({ timeout: 30_000 });
}
