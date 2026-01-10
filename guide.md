# BudgetThing – Complete Clerk + Convex Setup Guide (Expo)

This guide covers everything you need to get the **BudgetThing** Expo app running with **Clerk authentication** and **Convex backend sync**.

The backend code is already in place:
- ✅ `expo-app/convex/schema.ts` – Complete Convex schema with `changeLog` table
- ✅ `expo-app/convex/auth.config.ts` – Clerk JWT integration
- ✅ `expo-app/convex/sync.ts` – Push/pull mutations with changelog-based sync
- ✅ `expo-app/lib/sync/syncEngine.ts` – Client sync engine
- ✅ `expo-app/app/_layout.tsx` – Providers already wired

**What you need to do:** Set up the Clerk and Convex accounts, configure environment variables, and initialize the Convex deployment.

---

## Prerequisites

- ✅ Node.js + npm installed
- ✅ Xcode installed (for iOS simulator)
- ✅ Clerk account: https://dashboard.clerk.com
- ✅ Convex account: https://dashboard.convex.dev

---

## Step 1: Install Dependencies

```bash
cd expo-app
npm install
```

---

## Step 2: Clerk Setup

### 2.1 Create Clerk Application

1. Go to https://dashboard.clerk.com
2. Click **Create Application**
3. Choose a name (e.g., "BudgetThing Dev")
4. **Sign-in options**: Enable **Apple** (required for iOS)
   - You can also enable **Google** (optional)

### 2.2 Enable Native API

Since this is a React Native app using `@clerk/clerk-expo`:

1. In Clerk dashboard → **Settings** → **Advanced**
2. Find **Native Applications** section
3. **Enable Native API** toggle

### 2.3 Get Clerk Publishable Key

1. Clerk dashboard → **API Keys**
2. Copy your **Publishable Key** (format: `pk_test_...` for development)

**Save this for later** – you'll add it to `.env.local`.

### 2.4 Create Clerk JWT Template for Convex

This is **critical** for Convex auth integration:

1. Clerk dashboard → **JWT Templates**
2. Click **+ New template**
3. Select **Convex** from the template list
4. **Do NOT rename it** – must stay as `convex`
5. Click **Create**
6. Copy the **Issuer URL** shown in the template
   - Dev example: `https://allowed-pelican-12.clerk.accounts.dev`
   - This is what Convex will verify JWTs against

**Save this Issuer URL** – you'll add it to Convex environment variables.

---

## Step 3: Convex Setup

### 3.1 Initialize Convex Deployment

From the `expo-app/` directory, run:

```bash
npm run convex:dev
```

This will:
1. Prompt you to log in to Convex (or create an account)
2. Ask you to create a new project or select an existing one
3. Create a **development deployment**
4. Generate `convex/_generated/` directory with TypeScript types
5. Print your **deployment URL** (format: `https://xxxxx.convex.cloud`)

**⚠️ Keep this terminal running!** It watches for changes to Convex functions.

**Copy the deployment URL** – you'll need it for `.env.local`.

### 3.2 Set Convex Environment Variable

Now that you have a Convex deployment, configure it to trust Clerk JWTs:

1. Go to https://dashboard.convex.dev
2. Select your project → **Settings** → **Environment Variables**
3. Click **Add Environment Variable**
4. Add:
   ```
   Name: CLERK_JWT_ISSUER_DOMAIN
   Value: <Clerk JWT template Issuer URL from Step 2.4>
   ```
   Example: `https://allowed-pelican-12.clerk.accounts.dev`

5. Click **Save**

The Convex deployment will automatically pick up this variable. The `convex/auth.config.ts` file reads it to validate Clerk tokens.

---

## Step 4: Create Expo Environment File

Now create `expo-app/.env.local` (this file is gitignored):

```env
EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_xxxxxxxxxxxxxxxxxx
EXPO_PUBLIC_CONVEX_URL=https://xxxxx.convex.cloud
```

**Replace with your actual values:**
- `EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY` from Step 2.3
- `EXPO_PUBLIC_CONVEX_URL` from Step 3.1

> **Note:** `EXPO_PUBLIC_*` variables are embedded in the client bundle (not secrets). Expo automatically loads these from `.env.local`.

---

## Step 5: Push Convex Schema

If `npm run convex:dev` is still running from Step 3.1, it should have automatically pushed the schema. You can verify by checking the Convex dashboard → **Data** tab – you should see tables like `accounts`, `categories`, `transactions`, `changeLog`, etc.

If you stopped the dev process, restart it:

```bash
npm run convex:dev
```

---

## Step 6: Run the Expo App

Open a **new terminal** (keep `convex:dev` running in the first one), then:

```bash
cd expo-app
npm run ios
```

This will:
1. Start the Expo dev server
2. Launch the iOS simulator
3. Load the app

**Expected behavior:**
- App should load without errors
- You're in **guest mode** (local-only, no sync)
- You can use the app fully offline

**To test auth:** Implement sign-in UI (see plan.md Phase 4 checklist – sign-in UI is still TODO).

---

## Step 7: Verify Convex Integration (Optional)

You can test if Convex auth is working by adding a simple test query.

### 7.1 Add a test query

The `convex/sync.ts` file already includes a `whoami` query. You can call it from the app to verify auth.

### 7.2 Call it from React Native

