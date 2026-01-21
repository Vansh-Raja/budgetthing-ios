# BudgetThing: SwiftUI to Expo + Convex Migration Plan

---

## Data Consistency Hardening (2026-01-21)

Goal: Prevent “write succeeded but UI showed failure” and eliminate accidental duplicates/corruption, especially for high-impact entities (settlements/expenses/transfers). Enforce canonical-vs-derived rules so derived rows never permanently break totals.

### Checklist (Newest First)

DB + concurrency
- [x] Enforce single-writer DB access (queue/mutex around transactions + writes; avoid direct `withTransactionAsync` outside migrations)
- [x] Make multi-step local writes atomic with `withTransaction` (tx + tripExpense linking; remove-from-trip)

Idempotency + dedupe (high impact, 5s window)
- [x] Add stable stringify + deterministic hash helpers
- [x] Deterministic IDs for:
  - [x] shared trip settlements
  - [x] local trip settlements
  - [x] shared trip expenses
  - [x] transfers + adjustments
- [x] Add post-sync + post-bootstrap dedupe sweeper that:
  - [x] soft-deletes non-canonical duplicates in canonical tables
  - [x] triggers reconcile so derived rows + totals reflect “never existed”

UX behavior (no scary false failures)
- [x] Make reconcile/sync followups best-effort (never turn a successful save into an error)
- [x] Add global non-blocking toast host
- [x] Standard toast for followup failures: “Saved. Sync pending.”

Derived rules
- [x] Ensure local trip reconcile deletes derived rows for deleted canonical expenses/settlements (include deleted ids in deletion scope)
- [x] Ensure derived settlement delete path deletes canonical settlement and then reconciles

QA
- [x] Add tests for stable stringify + deterministic IDs
- [ ] Add tests for high-impact dedupe grouping + canonical selection
- [ ] Hammer test: rapid back-to-back saves, forced reconcile failure, forced sync failure

---

## Executive Summary

Rewrite the existing native iOS SwiftUI budget tracker as an **Expo (React Native)** app with **Convex** as the backend. The app will support:

- **Offline-first** operation (works without network, syncs when online)
- **Guest mode** (fully local, no account required)
- **Signed-in mode** (Clerk auth, multi-device sync)
- **Pixel/behavior parity** with the current SwiftUI app
- **iOS only** for v1 (Android can be added later)

---

## Current Codebase Status (2026-01-21)

This section reflects what’s actually present in the repo today.

### Migration Complete ✅

- **Core Functionality**: Fully implemented in Expo (Calculator, Transactions, Accounts, Trips, Settings).
- **Backend**: Convex Schema deployed and syncing correctly (Auth + Sync Engine).
- **Parity**: Swift feature parity achieved (including Shared Trips and Emoji Picker).
- **Navigation**: Pager-based navigation implemented matching Swift.
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

## Pre-TestFlight: Emoji Picker System

Goal: Replace all hardcoded/predefined emoji-only selectors with a shared emoji picker experience that:
- shows curated “Recommended” emojis per context (Category / Trip / Account-kind)
- supports full customization via a system emoji picker (“More…”)
- reuses shared code across the app (no per-screen `EMOJI_OPTIONS` duplication)
- iOS-first (ignore Android for v1/TestFlight)

Note: Some older sections of this plan still reference an `expo-app/` subfolder. The current Expo app lives at repo root (e.g. `app/`, `screens/`, `lib/`, `components/`, `convex/`). This emoji plan uses current paths.

### UX Decisions (Locked)

- Categories: recommended grid + “More…” (no big grouped catalog)
- Trips (local + shared): compact recommended list + “More…”
- Accounts: recommended list depends on account kind (`cash` | `card` | `savings`)
- “More…” uses `rn-emoji-keyboard` (in-app emoji picker UI with search).
- “More…” works in Expo Go and dev builds (no native module required).
- The *recommended emoji selector screen* must be full-screen.
- Selecting an emoji auto-dismisses the selector.
- No “Recently used” row for this build.
- Changing account kind never mutates emoji automatically.

