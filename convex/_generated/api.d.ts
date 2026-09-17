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
import type * as http from "../http.js";
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
  http: typeof http;
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
