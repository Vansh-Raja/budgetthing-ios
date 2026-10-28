import { requireOptionalNativeModule } from 'expo';
import type { EventSubscription } from 'expo-modules-core';

export type InstallRequest = {
  url: string;
  versionCode: number;
  versionName: string;
  sha256: string;
  sizeBytes: number;
  viaSystemInstaller: boolean;
};

export type InstallStatusEvent = {
  /** PackageInstaller.STATUS_*: 0 success, -1 waiting for confirmation, 3 aborted, ... */
  status: number;
  statusName: string;
  message: string | null;
  versionCode: number;
  pendingConfirm: boolean;
};

export type LastAttempt = {
  status: number;
  statusName: string;
  message: string | null;
  versionCode: number;
  at: number;
};

type UpdaterNative = {
  versionCode: number;
  versionName: string;
  canInstall(): boolean;
  openInstallSettings(): void;
  requestNotificationPermission(): void;
  confirmPendingInstall(): boolean;
  hasPendingConfirm(): boolean;
  lastAttempt(): LastAttempt | null;
  getNumber(key: string): number;
  setNumber(key: string, value: number): void;
  install(request: InstallRequest): Promise<'session' | 'system-installer'>;
  addListener(event: 'onProgress', listener: (e: { fraction: number }) => void): EventSubscription;
  addListener(event: 'onStatus', listener: (e: InstallStatusEvent) => void): EventSubscription;
};

/** Self-update for the sideloaded Android APK. Null on iOS and web (Android-only module). */
export const Updater = requireOptionalNativeModule<UpdaterNative>('BudgetThingUpdater');

export const INSTALL_STATUS = {
  SUCCESS: 0,
  PENDING_USER_ACTION: -1,
  ABORTED: 3,
} as const;
