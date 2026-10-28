/**
 * Android sign-in: email + password (with email-code verification), plus
 * browser-based Google/Apple through Clerk SSO.
 *
 * Google only appears when it's enabled on the Clerk instance. Apple stays as a
 * secondary link so accounts created on iPhone with Apple can still sign in.
 */

import { Text, TextInput } from '@/components/ui/LockedText';
import { Colors } from '@/constants/theme';
import { useClerk, useSignIn, useSignUp, useSSO } from '@clerk/clerk-expo';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import * as WebBrowser from 'expo-web-browser';
import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

WebBrowser.maybeCompleteAuthSession();

interface SignInButtonProps {
  onSignInStart?: () => void;
  onSignInComplete?: () => void;
  onSignInError?: (error: Error) => void;
}

type Step = 'signIn' | 'signUp' | 'verifySignUp' | 'verifySignIn' | 'reset';
type SSOStrategy = 'oauth_google' | 'oauth_apple';

function clerkMessage(error: any, fallback: string): string {
  return error?.errors?.[0]?.longMessage || error?.errors?.[0]?.message || error?.message || fallback;
}

/** Whether a social strategy is enabled on the Clerk instance (environment isn't in the public types). */
function useSocialEnabled(strategy: SSOStrategy): boolean {
  const clerk = useClerk() as any;
  const strategies: string[] | undefined =
    clerk?.__unstable__environment?.userSettings?.authenticatableSocialStrategies;
  return Array.isArray(strategies) && strategies.includes(strategy);
}

export function SignInButton({ onSignInStart, onSignInComplete, onSignInError }: SignInButtonProps) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <TouchableOpacity
        style={styles.button}
        onPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
          onSignInStart?.();
          setOpen(true);
        }}
        activeOpacity={0.8}
      >
        <Ionicons name="mail" size={20} color="#000000" />
        <Text style={styles.buttonText}>Sign in or create account</Text>
      </TouchableOpacity>

      <Modal
        visible={open}
        animationType="slide"
        onRequestClose={() => setOpen(false)}
        statusBarTranslucent
        navigationBarTranslucent
      >
        <SignInSheet
          onClose={() => setOpen(false)}
          onComplete={() => {
            setOpen(false);
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            onSignInComplete?.();
          }}
          onError={onSignInError}
        />
      </Modal>
    </>
  );
}