### Audit: Where Emojis Are Edited / Missing Today (Expo)

- Categories
  - `screens/EditCategoryScreen.tsx` (currently inline grid via `EMOJI_OPTIONS`)
  - `screens/CategoryDetailScreen.tsx` opens EditCategoryScreen in a pageSheet
  - `screens/ManageCategoriesScreen.tsx` via `app/settings/categories/index.tsx`
- Accounts
  - `screens/EditAccountScreen.tsx` (emoji exists, but no picker wired)
  - `screens/ManageAccountsScreen.tsx` via `app/settings/accounts/index.tsx`
- Local Trips
  - `screens/AddTripScreen.tsx` (custom modal + `EMOJI_OPTIONS`)
  - `screens/EditTripScreen.tsx` (no emoji picker wired)
- Shared Trips
  - `screens/AddSharedTripScreen.tsx` (custom modal + `EMOJI_OPTIONS`)
  - `screens/EditSharedTripScreen.tsx` (no emoji picker wired)

### Curated Emoji Sets (Final Lists)

Accounts (by `AccountKind`, ~10 each; based on legacy Swift catalog):
- cash: 💵 🪙 👛 👜 🎒 🧾 💴 💶 💷 🧰
- card: 💳 🔒 ✅ 🔁 💸 🏷️ ✨ 📝 📇 📬
- savings: 🏦 🏛️ 💱 📈 📉 🔐 🏧 🪪 📊 🗂️

Trips (local + shared, ~24; reuse existing add-trip lists):
- ✈️ 🏝️ 🏔️ 🏙️ 🏰 🗽 🗼 ⛩️
- 🚗 🚂 🚢 ⛺ 🎢 🏟️ 🏖️ 🏜️
- 🗺️ 📸 🎒 🕶️ 🍷 🍻 🍕 🍱

Categories (~24; high-signal/common personal finance categories + matches seeds):
- 🍔 🛒 🍽️ ☕
- 🚕 🚗 ⛽ 🅿️
- 🏠 💡 🌐 📱
- 💳 🧾 💵 🏦
- 🎉 🎬 🎁 ✈️
- 💊 🏋️ 📚 ❓

### Execution Checklist (Ordered)

#### 1) Dependency + iOS Sanity Check

- [x] Add dependency: `rn-emoji-keyboard`
- [ ] Verify iOS behavior from inside existing modal flows (pageSheet)
- [ ] Confirm selected emoji returns correctly (including multi-codepoint emojis like ✈️)

#### 2) Centralize Curated Emoji Lists

- [x] Add `lib/emoji/recommendedEmojis.ts` exporting:
  - [x] `RECOMMENDED_CATEGORY_EMOJIS`
  - [x] `RECOMMENDED_TRIP_EMOJIS`
  - [x] `RECOMMENDED_ACCOUNT_EMOJIS_BY_KIND` keyed by `AccountKind`

#### 3) Build Shared Full-screen Recommended Selector

- [x] Add `components/emoji/EmojiPickerModal.tsx`
- [x] Requirements:
  - [x] Full-screen `Modal` presentation on iOS
  - [x] Shows recommended emoji grid
  - [x] Highlights current selection
  - [x] “More…” triggers system emoji picker via `EmojiPopup`
  - [x] Any selection closes modal immediately

#### 4) Wire Into Categories

- [x] Update `screens/EditCategoryScreen.tsx`
  - [x] Remove inline emoji grid + `EMOJI_OPTIONS`
  - [x] Emoji button opens `EmojiPickerModal` with `RECOMMENDED_CATEGORY_EMOJIS`

#### 5) Wire Into Accounts

- [x] Update `screens/EditAccountScreen.tsx`
  - [x] Emoji button opens `EmojiPickerModal`
  - [x] Recommended list depends on `kind`
  - [x] Ensure kind changes do NOT modify emoji automatically

