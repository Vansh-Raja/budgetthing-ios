import { CustomPopupProvider } from '@/components/ui/CustomPopupProvider';
import { ToastProvider } from '@/components/ui/ToastProvider';
import { ClerkProvider, useAuth } from '@clerk/clerk-expo';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { DarkTheme, ThemeProvider } from '@react-navigation/native';
import { ConvexReactClient } from 'convex/react';
import { ConvexProviderWithClerk } from 'convex/react-clerk';
import { useFonts } from 'expo-font';
import * as Linking from 'expo-linking';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import React, { useEffect } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import 'react-native-get-random-values'; // Polyfill for uuid
import 'react-native-reanimated';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { tokenCache } from '../lib/auth/tokenCache';
import { SyncProvider } from '../lib/sync/SyncProvider';

export {
  // Catch any errors thrown by the Layout component.
  ErrorBoundary
} from 'expo-router';

const CLERK_KEY = process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY ?? '';
const CONVEX_URL = process.env.EXPO_PUBLIC_CONVEX_URL ?? '';

// Fail fast in non-dev so we don't ship with placeholders.
if (!__DEV__) {
  if (!CLERK_KEY) throw new Error('Missing EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY');
  if (!CONVEX_URL) throw new Error('Missing EXPO_PUBLIC_CONVEX_URL');
}

const convex = new ConvexReactClient(CONVEX_URL, {
  unsavedChangesWarning: false,
});

export const unstable_settings = {
  initialRouteName: '(tabs)',
};

// Prevent the splash screen from auto-hiding before asset loading is complete.
SplashScreen.preventAutoHideAsync();

// Custom dark theme matching our app
const AppTheme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    background: '#000000',
    card: '#000000',
    primary: '#FF9500',
  },
};

export default function RootLayout() {
  const [loaded, error] = useFonts({
    SpaceMono: require('../assets/fonts/SpaceMono-Regular.ttf'),
    ...FontAwesome.font,
  });

  // Expo Router uses Error Boundaries to catch errors in the navigation tree.
  useEffect(() => {
    if (error) throw error;
  }, [error]);


  if (!loaded) {
    return null;
  }

  return <RootLayoutNav />;
}

import { useRouter, useSegments } from 'expo-router';
import { UserSettingsProvider, useUserSettings } from '../lib/hooks/useUserSettings';

// ...

function RootLayoutNav() {
  return (
    <ClerkProvider publishableKey={CLERK_KEY} tokenCache={tokenCache}>
      <ConvexProviderWithClerk client={convex} useAuth={useAuth}>
        <GestureHandlerRootView style={{ flex: 1 }}>
          <SafeAreaProvider>
            <ThemeProvider value={AppTheme}>
              <CustomPopupProvider>
                <SyncProvider>
                  <UserSettingsProvider>
                    <ToastProvider>
                      <InitialLayout />
                    </ToastProvider>
                  </UserSettingsProvider>
                </SyncProvider>
              </CustomPopupProvider>
            </ThemeProvider>
          </SafeAreaProvider>
        </GestureHandlerRootView>
      </ConvexProviderWithClerk>
    </ClerkProvider>
  );
}

function InitialLayout() {
  const { settings, loading } = useUserSettings();
  const router = useRouter();
  const segments = useSegments();
  const [isReady, setIsReady] = React.useState(false);

  useEffect(() => {
    if (loading) return;

    if (!settings?.hasSeenOnboarding) {
      // Check if we are already on onboarding
      // segments is array of route segments
      // if blank (root), or not onboarding
      // Actually simplest is just replace if not onboarding
      // But we need to ensure navigation is ready?
      // router.replace works usually.

      // We defer Splash hide until we know where to go?
      // Or we just redirect.

      // Let's perform redirect if needed.
      // We can't easily check 'current route' synchronously at mount sometimes.
      // But InitialLayout mounts with Stack.
    }

    // Hide splash screen once we have loaded settings
    SplashScreen.hideAsync();
    setIsReady(true);
  }, [loading]);

  useEffect(() => {
    if (!isReady || loading) return;

    const inOnboarding = segments[0] === 'onboarding';
    if (!settings?.hasSeenOnboarding && !inOnboarding) {
      router.replace('/onboarding');
    }
  }, [isReady, loading, settings, segments]);

  // Deep link handler for budgetthing:// URL scheme
  useEffect(() => {
    if (!isReady) return;

    const handleDeepLink = (event: { url: string }) => {
      const url = event.url;
      if (!url) return;

      // Parse budgetthing:// URLs
      // Expected formats:
      // - budgetthing://calculator
      // - budgetthing://calculator?categoryId=UUID
      // - budgetthing://transaction/UUID
      try {
        const parsed = Linking.parse(url);
        const path = parsed.path?.toLowerCase() || parsed.hostname?.toLowerCase();

        if (path === 'calculator') {
          // Navigate to calculator tab (index 0 in tabs)
          const categoryId = parsed.queryParams?.categoryId;
          if (categoryId) {
            // Could pass as param, but for now just go to calculator
            router.push('/(tabs)');
          } else {
            router.push('/(tabs)');
          }
        } else if (path?.startsWith('transaction')) {
          // Extract transaction ID from path
          const parts = (parsed.path || '').split('/');
          const txId = parts.length > 1 ? parts[1] : parsed.queryParams?.id;
          if (txId) {
            // Navigate to transaction detail - would need a route
            // For now, navigate to transactions tab
            router.push('/(tabs)' as const);
          }
        }
      } catch (e) {
        console.warn('Failed to handle deep link:', e);
      }
    };

    // Get initial URL (app opened via deep link)
    Linking.getInitialURL().then(url => {
      if (url) handleDeepLink({ url });
    });

    // Listen for incoming links while app is open
    const subscription = Linking.addEventListener('url', handleDeepLink);

    return () => subscription.remove();
  }, [isReady, router]);

  return (
    <Stack
      screenOptions={{
        headerShown: true,
        headerStyle: { backgroundColor: '#000000' },
        headerTintColor: '#FFFFFF',
        headerTitleStyle: { fontFamily: 'AvenirNextCondensed-DemiBold', fontSize: 18 },
      }}
    >
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="settings" options={{ headerShown: false }} />
      <Stack.Screen name="onboarding" options={{ headerShown: false, gestureEnabled: false, animation: 'fade' }} />
    </Stack>
  );
}
