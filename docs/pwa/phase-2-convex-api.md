# Phase 2 — Canonical Convex API for the PWA (evidence log)

Plan: https://plans.vanshraja.me/agent/PszNYhnX7vY5 · Worktree: `feature/mobile-pwa`

## Principles

- **One ledger.** PWA writes land in the same tables, with the same field names, integer cents, client-style string `id`s, `createdAtMs`/`updatedAtMs`, `syncVersion` (1 on insert, +1 per change), `deletedAtMs` tombstones, and provenance fields native uses. Every personal change is recorded with `recordUserChange`; every shared-trip change with `recordTripChange`. Native pulls them through the **unchanged** `sync:pull` / `sharedTripSync:pull`.
- **No legacy endpoint changed or removed.** `sync:push` gained one defensive rule only: incoming `transactions` rows with a derived `trip_*` system type are skipped.
- **Derived rows are virtual.** `trip_share` / `trip_cashflow` / `trip_settlement` are computed at read time on the server (`convex/pwaDerived.ts`) with the shared calculator, using the same IDs native derives (`derivedKey` = Clerk subject). They are never inserted. Legacy persisted derived rows are excluded defensively from every PWA read.
- **Client never supplies** `userId`, timestamps, `syncVersion`, or derived system types; validators do not accept them.
- **Optional optimistic concurrency.** Commands accept `expectedSyncVersion`; mismatch throws `ConvexError({ code: "CONFLICT", row, expectedSyncVersion, currentSyncVersion })`. Other codes: `UNAUTHENTICATED`, `FORBIDDEN`, `NOT_FOUND`, `VALIDATION`, `STATE`.

## Modules

| File | Role |
|---|---|
| `convex/pwaAuth.ts` | `requireUser`, `getOwned`, `requireOwnedLive`, `assertExpectedVersion`, `serverNow`, `newId`, `toWire`, `pwaError` |
| `convex/pwaValidation.ts` | cents/date/text/currency/kind validators, owned-reference checks, split validation via `lib/logic/tripSplitCalculator` |
| `convex/pwaWrite.ts` | `insertOwned` / `patchOwned` / `softDeleteOwned` (stamps, versions, NULL-clears, change log) |
| `convex/pwaDerived.ts` | virtual derived projection for local group trips + shared trips, `derivedAccountOverrides` get/set, `excludePersistedDerivedRows` |
| `convex/pwaPersonal.ts` | `getSnapshot`, `getSettings`, `listAccounts` (with balances), `listCategories`, `listTransactions` (paginated), `listDashboard`; account/category create/update/archive/reorder; `updateSettings` |
| `convex/pwaLedger.ts` | `createTransaction`, `updateTransaction`, `deleteTransaction`, `bulkSetCategory`, `bulkDelete`, `createTransfer`, `createAdjustment` |
| `convex/pwaTrips.ts` | `listTrips`, `getTrip`; trip create/update/delete/reorder; participant add/update/remove (one current user enforced); expense create/update/delete/unlink; settlement create/delete |
| `convex/pwaSharedTrips.ts` | `listMine`, `getTrip`; `updateTrip`, participant add/update/remove, expense add/update/delete, settlement record/delete (membership-guarded) |
| `convex/pwaImports.ts` | `listPending`, `countPending`, `reviewOptions`, `confirm`, `ignore` |
| `lib/logic/importProvenance.ts` | shared deterministic `api_import_<hash>` id (native repositories now import it) |
| `lib/logic/syncGuards.ts` | derived-type guard shared by native outbox (`lib/db/sync.ts`) and `convex/sync.ts` |

## View / write → canonical mapping

