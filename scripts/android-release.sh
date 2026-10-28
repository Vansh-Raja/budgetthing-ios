#!/usr/bin/env bash
# Build a signed Android release and publish it to the self-update feed
# (budgetthing-updates.vanshraja.me, served from ~/services/budgetthing-updates/www).
#
#   scripts/android-release.sh "What changed, one line"           # bump android.versionCode
#   scripts/android-release.sh --keep "Notes"                     # republish the current versionCode
#
# Phones on an older versionCode see "BudgetThing x.y.z (code) is available" on next launch
# (lib/updates/androidUpdater.ts). The version name is app.json's shared "version".
# Commit the app.json bump afterwards. See docs/android-build.md.
set -euo pipefail
cd "$(dirname "$0")/.."
FEED="${BUDGETTHING_FEED_DIR:-$HOME/services/budgetthing-updates/www}"
FEED_URL="${BUDGETTHING_FEED_URL:-https://budgetthing-updates.vanshraja.me}"
BUMP=1
case "${1:-}" in --keep) BUMP=0; shift ;; esac
NOTES="${1:-}"
[ -n "$NOTES" ] || { echo "usage: $0 [--keep] \"release notes\"" >&2; exit 2; }

# Bump android.versionCode in app.json (keeps the file's line endings).
read -r code name < <(python3 -I - "$BUMP" <<'PY'
import json, sys
bump = sys.argv[1] == "1"
raw = open("app.json", newline="").read()
data = json.loads(raw)
android = data["expo"]["android"]
if bump:
    old = android["versionCode"]
    android["versionCode"] = old + 1
    raw = raw.replace(f'"versionCode": {old},', f'"versionCode": {old + 1},', 1)
    assert json.loads(raw)["expo"]["android"]["versionCode"] == old + 1, "couldn't bump versionCode"
    open("app.json", "w", newline="").write(raw)
print(android["versionCode"], data["expo"]["version"])
PY
)

# The feed must only move forward, or phones would never see the next release.
if [ -f "$FEED/latest.json" ]; then
  published=$(python3 -I -c 'import json,sys; print(json.load(open(sys.argv[1])).get("versionCode", 0))' "$FEED/latest.json")
  if [ "$code" -lt "$published" ] || { [ "$BUMP" = 1 ] && [ "$code" -le "$published" ]; }; then
    echo "error: versionCode $code is not newer than the published $published" >&2
    exit 1
  fi
fi

export PATH="$HOME/.local/node22/bin:$PATH" ANDROID_HOME="${ANDROID_HOME:-$HOME/Android/sdk}"
CI=1 npx expo prebuild --platform android --no-install >/dev/null
[ -f android/local.properties ] || printf 'sdk.dir=%s\n' "$ANDROID_HOME" > android/local.properties
scripts/android-build.sh assembleRelease

apk=android/app/build/outputs/apk/release/app-release.apk
"$ANDROID_HOME/build-tools/35.0.0/apksigner" verify "$apk" >/dev/null 2>&1 || jarsigner -verify "$apk" >/dev/null

mkdir -p "$FEED/apk"
out="apk/BudgetThing-$name-$code.apk"
cp "$apk" "$FEED/$out"
sha=$(sha256sum "$FEED/$out" | cut -d' ' -f1)
size=$(stat -c %s "$FEED/$out")
python3 -I - "$FEED/latest.json" "$code" "$name" "$out" "$sha" "$size" "$NOTES" <<'PY'
import json, sys, os
path, code, name, apk, sha, size, notes = sys.argv[1:]
tmp = path + ".tmp"
with open(tmp, "w") as f:
    json.dump({"versionCode": int(code), "versionName": name, "apk": apk, "sha256": sha,
               "sizeBytes": int(size), "notes": notes}, f, indent=2)
os.replace(tmp, path)
PY
# Keep the five newest APKs.
ls -1t "$FEED"/apk/BudgetThing-*.apk | tail -n +6 | xargs -r rm -f

echo "Published BudgetThing $name (versionCode $code)"
echo "  $FEED_URL/$out"
[ "$BUMP" = 1 ] && echo "  Commit the app.json versionCode bump."
