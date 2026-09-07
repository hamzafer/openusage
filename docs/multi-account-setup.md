# Multi-Account Claude Setup

## Overview

The `claude-work` plugin tracks a second Claude account alongside the default `claude` plugin. This is useful when you have separate personal and employer-provided Claude subscriptions running via different `CLAUDE_CONFIG_DIR` directories.

## How it works

- `plugins/claude/` reads credentials from `~/.claude/` (or `$CLAUDE_CONFIG_DIR` when exported).
- `plugins/claude-work/` reads credentials from `~/.claude-work/` and ignores `CLAUDE_CONFIG_DIR`.

The work plugin is **generated** from the Claude plugin by `scripts/sync-claude-work-plugin.mjs`:

```
bun run sync:claude-work
```

It applies four anchored edits (default home, ignore the env var, keychain hash from the expanded
`~/.claude-work` path, plugin id) and fails loudly if the Claude plugin changed shape. A test in
`plugins/claude-work/plugin.test.js` checks the generated file is current, so run the sync after
every change to `plugins/claude/`. Only `icon.svg` and the test file are hand-written.

## Keychain service name

Claude Code appends a hash suffix to the keychain service name when using a non-default config dir:
`Claude Code-credentials-<first 8 hex of sha256(CLAUDE_CONFIG_DIR)>`. The hash is over the literal
value Claude Code was launched with, which is the expanded path (`/Users/hamza/.claude-work` →
`1c731050`). The work plugin computes it from `$HOME` at runtime, so nothing is hardcoded.

## Troubleshooting

### Both cards show identical data (most common cause)

**Always launch OpenUsage from Spotlight / Finder / the Dock — never from a terminal
where you have `export CLAUDE_CONFIG_DIR=...` set.**

The personal `claude` plugin reads `CLAUDE_CONFIG_DIR` from the process environment. If
OpenUsage is launched from a shell that has `CLAUDE_CONFIG_DIR` exported (e.g. pointing at
`~/.claude-work`), the personal plugin *inherits* it and loads the work token — so both
cards end up showing the work account, byte-identical down to the reset minute.

The `claude-work` shell alias is safe: it scopes the var to that one command and does not
export it. The trouble only comes from a globally-exported `CLAUDE_CONFIG_DIR` in the shell
that launched the app.

Diagnose and fix:

```
# Is the running app polluted?
ps eww -p "$(pgrep -x openusage | head -1)" | tr ' ' '\n' | grep CLAUDE_CONFIG_DIR
# Not in launchd globally (if this prints a value, run: launchctl unsetenv CLAUDE_CONFIG_DIR)
launchctl getenv CLAUDE_CONFIG_DIR
# Quit, then relaunch clean:
osascript -e 'quit app "OpenUsage"'
env -u CLAUDE_CONFIG_DIR open -a OpenUsage
```

### Work card shows "Not logged in"

Run `claude-work` (your alias for `CLAUDE_CONFIG_DIR=~/.claude-work claude`) and sign in again,
then refresh OpenUsage. If it keeps failing, confirm the keychain item exists:

```
security find-generic-password -s "Claude Code-credentials-$(printf '%s' "$HOME/.claude-work" | shasum -a 256 | cut -c1-8)" >/dev/null && echo ok
```

## Showing both accounts in the menu bar

OpenUsage normally shows one provider in the menu bar (the one you have open in the popover).
The fork (v0.6.29 and up) adds **Settings → Menubar
Icon → Pinned Providers**: tap the providers you want and they render side by side, e.g.
`● 27%  ● 80%`. With nothing pinned the old "follow the open provider" behaviour applies.

- Works with the **Plugin** and **Donut** icon styles. **Bars** already shows up to four providers.
- The setting is stored as `menubarPinnedPlugins` in `settings.json` under
  `~/Library/Application Support/com.sunstory.openusage/`.
- Rebuild after changes with:
  ```
  bun tauri build --bundles app --config '{"bundle":{"createUpdaterArtifacts":false}}'
  ```
  The `.app` lands in `src-tauri/target/release/bundle/macos/`.
