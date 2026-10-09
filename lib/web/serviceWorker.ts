/**
 * Web service-worker registration and update signalling.
 *
 * Registered only in production builds (never under the Metro dev server, whose bundles
 * are not content-hashed). When a new build's worker is installed and waiting, the app
 * shows "Update available"; the page only switches to it when the user taps Reload, so
 * an update never interrupts an edit in progress.
 */
import { useCallback, useEffect, useRef, useState } from 'react';

function supported(): boolean {
  return typeof window !== 'undefined' && typeof navigator !== 'undefined' && 'serviceWorker' in navigator && !__DEV__;
}

export function useServiceWorkerUpdate(): { updateReady: boolean; applyUpdate: () => void } {
  const [waiting, setWaiting] = useState<ServiceWorker | null>(null);
  const reloadRequested = useRef(false);

  useEffect(() => {
    if (!supported()) return;
    let registration: ServiceWorkerRegistration | null = null;
    const markWaiting = (worker: ServiceWorker | null) => {
      // Only an *update* (an existing controller) is worth announcing; a first install is silent.
      if (worker && navigator.serviceWorker.controller) setWaiting(worker);
    };
    const onControllerChange = () => {
      if (reloadRequested.current) window.location.reload();
    };
    const checkForUpdate = () => {
      if (document.visibilityState === 'visible') registration?.update().catch(() => undefined);
    };

    navigator.serviceWorker.addEventListener('controllerchange', onControllerChange);
    document.addEventListener('visibilitychange', checkForUpdate);
    navigator.serviceWorker
      .register('/sw.js', { scope: '/' })
      .then((reg) => {
        registration = reg;
        markWaiting(reg.waiting);
        reg.addEventListener('updatefound', () => {
          const installing = reg.installing;
          installing?.addEventListener('statechange', () => {
            if (installing.state === 'installed') markWaiting(installing);
          });
        });
      })
      .catch((e) => console.warn('[sw] registration failed', e));

    return () => {
      navigator.serviceWorker.removeEventListener('controllerchange', onControllerChange);
      document.removeEventListener('visibilitychange', checkForUpdate);
    };
  }, []);

  const applyUpdate = useCallback(() => {
    if (!waiting) return;
    reloadRequested.current = true;
    waiting.postMessage({ type: 'SKIP_WAITING' });
  }, [waiting]);

  return { updateReady: waiting !== null, applyUpdate };
}

/** Browser features the online-only app cannot run without. */
export function missingBrowserFeatures(): string[] {
  if (typeof window === 'undefined') return [];
  const missing: string[] = [];
  if (typeof WebSocket === 'undefined') missing.push('WebSockets');
  if (typeof fetch === 'undefined') missing.push('fetch');
  if (!window.crypto || typeof window.crypto.getRandomValues !== 'function') missing.push('secure random numbers');
  return missing;
}
