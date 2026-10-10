import React from 'react';
import { Stack } from 'expo-router';
import { SignUp } from '@clerk/clerk-expo/web';
import { WebAuthScreen } from '@/components/web/WebAuthScreen';
import { clerkAppearance } from '@/components/web/clerkAppearance';

export default function SignUpWebRoute() {
  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <WebAuthScreen testID="web-sign-up">
        <SignUp routing="hash" signInUrl="/sign-in" appearance={clerkAppearance} />
      </WebAuthScreen>
    </>
  );
}
