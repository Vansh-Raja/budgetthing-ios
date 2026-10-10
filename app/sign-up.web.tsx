import React from 'react';
import { Stack } from 'expo-router';
import { SignUp } from '@clerk/clerk-expo/web';
import { WebAuthScreen } from '@/components/web/WebAuthScreen';
import { clerkAppearance } from '@/components/web/clerkAppearance';
import { webOAuthFlow } from '@/lib/web/runtime';

export default function SignUpWebRoute() {
  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <WebAuthScreen testID="web-sign-up">
        {/* Installed (home-screen) mode has no back button: run OAuth in a cancellable popup sheet. */}
        <SignUp oauthFlow={webOAuthFlow()} routing="hash" signInUrl="/sign-in" appearance={clerkAppearance} />
      </WebAuthScreen>
    </>
  );
}
