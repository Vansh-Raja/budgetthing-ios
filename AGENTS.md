# BudgetThing - Agent Context Document

This file provides essential context for AI agents working on this codebase. It should be read at the start of any session to understand the project structure, current state, and future direction.

---

## Important: Follow the Plan

**Always refer to `plan.md` for the detailed migration blueprint.** The plan contains:
- Architecture decisions and rationale
- Database schemas (SQLite local + Convex backend)
- Sync engine design
- Implementation phases with checklists
- UI parity requirements

**Keep both files updated:**
- Update `plan.md` checkboxes as tasks are completed
- Add new decisions or changes to the plan as they arise
- Update this file (`AGENTS.md`) if project structure or key concepts change

Plan workflow rule:
- Add new implementation checklists near the top of `plan.md` (newest plans first).
- As work completes, check off the new plan items.
- Keep older plans below; mark them completed instead of deleting.

Additional:
- Correctness rules live in `rules.md` and are enforced by CI tests.

---

## Project Overview

**BudgetThing** is a personal finance / budget tracking app. It currently exists as a **native iOS SwiftUI app** but is being migrated to **Expo (React Native) + Convex** for cross-platform support and cloud sync.

### Current State (as of January 2026)

- **Production app**: Native iOS SwiftUI with SwiftData (local-only storage)
- **Migration in progress**: Expo + Convex rewrite on branch `feature/expo-convex-migration`
- **Target platforms**: iOS only for v1 (Android planned for future)

---

## Repository Structure (Current)

```
/app/                            # Expo Router routes
/screens/                        # Screen components used by routes
/components/                     # Shared UI components
/lib/
  /db/                           # SQLite wrapper, migrations, repositories
  /sync/                         # Sync engine + reconcile logic
  /logic/                        # Business logic (calculators, formatters)
  /hooks/                         # Data hooks
/convex/                         # Convex backend (schema + functions)
/legacySwiftApp/                 # Legacy Swift app reference code
/plan.md                         # Migration + build plan
```

---

## Key Domain Concepts

### Core Entities

| Entity | Description |
|--------|-------------|
| **Account** | A financial account (cash, bank, credit card). Has balance, optional credit limit. |
| **Category** | Expense category with emoji and optional monthly budget. |
| **Transaction** | An expense, income, transfer, or adjustment. Core financial record. |
| **Trip** | A travel/event budget container. Can be solo or group. |
| **TripParticipant** | A person in a group trip (name + color, one marked as "current user"). |
| **TripExpense** | Links a transaction to a trip with split info (who paid, how to split). |
| **TripSettlement** | Records a payment between participants to settle debts. |

### Special Transaction Types

- **Expense**: Normal spending (negative to account balance)
- **Income**: Money coming in (positive to account balance)
- **Transfer**: Money moving between accounts (`systemType = "transfer"`)
- **Adjustment**: Balance correction (`systemType = "adjustment"`)

### Split Types (for group trips)

1. **Equal**: Split evenly among all participants
2. **Equal Selected**: Split evenly among selected participants only
3. **Percentage**: Each participant pays a percentage
4. **Shares**: Proportional by share count (e.g., 2 shares vs 1 share)
5. **Exact**: Manually specify each person's exact amount

---

## Key Business Logic Files (Swift)

These files contain the core algorithms that must be ported to TypeScript with identical behavior:

| File | Purpose |
|------|---------|
| `TripSplitCalculator.swift` | Calculates how to split an expense among participants |
| `TripBalanceCalculator.swift` | Calculates who owes whom after all expenses and settlements |
| `TripSummaryCalculator.swift` | Computes trip totals, daily averages, budget usage |
| `Transaction+TripShare.swift` | Determines "effective amount" and visibility rules for trip-linked transactions |
| `CurrencyUtils.swift` | Currency formatting with locale awareness |

---

## Migration Decisions (Important Context)

### What's Changing

