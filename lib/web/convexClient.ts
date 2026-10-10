import type { ConvexReactClient } from 'convex/react';
import { WebNotAvailableError } from './runtime';
import { toWebRequestError } from './errors';

/**
 * The web root layout registers its ConvexReactClient here so imperative
 * adapters (repositories, actions) can issue one-shot queries and mutations
 * outside React. Never used on native.
 */
let client: ConvexReactClient | null = null;

export function setWebConvexClient(next: ConvexReactClient | null) {
  client = next;
}

export function getWebConvexClient(): ConvexReactClient {
  if (!client) throw new WebNotAvailableError('Convex client (not initialized)');
  return client;
}

/** One-shot query with friendly error mapping. */
export async function webQuery<T = any>(fn: any, args: Record<string, unknown> = {}): Promise<T> {
  try {
    return await getWebConvexClient().query(fn, args as any);
  } catch (e) {
    throw toWebRequestError(e);
  }
}

/** Mutation with friendly error mapping. Resolves only after the server commits. */
export async function webMutation<T = any>(fn: any, args: Record<string, unknown> = {}): Promise<T> {
  try {
    return await getWebConvexClient().mutation(fn, args as any);
  } catch (e) {
    throw toWebRequestError(e);
  }
}
