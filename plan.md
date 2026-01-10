# BudgetThing: SwiftUI to Expo + Convex Migration Plan

## Executive Summary

Rewrite the existing native iOS SwiftUI budget tracker as an **Expo (React Native)** app with **Convex** as the backend. The app will support:

- **Offline-first** operation (works without network, syncs when online)
- **Guest mode** (fully local, no account required)
- **Signed-in mode** (Clerk auth, multi-device sync)
- **Pixel/behavior parity** with the current SwiftUI app
- **iOS only** for v1 (Android can be added later)

---

## Current Codebase Status (2026-01-08)

This section reflects what’s actually present in the repo today (not just the intended target state).

### Implemented (Expo app)

- **Pager-based navigation**: `expo-app/app/(tabs)/index.tsx`
- **Core screens exist**: `expo-app/screens/CalculatorScreen.tsx`, `expo-app/screens/TransactionsScreen.tsx`, `expo-app/screens/AccountsScreen.tsx`, `expo-app/screens/TripsScreen.tsx`, `expo-app/screens/TripDetailScreen.tsx`, `expo-app/screens/SettingsScreen.tsx`, `expo-app/screens/OnboardingScreen.tsx`
- **SQLite schema + migrations**: `expo-app/lib/db/schema.ts` and `expo-app/lib/db/database.ts`
- **Repository layer (CRUD)**: `expo-app/lib/db/repositories.ts`
- **Business logic + tests**: `expo-app/lib/logic/tripSplitCalculator.ts` + `expo-app/lib/logic/__tests__/tripSplitCalculator.test.ts` (and corresponding balance/summary modules/tests)

### Partially implemented / still stubbed

- **Trip add-expense from Trip Detail**: `expo-app/screens/AddExpenseScreen.tsx` still uses `MOCK_TRIPS` and doesn’t persist to SQLite yet.
- **Auth + Sync**: `expo-app/app/_layout.tsx` wires Clerk + Convex providers, and `expo-app/lib/sync/syncEngine.ts` exists, but the Convex backend functions (`expo-app/convex/…`) are not in the repo yet.

---

## Scope Summary

| Feature | Status |
|---------|--------|
| Widgets / AppIntents | **Dropped** |
| Offline use | **Yes** (local-first) |
| Multi-device sync | **Yes** (when signed in) |
| Guest mode (no account) | **Yes** |
| Data migration from Swift app | **No** (fresh DB) |
| Guest → signed-in upgrade | **Yes** (uploads local data) |
| UI/UX parity | **Exact same** |
| Platform | **iOS only** (v1) |

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                      Expo App (iOS)                         │
├─────────────────────────────────────────────────────────────┤
│  UI Layer (React Native)                                    │
│  - Pixel-perfect SwiftUI recreation                         │
│  - Pager navigation + floating tab switcher                 │
│  - Avenir Next Condensed fonts, same spacing/colors         │
├─────────────────────────────────────────────────────────────┤
│  Business Logic (TypeScript modules)                        │
│  - TripSplitCalculator                                      │
│  - TripBalanceCalculator                                    │
│  - Transaction display rules (effectiveAmount, hiding)      │
│  - Currency formatting                                      │
├─────────────────────────────────────────────────────────────┤
│  Data Layer                                                 │
│  ┌─────────────────┐    ┌─────────────────────────────────┐ │
│  │  Local SQLite   │◄──►│  Sync Engine                    │ │
│  │  (expo-sqlite)  │    │  - Outbox queue                 │ │
│  │                 │    │  - Pull cursor                  │ │
│  │  Source of      │    │  - Last-write-wins conflict     │ │
│  │  truth for UI   │    │  - Network state aware          │ │
│  └─────────────────┘    └──────────┬──────────────────────┘ │
│                                    │                        │
│                         ┌──────────▼──────────┐             │
│                         │   Convex Backend    │             │
│                         │   (when signed in)  │             │
│                         └─────────────────────┘             │
└─────────────────────────────────────────────────────────────┘
```

---

## 1. Local Database Schema (SQLite via expo-sqlite)

All tables mirror the current SwiftData models. Every entity has:

- `id` (TEXT, UUID string, primary key)
- `updatedAtMs` (INTEGER, epoch ms)
- `deletedAtMs` (INTEGER, nullable, for soft-delete sync)
- `syncVersion` (INTEGER, incremented on each local change)
- `needsSync` (INTEGER, 0/1, marks pending outbox items)

### Tables

```sql
-- accounts
CREATE TABLE accounts (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  emoji TEXT NOT NULL DEFAULT '💵',
  kind TEXT NOT NULL DEFAULT 'cash', -- 'cash' | 'bank' | 'credit'
  sortIndex INTEGER NOT NULL DEFAULT 0,
  openingBalanceCents INTEGER, -- nullable, for cash/bank
  limitAmountCents INTEGER,    -- nullable, for credit
  billingCycleDay INTEGER,     -- nullable, for credit
  createdAtMs INTEGER NOT NULL,
  updatedAtMs INTEGER NOT NULL,
  deletedAtMs INTEGER,
  syncVersion INTEGER NOT NULL DEFAULT 1,
  needsSync INTEGER NOT NULL DEFAULT 1
);

