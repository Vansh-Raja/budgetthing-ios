#!/usr/bin/env bash
# Local Android release build (see docs/android-build.md).
# Usage: scripts/android-build.sh [assembleRelease|assembleDebug]
set -euo pipefail
cd "$(dirname "$0")/.."

TASK="${1:-assembleRelease}"
SIGNING_PROPS="${BUDGETTHING_SIGNING_PROPS:-$HOME/Android/keystores/budgetthing-release.properties}"

# Production backend unless the caller overrides.
export EXPO_PUBLIC_CONVEX_URL="${EXPO_PUBLIC_CONVEX_URL:-https://ceaseless-mandrill-733.convex.cloud}"
export EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY="${EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY:-pk_live_$(printf 'clerk.budgetthing.vanshraja.me$' | base64)}"
export NODE_ENV=production

if [ -f "$SIGNING_PROPS" ]; then
  while IFS='=' read -r key value; do
    [ -n "$key" ] && export "ORG_GRADLE_PROJECT_${key}=${value}"
  done < "$SIGNING_PROPS"
else
  echo "warning: $SIGNING_PROPS not found; release APK will be debug-signed" >&2
fi

# arm64 Linux: React Native ships hermesc for x86-64 only; use one built from source.
HERMESC="${BUDGETTHING_HERMESC:-$HOME/Android/hermesc/build/bin/hermesc}"
if [ "$(uname -m)" = "aarch64" ]; then
  [ -x "$HERMESC" ] || { echo "error: arm64 host needs hermesc at $HERMESC (see docs/android-build.md)" >&2; exit 1; }
  export ORG_GRADLE_PROJECT_BUDGETTHING_HERMESC="$HERMESC"
fi

cd android
# The JS bundle task doesn't track EXPO_PUBLIC_* env vars as inputs, so force it to
# rerun; otherwise a changed backend URL could ship with a stale bundle.
RERUN=()
[ "$TASK" = "assembleRelease" ] && RERUN=(:app:createBundleReleaseJsAndAssets --rerun)
./gradlew "${RERUN[@]}" "$TASK" -PreactNativeArchitectures="${ANDROID_ABIS:-arm64-v8a}" --no-daemon
