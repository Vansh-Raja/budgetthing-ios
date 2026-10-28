/**
 * Self-update for the sideloaded Android APK (same feed format as BookThing).
 *
 * `scripts/android-release.sh` publishes `latest.json` + the APK on the feed. The app checks
 * when it comes to the front (at most every 6 hours) and from Settings; the native module
 * (`modules/budgetthing-updater`) downloads the APK, verifies its SHA-256 and installs it.
 * iOS and web never load this (the native module is null there).
 */
import { useSyncExternalStore } from 'react';
import { Updater, INSTALL_STATUS, type InstallStatusEvent } from '../../modules/budgetthing-updater';

export const UPDATE_FEED = process.env.EXPO_PUBLIC_ANDROID_UPDATE_FEED || 'https://budgetthing-updates.vanshraja.me';
const CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;

export type Release = {
  versionCode: number;
  versionName: string;
  apk: string;
  sha256: string;
  sizeBytes: number;
  notes: string;
};

export type UpdatePhase =
  | { kind: 'idle' }
  | { kind: 'checking' }
  | { kind: 'upToDate' }
  | { kind: 'available'; release: Release }
  | { kind: 'downloading'; release: Release; fraction: number }
  | { kind: 'installing'; release: Release }
  /** Android wants a confirmation tap; "Install" shows the prompt again. */
  | { kind: 'pendingConfirm'; release: Release }
  /** Android blocks installs until "Install unknown apps" is allowed for BudgetThing. */
  | { kind: 'needsPermission'; release: Release }
  /** viaSystemInstaller: the next try opens Android's installer screen instead of another session. */
  | { kind: 'failed'; message: string; release: Release | null; viaSystemInstaller: boolean }
  | { kind: 'inSystemInstaller'; release: Release };

type State = { phase: UpdatePhase; dismissedCode: number };

export const isUpdaterAvailable = Updater != null;
export const currentVersion = Updater ? { code: Updater.versionCode, name: Updater.versionName } : null;

let state: State = { phase: { kind: 'idle' }, dismissedCode: Updater?.getNumber('dismissedCode') ?? 0 };
const listeners = new Set<() => void>();

function set(next: Partial<State>) {
  state = { ...state, ...next };
  listeners.forEach((l) => l());
}

function setPhase(phase: UpdatePhase) {
  set({ phase });
}

function phaseRelease(phase: UpdatePhase): Release | null {
  return 'release' in phase ? phase.release : null;
}

/** The release being installed when a status event arrives (also after a restart, from the feed). */
let inFlight: Release | null = null;

Updater?.addListener('onProgress', ({ fraction }) => {
  if (state.phase.kind === 'downloading') setPhase({ ...state.phase, fraction });
});

Updater?.addListener('onStatus', (e: InstallStatusEvent) => {
  const release = phaseRelease(state.phase) ?? inFlight;
  if (e.status === INSTALL_STATUS.PENDING_USER_ACTION) {
    if (release) setPhase({ kind: 'pendingConfirm', release });
    return;
  }
  if (e.status === INSTALL_STATUS.SUCCESS) {
    setPhase({ kind: 'idle' }); // the process is replaced; rarely observed
    return;
  }
  // A failed or aborted session is never silently turned back into "available": say what
  // happened, and the next tap hands the APK to Android's installer, which shows its own errors.
  const message =
    e.status === INSTALL_STATUS.ABORTED
      ? "Not installed. Tap Update to open Android's installer instead."
      : `Install ${e.statusName}${e.message ? ` (${e.message})` : ''}`;
  setPhase({ kind: 'failed', message, release, viaSystemInstaller: release != null });
});

