#!/bin/bash
# Install (or reinstall) the loop's launchd agents for the current user.
# Run it yourself — it writes to ~/Library/LaunchAgents.
#
#   ./.loop/runner/install.sh              # both agents
#   ./.loop/runner/install.sh watchdog     # just one
#   ./.loop/runner/install.sh --uninstall  # remove both

set -euo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd -P)"
AGENTS_DIR="$HOME/Library/LaunchAgents"
UID_NUM="$(id -u)"

ALL=(watchdog lanes)

install_one() {
  local name="$1"
  local label="com.cccost.loop-$name"
  local src="$REPO/.loop/runner/$label.plist"
  local target="$AGENTS_DIR/$label.plist"

  [ -f "$src" ] || { echo "no plist for '$name' at $src"; exit 1; }

  sed "s|REPO_PATH|$REPO|g" "$src" > "$target"
  chmod +x "$REPO/.loop/runner/$name.sh"

  # bootout first so a reinstall replaces rather than errors
  launchctl bootout "gui/$UID_NUM/$label" 2>/dev/null || true
  launchctl bootstrap "gui/$UID_NUM" "$target"
  echo "installed $label"
  echo "  run once:  launchctl kickstart -p gui/$UID_NUM/$label"
}

uninstall_one() {
  local label="com.cccost.loop-$1"
  launchctl bootout "gui/$UID_NUM/$label" 2>/dev/null || true
  rm -f "$AGENTS_DIR/$label.plist"
  echo "uninstalled $label"
}

mkdir -p "$AGENTS_DIR" "$REPO/.loop/runner/logs" "$REPO/.loop/runner/state"

if [ "${1:-}" = "--uninstall" ]; then
  for n in "${ALL[@]}"; do uninstall_one "$n"; done
  exit 0
fi

TARGETS=("${@:-}")
[ -z "${TARGETS[0]:-}" ] && TARGETS=("${ALL[@]}")

for n in "${TARGETS[@]}"; do install_one "$n"; done

echo
echo "Repo:  $REPO"
echo "  watchdog — daily 09:47 local, drift checks"
echo "  lanes    — hourly, picks up loop:go issues and loop:build PRs"
echo "Logs:      $REPO/.loop/runner/logs/"
echo "Uninstall: $0 --uninstall"
