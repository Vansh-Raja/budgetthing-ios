/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as apiImportHttp from "../apiImportHttp.js";
import type * as apiImportKeys from "../apiImportKeys.js";
import type * as apiImportShared from "../apiImportShared.js";
import type * as deleteMyAccount from "../deleteMyAccount.js";
import type * as functions from "../functions.js";
import type * as history from "../history.js";
import type * as http from "../http.js";
import type * as importSync from "../importSync.js";
import type * as pwaAuth from "../pwaAuth.js";
import type * as pwaDerived from "../pwaDerived.js";
import type * as pwaImports from "../pwaImports.js";
import type * as pwaLedger from "../pwaLedger.js";
import type * as pwaPersonal from "../pwaPersonal.js";
import type * as pwaSharedTrips from "../pwaSharedTrips.js";
import type * as pwaTrips from "../pwaTrips.js";
import type * as pwaValidation from "../pwaValidation.js";
import type * as pwaWrite from "../pwaWrite.js";
import type * as sharedTripInvites from "../sharedTripInvites.js";
import type * as sharedTripMembers from "../sharedTripMembers.js";
import type * as sharedTripPoke from "../sharedTripPoke.js";
import type * as sharedTripSeq from "../sharedTripSeq.js";
import type * as sharedTripSync from "../sharedTripSync.js";
import type * as sharedTrips from "../sharedTrips.js";
import type * as sync from "../sync.js";
import type * as userSyncSeq from "../userSyncSeq.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  apiImportHttp: typeof apiImportHttp;
  apiImportKeys: typeof apiImportKeys;
  apiImportShared: typeof apiImportShared;
  deleteMyAccount: typeof deleteMyAccount;
  functions: typeof functions;
  history: typeof history;
  http: typeof http;
  importSync: typeof importSync;
  pwaAuth: typeof pwaAuth;
  pwaDerived: typeof pwaDerived;
  pwaImports: typeof pwaImports;
  pwaLedger: typeof pwaLedger;
  pwaPersonal: typeof pwaPersonal;
  pwaSharedTrips: typeof pwaSharedTrips;
  pwaTrips: typeof pwaTrips;
  pwaValidation: typeof pwaValidation;
  pwaWrite: typeof pwaWrite;
  sharedTripInvites: typeof sharedTripInvites;
  sharedTripMembers: typeof sharedTripMembers;
  sharedTripPoke: typeof sharedTripPoke;
  sharedTripSeq: typeof sharedTripSeq;
  sharedTripSync: typeof sharedTripSync;
  sharedTrips: typeof sharedTrips;
  sync: typeof sync;
  userSyncSeq: typeof userSyncSeq;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
