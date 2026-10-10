/**
 * Root layout route. Platform-specific implementations live in lib/app so
 * Metro resolves exactly one of RootLayout.tsx (native) or RootLayout.web.tsx.
 * Keep this file thin: Expo Router bundles every base route file on every platform.
 */
export { default, unstable_settings, ErrorBoundary } from '@/lib/app/RootLayout';
