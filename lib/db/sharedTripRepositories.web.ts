import { api } from '@/convex/_generated/api';
import { webMutation, webQuery } from '../web/convexClient';
import type { Trip } from '../logic/types';
import { sharedTripToTrip } from '../web/mappers';

export interface SharedTripSummary {
  id: string;
  name: string;
  emoji: string;
  currencyCode: string;
  updatedAtMs: number;
  totalSpentCents: number;
  participantCount: number;
}


export const SharedTripRepository = {
  async getAllSummariesForUser(_userId: string): Promise<SharedTripSummary[]> {
    const rows: any[] = await webQuery(api.pwaSharedTrips.listMine, {});
    return rows.map((r) => ({ id: r.id, name: r.name, emoji: r.emoji, currencyCode: r.currencyCode, updatedAtMs: r.updatedAtMs, totalSpentCents: r.totalSpentCents ?? 0, participantCount: r.participantCount ?? 0 }));
  },
  async getTripIdForExpense(expenseId: string): Promise<string | null> {
    const meta: any = await webQuery(api.pwaSharedTrips.resolveMeta, { expenseIds: [expenseId] });
    return meta.expenses[expenseId]?.tripId ?? null;
  },
  async getExpenseMetaByIds(expenseIds: string[]): Promise<Record<string, { tripId: string; tripEmoji: string; categoryEmoji: string | null; categoryName: string | null; amountCents: number }>> {
    if (expenseIds.length === 0) return {};
    const meta: any = await webQuery(api.pwaSharedTrips.resolveMeta, { expenseIds });
    return meta.expenses;
  },
  async getTripIdForSettlement(settlementId: string): Promise<string | null> {
    const meta: any = await webQuery(api.pwaSharedTrips.resolveMeta, { settlementIds: [settlementId] });
    return meta.settlements[settlementId]?.tripId ?? null;
  },
  async getSettlementMetaByIds(settlementIds: string[]): Promise<Record<string, { tripId: string; tripEmoji: string }>> {
    if (settlementIds.length === 0) return {};
    const meta: any = await webQuery(api.pwaSharedTrips.resolveMeta, { settlementIds });
    return meta.settlements;
  },
  async getHydratedTripForUser(_userId: string, tripId: string): Promise<Trip | null> {
    const row = await webQuery(api.pwaSharedTrips.getTrip, { tripId });
    return row ? sharedTripToTrip(row) : null;
  },
};