| Aspect | Before (Swift) | After (Expo) |
|--------|----------------|--------------|
| UI Framework | SwiftUI | React Native |
| Local Storage | SwiftData | SQLite (expo-sqlite) |
| Backend | None (local only) | Convex |
| Authentication | None | Clerk |
| Sync | None | Custom sync engine (local-first) |
| Platform | iOS only | iOS (v1), Android later |

### What's Staying the Same

- **UI/UX**: Pixel-perfect parity with current SwiftUI app
- **Business logic**: Same calculations, same behavior
- **Core features**: All features except widgets/AppIntents

### What's Being Dropped

- iOS Widgets (QuickAddWidget, LatestTransactionsWidget, AccountsChartWidget)
- AppIntents / Siri Shortcuts
- Shared App Group for widget data

### What's Being Added

- **Guest mode**: Use app fully offline without account
- **Cloud sync**: Sign in to sync across devices
- **Guest → Account upgrade**: Upload local data when signing in

---

## Sync Architecture

The app uses a **local-first** architecture inspired by Splitwise:

1. **Local SQLite** is the source of truth for the UI
2. **Outbox queue** buffers changes made while offline
3. **Sync engine** pushes to Convex when online
4. **Pull mechanism** fetches server changes via changelog
5. **Conflict resolution**: Last-write-wins by `updatedAtMs`

Key fields for sync:
- `id`: UUID string (client-generated, stable across devices)
- `updatedAtMs`: Timestamp for conflict resolution
- `deletedAtMs`: Soft-delete marker for sync correctness
- `syncVersion`: Incremented on each local change
- `needsSync`: Boolean flag for outbox

---

## Money Handling

**Critical for correctness:**

- Store as **integer cents** (e.g., `1234` = $12.34)
- Swift uses `Decimal`; JS uses integer math to match
- Split calculations use banker's rounding
- Remainder goes to last participant in list

---

## Authentication

Using **Clerk** with Convex integration:

- JWT template named `convex` in Clerk dashboard
- `ConvexProviderWithClerk` wrapper in Expo app
- Apple Sign-In primary, Google optional
- Guest mode = no auth, local-only

---

## Convex Deployments & Commands (Important)

This repo uses two Convex deployments:

### Dev

- Deployment: `dev:adjoining-gnat-886`
- URL: `https://adjoining-gnat-886.convex.cloud`
- Push schema/functions to dev (one-shot):
  - `CONVEX_DEPLOYMENT=dev:adjoining-gnat-886 npx convex dev --once`

### Production

- Deployment: `prod:ceaseless-mandrill-733`
- URL: `https://ceaseless-mandrill-733.convex.cloud`
- Deploy to production (release-time only):
  - `CONVEX_DEPLOYMENT=prod:ceaseless-mandrill-733 npx convex deploy --yes`

### Critical Warning

- `npx convex deploy` targets production by default. Do NOT use it when you mean dev.
- For dev pushes, use `convex dev --once` with `CONVEX_DEPLOYMENT=dev:...`.

### Expo Note

- Some features require a native dev build/TestFlight build. The emoji picker uses `rn-emoji-keyboard` and does not require a native module.

---

## Testing Strategy

### Unit Tests

Port Swift calculator tests to TypeScript with same fixtures:
- `TripSplitCalculatorTests.swift` → `tripSplitCalculator.test.ts`
- `TripBalanceCalculatorTests.swift` → `tripBalanceCalculator.test.ts`
- `TripSummaryCalculatorTests.swift` → `tripSummaryCalculator.test.ts`

### Parity Fixtures

- All 5 split types with edge cases
- Transfers showing in both accounts correctly
- Adjustments affecting balances
- Transaction effective amount / hiding rules
- Month grouping and totals

---

## UI Parity Reference

### Typography
- `AvenirNextCondensed-Heavy` (titles, large numbers)
- `AvenirNextCondensed-DemiBold` (buttons, labels)
- `AvenirNextCondensed-Medium` (body text)

### Colors
- Background: `#000000` (pure black)
- Accent: iOS system orange
- Text: white with opacity variants (0.5, 0.6, 0.7)