function SignInSheet({
  onClose,
  onComplete,
  onError,
}: {
  onClose: () => void;
  onComplete: () => void;
  onError?: (error: Error) => void;
}) {
  const { signIn, setActive, isLoaded: signInLoaded } = useSignIn();
  const { signUp, isLoaded: signUpLoaded } = useSignUp();
  const { startSSOFlow } = useSSO();
  const googleEnabled = useSocialEnabled('oauth_google');

  const [step, setStep] = useState<Step>('signIn');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const ready = signInLoaded && signUpLoaded && !!signIn && !!signUp && !!setActive;

  const run = useCallback(
    async (fn: () => Promise<void>) => {
      if (busy) return;
      setBusy(true);
      setError(null);
      try {
        await fn();
      } catch (e: any) {
        console.warn('[Auth] Android sign-in error:', e);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        setError(clerkMessage(e, 'Something went wrong. Please try again.'));
        onError?.(e);
      } finally {
        setBusy(false);
      }
    },
    [busy, onError]
  );

  const activate = useCallback(
    async (sessionId: string | null | undefined) => {
      if (!sessionId || !setActive) throw new Error('Sign-in did not complete. Please try again.');
      await setActive({ session: sessionId });
      onComplete();
    },
    [setActive, onComplete]
  );

  const goTo = (next: Step) => {
    setError(null);
    setCode('');
    setStep(next);
  };

  const handleSignIn = () =>
    run(async () => {
      if (!signIn) return;
      const attempt = await signIn.create({ identifier: email.trim(), password });
      if (attempt.status === 'complete') return activate(attempt.createdSessionId);

      // New-device check (Device Trust: 'needs_client_trust' on newer Clerk APIs) or email-code second factor.
      const emailFactor = attempt.supportedSecondFactors?.find((f) => f.strategy === 'email_code');
      const status = attempt.status as string;
      if ((status === 'needs_second_factor' || status === 'needs_client_trust') && emailFactor) {
        await signIn.prepareSecondFactor({ strategy: 'email_code' });
        return goTo('verifySignIn');
      }
      throw new Error('This account needs a sign-in method the app does not support yet. Try the web app.');
    });

  const handleVerifySignIn = () =>
    run(async () => {
      if (!signIn) return;
      const attempt = await signIn.attemptSecondFactor({ strategy: 'email_code', code: code.trim() });
      if (attempt.status === 'complete') return activate(attempt.createdSessionId);
      throw new Error('That code did not work. Please try again.');
    });

  const handleSignUp = () =>
    run(async () => {
      if (!signUp) return;
      await signUp.create({ emailAddress: email.trim(), password });
      await signUp.prepareEmailAddressVerification({ strategy: 'email_code' });
      goTo('verifySignUp');
    });

  const handleVerifySignUp = () =>
    run(async () => {
      if (!signUp) return;
      const attempt = await signUp.attemptEmailAddressVerification({ code: code.trim() });
      if (attempt.status === 'complete') return activate(attempt.createdSessionId);
      throw new Error('Your account needs more details. Please finish signing up on the web app.');
    });

  const handleSendReset = () =>
    run(async () => {
      if (!signIn) return;
      await signIn.create({ strategy: 'reset_password_email_code', identifier: email.trim() });
      goTo('reset');
    });

  const handleReset = () =>
    run(async () => {
      if (!signIn) return;
      const attempt = await signIn.attemptFirstFactor({
        strategy: 'reset_password_email_code',
        code: code.trim(),
        password,
      });
      if (attempt.status === 'complete') return activate(attempt.createdSessionId);
      throw new Error('Password reset did not complete. Please try again.');
    });

  const handleSSO = (strategy: SSOStrategy) =>
    run(async () => {
      try {
        const { createdSessionId, setActive: ssoSetActive } = await startSSOFlow({ strategy });
        if (createdSessionId && ssoSetActive) {
          await ssoSetActive({ session: createdSessionId });
          onComplete();
        }
      } catch (e: any) {
        if (e?.errors?.[0]?.code === 'user_cancelled') return;
        throw e;
      }
    });

  const isCodeStep = step === 'verifySignIn' || step === 'verifySignUp' || step === 'reset';
  const title =
    step === 'signUp' ? 'Create account' : step === 'reset' ? 'Reset password' : isCodeStep ? 'Check your email' : 'Sign in';
  const subtitle = isCodeStep
    ? `We sent a code to ${email.trim()}.`
    : step === 'signUp'
      ? 'Sync your budget across your phone and the web.'
      : 'Use the email and password for your BudgetThing account.';

  const primary = (() => {
    switch (step) {
      case 'signIn':
        return { label: 'Sign in', onPress: handleSignIn, disabled: !email.trim() || !password };
      case 'signUp':
        return { label: 'Create account', onPress: handleSignUp, disabled: !email.trim() || password.length < 8 };
      case 'verifySignIn':
        return { label: 'Verify', onPress: handleVerifySignIn, disabled: code.trim().length < 6 };
      case 'verifySignUp':
        return { label: 'Verify', onPress: handleVerifySignUp, disabled: code.trim().length < 6 };
      case 'reset':
        return { label: 'Set new password', onPress: handleReset, disabled: code.trim().length < 6 || password.length < 8 };
    }
  })();

  return (
    <SafeAreaView style={styles.sheet} edges={['top', 'bottom']}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding">
        <View style={styles.header}>
          <TouchableOpacity onPress={onClose} style={styles.closeButton} activeOpacity={0.75} accessibilityLabel="Close">
            <Ionicons name="close" size={24} color={Colors.textPrimary} />
          </TouchableOpacity>
        </View>

        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.subtitle}>{subtitle}</Text>

          {!isCodeStep && (
            <TextInput
              style={styles.input}
              value={email}
              onChangeText={setEmail}
              placeholder="Email"
              placeholderTextColor={Colors.textMuted}
              autoCapitalize="none"
              autoComplete="email"
              keyboardType="email-address"
              textContentType="emailAddress"
              selectionColor={Colors.accent}
              cursorColor={Colors.accent}
              editable={!busy}
            />
          )}

          {isCodeStep && (
            <TextInput
              style={styles.input}
              value={code}
              onChangeText={setCode}
              placeholder="6-digit code"
              placeholderTextColor={Colors.textMuted}
              keyboardType="number-pad"
              autoComplete="one-time-code"
              textContentType="oneTimeCode"
              maxLength={6}
              selectionColor={Colors.accent}
              cursorColor={Colors.accent}
              editable={!busy}
              autoFocus
            />
          )}

          {(step === 'signIn' || step === 'signUp' || step === 'reset') && (
            <TextInput
              style={styles.input}
              value={password}
              onChangeText={setPassword}
              placeholder={step === 'reset' ? 'New password' : 'Password'}
              placeholderTextColor={Colors.textMuted}
              secureTextEntry
              autoCapitalize="none"
              autoComplete={step === 'signIn' ? 'password' : 'new-password'}
              selectionColor={Colors.accent}
              cursorColor={Colors.accent}
              editable={!busy}
              onSubmitEditing={() => !primary.disabled && primary.onPress()}
            />
          )}

          {step === 'signUp' && <Text style={styles.hint}>At least 8 characters.</Text>}
          {error && <Text style={styles.error}>{error}</Text>}

          <TouchableOpacity
            style={[styles.primary, (primary.disabled || !ready) && styles.primaryDisabled]}
            onPress={primary.onPress}
            disabled={primary.disabled || !ready || busy}
            activeOpacity={0.8}
          >
            {busy ? <ActivityIndicator color="#000000" /> : <Text style={styles.primaryText}>{primary.label}</Text>}
          </TouchableOpacity>

          {step === 'signIn' && (
            <>
              <TouchableOpacity onPress={() => goTo('signUp')} style={styles.link}>
                <Text style={styles.linkText}>New here? <Text style={styles.linkAccent}>Create an account</Text></Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => {
                  if (!email.trim()) {
                    setError('Enter your email first, then tap “Forgot password?”.');
                    return;
                  }
                  handleSendReset();
                }}
                style={styles.link}
              >
                <Text style={styles.linkText}>Forgot password?</Text>
              </TouchableOpacity>
            </>
          )}
          {step !== 'signIn' && (
            <TouchableOpacity onPress={() => goTo('signIn')} style={styles.link}>
              <Text style={styles.linkText}>Back to sign in</Text>
            </TouchableOpacity>
          )}

          {(step === 'signIn' || step === 'signUp') && (
            <View style={styles.ssoBlock}>
              <View style={styles.dividerRow}>
                <View style={styles.dividerLine} />
                <Text style={styles.dividerText}>or</Text>
                <View style={styles.dividerLine} />
              </View>
              {googleEnabled && (
                <TouchableOpacity style={styles.ssoButton} onPress={() => handleSSO('oauth_google')} disabled={busy}>
                  <Ionicons name="logo-google" size={18} color={Colors.textPrimary} />
                  <Text style={styles.ssoText}>Continue with Google</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity style={styles.ssoButton} onPress={() => handleSSO('oauth_apple')} disabled={busy}>
                <Ionicons name="logo-apple" size={18} color={Colors.textPrimary} />
                <Text style={styles.ssoText}>Continue with Apple</Text>
              </TouchableOpacity>
              <Text style={styles.hint}>Signed up on iPhone with Apple? Use “Continue with Apple” to reach the same account.</Text>
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
    height: 50,
    borderRadius: 12,
    gap: 8,
  },
  buttonText: {
    fontFamily: 'AvenirNextCondensed-DemiBold',
    fontSize: 17,
    color: '#000000',
  },
  sheet: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    paddingHorizontal: 12,
    paddingTop: 8,
  },
  closeButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    paddingHorizontal: 24,
    paddingTop: 8,
    paddingBottom: 40,
  },
  title: {
    fontFamily: 'AvenirNextCondensed-Heavy',
    fontSize: 34,
    color: Colors.textPrimary,
  },
  subtitle: {
    fontFamily: 'AvenirNextCondensed-Medium',
    fontSize: 16,
    color: Colors.textSecondary,
    marginTop: 6,
    marginBottom: 24,
  },
  input: {
    fontFamily: 'AvenirNextCondensed-DemiBold',
    fontSize: 18,
    color: Colors.textPrimary,
    backgroundColor: Colors.cardBackground,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    marginBottom: 12,
  },
  hint: {
    fontFamily: 'AvenirNextCondensed-Medium',
    fontSize: 14,
    color: Colors.textTertiary,
    marginBottom: 8,
  },
  error: {
    fontFamily: 'AvenirNextCondensed-DemiBold',
    fontSize: 15,
    color: Colors.error,
    marginBottom: 8,
  },
  primary: {
    height: 52,
    borderRadius: 12,
    backgroundColor: Colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
  },
  primaryDisabled: {
    opacity: 0.4,
  },
  primaryText: {
    fontFamily: 'AvenirNextCondensed-Heavy',
    fontSize: 18,
    color: '#000000',
  },
  link: {
    alignItems: 'center',
    paddingVertical: 12,
  },
  linkText: {
    fontFamily: 'AvenirNextCondensed-DemiBold',
    fontSize: 15,
    color: Colors.textSecondary,
  },
  linkAccent: {
    color: Colors.accent,
  },
  ssoBlock: {
    marginTop: 12,
    gap: 12,
  },
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  dividerLine: {
    flex: 1,
    height: StyleSheet.hairlineWidth,
    backgroundColor: Colors.pillBorder,
  },
  dividerText: {
    fontFamily: 'AvenirNextCondensed-Medium',
    fontSize: 14,
    color: Colors.textTertiary,
  },
  ssoButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    height: 48,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.pillBorder,
  },
  ssoText: {
    fontFamily: 'AvenirNextCondensed-DemiBold',
    fontSize: 16,
    color: Colors.textPrimary,
  },
});