-- categories
CREATE TABLE categories (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  emoji TEXT NOT NULL,
  sortIndex INTEGER NOT NULL DEFAULT 0,
  monthlyBudgetCents INTEGER,
  isSystem INTEGER NOT NULL DEFAULT 0,
  createdAtMs INTEGER NOT NULL,
  updatedAtMs INTEGER NOT NULL,
  deletedAtMs INTEGER,
  syncVersion INTEGER NOT NULL DEFAULT 1,
  needsSync INTEGER NOT NULL DEFAULT 1
);

-- transactions
CREATE TABLE transactions (
  id TEXT PRIMARY KEY,
  amountCents INTEGER NOT NULL,
  date INTEGER NOT NULL, -- epoch ms
  note TEXT,
  type TEXT NOT NULL DEFAULT 'expense', -- 'expense' | 'income'
  systemType TEXT, -- null | 'transfer' | 'adjustment'
  accountId TEXT, -- FK to accounts.id (nullable)
  categoryId TEXT, -- FK to categories.id (nullable)
  transferFromAccountId TEXT, -- for transfers
  transferToAccountId TEXT,   -- for transfers
  tripExpenseId TEXT, -- FK to tripExpenses.id (nullable)
  createdAtMs INTEGER NOT NULL,
  updatedAtMs INTEGER NOT NULL,
  deletedAtMs INTEGER,
  syncVersion INTEGER NOT NULL DEFAULT 1,
  needsSync INTEGER NOT NULL DEFAULT 1
);

-- trips
CREATE TABLE trips (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  emoji TEXT NOT NULL DEFAULT '✈️',
  isGroup INTEGER NOT NULL DEFAULT 0,
  isArchived INTEGER NOT NULL DEFAULT 0,
  startDate INTEGER, -- epoch ms
  endDate INTEGER,
  budgetCents INTEGER,
  createdAtMs INTEGER NOT NULL,
  updatedAtMs INTEGER NOT NULL,
  deletedAtMs INTEGER,
  syncVersion INTEGER NOT NULL DEFAULT 1,
  needsSync INTEGER NOT NULL DEFAULT 1
);

-- tripParticipants
CREATE TABLE tripParticipants (
  id TEXT PRIMARY KEY,
  tripId TEXT NOT NULL,
  name TEXT NOT NULL,
  isCurrentUser INTEGER NOT NULL DEFAULT 0,
  colorHex TEXT,
  createdAtMs INTEGER NOT NULL,
  updatedAtMs INTEGER NOT NULL,
  deletedAtMs INTEGER,
  syncVersion INTEGER NOT NULL DEFAULT 1,
  needsSync INTEGER NOT NULL DEFAULT 1
);

-- tripExpenses
CREATE TABLE tripExpenses (
  id TEXT PRIMARY KEY,
  tripId TEXT NOT NULL,
  transactionId TEXT NOT NULL,
  paidByParticipantId TEXT,
  splitType TEXT NOT NULL DEFAULT 'equal', -- equal|equalSelected|percentage|shares|exact
  splitDataJson TEXT, -- JSON: { [participantId]: number }
  computedSplitsJson TEXT, -- JSON: { [participantId]: cents }
  createdAtMs INTEGER NOT NULL,
  updatedAtMs INTEGER NOT NULL,
  deletedAtMs INTEGER,
  syncVersion INTEGER NOT NULL DEFAULT 1,
  needsSync INTEGER NOT NULL DEFAULT 1
);