### Navigation
- Swipeable pager with 5 tabs (index 0,1,2,4,3)
- Floating tab switcher pill at bottom
- Full-screen modals for detail views

---

## Implementation Phases

See `plan.md` for detailed breakdown:

1. **Foundation**: Expo setup, SQLite schema, port business logic
2. **Core UI**: Pager, Calculator, Transactions, Accounts, Settings
3. **Trips**: Trip list, detail, split editor, settlements
4. **Auth + Sync**: Clerk, Convex, sync engine, upgrade flow
5. **Polish**: Pixel-perfect audit, animations, edge cases
6. **App Store**: Icons, splash, privacy policy, TestFlight

---

## Common Gotchas

1. **Tab order is weird**: Calculator=0, Transactions=1, Accounts=2, Settings=3, Trips=4 (but displayed as 0,1,2,4,3)
2. **Transfers are single rows**: One transaction with `systemType="transfer"` + from/to account IDs
3. **Trip delete keeps transactions**: TripExpense is deleted but Transaction remains (unlinked)
4. **"Current user" participant**: In group trips, one participant is marked `isCurrentUser=true` for "You owe/get back" calculations
5. **Soft deletes for sync**: `deletedAtMs` is set instead of hard delete; UI filters these out
6. **Shared trips accounting**: `trip_share` is a ledger (owed share) and does not affect personal accounts. Personal accounts change only for real money movement: when you paid an expense (`trip_cashflow`, payer-only) or when a settlement occurs (`trip_settlement`).

---

## Key Files to Read First

When starting work on a feature, read these files:

### For Calculator/Expense Entry
- `BudgetThing/ExpenseEntryView.swift`
- `BudgetThing/RootPagerView.swift` (transaction creation logic)

### For Transactions
- `BudgetThing/TransactionsListView.swift`
- `BudgetThing/TransactionDetailView.swift`
- `BudgetThing/Transaction.swift`

### For Accounts
- `BudgetThing/AccountsView.swift`
- `BudgetThing/AccountDetailView.swift`
- `BudgetThing/Account.swift`
- `BudgetThing/TransferMoneyView.swift`

### For Trips
- `BudgetThing/TripsListView.swift`
- `BudgetThing/TripDetailView.swift`
- `BudgetThing/TripExpensesTab.swift`
- `BudgetThing/TripBalancesTab.swift`
- `BudgetThing/TripSettleUpTab.swift`
- `BudgetThing/TripSplitCalculator.swift`
- `BudgetThing/TripBalanceCalculator.swift`

### For Settings
- `BudgetThing/SettingsView.swift`
- `BudgetThing/CategoriesManageView.swift`
- `BudgetThing/AccountsManageView.swift`

---

## Environment & Build

### Current (Swift)
- Xcode project: `BudgetThing.xcodeproj`
- Target: iOS 17+
- Build: `xcodebuild` or Xcode IDE

### After Migration (Expo)
- Package manager: npm or pnpm
- Dev: `npx expo start`
- Build: `eas build`
- Convex: `npx convex dev`

Build/Release workflow rule:
- Do not run EAS build/submit commands automatically.
- Provide the exact commands for the maintainer to run (EAS builds, submits, and any App Store Connect steps are executed by the maintainer).

Git workflow rule:
- Never create commits or push to GitHub unless the user explicitly asks.
- For UI/native-facing changes, always ask the user to test locally (e.g. `npx expo run:ios`) before committing.
- Test before commit/push: do not commit or push a fix that hasn't been verified by the maintainer.

---

## Questions to Ask User

When uncertain about behavior:

1. "Should this work offline?" → Usually yes
2. "Should this sync across devices?" → Yes if user is signed in
3. "What happens if two devices edit the same thing offline?" → Last-write-wins
4. "Should this look exactly like the Swift app?" → Yes, pixel-perfect

---

## Contact / Resources

- Current Swift app: This repository (`/BudgetThing/`)
- Migration plan: `/plan.md`
- Convex docs: https://docs.convex.dev
- Clerk docs: https://clerk.com/docs
- Expo docs: https://docs.expo.dev
