import { Redirect } from 'expo-router';

// Native never uses a dedicated sign-in route; onboarding owns sign-in there.
export default function SignInRoute() {
  return <Redirect href="/onboarding" />;
}
