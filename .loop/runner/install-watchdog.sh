#!/bin/bash
# Install (or reinstall) the daily watchdog launchd agent for the current user.
# Run it yourself — it writes to ~/Library/LaunchAgents.
#
#   ./.loop/runner/install-watchdog.sh
#   ./.loop/runner/install-watchdog.sh --uninstall

set -euo pipefail

LABEL="com.cccost.loop-watchdog"
REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd -P)"
AGENTS_DIR="$HOME/Library/LaunchAgents"
TARGET="$AGENTS_DIR/$LABEL.plist"

if [ "${1:-}" = "--uninstall" ]; then
  launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null || true
  rm -f "$TARGET"
  echo "Uninstalled $LABEL"
  exit 0
fi

mkdir -p "$AGENTS_DIR" "$REPO/.loop/runner/logs"
sed "s|REPO_PATH|$REPO|g" "$REPO/.loop/runner/$LABEL.plist" > "$TARGET"
chmod +x "$REPO/.loop/runner/watchdog.sh"

# bootout first so a reinstall replaces rather than errors
launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null || true
launchctl bootstrap "gui/$(id -u)" "$TARGET"

echo "Installed $LABEL -> $TARGET"
echo "Repo:     $REPO"
echo "Schedule: daily at 09:47 local"
echo
echo "Run it once now:  launchctl kickstart -p gui/$(id -u)/$LABEL"
echo "Check status:     launchctl print gui/$(id -u)/$LABEL | head -20"
echo "Logs:             $REPO/.loop/runner/logs/"
echo "Uninstall:        $0 --uninstall"