#### 6) Wire Into Local Trips

- [x] Update `screens/AddTripScreen.tsx`
  - [x] Remove custom emoji modal + `EMOJI_OPTIONS`
  - [x] Use `EmojiPickerModal` with `RECOMMENDED_TRIP_EMOJIS`
- [x] Update `screens/EditTripScreen.tsx`
  - [x] Add emoji picker (missing today)

#### 7) Wire Into Shared Trips

- [x] Update `screens/AddSharedTripScreen.tsx`
  - [x] Remove custom emoji modal + `EMOJI_OPTIONS`
  - [x] Use `EmojiPickerModal` with `RECOMMENDED_TRIP_EMOJIS`
- [x] Update `screens/EditSharedTripScreen.tsx`
  - [x] Add emoji picker (missing today)

#### 8) Cleanup + Consistency

- [x] Ensure no per-screen `EMOJI_OPTIONS` remain for these contexts
- [x] Ensure all emoji buttons are tappable and auto-dismiss on selection

### Manual QA (iOS)

- [ ] Categories: create/edit supports recommended + “More…”, persists and renders everywhere
- [ ] Accounts: create/edit supports recommended + “More…”, kind change does not alter emoji
- [ ] Trips (local + shared): add + edit supports recommended + “More…”, persists and renders in list + headers

---

## QoL: Transactions Filters (Transactions Tab Only)

Goal: Add a Transactions tab filter system that is offline-first, optionally syncable, and respects existing transaction visibility rules.

### UX Decisions (Locked)

- Filters apply ONLY to `screens/TransactionsScreen.tsx`.
- Filter button shows a dot indicator when filters are active (no count in v1).
- Month totals follow the active filters.
- Multi-select for Category, Account, and Trip.
- Provide an `Uncategorized` pseudo-category.
- Account filter on transfers matches either `transferFromAccountId` or `transferToAccountId`.
- System types are individually hideable: `transfer`, `adjustment`, `trip_share`, `trip_settlement`.
- `trip_cashflow` remains hidden from Transactions tab always.
- Trip filters include BOTH a 3-state mode (All / Trips / Non-trip) and an optional trip multi-select.
- If `Reset filters on reopen` is enabled, `Sync transaction filters` is forced OFF.

### Execution Checklist (Ordered)

#### 1) Filter predicate + tests

- [x] Add `lib/ui/transactionFilters.ts` (filter state + predicate)
- [x] Add `lib/ui/__tests__/transactionFilters.test.ts`

#### 2) SecureStore persistence

- [x] Add `lib/ui/transactionFiltersStorage.ts` (guest + per-user keys)

#### 3) userSettings schema + types + repo

- [x] SQLite: bump `lib/db/schema.ts` to schema version 5 and add userSettings columns
- [x] Update `lib/logic/types.ts` (`UserSettings` fields)
- [x] Update `lib/db/repositories.ts` (`UserSettingsRepository` read/write)

#### 4) Convex schema + sync allowlists

- [x] Update `convex/schema.ts` (new optional userSettings fields)
- [x] Update `convex/sync.ts` (NULL-clears allowlist)
- [x] Update `lib/db/sync.ts` (optional field normalization)

#### 5) Settings UI toggles

- [x] Update `screens/SettingsScreen.tsx`
  - [x] Toggle: Sync transaction filters
  - [x] Toggle: Reset filters on reopen (forces sync OFF)

#### 6) Filter sheet UI

- [x] Add `components/transactions/TransactionsFilterSheet.tsx`

#### 7) Wire into TransactionsScreen

- [x] Update `screens/TransactionsScreen.tsx`
  - [x] Right-aligned filter button with dot indicator
  - [x] Apply filters before month grouping so totals follow filters
  - [x] Load/save filters via SecureStore and (optionally) userSettings sync
  - [x] Reset-on-reopen support

