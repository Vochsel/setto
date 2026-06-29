#!/usr/bin/env bash
#
# Point the locally-run Next app at a Convex deployment's DATA.
#
#   bash scripts/convex-env.sh dev    # default — your personal dev deployment
#   bash scripts/convex-env.sh prod   # read/write PRODUCTION data locally
#
# Only NEXT_PUBLIC_CONVEX_URL / NEXT_PUBLIC_CONVEX_SITE_URL in .env.local are
# changed (these are what the browser client uses). CONVEX_DEPLOYMENT is left
# untouched on purpose, so `npx convex dev` always keeps targeting dev and can
# never accidentally push code to production.
#
# After switching, restart `next dev` (NEXT_PUBLIC_* are inlined at boot).
# Note: running `npx convex dev` rewrites these back to dev — that's expected;
# use the `prod` mode only when you are NOT running the dev watcher.
set -euo pipefail

target="${1:-}"
root="$(cd "$(dirname "$0")/.." && pwd)"
env_file="$root/.env.local"

case "$target" in
  dev)  slug="savory-reindeer-554" ;;
  prod) slug="formal-warthog-79" ;;
  *) echo "Usage: $0 dev|prod" >&2; exit 1 ;;
esac

[ -f "$env_file" ] || { echo "✖ $env_file not found (run 'npx convex dev' once)" >&2; exit 1; }

cloud="https://$slug.convex.cloud"
site="https://$slug.convex.site"

tmp="$(mktemp)"
awk -v c="$cloud" -v s="$site" '
  /^NEXT_PUBLIC_CONVEX_URL=/      { print "NEXT_PUBLIC_CONVEX_URL=" c; seen_c=1; next }
  /^NEXT_PUBLIC_CONVEX_SITE_URL=/ { print "NEXT_PUBLIC_CONVEX_SITE_URL=" s; seen_s=1; next }
  { print }
  END {
    if (!seen_c) print "NEXT_PUBLIC_CONVEX_URL=" c
    if (!seen_s) print "NEXT_PUBLIC_CONVEX_SITE_URL=" s
  }
' "$env_file" > "$tmp" && mv "$tmp" "$env_file"

echo "✓ Next app now points at $target Convex data → $cloud"
echo "  Restart 'npm run dev' to pick it up. (CONVEX_DEPLOYMENT unchanged → CLI stays on dev.)"
