/**
 * Auth hooks for managing authentication state
 */

import { useAuth, useUser } from '@clerk/clerk-expo';

/**
 * Hook for auth state with convenience fields.
 */
export function useAuthState() {
  const { isSignedIn, isLoaded, signOut } = useAuth();
  const { user } = useUser();

  return {
    isLoaded,
    isSignedIn: isSignedIn ?? false,
    isGuest: !isSignedIn,
    user,
    signOut,
  };
}