### Manual QA (iOS)

- [ ] Filter dot indicator appears/disappears correctly
- [ ] Month totals update with filters
- [ ] System toggles independently hide/show transfer/adjustment/trip_share/trip_settlement
- [ ] Category filter works with `Uncategorized`
- [ ] Account filter matches either side of transfers
- [ ] Trip mode and trip selection work for local + shared trips
- [ ] Reset-on-reopen resets filters after background/foreground

---

## Release 2.0.1 (TestFlight Build 201)

Goal: Ship `2.0.1 (201)` with shared trips + emoji picker, without breaking existing TestFlight build `200`.

### Versioning

- [x] Bump `app.json` → `expo.version = 2.0.1`
- [x] Bump `app.json` → `ios.buildNumber = 201` (monotonic; build 200 already uploaded)
- [x] Optional: bump `package.json` version → `2.0.1`

### Preflight Checks

- [x] Ensure `.expo/` is not tracked (remove `.expo/README.md` from git)
- [x] `npx expo-doctor` passes
- [x] `npx tsc -p tsconfig.json --noEmit` passes
- [x] `npm test` passes
- [x] Align Expo SDK dependency versions via `npx expo install` (runtime deps)
- [x] Align Jest dev deps (does not affect runtime, but keeps `expo-doctor` clean)

### Convex Production Deploy (must be additive)

Constraints:
- Build `200` must remain functional (no endpoint/table renames/removals)
- Shared trips are new for prod; deploy adds new tables + functions only

Steps:
- [ ] Export/backup production Convex data (dashboard export)
- [ ] Confirm production Convex env has `CLERK_JWT_ISSUER_DOMAIN` set correctly
- [ ] Deploy Convex to prod deployment `ceaseless-mandrill-733`
- [ ] Post-deploy smoke:
  - [ ] Existing endpoints still OK: `sync:push`, `sync:pull`, `sync:latestSeq`
  - [ ] New endpoints available: `sharedTrips:create`, `sharedTripInvites:joinByCode`, `sharedTripSync:push/pull`

### Build + Submit (TestFlight)

- [ ] Create EAS iOS store build (production profile)
- [ ] Submit to TestFlight
- [ ] App Store Connect: set “What to Test” notes (shared trips + emoji)

### Upgrade + Migration QA (iOS)

- [ ] Upgrade test: install build `200` with real data → update to build `201` → confirm local data still present
- [ ] Sync continuity: 2 devices signed-in → edits propagate, no duplicates
- [ ] Shared trips: create → rotate code → join → add expense → settle
- [ ] Emoji picker: recommended + “More” works in TestFlight build (native module included)

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
- [x] Account current-balance edits insert `systemType="adjustment"` (category: `System · Adjustment`)
- [x] Default account (`userSettings.defaultAccountId`) preselects calculator account (does not affect account order)
- [x] Calculator ⊕: categories opens Manage Categories; trips switches tabs and opens Add Trip
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

---

## 14. Shared Trips v1 (INR-only, Splitwise-style)

This section is the implementation blueprint for turning Trips into a shared, Splitwise-like feature where multiple signed-in users can see and collaborate on the same trip.

### 14.1 Scope (v1)

- Shared group trips across multiple signed-in users (Clerk)
- Guest participants supported (non-app people can be included in splits)
- Join by code (no email invites / no deep links in v1)
- Any member can:
  - add/edit/delete trip expenses
  - regenerate join code
  - remove members
  - delete the trip (global delete)
- **INR-only**: `currencyCode` is fixed to `INR` for all trips and immutable.

### 14.2 Non-goals (v1)

- Currency conversion / exchange rates
- Multi-currency accounts or cross-currency totals
- Fine-grained roles/permissions (admin-only actions)

### 14.3 Core Behavioral Rules (must match exactly)

#### Trip visibility

- Every member of a trip can see every trip expense in the Trip UI, even if their share is 0.
- For members with `myShareCents == 0`, the expense should show as “Not included” (or equivalent) in the trip UI.

