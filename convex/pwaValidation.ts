/**
 * PWA input validation. Money is integer cents; dates are epoch ms; the client
 * never supplies userId, timestamps, syncVersion, or derived system types.
 */
import { v } from "convex/values";
import { pwaError, type Ctx, getOwned } from "./pwaAuth";
import { isDerivedTripSystemType } from "../lib/logic/syncGuards";
import { TripSplitCalculator } from "../lib/logic/tripSplitCalculator";

export const ACCOUNT_KINDS = ["cash", "card", "savings"] as const;
export const TRANSACTION_TYPES = ["expense", "income"] as const;
export const SPLIT_TYPES = ["equal", "equalSelected", "percentage", "shares", "exact"] as const;
export const IMPORT_STATUSES = ["pending", "confirmed", "ignored"] as const;

export const vAccountKind = v.union(v.literal("cash"), v.literal("card"), v.literal("savings"));
export const vTransactionType = v.union(v.literal("expense"), v.literal("income"));
export const vSplitType = v.union(
  v.literal("equal"),
  v.literal("equalSelected"),
  v.literal("percentage"),
  v.literal("shares"),
  v.literal("exact")
);
export const vNullableString = v.union(v.string(), v.null());
export const vNullableNumber = v.union(v.number(), v.null());
export const vExpectedVersion = v.optional(v.number());
export const vSplitMap = v.record(v.string(), v.number());

export function assertCents(value: unknown, field: string, opts: { allowZero?: boolean; allowNegative?: boolean } = {}): number {
  if (typeof value !== "number" || !Number.isFinite(value) || !Number.isInteger(value)) {
    throw pwaError("VALIDATION", `${field} must be an integer amount in cents`);
  }
  if (!opts.allowNegative && value < 0) throw pwaError("VALIDATION", `${field} must not be negative`);
  if (!opts.allowZero && value === 0) throw pwaError("VALIDATION", `${field} must not be zero`);
  if (Math.abs(value) > 1_000_000_000_000) throw pwaError("VALIDATION", `${field} is out of range`);
  return value;
}

export function assertDateMs(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isFinite(value) || !Number.isInteger(value) || value <= 0) {
    throw pwaError("VALIDATION", `${field} must be an epoch-millisecond timestamp`);
  }
  return value;
}

export function assertText(value: unknown, field: string, opts: { min?: number; max?: number; optional?: boolean } = {}): string {
  const max = opts.max ?? 200;
  if (value === undefined || value === null) {
    if (opts.optional) return "";
    throw pwaError("VALIDATION", `${field} is required`);
  }
  if (typeof value !== "string") throw pwaError("VALIDATION", `${field} must be text`);
  const trimmed = value.trim();
  if (trimmed.length < (opts.min ?? 0)) throw pwaError("VALIDATION", `${field} is too short`);
  if (trimmed.length > max) throw pwaError("VALIDATION", `${field} is too long`);
  return trimmed;
}

export function optionalText(value: string | null | undefined, field: string, max = 500): string | undefined {
  if (value === undefined || value === null) return undefined;
  const t = assertText(value, field, { max, optional: true });
  return t.length ? t : undefined;
}

export function assertEmoji(value: unknown, field = "emoji"): string {
  const t = assertText(value, field, { min: 1, max: 16 });
  return t;
}

export function assertCurrencyCode(value: unknown): string {
  if (typeof value !== "string" || !/^[A-Z]{3}$/.test(value)) {
    throw pwaError("VALIDATION", "currencyCode must be a 3-letter ISO code");
  }
  return value;
}

export function assertSortIndex(value: unknown, field = "sortIndex"): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
    throw pwaError("VALIDATION", `${field} must be a non-negative integer`);
  }
  return value;
}

export function assertBillingCycleDay(value: number | null | undefined): number | undefined {
  if (value === undefined || value === null) return undefined;
  if (!Number.isInteger(value) || value < 1 || value > 31) {
    throw pwaError("VALIDATION", "billingCycleDay must be between 1 and 31");
  }
  return value;
}

export function forbidDerivedSystemType(systemType: unknown) {
  if (isDerivedTripSystemType(systemType)) {
    throw pwaError("VALIDATION", "Derived trip rows are virtual and cannot be written");
  }
}

/** Ensures a referenced account/category belongs to the user and is live. Returns undefined for null/undefined. */
export async function assertOwnedRef(
  ctx: Ctx,
  userId: string,
  table: "accounts" | "categories" | "trips" | "tripParticipants",
  id: string | null | undefined,
  field: string
): Promise<string | undefined> {
  if (id === undefined || id === null || id === "") return undefined;
  const row = await getOwned(ctx, userId, table, id);
  if (!row || row.deletedAtMs !== undefined) {
    throw pwaError("VALIDATION", `${field} refers to a missing ${table} row`);
  }
  return id;
}

/**
 * Validates split inputs against live participants and returns computed splits
 * using the shared calculator, so server and clients agree on rounding.
 */
export function computeAndValidateSplits(args: {
  amountCents: number;
  splitType: string;
  participants: Array<{ id: string; name: string; isCurrentUser: boolean }>;
  splitData?: Record<string, number> | null;
  paidByParticipantId?: string | null;
}): { splitData?: Record<string, number>; computedSplits: Record<string, number> } {
  if (!(SPLIT_TYPES as readonly string[]).includes(args.splitType)) {
    throw pwaError("VALIDATION", "Unknown split type");
  }
  const participantIds = new Set(args.participants.map((p) => p.id));
  if (args.paidByParticipantId && !participantIds.has(args.paidByParticipantId)) {
    throw pwaError("VALIDATION", "paidByParticipantId is not a participant of this trip");
  }
  const splitData = args.splitData ?? undefined;
  if (splitData) {
    for (const [pid, value] of Object.entries(splitData)) {
      if (!participantIds.has(pid)) throw pwaError("VALIDATION", "splitData references a non-participant");
      if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
        throw pwaError("VALIDATION", "splitData values must be non-negative numbers");
      }
    }
  }
  if (args.splitType === "percentage") {
    if (!splitData || !TripSplitCalculator.validatePercentages(splitData)) {
      throw pwaError("VALIDATION", "Percentages must total 100");
    }
  } else if (args.splitType === "exact") {
    // Exact splits are cents: fractional values would leak fractional trip_share amounts.
    if (splitData && Object.values(splitData).some((value) => !Number.isInteger(value))) {
      throw pwaError("VALIDATION", "Exact amounts must be whole cents");
    }
    if (!splitData || !TripSplitCalculator.validateExactAmounts(splitData, args.amountCents)) {
      throw pwaError("VALIDATION", "Exact amounts must total the expense amount");
    }
  } else if (args.splitType === "equalSelected") {
    if (!TripSplitCalculator.validateSelectedParticipants(splitData)) {
      throw pwaError("VALIDATION", "Select at least one participant");
    }
  } else if (args.splitType === "shares") {
    if (!splitData || Object.values(splitData).every((s) => s <= 0)) {
      throw pwaError("VALIDATION", "Shares must include at least one positive share");
    }
  }
  const computedSplits = TripSplitCalculator.calculateSplits(
    args.amountCents,
    args.splitType as any,
    args.participants as any,
    splitData
  );
  return { splitData, computedSplits };
}
