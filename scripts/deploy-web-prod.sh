#!/usr/bin/env bash
# Build the PWA against PRODUCTION and deploy it to the main server as a new release.
#   https://app.budgetthing.vanshraja.me  ->  Nginx Proxy Manager (custom include)
#   -> 127.0.0.1:18170 (systemd user unit budgetthing-app-web) -> ~/sites/budgetthing-app/site
#
# Pitfalls this script handles:
# - .env.local pins DEV values; EXPO_NO_DOTENV=1 + --clear make the production values stick
#   (Metro caches inlined EXPO_PUBLIC_* values between builds).
# - The Clerk publishable key is public: it is base64("<frontend-api-host>$").
# Backend (Convex) deploys are separate: `npx convex deploy --yes` (use --prod on other
# convex commands; CONVEX_DEPLOYMENT=prod:... is overridden by .env.local in this repo).
set -euo pipefail
cd "$(dirname "$0")/.."

CLERK_FAPI_HOST="clerk.budgetthing.vanshraja.me"
CONVEX_URL="https://ceaseless-mandrill-733.convex.cloud"
SSH_HOST="Main Ubuntu Server"
SSH_AUTH="${SSHTHING_AUTH_FILE:-$HOME/.sshthing/tokens/personal-projects.token}"
OUT=dist-prod

rm -rf "$OUT"
EXPO_NO_DOTENV=1 \
EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY="pk_live_$(printf '%s$' "$CLERK_FAPI_HOST" | base64)" \
EXPO_PUBLIC_CONVEX_URL="$CONVEX_URL" \
  npx expo export --platform web --source-maps --clear --output-dir "$OUT"
node scripts/stamp-sw.mjs "$OUT"
node scripts/web-import-audit.mjs "$OUT"

# Guard: the bundle must carry production values only.
if grep -rqE 'adjoining-gnat-886|immune-akita-85' "$OUT/_expo/static/js"; then
  echo "ABORT: dev Convex/Clerk values found in the production bundle" >&2; exit 1
fi
grep -rq 'ceaseless-mandrill-733' "$OUT/_expo/static/js" || { echo "ABORT: production Convex URL missing" >&2; exit 1; }

find "$OUT" -name '*.map' -delete
TGZ=$(mktemp -t budgetthing-site).tgz
(cd "$OUT" && tar czf "$TGZ" .)
sshthing cp -t "$SSH_HOST" --auth-file "$SSH_AUTH" "$TGZ" :/home/ubuntu/sites/budgetthing-app/site.tgz
sshthing exec -t "$SSH_HOST" --auth-file "$SSH_AUTH" '
  set -e
  cd ~/sites/budgetthing-app
  R=releases/$(date +%Y%m%d-%H%M%S)
  mkdir -p "$R" && tar xzf site.tgz -C "$R" 2>/dev/null
  ln -sfn "$R" site
  ls -1dt releases/* | tail -n +6 | xargs -r rm -rf   # keep the last 5 releases
  curl -sf -o /dev/null http://127.0.0.1:18170/sign-in && echo "deployed $R"
'
echo "Rollback: ln -sfn releases/<previous> ~/sites/budgetthing-app/site (no restart needed)"
