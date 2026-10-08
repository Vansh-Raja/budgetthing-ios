import { Redirect } from 'expo-router';

// Web has no guest mode: sign-in is the entry gate, so onboarding is skipped.
export function OnboardingScreen() {
  return <Redirect href="/" />;
}
