/**
 * Android self-update UI: a floating card under the status bar when a new APK is out
 * (and while it downloads/installs), plus the Settings row. Renders nothing on iOS/web.
 */
import { Text } from '@/components/ui/LockedText';
import { Colors } from '@/constants/theme';
import * as Haptics from 'expo-haptics';
import React, { useEffect } from 'react';
import { ActivityIndicator, AppState, StyleSheet, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  checkForUpdate,
  confirmInstall,
  currentVersion,
  dismissUpdate,
  installUpdate,
  isUpdaterAvailable,
  onAppForeground,
  openInstallSettings,
  useAndroidUpdate,
  type Release,
  type UpdatePhase,
} from '../../lib/updates/androidUpdater';

type Action = { label: string; onPress: () => void; primary?: boolean };

function describe(phase: UpdatePhase): { title: string; body: string; actions: Action[]; busy?: boolean } | null {
  const name = (r: Release) => `BudgetThing ${r.versionName} (${r.versionCode})`;
  switch (phase.kind) {
    case 'available':
      return {
        title: `${name(phase.release)} is available`,
        body: phase.release.notes || 'A new version is ready to install.',
        actions: [
          { label: 'Later', onPress: () => dismissUpdate(phase.release) },
          { label: 'Update', onPress: () => installUpdate(phase.release), primary: true },
        ],
      };
    case 'downloading':
      return { title: `Downloading ${phase.release.versionName}`, body: `${Math.round(phase.fraction * 100)}%`, actions: [], busy: true };
    case 'installing':
      return { title: `Installing ${phase.release.versionName}`, body: 'BudgetThing restarts when it’s done.', actions: [], busy: true };
    case 'pendingConfirm':
      return {
        title: `Install ${phase.release.versionName}?`,
        body: 'Android needs you to confirm the update.',
        actions: [{ label: 'Install', onPress: confirmInstall, primary: true }],
      };
    case 'needsPermission':
      return {
        title: 'Allow updates',
        body: 'Let BudgetThing install its own updates: turn on “Allow from this source”, then come back.',
        actions: [
          { label: 'Later', onPress: () => dismissUpdate(phase.release) },
          { label: 'Open settings', onPress: openInstallSettings, primary: true },
        ],
      };
    case 'inSystemInstaller':
      return {
        title: `Install ${phase.release.versionName}`,
        body: 'Finish in Android’s installer.',
        actions: [{ label: 'Open again', onPress: () => installUpdate(phase.release), primary: true }],
      };
    case 'failed':
      if (!phase.release) return null; // check errors only show in Settings
      return {
        title: `${name(phase.release)} wasn’t installed`,
        body: phase.message,
        actions: [
          { label: 'Later', onPress: () => dismissUpdate(phase.release!) },
          { label: 'Update', onPress: () => installUpdate(phase.release!), primary: true },
        ],
      };
    default:
      return null;
  }
}

export function AndroidUpdateBanner() {
  const { phase, dismissedCode } = useAndroidUpdate();
  const insets = useSafeAreaInsets();

  useEffect(() => {
    if (!isUpdaterAvailable) return;
    onAppForeground();
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') onAppForeground();
    });
    return () => sub.remove();
  }, []);

  if (!isUpdaterAvailable) return null;
  if (phase.kind === 'available' && phase.release.versionCode <= dismissedCode) return null;
  const content = describe(phase);
  if (!content) return null;

  return (
    <View style={[styles.wrap, { top: insets.top + 8 }]} pointerEvents="box-none">
      <View style={styles.card}>
        <View style={{ flex: 1 }}>
          <Text style={styles.title} numberOfLines={1}>{content.title}</Text>
          <Text style={styles.body} numberOfLines={3}>{content.body}</Text>
        </View>
        {content.busy ? <ActivityIndicator color={Colors.accent} /> : null}
        {content.actions.length > 0 && (
          <View style={styles.actions}>
            {content.actions.map((a) => (
              <TouchableOpacity
                key={a.label}
                onPress={() => {
                  Haptics.selectionAsync();
                  a.onPress();
                }}
                style={[styles.button, a.primary && styles.buttonPrimary]}
                activeOpacity={0.8}
              >
                <Text style={[styles.buttonText, a.primary && styles.buttonTextPrimary]}>{a.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}
      </View>
    </View>
  );
}

/** Settings › About: current version and a manual check. */
export function AndroidUpdateSettingsRow() {
  const { phase } = useAndroidUpdate();
  if (!isUpdaterAvailable || !currentVersion) return null;

  const status = (() => {
    switch (phase.kind) {
      case 'checking': return 'Checking…';
      case 'upToDate': return 'You’re on the latest version.';
      case 'failed': return phase.message;
      case 'idle': return null;
      default: return describe(phase)?.title ?? null;
    }
  })();
  const release = 'release' in phase ? phase.release : null;
  const canInstall = release && (phase.kind === 'available' || phase.kind === 'failed');

  return (
    <View style={styles.row}>
      <View style={{ flex: 1 }}>
        <Text style={styles.rowTitle}>Version {currentVersion.name} ({currentVersion.code})</Text>
        {status ? <Text style={styles.rowStatus}>{status}</Text> : null}
      </View>
      <TouchableOpacity
        onPress={() => {
          Haptics.selectionAsync();
          if (canInstall && release) installUpdate(release);
          else checkForUpdate(true);
        }}
        disabled={phase.kind === 'checking' || phase.kind === 'downloading' || phase.kind === 'installing'}
        style={[styles.button, styles.buttonPrimary]}
        activeOpacity={0.8}
      >
        <Text style={[styles.buttonText, styles.buttonTextPrimary]}>{canInstall ? 'Update' : 'Check for updates'}</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: 12,
    right: 12,
    zIndex: 2000,
    elevation: 2000,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#1C1C1E',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.pillBorder,
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  title: {
    fontFamily: 'AvenirNextCondensed-DemiBold',
    fontSize: 16,
    color: Colors.textPrimary,
  },
  body: {
    fontFamily: 'AvenirNextCondensed-Medium',
    fontSize: 14,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  actions: {
    gap: 8,
  },
  button: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 999,
    backgroundColor: Colors.pillBackground,
    alignItems: 'center',
  },
  buttonPrimary: {
    backgroundColor: Colors.accent,
  },
  buttonText: {
    fontFamily: 'AvenirNextCondensed-DemiBold',
    fontSize: 15,
    color: Colors.textPrimary,
  },
  buttonTextPrimary: {
    color: '#000000',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 12,
  },
  rowTitle: {
    fontFamily: 'AvenirNextCondensed-DemiBold',
    fontSize: 16,
    color: Colors.textPrimary,
  },
  rowStatus: {
    fontFamily: 'AvenirNextCondensed-Medium',
    fontSize: 14,
    color: Colors.textTertiary,
    marginTop: 2,
  },
});