| PWA need | Table(s) | Scope | Change log | Tombstone | Native counterpart |
|---|---|---|---|---|---|
| Accounts + balances | `accounts`, `transactions` (+virtual derived) | `userId` | `recordUserChange` | `deletedAtMs` | `AccountRepository`, `accountBalance.ts` |
| Categories | `categories` | `userId` | user | `deletedAtMs` | `CategoryRepository` |
| Settings | `userSettings` (client id `local`) | `userId` | user | n/a | `UserSettingsRepository` |
| Transactions list/detail/edit/delete/bulk | `transactions` (+`tripExpenses` cascade) | `userId` | user | `deletedAtMs` | `TransactionRepository`, `Actions.deleteTransaction` |
| Transfer | `transactions` (`systemType=transfer`, from/to ids, deterministic id) | `userId` | user | `deletedAtMs` | `TransactionRepository.create` |
| Adjustment | `transactions` (`systemType=adjustment`, deterministic id) | `userId` | user | `deletedAtMs` | same |
| Local trips | `trips`, `tripParticipants`, `tripExpenses`, `tripSettlements`, `transactions` | `userId` | user | `deletedAtMs` | `TripRepository`, `Actions.createTrip/createGroupExpense` |
| Shared trips | `sharedTrips`, `sharedTripParticipants`, `sharedTripExpenses`, `sharedTripSettlements`, `sharedTripMembers` | member of `tripId` | `recordTripChange` | `deletedAtMs` | `sharedTripWriteRepositories`, `sharedTripSync` |
| Import inbox | `importInboxItems` → `transactions` (`sourceType=api_import`, deterministic id) | `userId` | user (both rows) | `deletedAtMs` | `ImportInboxRepository.confirm/ignore` |
| Derived account choice (web) | `derivedAccountOverrides` (new, PWA-only) | `userId` | **none** (not emitted through legacy sync) | `deletedAtMs` | device-local override (not recoverable) |

## Compatibility gate (automated, `npm run test:convex`, 18 tests)

- Unauthenticated calls rejected; cross-user reads empty and cross-user writes `NOT_FOUND`.
- Web create → `sync:pull` returns the row (`syncVersion` 1), `latestSeq` advances; update clears an optional field via `null`; archive produces a pulled tombstone with `syncVersion` 3.
- Native `sync:push` row (with `needsSync`, NULLs) → visible to `listAccounts` with correct balance; web edit continues the same version chain and pulls back.
- `expectedSyncVersion` mismatch → structured `CONFLICT` with current row.
- Transfer: one row, deterministic id, idempotent within the 5s window, balances move on both accounts. Adjustment: absolute cents, type by sign.
- Group trip expense paid by me: base transaction has no account (share is ledger-only), virtual `trip_share` + `trip_cashflow` with native-identical IDs, account balance reflects cashflow, **no** derived row persisted, none in `sync:pull`. Non-payer: share only. Settlement: expense on payer side.
- Legacy persisted derived row excluded from reads; `sync:push` drops derived rows without touching the change log.
- Override changes only the virtual projection; `latestSeq` unchanged; other users cannot set overrides on foreign accounts.
- Exactly one current user is preserved through participant changes; trip delete tombstones links and keeps base transactions unlinked.
- Import confirm creates the deterministic `api_import_*` transaction once, second confirm is a no-op, ignore after confirm is a `STATE` error; ignore is terminal.
- Shared trips: non-member `FORBIDDEN`; web expense is idempotent and appears in `sharedTripSync:pull`; derived rows and balances reflect it.

## Verification runs (2026-09-20)

| Check | Result |
|---|---|
| `npm test -- --runInBand` (jest, incl. `syncGuards.test.ts`) | 102 passed |
| `npm run test:convex` | 18 passed |
| `npx tsc --noEmit` | clean |
| `npx convex codegen` | ok |
| `CONVEX_DEPLOYMENT=dev:adjoining-gnat-886 npx convex dev --once` | see console log in session (additive schema: `derivedAccountOverrides`) |
| `npx convex run sync:whoami '{}'` | null (CLI is unauthenticated) |
| web export + `npm run web:audit` | OK |

## Known limits / follow-ups

- `getSnapshot` loads all live rows for the user (parity with native, which keeps everything in memory). Very large ledgers should move to `listTransactions` pagination in the Transactions screen; the query exists.
- `sync:pull` still looks up `userSettings` by `by_client_id` on the shared id `local` (pre-existing); PWA reads use `by_user`.
- Import state-machine hardening for `sync:push` (confirm/ignore races across clients) is Phase 6.
- Production deploy is not performed; dev only.
