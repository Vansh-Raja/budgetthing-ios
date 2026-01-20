import type { UserResource } from '@clerk/types';

export function getDefaultTripNickname(user: UserResource | null | undefined): string {
  if (!user) return 'You';

  const fullName = (user as any).fullName as string | undefined;
  if (fullName && fullName.trim().length > 0) return fullName.trim();

  const firstName = user.firstName ?? undefined;
  const lastName = user.lastName ?? undefined;
  const combined = [firstName, lastName].filter(Boolean).join(' ');
  if (combined.trim().length > 0) return combined.trim();

  const email = user.primaryEmailAddress?.emailAddress ?? undefined;
  const prefix = email ? email.split('@')[0] : undefined;
  if (prefix && prefix.trim().length > 0) return prefix.trim();

  return 'You';
}
