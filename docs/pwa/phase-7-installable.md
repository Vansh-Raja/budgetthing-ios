# Phase 7: Installable and operationally honest PWA (evidence log)

Plan: https://plans.vanshraja.me/agent/PszNYhnX7vY5 · Branch: `feature/pwa-installable`

## What shipped

| Area | Implementation |
|---|---|
| Manifest | `public/manifest.webmanifest`: standalone, `start_url`/`scope` `/`, black theme/background, 192/512 icons + maskable 512 (padded with the icon's own navy) |
| iOS metadata | `app/+html.tsx`: manifest link, `apple-touch-icon` (180), `apple-mobile-web-app-*` meta, `theme-color` |
| Service worker | `public/sw.js`, **static shell only**: content-hashed `/_expo/static`, `/assets`, `/icons`, manifest, favicon are cache-first; page loads are network-first with the cached shell as an offline fallback. Never cached: cross-origin (Convex, Clerk, import API), non-GET, non-200 responses. Registered only in production builds |
| Update signalling | `scripts/stamp-sw.mjs` stamps a build id into `dist/sw.js` (run by `npm run web:export`). A waiting worker shows "A new version of BudgetThing is available. **Reload**"; the page only switches when the user taps it, so an update never discards an edit |
| Truthful offline | `useEffectiveOffline`: offline only if the browser says so, **and** no Convex socket is live, **and** a real request to Convex fails (re-probed every 15s). Fixes false "offline" on iOS Safari (which reported `navigator.onLine=false` while connected) and on signed-out pages (no socket yet) |
| Errors | On-brand root error boundary (Retry / Reload app); unsupported-browser screen when WebSockets, fetch or `crypto.getRandomValues` are missing; existing reconnecting banner and session-expiry redirect to sign-in |
| Installed-mode auth | Clerk sign-in/up use `oauthFlow="popup"` when running standalone (no back button there), default flow in a browser tab |

## Cache policy (privacy)

Only same-origin static assets and the HTML shell are ever written to Cache Storage. Clerk keeps its own session storage (SDK-managed). The app writes no finance, auth or API payloads to any cache. This is asserted by `e2e/pwa-install.spec.ts` after signing in and visiting data-heavy screens.

## Verification (2026-10-09)

| Check | Result |
|---|---|
| `npx tsc --noEmit` | clean |
| jest / convex-test | 104 / 46 |
| web export + audit | 0 violations; `stamp-sw` stamps a build id |
| `e2e/pwa-install.spec.ts` on a production export (`E2E_PROD=1`, `npx expo serve dist`) | 3/3 mobile WebKit, 3/3 mobile Chromium: manifest + icons + iOS meta; SW control + cache only holds static same-origin URLs after a signed-in session; new build → banner → Reload → new worker |
| auth shell against the production export | 6/6 |
| Full dev suite, mobile WebKit | 18 passed (3 prod-only skipped) |
| iOS 26.4 simulator Safari | Share → Add to Home Screen shows the manifest name, icon and "Open as Web App"; the icon is installed on the home screen |

## Not verified here (maintainer, real device)

- Driving the **installed** (standalone) app. The simulator automation is pinned to Safari and relaunches it, so standalone launch, sign-in (including Apple/Google popup), navigation, sign-out, refresh and second-account switching in installed mode belong to the real-iPhone pass.
- Android Chrome install prompt on a real device.
- Release hostname + Clerk allowed origins/redirects: configured only once the release domain is an approved input.