async function fetchLatest(): Promise<Release> {
  const res = await fetch(`${UPDATE_FEED}/latest.json`, { headers: { 'Cache-Control': 'no-cache' } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = await res.json();
  return {
    versionCode: Number(json.versionCode) || 0,
    versionName: String(json.versionName ?? ''),
    apk: String(json.apk ?? ''),
    sha256: String(json.sha256 ?? ''),
    sizeBytes: Number(json.sizeBytes) || 0,
    notes: String(json.notes ?? ''),
  };
}

let checking = false;

/** An install is underway; checks must not overwrite its phase. */
function isBusy() {
  return ['downloading', 'installing', 'pendingConfirm', 'inSystemInstaller'].includes(state.phase.kind);
}

export async function checkForUpdate(manual = true) {
  if (!Updater || checking || isBusy()) return;
  checking = true;
  if (manual) setPhase({ kind: 'checking' });
  try {
    const release = await fetchLatest();
    if (isBusy()) return; // an install started while the feed was loading
    Updater.setNumber('lastCheck', Date.now());
    // No checksum, no install: the APK is only trusted after its SHA-256 matches the feed.
    if (release.versionCode > Updater.versionCode && release.apk && release.sha256) {
      inFlight = release;
      // A failed attempt for this version (even before a restart) goes straight to Android's installer next time.
      const last = Updater.lastAttempt();
      // (A recorded "waiting for confirmation" isn't a failure: the prompt was just left open.)
      const failedBefore =
        !!last &&
        last.status !== INSTALL_STATUS.SUCCESS &&
        last.status !== INSTALL_STATUS.PENDING_USER_ACTION &&
        last.versionCode === release.versionCode;
      setPhase(
        failedBefore
          ? {
              kind: 'failed',
              message: `Last attempt failed: ${last!.statusName}${last!.message ? ` (${last!.message})` : ''}`,
              release,
              viaSystemInstaller: true,
            }
          : { kind: 'available', release }
      );
    } else {
      setPhase(manual ? { kind: 'upToDate' } : { kind: 'idle' });
    }
  } catch (e: any) {
    if (isBusy()) return;
    setPhase(
      manual
        ? { kind: 'failed', message: `Couldn't check for updates: ${e?.message ?? 'network error'}`, release: null, viaSystemInstaller: false }
        : { kind: 'idle' }
    );
  } finally {
    checking = false;
  }
}

/** Foreground hook: check quietly if the last check is old enough; resume after the permission screen. */
export function onAppForeground() {
  if (!Updater) return;
  if (state.phase.kind === 'needsPermission' && Updater.canInstall()) {
    void installUpdate(state.phase.release);
    return;
  }
  if (Date.now() - Updater.getNumber('lastCheck') >= CHECK_INTERVAL_MS) void checkForUpdate(false);
}

export async function installUpdate(release: Release) {
  if (!Updater) return;
  if (['downloading', 'installing'].includes(state.phase.kind)) return;
  if (!Updater.canInstall()) {
    setPhase({ kind: 'needsPermission', release });
    return;
  }
  // After a failed session (or "Open again" from Android's installer), use Android's installer screen.
  const viaSystemInstaller =
    state.phase.kind === 'inSystemInstaller' || (state.phase.kind === 'failed' && state.phase.viaSystemInstaller);
  Updater.requestNotificationPermission();
  inFlight = release;
  setPhase({ kind: 'downloading', release, fraction: 0 });
  try {
    const result = await Updater.install({
      url: `${UPDATE_FEED}/${release.apk.replace(/^\/+/, '')}`,
      versionCode: release.versionCode,
      versionName: release.versionName,
      sha256: release.sha256,
      sizeBytes: release.sizeBytes,
      viaSystemInstaller,
    });
    // A status event may already have moved the phase on (e.g. to pendingConfirm).
    if (state.phase.kind === 'downloading') {
      setPhase(result === 'system-installer' ? { kind: 'inSystemInstaller', release } : { kind: 'installing', release });
    }
  } catch (e: any) {
    setPhase({ kind: 'failed', message: e?.message ?? 'Update failed', release, viaSystemInstaller });
  }
}

export function confirmInstall() {
  Updater?.confirmPendingInstall();
}

export function openInstallSettings() {
  Updater?.openInstallSettings();
}

/** "Later": hide this version until a newer one ships. */
export function dismissUpdate(release: Release) {
  Updater?.setNumber('dismissedCode', release.versionCode);
  set({ dismissedCode: release.versionCode, phase: { kind: 'idle' } });
}

export function useAndroidUpdate(): State {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => state
  );
}
