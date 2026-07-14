# Claude Code Cost Dashboard — VS Code extension

The [cccost-dashboard](https://github.com/simantaturja/cccost-dashboard) inside VS
Code. Run the command **“Claude Code: Open Cost Dashboard”** (Command Palette) to
open a panel showing where your Claude Code tokens and money go — per project, per
model, and per prompt — with an efficiency advisor.

Reads the session logs Claude Code already writes to `~/.claude/projects/`. No API
key, no proxy, no data leaves your machine.

> **Unofficial.** Not affiliated with or endorsed by Anthropic. Costs shown are
> *API-equivalent value* computed from local usage logs — on a Pro/Max subscription
> they are not what you are billed.

**Desktop only.** Needs local filesystem access, so it does not run in
vscode.dev / github.dev.

## Build from source

```sh
npm --prefix web ci && npm --prefix web run build   # build the SPA
cd extension && npm ci && npm run build             # bundle host + copy SPA
npm run package                                     # -> cccost-dashboard-vscode-*.vsix
```

Install the `.vsix`: Extensions view → ⋯ → *Install from VSIX…*, or
`code --install-extension cccost-dashboard-vscode-*.vsix`.
