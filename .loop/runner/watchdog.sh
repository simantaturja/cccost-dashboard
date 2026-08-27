#!/bin/bash
# Daily watchdog run. Invoked by launchd; see README.md in this directory.
#
# Runs Claude Code headlessly against the loop-watchdog skill. The skill decides
# findings, loop-pipeline carries them to a draft PR, and a human merges. This
# script only starts the run and records what happened.

set -uo pipefail

REPO="${LOOP_REPO:-$HOME/Developer/claude-cost-dashboard}"
LOG_DIR="$REPO/.loop/runner/logs"
LOG="$LOG_DIR/watchdog-$(date +%Y-%m-%d).log"
PROJECTS_DIR="${CLAUDE_PROJECTS_DIR:-$HOME/.claude/projects}"

mkdir -p "$LOG_DIR"
exec >>"$LOG" 2>&1
echo "=== $(date -Iseconds) watchdog start ==="

cd "$REPO" || { echo "FATAL: repo not found at $REPO"; exit 1; }

# A dirty tree means a human is mid-edit. The loop works in its own worktree, but
# the skill reads the checkout for the allowlist and PRICING — read those from a
# known state or not at all.
if [ -n "$(git status --porcelain)" ]; then
  echo "SKIP: working tree is dirty, not starting an unattended run"
  echo "=== $(date -Iseconds) watchdog end (skipped) ==="
  exit 0
fi

command -v claude >/dev/null || { echo "FATAL: claude CLI not on PATH"; exit 1; }
command -v gh >/dev/null || { echo "FATAL: gh CLI not on PATH"; exit 1; }
gh auth status >/dev/null 2>&1 || { echo "FATAL: gh not authenticated"; exit 1; }

claude -p "Use the loop-watchdog skill to run today's drift checks on this repo.

Read .claude/skills/loop-watchdog/SKILL.md and follow it exactly. It defines all
three checks, the dedup rules, and where the log gets committed.

You are running unattended. No human will answer a question, so a question you
cannot answer from the repo, the transcripts, or a source you fetched is a
finding to file rather than a blocker to sit on. Never guess a pricing rate." \
  --permission-mode acceptEdits \
  --add-dir "$PROJECTS_DIR" \
  --allowed-tools "Read Grep Glob Edit Write WebFetch WebSearch Task Bash(git:*) Bash(gh:*) Bash(npm:*) Bash(npx:*) Bash(node:*) Bash(jq:*) Bash(rg:*)"

STATUS=$?
echo "=== $(date -Iseconds) watchdog end (exit $STATUS) ==="
exit $STATUS
