# Phase 8: Acceptance record and maintainer-controlled release runbook

Plan: https://plans.vanshraja.me/agent/PszNYhnX7vY5 · Branch: `feature/pwa-release-prep`

Nothing in this document has been executed against production. Every production, hosting, DNS, Clerk-dashboard, EAS and App Store step below is a maintainer action that needs its own explicit go-ahead.

## 1. Acceptance status

### Automated (dev deployment `dev:adjoining-gnat-886`)

| Suite | Result | Covers |
|---|---|---|
| `npx tsc --noEmit` | clean | |
| `npm test -- --runInBand` | 104 | split / balance / summary calculators, trip accounting rules, sync guards, import validation, sourceType normalisation |
| `npm run test:convex` | 46 | auth isolation, native-sync compatibility, ledger rules, virtual derived rows, split parity, default-account pinning, import state machine, review regressions |
| Playwright full suite (mobile WebKit, dev) | 18 | auth gating, all screens, ledger flows, cross-client convergence, trips (all split UIs, settlements, shared trips), import API → live inbox |
| Playwright production export (`E2E_PROD=1`) | 3 + 6 | manifest, cache privacy after a signed-in session, update flow; auth shell |
| `npm run web:export` + `web:audit` | 0 violations | no SQLite, sync, SecureStore, pager or native date picker in the web bundle |

### iPhone Safari (iOS 26.4 Simulator, iPhone 17 Pro Max)

Driven through the T3 Device panel on 2026-10-09.

| Flow | Result |
|---|---|
| Sign-in incl. Clerk new-device code; Avenir Next Condensed renders | pass |
| All five tabs; floating tab pill clears Safari's toolbar (Calculator has none, as on native) | pass |
| Calculator keypad entry → save → row in Transactions | pass |
| Trip share rows "share · total" + trip emoji | pass |
| Transaction detail view/edit; web date/time picker | pass (after fixes) |
| Settings › Accounts / Categories / Currency; account detail; Safari Back | pass |
| Local trip Expenses / Balances / Settle Up | pass |
| Sign-out; Back after sign-out; signed-out deep link | pass (no private UI) |
| Add to Home Screen (manifest name, icon, "Open as Web App"; icon installed) | pass |

Fixed during the pass: a false "You are offline" banner (iOS Safari `navigator.onLine`, and signed-out pages with no socket), the transaction-detail amount clipping off-screen, and the date input overflowing its sheet.

### Maintainer pass on a real iPhone (required before release)

- [ ] Safari: sign in, five tabs, calculator, transfer, transaction edit, trip with Shares/Exact splits, settle up, sign out, Back, deep links.
- [ ] Installed: Share → Add to Home Screen → launch → sign in with **Apple** (popup sheet, can be cancelled) → navigate → sign out → sign in as a second account; no previous user's data visible.
- [ ] Installed: pull-to-refresh/relaunch keeps the session; airplane mode shows "You are offline" and blocks edits; reconnect recovers.
- [ ] After a new build is deployed: "A new version of BudgetThing is available" → Reload.
- [ ] Import inbox: run the Shortcut/Hermes agent once (persistent per-event UUID; retry reuses it) → item appears live → confirm → one transaction; a duplicate retry creates nothing.
- [ ] Android Chrome: install prompt, launch, sign in.
- [ ] Visual review against the native app for the agreed screens; record any accepted deviations here (no parity percentage is claimed).

## 2. Decisions the maintainer still owns