In any component:

```tsx
import { useQuery } from "convex/react";

const identity = useQuery("sync:whoami" as any);
console.log("Clerk identity:", identity);
```

- If **guest mode**: `identity` will be `null`
- If **signed in**: `identity` will contain Clerk user info

---

## File Checklist

After completing all steps, your `expo-app/` directory should have:

```
✅ .env.local                         # Your keys (gitignored)
✅ convex/_generated/                 # Auto-generated Convex types
✅ convex/schema.ts                   # Convex schema with changeLog
✅ convex/auth.config.ts              # Clerk JWT config
✅ convex/sync.ts                     # Push/pull mutations
✅ node_modules/                      # Dependencies installed
```

---

## Common Issues & Solutions

### Issue: `EXPO_PUBLIC_CONVEX_URL` is undefined

**Cause:** `.env.local` not created or not in the right location.

**Fix:**
1. Ensure `.env.local` is at `expo-app/.env.local` (not in repo root)
2. Restart Expo dev server (`npm run ios`)

---

### Issue: `CLERK_JWT_ISSUER_DOMAIN` not set error

**Cause:** You didn't set the environment variable in Convex dashboard.

**Fix:** Go to Convex dashboard → Settings → Environment Variables and add `CLERK_JWT_ISSUER_DOMAIN`.

---

### Issue: Clerk JWT template not named `convex`

**Cause:** You renamed the template or created a custom one.

**Fix:** Delete the template and create a new one using the **Convex** preset (it auto-names it `convex`).

---

### Issue: `Unable to resolve module expo-auth-session`

**Cause:** Missing peer dependency for `@clerk/clerk-expo`.

**Fix:**
```bash
cd expo-app
npm install expo-auth-session
```

If you get peer dependency conflicts:
```bash
npm install expo-auth-session --legacy-peer-deps
```

---

### Issue: Convex functions show "Unauthorized" errors

**Cause:** Clerk JWT not being passed, or Issuer domain mismatch.

**Debug:**
1. Check `.env.local` has correct `EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY`
2. Check Convex dashboard env vars has correct `CLERK_JWT_ISSUER_DOMAIN`
3. Ensure JWT template Issuer URL **exactly matches** what you set in Convex
4. Restart `npm run convex:dev`

---

## Development vs Production

### Development (current setup)
- Clerk: `pk_test_...` key
- Convex: Development deployment
- Issuer: Clerk dev domain (e.g., `https://xxx.clerk.accounts.dev`)

### Production (when deploying)
1. Create a **production** Clerk application (or use production keys from the same app)
2. Create a **production** Convex deployment:
   ```bash
   npm run convex:deploy --prod
   ```
3. Set production env vars in Convex dashboard (prod deployment)
4. Update `.env.local` (or use different env files for prod builds)
5. Use Clerk **production** Issuer URL

---

## Next Steps

✅ Backend is fully configured and ready to use!

**What's still TODO (from plan.md Phase 4):**

1. **Sign-in UI**: Implement Apple Sign-In button + Clerk integration
   - Use `useSignIn()` from `@clerk/clerk-expo`
   - Show "Sign in with Apple" in Settings screen
   - Implement guest → signed-in upgrade flow

2. **Sign-out UI**: Add sign-out button in Settings
   - Use `useAuth().signOut()`
   - Show dialog: "Keep data on device" vs "Remove data"

3. **Test sync**: Sign in on two devices, make changes, verify sync works

4. **Handle offline**: Verify outbox queues changes when offline

---

## Architecture Summary

```
┌─────────────────────────────────────────────────────┐
│  Expo App (React Native)                            │
│  ┌────────────────────┐     ┌────────────────────┐ │
│  │  UI Components     │────▶│  SQLite (local)    │ │
│  │  (Screens/Forms)   │     │  Source of truth   │ │
│  └────────────────────┘     └────────┬───────────┘ │
│                                      │             │
│                              ┌───────▼──────────┐  │
│                              │  Sync Engine     │  │
│                              │  (syncEngine.ts) │  │
│                              └───────┬──────────┘  │
│                                      │             │
│                         ┌────────────▼──────────┐  │
│                         │  Clerk Provider       │  │
│                         │  (JWT tokens)         │  │
│                         └────────────┬──────────┘  │
│                                      │             │
└──────────────────────────────────────┼─────────────┘
                                       │
                          ┌────────────▼──────────┐
                          │  Convex Backend       │
                          │  - push mutation      │
                          │  - pull query         │
                          │  - changeLog table    │
                          └───────────────────────┘
```

**Data flow:**
1. User makes changes → SQLite (marked `needsSync=1`)
2. Sync engine pushes to Convex → `push` mutation
3. Convex stores in tables + records in `changeLog`
4. Other devices pull changes → `pull` query (returns changelog delta)
5. Sync engine applies to local SQLite

**Conflict resolution:** Last-write-wins by `updatedAtMs`.

---

## Reference

- **Clerk Expo docs:** https://clerk.com/docs/quickstarts/expo
- **Convex docs:** https://docs.convex.dev
- **Convex + Clerk guide:** https://docs.convex.dev/auth/clerk
- **Project plan:** See `plan.md` in repo root for full architecture details

---

**You're all set!** The backend is ready. Next steps are implementing the sign-in UI and testing the full sync flow.
