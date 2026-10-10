# Phase 6: Import inbox and cross-client compatibility (evidence log)

Plan: https://plans.vanshraja.me/agent/PszNYhnX7vY5 · Branch: `feature/pwa-import-sync`

## Server-authoritative import state machine (`convex/importSync.ts`)

API-import inbox items and their deterministic `api_import_*` transactions are no longer processed by generic last-write-wins in the legacy native `sync:push`. Every other table is unchanged, and the push still returns `{ status: "ok" }`, so released native clients keep working.

| Incoming (native push) | Server state | Result |
|---|---|---|
| confirm + exact deterministic tx | pending | confirmed; tx applied with provenance pinned (works even if the device clock is behind) |
| valid deterministic tx alone | pending | confirms the item (can't diverge) |
| "confirmed" without its tx | pending | refused; winner re-recorded so the device re-pulls pending |
| ignore | pending | ignored |
| ignore / pending (stale) | confirmed | no-op; winner re-recorded with newer `updatedAtMs` |
| confirm / tx (stale) | ignored | tombstoned resolution tx at the deterministic id (built from the item's immutable data), winner re-recorded, audit `import_sync_server_winner_ignored` |
| inbox row for an unknown or deleted id | n/a | dropped (only the server creates items) |
| import tx with missing/wrong provenance | n/a | dropped (never becomes active) |
| changed amount/merchant/etc. on an item | any | ignored (payload immutable; only review state moves) |

Native's pull overwrites a local row once it's no longer `needsSync=1`, and clients mark rows synced after the `ok` push and before the full pull. The losing device therefore converges on its next pull: an ignored item's resolution transaction arrives with `deletedAtMs` and drops out of lists and account and month totals.

**Deliberate deviation from the plan (needs sign-off):** ordinary edits and deletes of an already-confirmed imported transaction still go through LWW like any transaction (provenance stays pinned). Making amount/date/account/category immutable after confirmation would silently revert legitimate edits made in released native apps. An audited edit/reversal flow can come later.

## Web inbox

- The shared inbox screen and Settings › Agent Import API screen now run on web (placeholders removed) via the existing `pwaImports` adapters (atomic server `confirm` / `ignore`).
- `WebBootstrap` subscribes to `pwaImports.countPending` and emits `importInboxChanged`, so new API imports and other-device decisions update the inbox and badges live.

## Coverage

| Requirement | Evidence |
|---|---|
| Confirm, clock skew, confirm/ignore races, stale confirm vs ignored, unattributable rows, immutable payload, lone tx, web+native idempotency | `tests/convex/importSync.test.ts` (7) |
| Unauthorized/malformed API requests, batch atomicity, failed-auth bounds | `tests/convex/reviewFixes.test.ts`, `lib/logic/__tests__/importApiValidation.test.ts` |
| API → live web inbox → swipe confirm → one provenance tx; swipe-left → review → ignore; native pull sees both | `e2e/import-flows.spec.ts` against the real dev HTTP endpoint |

## Not done here (maintainer)

- Real-iPhone Shortcut / Hermes voice and keyword flows (persistent per-event UUID, retry reuse). These need your devices and agent setup.
- Production agent-API docs (`Website/agents/budgetthing/*`) point at the production `.convex.site`. They are **not release-ready** until a production Convex deploy is explicitly authorized; the import API stays undeployed in production until then.

## Verification (2026-10-09)

| Check | Result |
|---|---|
| `npx tsc --noEmit` | clean |
| `npm test -- --runInBand` | 104 passed |
| `npm run test:convex` | 46 passed |
| web export + audit | 0 violations |
| Playwright, mobile WebKit, full suite | 18 / 18 |
| Convex | dev only |
