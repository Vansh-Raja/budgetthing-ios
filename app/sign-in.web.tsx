import React from 'react';
import { Stack } from 'expo-router';
import { SignIn } from '@clerk/clerk-expo/web';
import { WebAuthScreen } from '@/components/web/WebAuthScreen';
import { clerkAppearance } from '@/components/web/clerkAppearance';

export default function SignInWebRoute() {
  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <WebAuthScreen testID="web-sign-in">
        <SignIn routing="hash" signUpUrl="/sign-up" appearance={clerkAppearance} />
      </WebAuthScreen>
    </>
  );
}
