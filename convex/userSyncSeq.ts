export async function getLastSeqFromChangeLog(ctx: any, userId: string): Promise<number> {
  const lastEntry = await ctx.db
    .query("changeLog")
    .withIndex("by_user_seq", (q: any) => q.eq("userId", userId))
    .order("desc")
    .first();
  return lastEntry?.seq ?? 0;
}

export async function getOrCreateUserSyncState(ctx: any, userId: string) {
  const existing = await ctx.db
    .query("userSyncState")
    .withIndex("by_client_id", (q: any) => q.eq("id", userId))
    .order("asc")
    .first();
  if (existing) return existing;

  const lastSeq = await getLastSeqFromChangeLog(ctx, userId);
  await ctx.db.insert("userSyncState", { id: userId, userId, lastSeq });

  return ctx.db
    .query("userSyncState")
    .withIndex("by_client_id", (q: any) => q.eq("id", userId))
    .order("asc")
    .first();
}

export async function allocateUserSeq(ctx: any, userId: string): Promise<number> {
  const state = await getOrCreateUserSyncState(ctx, userId);
  const nextSeq = ((state?.lastSeq as number | undefined) ?? 0) + 1;
  await ctx.db.patch(state._id, { lastSeq: nextSeq });
  return nextSeq;
}

export async function recordUserChange(
  ctx: any,
  userId: string,
  entityType: string,
  entityId: string,
  updatedAtMs: number,
  action: "upsert" | "delete"
) {
  const seq = await allocateUserSeq(ctx, userId);
  await ctx.db.insert("changeLog", {
    userId,
    entityType,
    entityId,
    action,
    updatedAtMs,
    seq,
  });
}
