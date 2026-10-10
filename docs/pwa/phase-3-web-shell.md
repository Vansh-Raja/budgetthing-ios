# Phase 3 — Mobile web navigation and shared chrome (evidence log)

Plan: https://plans.vanshraja.me/agent/PszNYhnX7vY5 · Worktree: `feature/mobile-pwa`

## Approach: shared screens, platform-split data layer

Instead of forking screens, the native SQLite/sync layer now has real, Convex-backed web implementations. Metro resolves `.web.ts(x)` siblings on web, so every shared screen (Calculator, Transactions, Accounts, Trips, Settings, detail and edit sheets) runs unchanged with the existing visual language.

| Native module | Web adapter | Backing |
|---|---|---|
| `lib/db/repositories.ts` | `lib/db/repositories.web.ts` | `pwaPersonal`, `pwaLedger`, `pwaTrips`, `pwaImports`, `pwaDerived` |
| `lib/db/sharedTripRepositories.ts`, `…WriteRepositories.ts`, `…LocalRepository.ts` | `.web.ts` siblings | `pwaSharedTrips` (+ `resolveMeta`) |
| `lib/db/database.ts` | `lib/db/database.web.ts` | no SQL; `withTransaction` just batches events |
| `lib/sync/SyncProvider.tsx`, `localTripReconcile.ts`, `sharedTripReconcile.ts`, `localDbOwner.ts`, `syncEngine.ts` | `.web.ts(x)` siblings | no-ops (server computes derived rows; nothing to reconcile or push) |
| `lib/hooks/useData.ts`, `useTrips.ts`, `useSharedTrips.ts`, `useUserSettings.tsx` | `.web.*` siblings | live `useQuery` subscriptions (`getSnapshot`, `listTrips`, `listMine`), one shared subscription per query |
| `lib/logic/actions.ts` | `actions.web.ts` | atomic server commands |

`lib/web/mappers.ts` converts wire rows to the exact domain shapes (numeric booleans → booleans, virtual derived rows → `Transaction`), and `lib/web/convexClient.ts` lets imperative repository calls reach the client registered by the web root layout.

Boundary enforcement was refined: `.web.*` adapters inside `lib/db` and `lib/sync` (and the pure `sharedTripDerivedIds.ts`) are the only files from those directories allowed on web; the Metro guard and the source-map audit both encode this.

## Navigation and chrome

- **Pager:** `components/ui/Pager.tsx` wraps `react-native-pager-view`; `Pager.web.tsx` is a horizontally paged ScrollView with CSS scroll snapping (swipe on touch, `setPage` programmatic). Inactive pages are `aria-hidden` so screen readers and automation only see the active page. Used by the tab shell, local trip detail, shared trip detail (and onboarding on native).
- **Tab shell:** `screens/tabs/MainTabsShell.tsx` is the shared implementation (native and web route files re-export/wrap it). Tab order unchanged: Calculator, Transactions, Accounts, Trips, Settings. On web the selected tab is mirrored to `?tab=N`, so reload, browser back/forward, and deep links land on the same tab.
- **Date/time input:** `components/ui/DateTimePicker.tsx` re-exports the community picker; `DateTimePicker.web.tsx` renders a dark-styled native `<input type="date|time|datetime-local">` with the same `onChange(event, date)` contract. Six screens now import the shared component.
- **Modals/sheets:** RN `Modal` renders through react-native-web portals; popups, action sheets and toasts (existing providers) work unchanged.
- **Haptics/blur/clipboard:** Expo web builds (no-op haptics, CSS blur, async clipboard).
- **Fonts:** `constants/theme.ts` appends a documented CSS fallback stack on web only (`Avenir Next Condensed` on Apple devices, condensed system faces elsewhere); native keeps the PostScript names.
- **Focus/inputs:** web-only CSS in `app/+html.tsx` keeps an orange keyboard focus ring and drops mouse focus rings; placeholders use the muted text colour.
- **Unsaved edits:** `lib/web/useUnsavedChangesWarning.ts` (beforeunload; no-op on native) is available for server-backed forms.
- **Settings:** the native "Sync" rows are hidden on web and replaced by the connection/identity status card (`components/web/WebRuntimeStatusSlot.web.tsx`).
- **First run:** `components/web/WebBootstrap.tsx` calls `pwaPersonal.seedDefaultsIfEmpty`, which creates the same default categories and Cash account native creates, only when the account is completely empty.

## Verification (2026-09-20)

| Check | Result |
|---|---|
| `npx tsc --noEmit` | clean |
| `npm test -- --runInBand` | 102 passed |
| `npm run test:convex` | passes (contracts + seeding) |
| `npx expo export --platform web --source-maps` + `npm run web:audit` | OK — 78 project modules, 0 violations |
| Playwright `auth-shell.spec.ts` (mobile WebKit) | 6/6 with the real tab shell |
| Playwright `screens-smoke.spec.ts` (mobile WebKit) | all 5 tabs + 6 nested routes render; screenshots in `reports/screens/` |

Known benign console noise recorded in the smoke test: WebKit reports fetches aborted by a full navigation as "access control checks" (Clerk token refresh mid-navigation); `react-native-draggable-flatlist` reads `element.ref` (React 19 deprecation warning).

## Screenshot reference checklist (phone web vs. iOS intent)

| Screen | Web state | Notes |
|---|---|---|
| Calculator | matches layout (pills, amount, keypad, ✓) | uses `₹` from settings currency |
| Transactions | matches (title, inbox icon, Select pill, empty state, tab pill) | |
| Accounts | matches (title, Manage pill, empty state) | |
| Trips | matches (title, join/add icons, empty state CTA) | |
| Settings | matches sections; web status card replaces native Sync rows | tab pill overlaps bottom rows like native |
| Settings › Accounts / Categories | header + list render | draggable list works with mouse/touch |
| Transfer | matches (From/To rows, amount, note, Transfer) | |

Exact pixel parity is not claimed; deviations are recorded in Phase 8 after the real-device pass.