1. **Derived-account boundary** (#3): web keeps the "which account a trip payment charges" choice per user on the server; native keeps it per device. Accept runtime-specific projection, or gate group-trip writes on web.
2. **Edits to confirmed imported transactions** (#5): currently ordinary LWW edits with provenance pinned, not immutable.
3. **Merge order:** #1 → #2 → #3 → #4 → #5 → #6 → this PR, each with a merge commit (not squash), bottom-up.
4. **Release hostname** for the PWA (needed for Clerk origins and hosting).

## 3. Release runbook

### Inputs required first
- Approved PWA hostname (e.g. `app.<domain>`), DNS access.
- Production values: `EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY` (live `pk_live_…`), `EXPO_PUBLIC_CONVEX_URL=https://ceaseless-mandrill-733.convex.cloud`.
- Clerk **production** instance: add the hostname to allowed origins and the OAuth redirect URLs (Apple, Google); keep the existing native settings.
- Confirm `IMPORT_API_KEY_PEPPER` is set on prod (it is, as of 2026-10-08) and `CLERK_JWT_ISSUER_DOMAIN` points at the production Clerk instance.

### Step 1: back up production Convex (before any backend change)
```bash
CONVEX_DEPLOYMENT=prod:ceaseless-mandrill-733 npx convex export --path ./backups/prod-$(date +%Y%m%d-%H%M).zip
```
Rehearse the restore into an **isolated** deployment (never into prod):
```bash
CONVEX_DEPLOYMENT=dev:adjoining-gnat-886 npx convex import --replace ./backups/prod-YYYYMMDD-HHMM.zip   # or a scratch project
```

### Step 2: deploy the backend to production
All schema changes are additive (`derivedAccountOverrides`). Behaviour changes that reach **released native apps**:
- `sync:push` ignores persisted derived trip rows, and pins derived accounts before default-account changes;
- API-import inbox rows and `api_import_*` transactions go through the server state machine (the push response is unchanged).
```bash
CONVEX_DEPLOYMENT=prod:ceaseless-mandrill-733 npx convex deploy --yes
```
Smoke test: `curl -i https://ceaseless-mandrill-733.convex.site/v1/health`. Then a native app sync (push and pull) with a test account.

### Step 3: build and host the web app
```bash
EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_live_… EXPO_PUBLIC_CONVEX_URL=https://ceaseless-mandrill-733.convex.cloud \
  npm run web:export          # expo export + stamps dist/sw.js with a build id
npm run web:audit             # must print OK
```
Host `dist/` as static files. On Vercel, use a **separate project** from the marketing site (`Website/`) with a config like:
```json
{
  "cleanUrls": true,
  "rewrites": [
    { "source": "/account/:id", "destination": "/account/[id].html" },
    { "source": "/category/:id", "destination": "/category/[id].html" }
  ],
  "headers": [
    { "source": "/sw.js", "headers": [{ "key": "Cache-Control", "value": "no-cache" }, { "key": "Service-Worker-Allowed", "value": "/" }] },
    { "source": "/manifest.webmanifest", "headers": [{ "key": "Content-Type", "value": "application/manifest+json" }] },
    { "source": "/_expo/static/(.*)", "headers": [{ "key": "Cache-Control", "value": "public, max-age=31536000, immutable" }] }
  ]
}
```
Check the generated `dist/` for any other dynamic routes before deploying.

### Step 4: post-release smoke checks
- `https://<host>/manifest.webmanifest` and `/sw.js` return 200; `sw.js` contains a build id, not `__BUILD_ID__`.
- Sign in on iPhone Safari and installed mode (checklist above), plus one native device: create a transaction on each and confirm it appears on the other.
- Import API: `GET /v1/health`, then one real import → live inbox → confirm.

### Monitoring
- Convex dashboard: function error rates for `sync:push`, `pwa*`, `apiImportHttp`; `apiImportAuditEvents` volume (auth failures are capped at 300/min globally).
- Clerk dashboard: sign-in failures by origin.

## 4. Rollback (data-forward only)

- **Web:** redeploy the previous `dist/` artifact. The new build id causes clients to offer Reload onto it. The service worker never caches API data, so rolling back the shell cannot serve stale finances.
- **Backend:** redeploy the previous Convex functions from the prior git commit (`npx convex deploy` from that checkout). The schema is additive, so older functions keep working with the new table present.
- **Never** restore a production backup over live data to undo a release. Financial rows, the change log and tombstones are kept; any bad data is repaired with audited, forward compensating writes (for example, a reversing transaction or a corrected import resolution), applied through mutations.
- A dedicated "web read-only" kill switch is not implemented. If one is wanted before launch, add an `EXPO_PUBLIC_WEB_READ_ONLY` flag that hides write affordances and have the `pwa*` mutations refuse writes.
