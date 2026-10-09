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

/**
 * True when running as an installed home-screen app (standalone display mode).
 * Installed apps have no browser back button, so flows that leave the origin
 * (OAuth) must not navigate the app's only window away.
 */
export function isStandaloneApp(): boolean {
  if (typeof window === 'undefined') return false;
  const mql = typeof window.matchMedia === 'function' ? window.matchMedia('(display-mode: standalone)') : null;
  return !!mql?.matches || (navigator as any).standalone === true;
}

/** OAuth flow for Clerk components: popup (a cancellable sheet) when installed, default otherwise. */
export function webOAuthFlow(): 'popup' | 'auto' {
  return isStandaloneApp() ? 'popup' : 'auto';
}

/**
 * Truthful offline signal. navigator.onLine can be wrong (iOS Safari has reported
 * false while fully connected), and a signed-out page has no Convex socket to vouch
 * for connectivity. So "offline" requires: browser says offline, no live socket, AND a
 * real request to the Convex endpoint fails. Re-probed every 15s while it looks offline.
 */
export function useEffectiveOffline(socketConnected: boolean): boolean {
  const online = useOnlineStatus();
  const [probeFailed, setProbeFailed] = useState(false);
  const suspect = !online && !socketConnected;

  useEffect(() => {
    if (!suspect) {
      setProbeFailed(false);
      return;
    }
    let cancelled = false;
    const url = process.env.EXPO_PUBLIC_CONVEX_URL;
    const probe = async () => {
      if (!url) return setProbeFailed(true);
      const ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
      const timer = setTimeout(() => ctrl?.abort(), 5_000);
      try {
        await fetch(url, { method: 'GET', mode: 'no-cors', cache: 'no-store', signal: ctrl?.signal });
        if (!cancelled) setProbeFailed(false);
      } catch {
        if (!cancelled) setProbeFailed(true);
      } finally {
        clearTimeout(timer);
      }
    };
    probe();
    const id = setInterval(probe, 15_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [suspect]);

  return suspect && probeFailed;
}