#### Transactions tab visibility (personal)

Trip expenses should appear in the main Transactions tab **only if the user is included in the split**:

- If `myShareCents > 0`: show a personal entry with amount = `myShareCents`.
- If `myShareCents == 0`: do not show it in Transactions (even if the user paid).

Examples:

- Trip has 5 members A, B, C, D, E.
- Expense is split among A, B, C only.
  - Trip UI: A/B/C/D/E can all see the expense.
  - Transactions tab: only A/B/C get an entry.

Special case (“paid on behalf”):

- If A paid for B (payer=A) but split includes only B:
  - A has `myShare == 0` → no Transactions-tab entry for A.
  - B has `myShare > 0` → Transactions-tab entry for B.

#### Settlements

- Settlements represent real cashflow.
- When a settlement is recorded, it should automatically create personal cashflow transactions:
  - receiver: income
  - payer: expense
- These should go into `userSettings.defaultAccountId` at first creation and be editable later.

#### Category

- Category is shared across members and must live on the shared trip expense.
- Store category snapshot on the expense: `categoryName`, `categoryEmoji`.

### 14.4 Architecture Overview (two ledgers + reconciliation)

Trips require separating “shared trip ledger” from “personal cashflow ledger” and linking them safely.

#### Shared Trip Ledger (shared across all members)

A single set of trip entities exists per trip and is synced to all members.

#### Personal Ledger (per user)

Accounts/categories/personal transactions remain per-user. Trip participation produces *derived* personal entries (below).

#### Reconciliation (derived personal transactions)

We will materialize derived personal `transactions` locally so:

- Transactions tab rendering is straightforward and offline-first.
- Derived rows are idempotent across devices.
- Deletes/edits to shared trip expenses correctly cascade.

### 14.5 Data Model (Convex)

Current Convex schema is user-owned (each record has `userId`). Shared trips require membership-based access.

Plan: introduce new membership-scoped tables (keep existing user-owned tables for now during migration).

#### New tables

- `sharedTrips`
  - `id`, `name`, `emoji`, `currencyCode` (always `INR`), `createdAtMs`, `updatedAtMs`, `deletedAtMs`
- `sharedTripMembers`
  - `tripId`, `userId`, `participantId`, `joinedAtMs`, `deletedAtMs`
- `sharedTripParticipants`
  - `tripId`, `name`, `colorHex`, `linkedUserId?`, `createdAtMs`, `updatedAtMs`, `deletedAtMs`
- `sharedTripExpenses`
  - `tripId`, `amountCents`, `dateMs`, `note`
  - `paidByParticipantId`
  - `splitType`, `splitDataJson`, `computedSplitsJson`
  - `categoryName`, `categoryEmoji`
  - `createdAtMs`, `updatedAtMs`, `deletedAtMs`
- `sharedTripSettlements`
  - `tripId`, `fromParticipantId`, `toParticipantId`, `amountCents`, `dateMs`, `note`
  - `createdAtMs`, `updatedAtMs`, `deletedAtMs`
- `sharedTripInvites`
  - `tripId`, `code`, `createdAtMs`, `expiresAtMs`, `uses`, `maxUses`, `createdByUserId`

#### Access control

- All shared trip queries/mutations must require: caller is a `sharedTripMember` of that `tripId`.
- `joinByCode` is the exception: it validates code then creates membership.

### 14.6 Data Model (SQLite)

Local DB will mirror the shared trip tables and add linking fields to support derived transactions.

#### New local tables

- `tripMembers` (mirror of `sharedTripMembers`)
- `tripInvites` (optional local cache)

#### Trip expenses

We will evolve local `tripExpenses` to store the shared expense fields directly:

- `amountCents`, `dateMs`, `note`
- `categoryName`, `categoryEmoji`

(Trip UI should not require joining through a local cashflow transaction to render an expense.)

