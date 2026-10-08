# Phase 1 — Web runtime and auth shell (evidence log)

Plan: https://plans.vanshraja.me/agent/PszNYhnX7vY5 · Worktree: `feature/mobile-pwa`

## Runtime boundary

The web (PWA) build is online-only and authenticated-only. Enforced three ways:

1. **Thin routes, platform-split modules.** Expo Router bundles every base route file on every platform (see `node_modules/expo-router/_ctx.web.js`), so route-level `.web.tsx` files do *not* keep native code out of the web bundle. Route files therefore only re-export, and the split lives in modules Metro resolves per platform: `lib/app/RootLayout(.web).tsx`, `screens/MainTabsScreen(.web).tsx`, `screens/*.web.tsx`, `lib/hooks/*.web.ts`, `lib/logic/actions.web.ts`, `lib/ui/transactionFiltersStorage.web.ts`, `lib/auth/tokenCache.web.ts`.
2. **Metro resolver guard** (`metro.config.js`): resolving `lib/db/*`, `lib/sync/*`, `expo-sqlite`, `react-native-pager-view`, `@react-native-community/datetimepicker`, or a project import of `expo-secure-store` for platform `web` fails the build with a `[web-boundary]` error.
3. **Source-map audit** (`npm run web:export && npm run web:audit`): parses the exported bundle's source maps and fails on the same list. Report: `reports/web-import-audit.json`.

### Audit result (2026-09-18)

`Web bundle modules: 1473 (project: 57)` — OK. Project modules in the web bundle are the thin route files, `lib/app/RootLayout.web.tsx`, `screens/*.web.tsx`, `components/ui/*`, `components/auth/*`, `components/web/*`, `constants/theme.ts`, `lib/hooks/useUserSettings.web.tsx`, `lib/logic/currencyUtils.ts`, `lib/web/runtime.ts`, `lib/auth/useAuthHooks.ts`, `convex/_generated/api.js`, and `screens/CurrencyPickerScreen.tsx` (already web-safe). No `lib/db`, `lib/sync`, `expo-sqlite`, pager, native date picker, or SecureStore project modules.

## Auth shell

- `@clerk/clerk-expo` on web delegates to `@clerk/clerk-react` (`standardBrowser: true`, `Clerk: null`, `tokenCache` ignored). No extra Clerk package was needed; `SignIn`/`SignUp` come from `@clerk/clerk-expo/web` with `routing="hash"`.
- `lib/app/RootLayout.web.tsx`: Clerk → Convex (`ConvexProviderWithClerk`) → shared UI providers → `Stack.Protected` gate. Signed-out users can only reach `/sign-in` and `/sign-up`; signed-in users cannot reach them. No `SyncProvider`, no SQLite bootstrap, no guest seed, no outbox.
- Onboarding is skipped on web (`screens/OnboardingScreen.web.tsx` redirects to `/`); there is no guest mode.
- Web settings context is in-memory defaults until Phase 2/4 add the canonical settings API.
- Public runtime config is limited to `EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY` and `EXPO_PUBLIC_CONVEX_URL`.

## Vertical slice (no writes)

`screens/MainTabsScreen.web.tsx` keeps the five-tab order and `FloatingTabSwitcher` and renders `components/web/WebRuntimeStatus.tsx`: Clerk identity, `sync:whoami` (server subject), Convex connection state, live `sync:latestSeq`, sign-out. Test ids: `web-shell`, `web-identity`, `web-server-subject`, `web-connection`, `web-sync-seq`, `web-sign-out`, `web-sign-in`, `web-sign-up`, `web-placeholder`.

## Browser automation

- `playwright.config.ts`: projects `mobile-webkit` (iPhone 14), `mobile-chromium` (Pixel 7), `desktop-webkit`, `desktop-chromium`; auto-starts `expo start --web`; traces/screenshots/videos on failure.
- `e2e/auth-shell.spec.ts`: signed-out gate, deep-link gate, no native-module runtime errors, sign-in → realtime read → sign-out privacy, account switch privacy, session reload.
- Test identities use Clerk development test emails (`…+clerk_test_<suffix>@…`, fixed code) — no real accounts, no production data.
- Clerk dev instance facts (from `/v1/environment`): email code + password, Apple and Google OAuth, public sign-up, **bot protection (Turnstile) enabled on sign-up**.

### Results (2026-09-18)

| Check | Result |
|---|---|
| `npx tsc --noEmit` | clean |
| `npm test -- --runInBand` | 98 passed |
| `npx expo export --platform web --source-maps` | success, 15 static routes |
| `npm run web:audit` | OK, 0 violations |
| Playwright: signed-out gate, deep-link gate, native-error-free boot | pass on all 4 projects |
| Playwright: sign-in → realtime read → sign-out privacy, account switch privacy, session reload | pass on all 4 projects (2026-09-20, after test users were created) |

## Test users

Two users exist on the Clerk **development** instance only (created 2026-09-20 via the dashboard by the maintainer's session): `budgetthing-e2e+clerk_test_primary@example.com` and `…+clerk_test_secondary@example.com`, password as in `e2e/helpers/clerk.ts` / `E2E_CLERK_TEST_PASSWORD`. They are Clerk test identities (no email delivery, fixed verification code). No secret key is stored; if the users are ever deleted, either recreate them or supply `CLERK_SECRET_KEY` so the suite can self-provision through the testing token.

## Maintainer inputs still needed for Phase 1 exit

1. **Real iPhone Safari check** of the no-write slice (viewport, sign-in, realtime read, sign-out, user switch). Needs an HTTPS URL; `npx expo start --web --tunnel` provides one.
2. **Release hostname** (final origin) — required later for Clerk allowed origins/redirects and for Phase 7 manifest/service-worker scope. Not configured; nothing points at production.

## Hosting headers / origins (recorded, not configured)

- Clerk: production instance will need the release origin added to allowed origins and the sign-in/up redirect URLs; dev instance currently allows localhost.
- Convex: browser clients connect by WebSocket to `EXPO_PUBLIC_CONVEX_URL`; no CORS change needed for the React client. The HTTP import API (`/v1/*`) is API-key based and is not called from the browser.
- Static hosting must serve `dist/` with SPA fallback for dynamic routes (`/account/[id]`, `/category/[id]`) and long-cache immutable assets under `_expo/static`.

## Native impact

- Native route files now re-export from `lib/app/RootLayout.tsx`, `screens/MainTabsScreen.tsx`, `screens/AccountDetailScreen.tsx`, `screens/ImportInboxScreen.tsx` (bodies moved verbatim, imports rebased). `app/sign-in.tsx` and `app/sign-up.tsx` redirect to onboarding on native.
- Unit tests and typecheck pass. A native build could not be run on this machine (Xcode license not accepted; maintainer-only).
