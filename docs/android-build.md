# Android build (local, no EAS)

How to produce an installable BudgetThing APK on a Linux box, including an arm64 host such as the Main Ubuntu server. EAS cloud builds and Play submissions stay maintainer-only.

## What the app config already handles

- `app.json › android`: package `com.vansh.budgetthing`, adaptive + monochrome icon, dark system UI, edge-to-edge, `softwareKeyboardLayoutMode: resize`.
- `plugins/withAndroidLocalBuild.js`: release builds use an upload keystore passed via Gradle properties (and fall back to the debug keystore without them), and an optional `BUDGETTHING_HERMESC` override.
- `android/` is generated (`npx expo prebuild`) and git-ignored. Never edit it by hand; change `app.json` or a config plugin instead.

## Toolchain

| Need | Version | Notes |
|------|---------|-------|
| Node | ≥ 20.19.4 | e.g. a user-local Node 22 in `~/.local/node22/bin`; leave the system Node alone |
| JDK | 17–21 | |
| Android SDK | platform `android-36`, build-tools `36.0.0` | `ANDROID_HOME=~/Android/sdk` |
| NDK | `27.1.12297006` (r27b) | needed for the new-architecture C++ (React Native, Reanimated, Expo modules) |
| CMake + Ninja | SDK `cmake;3.22.1` | x86 hosts: install via sdkmanager. arm64: see below |

### arm64 Linux hosts

Google ships the SDK build tools and the NDK as x86-64 only. On aarch64:

- **aapt2 / build-tools:** use the static aarch64 build-tools from `android-sdk-tools-static-aarch64` (installed as `build-tools/35.0.0`). `~/.gradle/gradle.properties` sets `android.aapt2FromMavenOverride=/home/<you>/Android/sdk/build-tools/35.0.0/aapt2`. Use an absolute path: Gradle doesn't expand `~`. `build-tools/36.0.0` is a hard-link copy of the same folder, with `36.0.0` in `source.properties` and `package.xml`, so AGP doesn't try to download the x86 one.
- **NDK:** the community aarch64-linux-gnu NDK build `android-ndk-r27b-aarch64-linux-gnu.tar.xz` from `github.com/HomuHomu833/android-ndk-custom` (release `r27`), extracted to `~/Android/sdk/ndk/27.1.12297006`.
- **hermesc:** React Native only ships x86-64 `hermesc`. Build it from the Hermes commit that RN pins (`node_modules/react-native/sdks/.hermesversion`; RN 0.81.5 pins `e0fc67142ec0763c6b6153ca2bf96df815539782`), so the bytecode matches the runtime:
  ```bash
  sudo apt install libicu-dev
  HERMES_COMMIT=e0fc67142ec0763c6b6153ca2bf96df815539782   # from .hermesversion's tag
  mkdir -p ~/Android/dl/hermes-src
  curl -sSL "https://github.com/facebook/hermes/archive/$HERMES_COMMIT.tar.gz" | tar -xz -C ~/Android/dl/hermes-src
  cmake -S ~/Android/dl/hermes-src/hermes-$HERMES_COMMIT -B ~/Android/hermesc/build -G Ninja \
    -DCMAKE_BUILD_TYPE=Release -DHERMES_ENABLE_INTL=OFF -DHERMES_ENABLE_TEST_SUITE=OFF
  ninja -C ~/Android/hermesc/build hermesc
  ```
  On aarch64, `scripts/android-build.sh` passes it to Gradle as `BUDGETTHING_HERMESC`, which the config plugin turns into the `hermesCommand` override. Rebuild hermesc whenever React Native is upgraded.
- **CMake:** AGP insists on the SDK's `cmake/3.22.1` and downloads the x86 package. Install `cmake ninja-build` from apt, then replace `~/Android/sdk/cmake/3.22.1/bin/{cmake,ctest,cpack,ninja}` with symlinks to `/usr/bin/*`. Keep `source.properties` and `package.xml`. Setting `cmake.dir` in `local.properties` is not enough.

## Build

```bash
export PATH=~/.local/node22/bin:$PATH ANDROID_HOME=~/Android/sdk
npm ci
CI=1 npx expo prebuild --platform android --clean --no-install
printf 'sdk.dir=%s\n' "$ANDROID_HOME" > android/local.properties
scripts/android-build.sh            # assembleRelease, arm64-v8a only
```

`scripts/android-build.sh`:
- points the bundle at **production** Convex and Clerk unless `EXPO_PUBLIC_CONVEX_URL` / `EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY` are already set;
- reads signing values from `~/Android/keystores/budgetthing-release.properties`, or from the path in `BUDGETTHING_SIGNING_PROPS`;
- builds `arm64-v8a` only. Set `ANDROID_ABIS=arm64-v8a,x86_64` for an emulator.

The APK is written to `android/app/build/outputs/apk/release/app-release.apk`.

### Signing

The upload keystore lives **outside the repo**. To create one:

```bash
keytool -genkeypair -storetype PKCS12 -keystore ~/Android/keystores/budgetthing-release.jks \
  -alias budgetthing -keyalg RSA -keysize 4096 -validity 10000
```

Then write the properties file:

```
BUDGETTHING_UPLOAD_STORE_FILE=/home/<you>/Android/keystores/budgetthing-release.jks
BUDGETTHING_UPLOAD_KEY_ALIAS=budgetthing
BUDGETTHING_UPLOAD_STORE_PASSWORD=...
BUDGETTHING_UPLOAD_KEY_PASSWORD=...
```

Every update must be signed with the same key, or Android refuses to install it over the existing app. Back the keystore up. For Play Store releases, prefer EAS-managed credentials.

### Disk

A single-ABI release build needs about 4 GB: Gradle caches plus `android/app/.cxx` and `android/*/build`. Afterwards, `rm -rf android/app/.cxx android/app/build/intermediates node_modules/*/android/build modules/*/android/build` frees most of it. The APK is in `outputs`.

## Install on a phone

1. Download the APK on the phone.
2. Allow your browser or file manager to "Install unknown apps" when Android asks.
3. Open the APK and install it.

Updates signed with the same keystore install over the top and keep local data.
