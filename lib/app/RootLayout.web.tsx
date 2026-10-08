/**
 * Web (PWA) root layout.
 *
 * Online-only, authenticated-only shell:
 * - Clerk on web uses browser session storage (no SecureStore token cache).
 * - Convex is the only data source; no SQLite bootstrap, seed, outbox, or SyncProvider.
 * - Unauthenticated visitors are routed to /sign-in via Stack.Protected.
 */
import { CustomPopupProvider } from '@/components/ui/CustomPopupProvider';
import { ToastProvider } from '@/components/ui/ToastProvider';
import { ClerkProvider, useAuth } from '@clerk/clerk-expo';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { DarkTheme, ThemeProvider } from '@react-navigation/native';
import { ConvexReactClient } from 'convex/react';
import { ConvexProviderWithClerk } from 'convex/react-clerk';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import React, { useEffect } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import 'react-native-get-random-values';
import 'react-native-reanimated';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { Text } from '@/components/ui/LockedText';
import { WebBootstrap } from '@/components/web/WebBootstrap';
import { WebConnectionBanner } from '@/components/web/WebConnectionBanner';
import { Colors, Fonts } from '@/constants/theme';
import { UserSettingsProvider } from '../hooks/useUserSettings';
import { SyncProvider } from '../sync/SyncProvider';
import { setWebConvexClient } from '../web/convexClient';

export { ErrorBoundary } from 'expo-router';

const CLERK_KEY = process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY ?? '';
const CONVEX_URL = process.env.EXPO_PUBLIC_CONVEX_URL ?? '';

if (!__DEV__) {
  if (!CLERK_KEY) throw new Error('Missing EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY');
  if (!CONVEX_URL) throw new Error('Missing EXPO_PUBLIC_CONVEX_URL');
}

export const unstable_settings = {
  initialRouteName: '(tabs)',
};

const AppTheme = {
  ...DarkTheme,
  colors: { ...DarkTheme.colors, background: '#000000', card: '#000000', primary: '#FF9500' },
};

export default function RootLayout() {
  const [loaded, error] = useFonts({
    SpaceMono: require('../../assets/fonts/SpaceMono-Regular.ttf'),
    ...FontAwesome.font,
  });

  useEffect(() => {
    if (error) throw error;
  }, [error]);

  if (!loaded) return null;

  if (!CLERK_KEY || !CONVEX_URL) {
    return (
      <View style={styles.center}>
        <Text style={styles.title}>Missing environment variables</Text>
        <Text style={styles.body}>
          Set EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY and EXPO_PUBLIC_CONVEX_URL, then restart the web server.
        </Text>
      </View>
    );
  }

  return <RootLayoutProviders />;
}

function RootLayoutProviders() {
  const convex = React.useMemo(() => {
    const c = new ConvexReactClient(CONVEX_URL, { unsavedChangesWarning: false });
    setWebConvexClient(c);
    if (__DEV__ && typeof window !== 'undefined') (window as any).__budgetthingConvex = c; // browser tests: cross-client checks
    return c;
  }, []);

  return (
    <ClerkProvider publishableKey={CLERK_KEY} afterSignOutUrl="/sign-in">
      <ConvexProviderWithClerk client={convex} useAuth={useAuth}>
        <GestureHandlerRootView style={{ flex: 1 }}>
          <SafeAreaProvider>
            <ThemeProvider value={AppTheme}>
              <CustomPopupProvider>
                <SyncProvider>
                  <UserSettingsProvider>
                    <ToastProvider>
                      <WebAuthGate />
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

function WebAuthGate() {
  const { isLoaded, isSignedIn } = useAuth();

  if (!isLoaded) {
    return (
      <View style={styles.center} testID="web-auth-loading">
        <ActivityIndicator color={Colors.accent} />
      </View>
    );
  }

  const signedIn = isSignedIn === true;

  return (
    <>
    <WebConnectionBanner />
    {signedIn ? <WebBootstrap /> : null}
    <Stack
      screenOptions={{
        headerShown: true,
        headerStyle: { backgroundColor: '#000000' },
        headerTintColor: '#FFFFFF',
        headerTitleStyle: { fontFamily: Fonts.demiBold, fontSize: 18 },
        contentStyle: { backgroundColor: '#000000' },
      }}
    >
      <Stack.Protected guard={signedIn}>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="settings" options={{ headerShown: false }} />
        <Stack.Screen name="import-inbox" options={{ headerShown: false, presentation: 'modal' }} />
        <Stack.Screen name="onboarding" options={{ headerShown: false }} />
        <Stack.Screen name="account/[id]" options={{ headerShown: false }} />
        <Stack.Screen name="category/[id]" options={{ headerShown: false }} />
        <Stack.Screen name="transfer" options={{ headerShown: false, presentation: 'modal' }} />
      </Stack.Protected>
      <Stack.Protected guard={!signedIn}>
        <Stack.Screen name="sign-in" options={{ headerShown: false }} />
        <Stack.Screen name="sign-up" options={{ headerShown: false }} />
      </Stack.Protected>
    </Stack>
    </>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, backgroundColor: Colors.background, alignItems: 'center', justifyContent: 'center', padding: 24 },
  title: { color: Colors.textPrimary, fontFamily: Fonts.heavy, fontSize: 20, marginBottom: 12 },
  body: { color: Colors.textSecondary, fontFamily: Fonts.medium, fontSize: 14, lineHeight: 20, textAlign: 'center' },
});
