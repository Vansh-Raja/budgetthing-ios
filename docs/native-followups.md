# Native (iOS/Android) app follow-ups

Changes the native app needs before it is supported again alongside the web app. Each item says why it is needed, what to change, and how to verify it.

---

## 1. Shared "which account a trip payment charges" (derived-account overrides)

**Why.** For local group trips and shared trips, the app derives two kinds of personal rows:
- `trip_cashflow`: "you paid", charged to one of your accounts;
- `trip_settlement` in/out: settlement money moving through an account.

Which account each derived row charges is a user choice.
- **Native today:** the choice is stored only on that device. It's the `accountId` on the locally persisted derived row: `TransactionRepository.updateDerivedAccountId`, preserved by `upsertDerivedBatch` (`preserveAccountIdRows`).
- **Web:** the choice is stored per user on the server in `derivedAccountOverrides` (`convex/pwaDerived.ts`) and is **not** synced to native.

If the same payment is assigned different accounts on web and on a phone, their account balances differ. Canonical trip data (expenses, splits, settlements) always matches.

**Target.** One source of truth on the server, synced to every device.

### Server (Convex)
1. Add `derivedAccountOverrides` to the legacy sync protocol:
   - in `sync:pull`: emit rows from the change log;
   - in `sync:push`: accept rows, with LWW on `updatedAtMs`/`revision`, owner-scoped;
   - record a change-log entry on every web write (`upsertDerivedOverride`, `setOverride`, `setOverrideForDerivedRow`, `pinDerivedAccounts`). Today these deliberately skip the change log.
2. Version the protocol so old clients are unaffected: emit the new key only to clients that send `protocolVersion >= 2`. Old clients ignore unknown keys anyway; verify `applyRemoteChanges` skips unknown tables.
3. Keep the pinning rules: pin before any change of the effective default (settings, reorder, archive, or a native default change in `sync:push`).

### Native app
1. **SQLite:** new table `derivedAccountOverrides` (`id`, `sourceKind`, `sourceId`, `direction`, `accountId`, `updatedAtMs`, `deletedAtMs`, `syncVersion`, `needsSync`). Add it to the schema, migrations, `lib/db/sync.ts` (pending changes, push, pull, `applyRemoteChanges`) and the `TABLES` constants.
2. **Reconcile:** in `lib/sync/localTripReconcile.ts` and `lib/sync/sharedTripReconcile.ts`, choose a derived row's `accountId` in this order:
   1. an override for `(sourceKind, sourceId, direction)`;
   2. the legacy base-transaction account (`legacyPaidFromAccountByExpenseId`);
   3. the default account.

   Stop treating the persisted derived row's `accountId` as the source of truth.
3. **Writes:** `TransactionRepository.updateDerivedAccountId` (and any "change account" UI on derived rows) writes or updates an override row with `needsSync = 1`, then re-runs reconcile. It never edits the derived row directly.
4. **One-time migration** on first launch of the updated app: for each existing derived cashflow or settlement row whose `accountId` differs from what reconcile would choose without overrides, create an override from it. This uploads the device's past choices once; LWW resolves conflicts between devices.
5. **Default-account changes on device:** before changing the default (settings, account archive, reorder when no explicit default), pin unpinned derived rows by writing overrides. Same rule as the server's `pinDerivedAccounts`.

### Verify
- Choose an account on web, and the phone shows the same account and balance after a pull; and the reverse.
- Two phones edit the same payment's account offline, and both converge to the later edit (LWW).
- Changing the default account on either side doesn't move past payments.
- An old app version (without this change) keeps working, still device-local.

---

## 2. History and undo (audit trail) in the native UI

The server records an append-only history of every change, including changes pushed by native sync (the trigger is in `convex/functions.ts`, the queries and restore in `convex/history.ts`). The web shows History and Restore. The native app should add the same **History** sheet on transaction, account, category and trip detail screens (read via the Convex `history` queries), and a **Recent changes** list in Settings. Restores go through the server's restore mutation, whose result reaches the phone through normal sync.

---

## 3. Fresh production backend (2026-10)

The production Convex deployment was wiped and redeployed from `main` (new-world reset, no data carried over). Before shipping a native build against it:
- point the native app at the same production Convex URL and Clerk production instance as the web app (unchanged, unless the reset created new ones; check `eas.json` / app config env);
- expect first sign-in to seed the default categories and Cash account (the same rules as web's `seedDefaultsIfEmpty`).