-- tripSettlements
CREATE TABLE tripSettlements (
  id TEXT PRIMARY KEY,
  tripId TEXT NOT NULL,
  fromParticipantId TEXT NOT NULL,
  toParticipantId TEXT NOT NULL,
  amountCents INTEGER NOT NULL,
  date INTEGER NOT NULL,
  note TEXT,
  createdAtMs INTEGER NOT NULL,
  updatedAtMs INTEGER NOT NULL,
  deletedAtMs INTEGER,
  syncVersion INTEGER NOT NULL DEFAULT 1,
  needsSync INTEGER NOT NULL DEFAULT 1
);

-- userSettings (single row per device, synced when signed in)
CREATE TABLE userSettings (
  id TEXT PRIMARY KEY DEFAULT 'local',
  currencyCode TEXT NOT NULL DEFAULT 'USD',
  hapticsEnabled INTEGER NOT NULL DEFAULT 1,
  defaultAccountId TEXT,
  hasSeenOnboarding INTEGER NOT NULL DEFAULT 0,
  updatedAtMs INTEGER NOT NULL,
  syncVersion INTEGER NOT NULL DEFAULT 1,
  needsSync INTEGER NOT NULL DEFAULT 1
);

-- syncMeta (tracks sync state)
CREATE TABLE syncMeta (
  key TEXT PRIMARY KEY,
  value TEXT
);
-- Keys: 'lastPullCursor', 'deviceId', 'userId'
```

---

## 2. Convex Backend Schema

Mirror the local tables, but with user ownership:

```typescript
// convex/schema.ts
import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  accounts: defineTable({
    id: v.string(), // client-generated UUID
    userId: v.string(), // from auth
    name: v.string(),
    emoji: v.string(),
    kind: v.string(), // "cash" | "bank" | "credit"
    sortIndex: v.number(),
    openingBalanceCents: v.optional(v.number()),
    limitAmountCents: v.optional(v.number()),
    billingCycleDay: v.optional(v.number()),
    createdAtMs: v.number(),
    updatedAtMs: v.number(),
    deletedAtMs: v.optional(v.number()),
    syncVersion: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_user_id", ["userId", "id"]),

  categories: defineTable({
    id: v.string(),
    userId: v.string(),
    name: v.string(),
    emoji: v.string(),
    sortIndex: v.number(),
    monthlyBudgetCents: v.optional(v.number()),
    isSystem: v.boolean(),
    createdAtMs: v.number(),
    updatedAtMs: v.number(),
    deletedAtMs: v.optional(v.number()),
    syncVersion: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_user_id", ["userId", "id"]),

  transactions: defineTable({
    id: v.string(),
    userId: v.string(),
    amountCents: v.number(),
    date: v.number(),
    note: v.optional(v.string()),
    type: v.string(),
    systemType: v.optional(v.string()),
    accountId: v.optional(v.string()),
    categoryId: v.optional(v.string()),
    transferFromAccountId: v.optional(v.string()),
    transferToAccountId: v.optional(v.string()),
    tripExpenseId: v.optional(v.string()),
    createdAtMs: v.number(),
    updatedAtMs: v.number(),
    deletedAtMs: v.optional(v.number()),
    syncVersion: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_user_date", ["userId", "date"])
    .index("by_user_id", ["userId", "id"]),

  trips: defineTable({
    id: v.string(),
    userId: v.string(),
    name: v.string(),
    emoji: v.string(),
    isGroup: v.boolean(),
    isArchived: v.boolean(),
    startDate: v.optional(v.number()),
    endDate: v.optional(v.number()),
    budgetCents: v.optional(v.number()),
    createdAtMs: v.number(),
    updatedAtMs: v.number(),
    deletedAtMs: v.optional(v.number()),
    syncVersion: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_user_id", ["userId", "id"]),

  tripParticipants: defineTable({
    id: v.string(),
    userId: v.string(),
    tripId: v.string(),
    name: v.string(),
    isCurrentUser: v.boolean(),
    colorHex: v.optional(v.string()),
    createdAtMs: v.number(),
    updatedAtMs: v.number(),
    deletedAtMs: v.optional(v.number()),
    syncVersion: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_user_trip", ["userId", "tripId"])
    .index("by_user_id", ["userId", "id"]),

  tripExpenses: defineTable({
    id: v.string(),
    userId: v.string(),
    tripId: v.string(),
    transactionId: v.string(),
    paidByParticipantId: v.optional(v.string()),
    splitType: v.string(),
    splitDataJson: v.optional(v.string()),
    computedSplitsJson: v.optional(v.string()),
    createdAtMs: v.number(),
    updatedAtMs: v.number(),
    deletedAtMs: v.optional(v.number()),
    syncVersion: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_user_trip", ["userId", "tripId"])
    .index("by_user_id", ["userId", "id"]),

  tripSettlements: defineTable({
    id: v.string(),
    userId: v.string(),
    tripId: v.string(),
    fromParticipantId: v.string(),
    toParticipantId: v.string(),
    amountCents: v.number(),
    date: v.number(),
    note: v.optional(v.string()),
    createdAtMs: v.number(),
    updatedAtMs: v.number(),
    deletedAtMs: v.optional(v.number()),
    syncVersion: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_user_trip", ["userId", "tripId"])
    .index("by_user_id", ["userId", "id"]),

  userSettings: defineTable({
    userId: v.string(),
    currencyCode: v.string(),
    hapticsEnabled: v.boolean(),
    defaultAccountId: v.optional(v.string()),
    hasSeenOnboarding: v.boolean(),
    updatedAtMs: v.number(),
    syncVersion: v.number(),
  }).index("by_user", ["userId"]),

  // For efficient sync: track all changes per user
  changeLog: defineTable({
    userId: v.string(),
    entityType: v.string(), // "accounts" | "categories" | ...
    entityId: v.string(),
    action: v.string(), // "upsert" | "delete"
    updatedAtMs: v.number(),
    seq: v.number(), // monotonic sequence per user
  })
    .index("by_user_seq", ["userId", "seq"])
    .index("by_user_entity", ["userId", "entityType", "entityId"]),
});
```

---

## 3. Sync Engine Design

### 3.1 Outbox (local → server)

When authenticated and online:

1. Query local DB for rows where `needsSync = 1`.
2. For each, call Convex **idempotent upsert mutation** (keyed by `id + syncVersion`).
3. On success, set `needsSync = 0` locally.

Mutation pattern:

```typescript
// convex/sync.ts
export const upsertAccount = mutation({
  args: { ... },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");
    const userId = identity.subject;

    const existing = await ctx.db
      .query("accounts")
      .withIndex("by_user_id", q => q.eq("userId", userId).eq("id", args.id))
      .first();

    // Last-write-wins: only apply if incoming updatedAtMs >= existing
    if (existing && existing.updatedAtMs > args.updatedAtMs) {
      return { status: "skipped", reason: "stale" };
    }

    if (existing) {
      await ctx.db.patch(existing._id, { ...args, userId });
    } else {
      await ctx.db.insert("accounts", { ...args, userId });
    }

    // Append to changeLog
    const lastSeq = await getLastSeq(ctx, userId);
    await ctx.db.insert("changeLog", {
      userId,
      entityType: "accounts",
      entityId: args.id,
      action: args.deletedAtMs ? "delete" : "upsert",
      updatedAtMs: args.updatedAtMs,
      seq: lastSeq + 1,
    });

    return { status: "ok" };
  },
});
```

### 3.2 Pull (server → local)

1. Client stores `lastPullCursor` (last `seq` from `changeLog`).
2. Call query: get `changeLog` entries where `userId = me AND seq > cursor`, plus the corresponding entity data.
3. Apply each to local SQLite (upsert or soft-delete).
4. Update `lastPullCursor`.

### 3.3 Conflict Resolution

**Last-write-wins by `updatedAtMs`** (at entity level). If two devices edit the same record offline, whichever has the later timestamp wins when both sync.

### 3.4 Network State

Use `@react-native-community/netinfo` to detect online/offline. Sync engine:

- **Offline:** writes go to outbox only.
- **Online:** flush outbox, then pull.
- Optionally subscribe to Convex for realtime updates while online.

---

## 4. Authentication (Clerk)

### 4.1 Setup

- Create Clerk app, enable Apple Sign-In (and optionally Google).
- Create JWT template named `convex` in Clerk dashboard.
- Configure `convex/auth.config.ts` with Clerk issuer domain.
- Wrap Expo app in `<ClerkProvider>` + `<ConvexProviderWithClerk>`.

### 4.2 App Modes

| Mode | Auth State | Data Source | Sync |
|------|------------|-------------|------|
| Guest | Not signed in | Local SQLite only | None |
| Signed-in | Authenticated | Local SQLite + Convex sync | Active |

### 4.3 Guest → Signed-in Upgrade

When a guest signs in:

1. Show confirmation: "Upload your local data to sync across devices?"
2. If yes: push all local entities to Convex (treated as fresh upload with current user).
3. Then enable normal sync.

### 4.4 Sign-out Behavior

Show dialog:

- **"Keep data on this device"** (default): local data stays, user can continue offline or sign in again.
- **"Remove data from this device"**: wipe local SQLite, start fresh.

Recommendation: default to "keep" because it matches user expectation for a finance app (don't lose my data).

---

## 5. Money Representation

| Layer | Format |
|-------|--------|
| Storage (SQLite, Convex) | **Integer cents** (e.g., `amountCents: 1234` = $12.34) |
| UI display | Formatted via `Intl.NumberFormat` with user's `currencyCode` |
| Split calculations | Integer math with banker's rounding + remainder to last participant |

This matches the precision of Swift's `Decimal` and avoids JS floating-point issues.

---

## 6. Local Data Security (v1)

For v1: **no encryption at rest**. iOS already encrypts app data when device is locked (Data Protection). Adding custom encryption adds complexity without significant security gain for this use case.

Future: if needed, can add SQLCipher or similar.

---

## 7. Expo App Structure

```
/app                    # Expo Router (file-based routing)
  /(tabs)               # Main tabbed navigation (pager)
    _layout.tsx         # Pager layout with FloatingPageSwitcher
    index.tsx           # Calculator (ExpenseEntryView)
    transactions.tsx    # TransactionsListView
    accounts.tsx        # AccountsView
    trips.tsx           # TripsListView
    settings.tsx        # SettingsView
  /transaction/[id].tsx # TransactionDetailView (modal)
  /account/[id].tsx     # AccountDetailView
  /trip/[id].tsx        # TripDetailView (with tabs)
  ...                   # Other modals/sheets
/components             # Shared UI components
/lib
  /db                   # SQLite wrapper, migrations, queries
  /sync                 # Sync engine (outbox, pull, conflict)
  /logic                # Business logic (split calc, balance calc, etc.)
  /hooks                # Custom hooks (useAccounts, useTransactions, etc.)
/convex                 # Convex backend
  schema.ts
  auth.config.ts
  sync.ts               # Upsert mutations, pull queries
  ...
```

---

## 8. UI Parity Checklist

| Swift Screen | Expo Equivalent | Key Behaviors to Match |
|--------------|-----------------|------------------------|
| `RootPagerView` | `/(tabs)/_layout.tsx` | Swipeable pager, floating tab switcher, tag order (0,1,2,4,3) |
| `ExpenseEntryView` | `/(tabs)/index.tsx` | Calculator input, category pills, account selector, trip selector, note, date |
| `TransactionsListView` | `/(tabs)/transactions.tsx` | Month sections, totals, bulk selection, filters, swipe actions |
| `AccountsView` | `/(tabs)/accounts.tsx` | Account cards with balances, credit cycle info |
| `TripsListView` | `/(tabs)/trips.tsx` | Active/archived sections, trip cards |
| `SettingsView` | `/(tabs)/settings.tsx` | Currency picker, haptics toggle, manage categories/accounts links |
| `TransactionDetailView` | `/transaction/[id].tsx` | View/edit mode, trip assignment, split details |
| `TripDetailView` | `/trip/[id].tsx` | Tabs (Expenses, Balances, Settle Up), header stats |
| All manage/add/edit views | Corresponding routes | Form fields, emoji pickers, reorder lists |
| `OnboardingView` | Modal on first launch | Swipeable pages, "Get Started" button |

### Typography

- Primary: `AvenirNextCondensed-Heavy`, `AvenirNextCondensed-DemiBold`, `AvenirNextCondensed-Medium`
- iOS RN can use these font family names directly.

### Colors

- Background: `#000000` (pure black)
- Accent: `.orange` (iOS system orange)
- Text: `.white`, `.white.opacity(0.5/0.6/0.7)` equivalents

---

## 9. Validation Plan

### 9.1 Port Swift Tests to TypeScript

| Swift Test File | Port To |
|-----------------|---------|
| `TripSplitCalculatorTests.swift` | `/lib/logic/__tests__/tripSplitCalculator.test.ts` |
| `TripBalanceCalculatorTests.swift` | `/lib/logic/__tests__/tripBalanceCalculator.test.ts` |
| `TripSummaryCalculatorTests.swift` | `/lib/logic/__tests__/tripSummaryCalculator.test.ts` |
| `TripModelTests.swift` | `/lib/logic/__tests__/tripModel.test.ts` |

### 9.2 Parity Fixtures

- Transfers: show in both accounts, excluded from category totals
- Adjustments: affect balance, show as system transaction
- Trip effectiveAmount/hiding rules (`Transaction+TripShare.swift`)
- All 5 split types with edge cases
- Month grouping and totals

---

## 10. Implementation Phases

### Phase 1: Foundation (1-2 weeks)

- [x] Initialize Expo project with TypeScript
- [x] Set up SQLite with schema + migrations
- [x] Port business logic modules (split calc, balance calc, currency formatting)
- [x] Write unit tests for ported logic

### Phase 2: Core UI (2-3 weeks)

- [x] Build pager navigation + floating tab switcher
- [x] Implement Calculator screen (ExpenseEntryView parity)
- [x] Implement Transactions list (with month grouping, selection, filters)
- [x] Implement Accounts view + detail
- [x] Implement Settings view
- [x] Implement onboarding flow

### Phase 3: Trips Feature (1-2 weeks)

- [x] Trips list + add
- [x] Trip detail with tabs (Expenses, Balances, Settle Up)
- [x] Split editor
- [ ] Add expense from Trip Detail (DB-backed; remove `MOCK_TRIPS` usage)

### Phase 4: Auth + Sync (1-2 weeks)

- [x] Wire Clerk + Convex providers in app shell (keys still placeholders)
- [x] Set up Convex backend (schema, auth config)
- [x] Implement sync engine end-to-end (outbox, pull, conflict resolution)
- [x] Guest → signed-in upgrade flow
- [x] Sign-out behavior


### Phase 5: Polish + Parity QA (1 week)

- [ ] Pixel-perfect UI audit vs Swift app
- [ ] Gesture/animation parity
- [ ] Edge case testing
- [ ] Performance optimization

### Phase 6: App Store Prep

- [ ] App icons, splash screen
- [ ] Privacy policy update (sync/Clerk)
- [ ] TestFlight beta

---

## 11. Key Dependencies

| Package | Purpose |
|---------|---------|
| `expo` | Framework |
| `expo-router` | File-based navigation |
| `expo-sqlite` | Local database |
| `expo-secure-store` | Secure token storage |
| `expo-haptics` | Haptic feedback |
| `convex` | Backend |
| `@clerk/clerk-expo` | Authentication |
| `@react-native-community/netinfo` | Network state |
| `react-native-pager-view` | Swipeable pager |
| `react-native-draggable-flatlist` | Reorderable lists |
| `react-native-reanimated` | Animations |
| `decimal.js` | Precise percentage calculations |

---

## 12. Risks and Mitigations

| Risk | Mitigation |
|------|------------|
| Sync conflicts cause data loss | Last-write-wins is transparent; no silent overwrites. User can see last-modified timestamps if needed. |
| Offline queue grows too large | Periodic background sync attempts; queue size limits with oldest-first flush. |
| UI doesn't match SwiftUI exactly | Side-by-side testing with Swift app; screenshot comparison. |
| Clerk/Convex integration issues | Both have official docs and examples for Expo; follow reference templates. |

---

## 13. Future Enhancements (Post-v1)

- **Android support**: Expo makes this straightforward once iOS is stable.
- **True multi-user trips**: Shared trip invites, real-time collaborative expense tracking.
- **Widgets**: If needed, use Expo prebuild + native widget extensions.
- **Encryption at rest**: Add SQLCipher for sensitive data.
- **Web app**: Expo Web or separate Next.js frontend sharing Convex backend.
