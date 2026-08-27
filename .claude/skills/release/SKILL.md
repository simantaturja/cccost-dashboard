---
name: release
description: Cut a new cccost-dashboard release — version bump, CHANGELOG entry, release commit, git tag, GitHub release, npm publish (CI), and VS Code Marketplace publish. Use when the user says "new release", "cut a release", "ship vX.Y.Z", "bump the version", "publish to npm", "publish the extension", or asks what version the next release should be.
disable-model-invocation: true
---

# Cutting a release

Two artifacts ship from this repo and their versions move in lockstep:

| Artifact | Version file | How it publishes |
|---|---|---|
| `cccost-dashboard` (npm) | `package.json` | **Automatic** — `.github/workflows/publish.yml` fires on any push to `master` that touches `package.json`, runs `npm test`, and publishes if the version differs from the registry |
| `turja.cccost-dashboard-vscode` (VS Code Marketplace) | `extension/package.json` + `extension/package-lock.json` | **Manual** — `vsce publish` from `extension/` |

Because npm publishes itself on push, **the push is the point of no return.** Everything below the push line is recoverable; the push is not. Get the version, CHANGELOG, and both `package.json` files right before pushing.

## Checklist

Create a todo per item. Do not skip items — v2.2.0 shipped with no git tag and no GitHub release because these steps were done ad hoc.

### 1. Preflight

```bash
git status --short                 # must be clean
git rev-parse --abbrev-ref HEAD    # must be master
git pull --ff-only
npm --prefix web ci && npm run build && npm test
```

Working tree dirty or tests red → stop and report. Never release over uncommitted changes.

### 2. Pick the version

```bash
git log $(git describe --tags --abbrev=0)..HEAD --oneline
```

SemVer against that log: breaking change to CLI/config/data shape → major; new user-visible capability → minor; fix/security/perf only → patch. State the version and the one-line reason before bumping; if the log is ambiguous between minor and patch, ask.

### 3. Refresh README screenshots (only if the UI changed)

`docs/screenshot-advisor.png`, `docs/screenshot-prompts.png`, `docs/demo.gif` must match what ships. Recapture against the bundled demo dataset: `npm run build`, `node server.js` (127.0.0.1:3456, wait ~4s for the initial scan), then Playwright with `colorScheme: 'light'|'dark'` — headless Chrome CLI follows macOS dark mode, so plain `--screenshot` cannot capture light mode on this machine.

Commit separately, before the release commit: `docs: refresh README screenshots for <what changed>`.

### 4. CHANGELOG entry

Prepend to `CHANGELOG.md` above the previous version. Keep a Changelog format, already used throughout:

```markdown
## [X.Y.Z] - YYYY-MM-DD

### Added
- ...

### Changed
- ...

### Fixed
- ...
```

Only include sections that have entries. Write from the user's point of view — what they can now see or do — not from the diff's. Date is today's actual date.

### 5. Bump both versions

```bash
npm version X.Y.Z --no-git-tag-version
npm --prefix extension version X.Y.Z --no-git-tag-version   # updates package.json + package-lock.json
```

Verify both read the same version before continuing:

```bash
node -p "require('./package.json').version + ' / ' + require('./extension/package.json').version"
```

### 6. Release commit

```
chore: release vX.Y.Z

<2-4 lines: what a user gets from this release, prose not bullets>
```

Author is the user only — no Co-Authored-By trailer on release commits.

Stage exactly: `package.json`, `extension/package.json`, `extension/package-lock.json`, `CHANGELOG.md`.

### 7. Push — npm publishes here

```bash
git push origin master
```

Then confirm CI actually published before moving on:

```bash
gh run watch                       # or: gh run list --workflow=publish.yml --limit 1
npm view cccost-dashboard version  # must equal X.Y.Z
```

If the publish job failed, fix forward with a patch release — do not force-push or unpublish.

### 8. Tag and GitHub release

```bash
git tag -a vX.Y.Z -m "vX.Y.Z"
git push origin vX.Y.Z
gh release create vX.Y.Z --title "vX.Y.Z" --notes "<the CHANGELOG section for this version>"
```

### 9. Publish the VS Code extension

```bash
cd extension
npx vsce package                                  # writes cccost-dashboard-vscode-X.Y.Z.vsix
npx vsce publish                                  # needs a marketplace PAT for publisher "turja"
```

The `.vsix` is committed to the repo alongside prior releases:

```bash
git add extension/cccost-dashboard-vscode-X.Y.Z.vsix
git commit -m "chore: add vX.Y.Z extension package"
git push origin master
```

`vsce publish` prompts for a Personal Access Token if none is cached. That is the user's credential — ask them to run the command themselves (`! npx vsce publish` in the prompt) rather than trying to source a token.

### 10. Verify

```bash
npm view cccost-dashboard version
gh release view vX.Y.Z
npx vsce show turja.cccost-dashboard-vscode | head -20
```

Report all three versions back. If the Marketplace still shows the old version, it is indexing lag — recheck rather than republishing.

## Rules

- Never bump one `package.json` without the other. A version skew between npm and the extension is user-visible in the README badges.
- Never hand-edit a version string; use `npm version --no-git-tag-version` so the lockfile stays consistent.
- A release commit contains only version files and CHANGELOG. Feature code, docs, and screenshots land in their own commits beforehand.
- `--no-git-tag-version` is required — the tag is created in step 8, after the publish is confirmed, so a failed publish leaves no dangling tag.
