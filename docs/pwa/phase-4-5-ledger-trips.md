# Phase 4–5: Core ledger and trip parity on web (evidence log)

Plan: https://plans.vanshraja.me/agent/PszNYhnX7vY5 · Branch: `feature/pwa-ledger-trips` (stacked on `feature/mobile-pwa`)

The screens were already connected to direct Convex data in Phase 3 (shared screens with `.web.*` adapters). This phase closed the parity gaps that the browser and contract tests found, and added coverage for every ledger and trip flow the plan lists.

## Fixes

| Issue found | Root cause | Fix |
|---|---|---|
| Web balance adjustments had no category | `createAdjustment` dropped `categoryId` | Accepts an owned `categoryId`; web passes native's "System · Adjustment" category |
| Web created "System · Adjustment" as a normal category, which leaked into the calculator's category row | `createCategory` forced `isSystem: 0` | Honours `isSystem` (sortIndex 9999, same as native and the first-run seed) |
| Changing the default account moved **past** trip payments and settlements onto the new account | Native keeps a derived row's account once it is assigned (`upsertDerivedBatch` preserves `accountId`), but the web projection recomputes with the current default on every read | Before the effective default changes (web `updateSettings` or native `sync:push`), the server pins every not-yet-overridden cashflow/settlement row to the account it charges now (`pinDerivedAccounts`). Writes only the PWA-only override table; nothing enters the changeLog |

Accessibility labels were added to the calculator mode toggles, calculator trip/category emoji rows, the Transactions filter button, and the split editor's share +/- and include toggles. There is no visual change; VoiceOver on native benefits too.

## Coverage

| Plan requirement | Evidence |
|---|---|
| Expense, edit, delete, native pull convergence | `ledger-flows.spec.ts` |
| Income | `ledger-extended.spec.ts`: income via calculator, exactly one income row, balance + amount |
| Transfer as one canonical row | `ledger-flows.spec.ts`; contract: deterministic id + idempotency |
| Adjustment | `ledger-extended.spec.ts`: Current Balance edit → one adjustment under the hidden system category, pulled by native with its category |
| Filters | `ledger-extended.spec.ts`: hide Adjustments, then Clear |
| Categories, currency | `ledger-flows.spec.ts` |
| Derived rows not editable or bulk-deletable | contract: derived system types rejected; bulk ops skip derived |
| All five split types incl. remainder | contract: server splits equal `TripSplitCalculator` for equal / equalSelected / percentage / shares / exact on 100.01, integer cents, sum = total; invalid inputs rejected. Browser: Shares (2:1) and Exact via the Split Options sheet |
| Payer vs non-payer, settlement movement | contract + `trips-flows.spec.ts` (local group trip) |
| Shared trips: invite, join, ACL, settle up | `trips-flows.spec.ts`: B cannot read before joining; B settles from the suggested payment via PAY → Record Payment; both converge; native `sharedTripSync:pull` sees web rows |
| Virtual rows never persisted or synced | contract + browser native pull checks |
| One current user per local group trip | contract |
| Trip delete keeps base transactions unlinked | contract + browser |

## Derived-account boundary (needs maintainer sign-off)

- **Native:** the account a trip payment or settlement charges is chosen per device and stored only in that device's SQLite. It never syncs.
- **Web:** the choice is stored per user on the server in `derivedAccountOverrides`. It applies only to the web projection and is never sent to native.
- **Consequence:** if a user picks a different account for the same trip payment on web and on a native device, their account balances differ between the two. Canonical data (trips, expenses, splits, settlements, base transactions) is identical on both.
- **Default changes:** on both runtimes, changing the default account affects only new trip payments (see the fix above).
- **Decision taken in code:** accept runtime-specific account projection, as the plan allows, rather than feature-gating group-trip web writes. No native release is required. If exact cross-device account parity is wanted later, it needs a versioned native adapter that reads the override table.

## Verification (2026-10-09)

| Check | Result |
|---|---|
| `npx tsc --noEmit` | clean |
| `npm test -- --runInBand` | 102 passed |
| `npm run test:convex` | 24 passed |
| `npm run web:export` + `npm run web:audit` | OK, 0 boundary violations |
| Playwright, mobile WebKit, full suite | 17 / 17 passed |
| Convex | pushed to **dev** only (`dev:adjoining-gnat-886`) |

Still pending: real-iPhone Safari pass (maintainer), and other browsers for the new specs (only mobile WebKit was run this phase).
