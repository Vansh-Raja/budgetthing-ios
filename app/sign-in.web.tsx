import React from 'react';
import { Stack } from 'expo-router';
import { SignIn } from '@clerk/clerk-expo/web';
import { WebAuthScreen } from '@/components/web/WebAuthScreen';
import { clerkAppearance } from '@/components/web/clerkAppearance';
import { webOAuthFlow } from '@/lib/web/runtime';

export default function SignInWebRoute() {
  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <WebAuthScreen testID="web-sign-in">
        {/* Installed (home-screen) mode has no back button: run OAuth in a cancellable popup sheet. */}
        <SignIn oauthFlow={webOAuthFlow()} routing="hash" signUpUrl="/sign-up" appearance={clerkAppearance} />
      </WebAuthScreen>
    </>
  );
}
