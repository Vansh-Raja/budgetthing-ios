/**
 * Web first-run: when a signed-in account is completely empty, create the same
 * default categories and Cash account native creates on first sign-in.
 * Idempotent server-side; runs once per user per page load.
 */
import { useEffect, useRef } from 'react';
import { usePathname, useRouter } from 'expo-router';
import { useUserSettings } from '@/lib/hooks/useUserSettings';
import { useAuth } from '@clerk/clerk-expo';
import { useConvexAuth, useMutation, useQuery } from 'convex/react';
import { Events, GlobalEvents } from '@/lib/events';
import { api } from '@/convex/_generated/api';

export function WebBootstrap() {
  const { isAuthenticated } = useConvexAuth();
  const { userId } = useAuth();
  const seed = useMutation(api.pwaPersonal.seedDefaultsIfEmpty);
  const doneFor = useRef<string | null>(null);

  useEffect(() => {
    if (!isAuthenticated || !userId || doneFor.current === userId) return;
    doneFor.current = userId;
    seed({}).catch((e) => console.warn('[WebBootstrap] seed failed:', e));
  }, [isAuthenticated, userId, seed]);

  // Native screens refresh the import inbox and its badges on sync events. The web has no
  // sync engine, so a live subscription stands in: new API imports (or confirms/ignores on
  // another device) emit the same event.
  // Watch the pending rows themselves (not just the count): one item replacing another
  // leaves the count unchanged but must still refresh the inbox.
  const pendingImports = useQuery(api.pwaImports.listPending, isAuthenticated ? {} : 'skip');
  useEffect(() => {
    if (pendingImports !== undefined) GlobalEvents.emit(Events.importInboxChanged);
  }, [pendingImports]);

  // First run: a brand-new account goes through onboarding once (Settings › View Tutorial replays it).
  const { settings, loading } = useUserSettings();
  const pathname = usePathname();
  const router = useRouter();
  useEffect(() => {
    if (!isAuthenticated || loading || !settings || settings.hasSeenOnboarding) return;
    if (pathname === '/onboarding' || pathname.startsWith('/settings/currency')) return;
    router.replace('/onboarding');
  }, [isAuthenticated, loading, settings, pathname, router]);

  return null;
}
