import { ConvexError } from 'convex/values';

export type PwaErrorData = { code?: string; message?: string; [k: string]: unknown };

/** Extract the structured payload thrown by PWA server functions, if any. */
export function getPwaErrorData(error: unknown): PwaErrorData | null {
  if (error instanceof ConvexError) {
    const data = (error as ConvexError<any>).data;
    if (data && typeof data === 'object') return data as PwaErrorData;
    if (typeof data === 'string') {
      try { return JSON.parse(data); } catch { return { message: data }; }
    }
  }
  return null;
}

/** Human-readable error the shared screens can show in their existing popups/toasts. */
export class WebRequestError extends Error {
  readonly code: string;
  readonly data: PwaErrorData | null;
  constructor(message: string, code: string, data: PwaErrorData | null) {
    super(message);
    this.name = 'WebRequestError';
    this.code = code;
    this.data = data;
  }
}

export function toWebRequestError(error: unknown): WebRequestError {
  if (error instanceof WebRequestError) return error;
  const data = getPwaErrorData(error);
  if (data) {
    const code = String(data.code ?? 'SERVER');
    const message =
      code === 'UNAUTHENTICATED' ? 'Your session has expired. Please sign in again.' :
      code === 'CONFLICT' ? 'This item changed on another device. Refresh and try again.' :
      String(data.message ?? 'The server rejected this change.');
    return new WebRequestError(message, code, data);
  }
  const raw = error instanceof Error ? error.message : String(error);
  if (/Failed to fetch|NetworkError|Load failed|WebSocket|offline/i.test(raw) || (typeof navigator !== 'undefined' && !navigator.onLine)) {
    return new WebRequestError('No connection. Check your network and try again.', 'OFFLINE', null);
  }
  return new WebRequestError(raw || 'Something went wrong.', 'UNKNOWN', null);
}
