# Android self-update

The sideloaded Android APK updates itself from a small feed, the same way BookThing does. Play Store builds would drop this (Play forbids `REQUEST_INSTALL_PACKAGES` for this use).

## Pieces

| Piece | Where |
|-------|-------|
| Feed | `https://budgetthing-updates.vanshraja.me` → `~/services/budgetthing-updates/` on the Main Ubuntu server. `server.py` serves `www/` on `127.0.0.1:5311`; `latest.json` is `no-store` and APKs are immutable. User units: `budgetthing-updates-web.service` and `budgetthing-updates-tunnel.service`. Tunnel config: `~/.cloudflared/configs/budgetthing-updates.yml`. |
| Native module | `modules/budgetthing-updater`, a local Expo module, Android only and autolinked from `modules/`. It downloads the APK, verifies its SHA-256 and installs it through a `PackageInstaller` session, with `USER_ACTION_NOT_REQUIRED` on Android 12+. `UpdateStatusReceiver` records every result; `UpdatedReceiver` (`MY_PACKAGE_REPLACED`) posts "BudgetThing updated, tap to open". After a failed or aborted session, the next try opens Android's installer screen instead. |
| App logic | `lib/updates/androidUpdater.ts`: checks on foreground at most every 6 hours, keeps the phase (available → downloading → installing / confirm / failed), and remembers "Later" per version. |
| UI | `components/ui/AndroidUpdateBanner.tsx`: a card under the status bar, plus a Settings › About row with the version and "Check for updates". |
| Release | `scripts/android-release.sh "notes"` |

## Releasing

```bash
scripts/android-release.sh "What changed, one line"   # bumps app.json android.versionCode, builds, publishes
scripts/android-release.sh --keep "Notes"             # republish the current versionCode
```

The script:
1. bumps `expo.android.versionCode` in `app.json`;
2. runs prebuild and `scripts/android-build.sh`;
3. copies the APK to `www/apk/BudgetThing-<version>-<code>.apk`;
4. writes `latest.json` (`versionCode`, `versionName`, `apk`, `sha256`, `sizeBytes`, `notes`);
5. keeps the five newest APKs.

It refuses a versionCode that isn't newer than the one already published. Commit the `app.json` bump afterwards.

Every release must be signed with the same keystore (`~/Android/keystores/budgetthing-release.jks`), or Android rejects the update as a conflict.

## How an update looks on the phone

- **First update** of a browser-installed APK: Android asks to allow "Install unknown apps" for BudgetThing, then shows one confirmation prompt.
- **Later updates** on Android 12+ install without a prompt, because BudgetThing is now the installer of record.
- **Android 14+** won't let the app reopen itself after the update, so a "BudgetThing updated, tap to open" notification appears. The app asks for notification permission the first time you tap Update.
