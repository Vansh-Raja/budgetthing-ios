/**
 * Platform sign-in entry point.
 *
 * iOS: Sign in with Apple. Android has its own email/password sheet
 * (`SignInButton.android.tsx`) because Apple isn't the primary method there.
 */

export { AppleSignInButton as SignInButton } from './AppleSignInButton';