#### Transactions linking

Add to `transactions`:

- `sourceTripExpenseId` (nullable)
- `sourceTripSettlementId` (nullable)

### 14.7 Derived Transaction Types (local-only, idempotent)

We will standardize the following `systemType` values:

- `trip_share` (derived, appears in Transactions tab)
  - Exists iff `myShareCents > 0`
  - `amountCents = myShareCents`
  - `accountId = NULL` (does not affect account balances)
  - Linked via `sourceTripExpenseId`
  - Tapping it navigates to the original trip expense
- `trip_cashflow` (payer cashflow)
  - Exists only if payer participant is linked to a signed-in user
  - `amountCents = totalAmountCents`
  - `accountId = defaultAccountId` on first create, user-editable later
  - Hidden from Transactions tab to avoid double-counting
  - Linked via `sourceTripExpenseId`
- `trip_settlement` (settlement cashflow)
  - payer gets expense, receiver gets income
  - `accountId = defaultAccountId` on first create, user-editable later
  - Linked via `sourceTripSettlementId`

#### Deterministic IDs

To prevent duplicates across a user’s devices, derived transactions must have deterministic IDs:

- `trip_share`: `hash(tripExpenseId + userId)`
- `trip_cashflow`: `hash(tripExpenseId + payerUserId)`
- `trip_settlement`: `hash(settlementId + userId + direction)`

#### Preserve user edits

Reconciliation should never overwrite a user’s chosen `accountId` for `trip_cashflow` and `trip_settlement` once set.

### 14.8 Sync Design (two scopes)

We keep existing per-user sync for personal tables and add a second sync scope for shared trips.

#### A) User-scoped sync (existing)

- accounts, categories, transactions, userSettings, etc.

#### B) Trip-scoped sync (new)

- Pull list of `sharedTripMembers` for current user to get `tripId`s.
- Maintain per-trip cursors (like `changeLog.seq` but keyed by trip).
- For each trip:
  - push pending shared trip rows
  - pull new shared trip rows
  - apply to SQLite
  - run reconciliation to upsert/delete derived local transactions

Conflict resolution remains last-write-wins by `updatedAtMs`.

### 14.9 UI Flows (v1)

- Trips list:
  - “Join Trip” (enter join code)
  - “Invite” (show code; regenerate)
- Join:
  - user selects/claims an existing guest participant or creates a new participant
- Trip detail:
  - Expenses list shows all expenses
  - For excluded users: show “Not included”
- Trip settings:
  - members list + remove
  - regenerate join code
  - delete trip (global)
- Transactions tab:
  - render `trip_share` rows + normal transactions + settlements
  - hide `trip_cashflow` rows
  - tapping `trip_share` navigates to original trip expense

### 14.10 Implementation Checklist

Branch + planning:
- [ ] Create branch `feature/shared-trips-v1`
- [ ] Add this section to `plan.md`

Backend (Convex):
- [ ] Add `sharedTrips`/members/participants/expenses/settlements/invites tables
- [ ] Add trip changelog + trip sync endpoints (`tripSync:push`/`tripSync:pull`)
- [ ] Add join code endpoints (create/rotate/join)
- [ ] Enforce membership ACL on all shared trip operations

Local DB (SQLite):
- [ ] Add local tables + columns (`tripMembers`, `sourceTripExpenseId`, `sourceTripSettlementId`)
- [ ] Evolve `tripExpenses` to store shared expense fields directly (amount/date/category)

Client:
- [ ] Add trip-scoped sync loop with per-trip cursors
- [ ] Implement reconciliation for `trip_share` / `trip_cashflow` / `trip_settlement`
- [ ] Refactor Trips UI to use shared expense fields
- [ ] Refactor Transactions tab to render derived `trip_share` rows and link to trip expense

Testing:
- [ ] Add reconciliation idempotency tests (no dupes; deletes cascade)
- [ ] Add join-code + membership edge-case tests

---
