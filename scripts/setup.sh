#!/usr/bin/env bash
#
# One-command Mellowtel Tizen SDK setup.
# Run this from your Tizen app's root directory. It fetches the SDK, builds it,
# and drops the ready-to-use file into ./js/mellowtel-tizen.umd.js.
#
#   curl -fsSL https://raw.githubusercontent.com/mellowtel-inc/mellowtel-tizen/main/scripts/setup.sh | bash
#   # or, if you cloned the repo:  bash scripts/setup.sh /path/to/your-app
#
set -e

REPO="git@github.com-devhub:mellowtel-inc/mellowtel-tizen.git"
DEST_APP="${1:-$(pwd)}"
DEST_JS="$DEST_APP/js"

echo "→ Setting up Mellowtel Tizen SDK into: $DEST_APP"

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

echo "→ Cloning SDK…"
git clone --depth 1 "$REPO" "$TMP/sdk" >/dev/null 2>&1

echo "→ Building SDK…"
( cd "$TMP/sdk" && npm install >/dev/null 2>&1 && npm run build >/dev/null 2>&1 )

mkdir -p "$DEST_JS"
cp "$TMP/sdk/dist/mellowtel-tizen.umd.js" "$DEST_JS/mellowtel-tizen.umd.js"

echo "✓ Copied SDK to: $DEST_JS/mellowtel-tizen.umd.js"
echo ""
echo "Next steps:"
echo "  1. In index.html:   <script src=\"js/mellowtel-tizen.umd.js\"></script>"
echo "  2. Start it:        new Mellowtel('YOUR_KEY').initBackground()..."
echo "  3. In config.xml:   <tizen:privilege name=\"http://tizen.org/privilege/internet\"/>"
echo ""
echo "See INTEGRATION.md for the full guide."
