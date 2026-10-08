/**
 * Web runtime helpers (PWA).
 *
 * The web build is online-only: it never bootstraps SQLite, never seeds guest
 * data, and never queues writes locally. Anything that still relies on the
 * native local-first stack must go through an explicit web adapter.
 */
import { useEffect, useState } from 'react';

export class WebNotAvailableError extends Error {
  readonly code = 'WEB_NOT_AVAILABLE';
  constructor(feature: string) {
    super(`${feature} is not available in the web app yet.`);
    this.name = 'WebNotAvailableError';
  }
}

export function isWebNotAvailableError(error: unknown): error is WebNotAvailableError {
  return !!error && typeof error === 'object' && (error as { code?: string }).code === 'WEB_NOT_AVAILABLE';
}

/** True while the browser reports a network connection. Defaults to true during SSR. */
export function useOnlineStatus(): boolean {
  const [online, setOnline] = useState<boolean>(() =>
    typeof navigator === 'undefined' ? true : navigator.onLine
  );

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const goOnline = () => setOnline(true);
    const goOffline = () => setOnline(false);
    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    return () => {
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
    };
  }, []);

  return online;
}

/** Browser-safe key/value storage for non-sensitive UI preferences only. */
export function getPreferenceStorage(): Storage | null {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return null;
    return window.localStorage;
  } catch {
    // Safari private mode / storage disabled.
    return null;
  }
}
