import { defineConfig, devices } from '@playwright/test';
import { loadLocalEnv } from './e2e/env';

loadLocalEnv();

/**
 * Browser tests for the BudgetThing web (PWA) runtime.
 *
 * - Runs against the Expo web dev server (started automatically).
 * - Uses Clerk's development-instance test emails (`*+clerk_test@…`) with the
 *   fixed verification code, so no real accounts or production data are touched.
 * - Never points at production Convex or Clerk.
 */
const PORT = Number(process.env.E2E_PORT ?? 8081);
const BASE_URL = process.env.E2E_BASE_URL ?? `http://localhost:${PORT}`;

export default defineConfig({
  testDir: './e2e',
  globalSetup: './e2e/global-setup.ts',
  timeout: 90_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'playwright-report' }]],
  outputDir: 'test-results',
  use: {
    baseURL: BASE_URL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    colorScheme: 'dark',
  },
  projects: [
    { name: 'mobile-webkit', use: { ...devices['iPhone 14'] } },
    { name: 'mobile-chromium', use: { ...devices['Pixel 7'] } },
    { name: 'desktop-webkit', use: { ...devices['Desktop Safari'] } },
    { name: 'desktop-chromium', use: { ...devices['Desktop Chrome'] } },
  ],
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: `npx expo start --web --port ${PORT}`,
        url: BASE_URL,
        reuseExistingServer: !process.env.CI,
        timeout: 180_000,
        env: { CI: '1', BROWSER: 'none', EXPO_NO_TELEMETRY: '1' },
      },
});
