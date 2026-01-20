async function getLastTripSeqFromChangeLog(ctx: any, tripId: string): Promise<number> {
  const lastEntry = await ctx.db
    .query('sharedTripChangeLog')
    .withIndex('by_trip_seq', (q: any) => q.eq('tripId', tripId))
    .order('desc')
    .first();
  return lastEntry?.seq ?? 0;
}

async function getOrCreateTripSyncState(ctx: any, tripId: string) {
  const existing = await ctx.db
    .query('sharedTripSyncState')
    .withIndex('by_client_id', (q: any) => q.eq('id', tripId))
    .order('asc')
    .first();
  if (existing) return existing;

  const lastSeq = await getLastTripSeqFromChangeLog(ctx, tripId);
  await ctx.db.insert('sharedTripSyncState', { id: tripId, tripId, lastSeq });

  return ctx.db
    .query('sharedTripSyncState')
    .withIndex('by_client_id', (q: any) => q.eq('id', tripId))
    .order('asc')
    .first();
}

export async function allocateTripSeq(ctx: any, tripId: string): Promise<number> {
  const state = await getOrCreateTripSyncState(ctx, tripId);
  const nextSeq = ((state?.lastSeq as number | undefined) ?? 0) + 1;
  await ctx.db.patch(state._id, { lastSeq: nextSeq });
  return nextSeq;
}

export async function recordTripChange(
  ctx: any,
  tripId: string,
  entityType: string,
  entityId: string,
  updatedAtMs: number,
  action: 'upsert' | 'delete'
) {
  const seq = await allocateTripSeq(ctx, tripId);
  await ctx.db.insert('sharedTripChangeLog', {
    tripId,
    entityType,
    entityId,
    action,
    updatedAtMs,
    seq,
  });
}
