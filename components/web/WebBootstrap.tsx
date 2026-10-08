/**
 * Web first-run: when a signed-in account is completely empty, create the same
 * default categories and Cash account native creates on first sign-in.
 * Idempotent server-side; runs once per user per page load.
 */
import { useEffect, useRef } from 'react';
import { useAuth } from '@clerk/clerk-expo';
import { useConvexAuth, useMutation } from 'convex/react';
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

  return null;
}
