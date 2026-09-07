# Fork Notes

This is Hamza's fork of OpenUsage (github.com/hamzafer/openusage). It keeps developing the
**Tauri edition** (React + Rust) that upstream retired at v0.6.28 in favour of a native Swift
rewrite. Read this first when picking the project up again.

## Why This Fork Exists

- Upstream `main` became the Swift app (0.7.x). It only discovers extra Claude accounts through
  Claude Desktop logins, not through a second Claude Code config dir like `~/.claude-work`, so
  it cannot show the personal and work Claude accounts side by side the way this fork does.
- The Tauri app is small, hackable, and already does what we need. We prefer it.

## What Changed Versus Upstream v0.6.28

| Area | Change |
|---|---|
| Menu bar | **Settings → Menubar Icon → Pinned Providers.** Pinned providers render side by side (icon + percent, or icon + donut). With nothing pinned the bar follows the provider you have open. Setting key: `menubarPinnedPlugins`. Renderer: `src/lib/tray-multi-provider-icon.ts`. |
| Claude (Work) | `plugins/claude-work/` is a second Claude card reading `~/.claude-work`. It is **generated** from `plugins/claude/` by `bun run sync:claude-work`. See [multi-account-setup.md](multi-account-setup.md). |
| Version | 0.6.29 and up. Keeps the auto-updater from pulling upstream's last Tauri build over ours. |

## Gotchas We Hit

- **The repo checkout can drift far behind the installed app.** The clone sat at 0.6.13 while
  0.6.28 was installed. Always base work on the fork's `main`, and check the installed version
  with `defaults read /Applications/OpenUsage.app/Contents/Info.plist CFBundleShortVersionString`.
- **Never merge upstream `main`.** It is the Swift app; merging replaces the whole tree. Pull
  individual commits from `upstream` only if they are from the Tauri era (tags `v0.6.*`).
  GitHub's "Sync fork" button would do exactly the wrong thing.
- **Bundled plugins overwrite the installed copies on every launch.** The app copies
  `resources/bundled_plugins/*` into `~/Library/Application Support/com.sunstory.openusage/plugins/`
  at startup, so editing a plugin in that folder is temporary. Edit it in the repo and rebuild.
- **Keychain service names are hashed per config dir.** Claude Code stores credentials under
  `Claude Code-credentials-<sha256(CLAUDE_CONFIG_DIR)[:8]>` when the env var is set, and the hash
  is over the literal value it was launched with (the expanded path in practice). The work plugin
  computes this from `$HOME`, so nothing is hardcoded.
- **Plugins only see whitelisted environment variables.** `WHITELISTED_ENV_VARS` in
  `src-tauri/src/plugin_engine/host_api.rs` decides what `ctx.host.env.get` returns; everything else
  is `null`. `HOME` was not on it, so the first generated work plugin hashed the literal `~/.claude-work`,
  missed the keychain item, and silently fell back to the personal login. Now `HOME` is whitelisted, the
  plugin also derives the home dir from `ctx.app.appDataDir`, and the work plugin never falls back to the
  unhashed keychain item (it says "Not logged in" instead of showing the wrong account).
- **Never edit plugins in `~/Library/Application Support/com.sunstory.openusage/plugins/` and expect it
  to stick**, and watch out for a second Claude Code session (for example one running as the work account)
  editing that folder at the same time. The repo is the only source of truth.
- **A LaunchAgent from June 2026 used to rewrite the installed work plugin.**
  `com.hamza.openusage-claude-work-sync` regenerated a hardcoded-path `claude-work` straight into
  `~/Library/Application Support/.../plugins/` on every launch, so the file actually running was never the
  one from the repo. It was retired on 2026-09-07 (agent stopped, plist and `.local/` script trashed) now
  that the fork bundles `claude-work` and the app no longer auto-updates. If the work card ever shows a
  file that differs from `plugins/claude-work/plugin.js`, look for something like it first.
- **A globally exported `CLAUDE_CONFIG_DIR` used to poison the personal card** (both cards showed
  the work account). The generated work plugin ignores that env var, and the personal plugin only
  inherits it if OpenUsage is launched from a shell that exports it. Launch from Spotlight/Dock.
- **Building needs the updater signing key unless you turn updater artifacts off.** Use
  `bun tauri build --bundles app --config '{"bundle":{"createUpdaterArtifacts":false}}'`.
  The build is ad-hoc signed; macOS may ask once to allow keychain access. Click Always Allow.
- **The menu bar title on macOS is a single native string.** With several providers pinned the
  whole strip (icons and percentages) is rendered into one template image instead.
- **`gh repo fork --remote` refuses a repository argument.** Fork without `--remote`, then add
  the remote by hand.
- **Screenshots from a terminal need Screen Recording permission**, otherwise `screencapture`
  fails with "could not create image". Verify menu bar changes by eye.

## How To Work On It

```sh
bun install
bun run sync:claude-work      # after touching plugins/claude
bun run test                  # vitest, 90% coverage threshold
bun tauri build --bundles app --config '{"bundle":{"createUpdaterArtifacts":false}}'
```

Install: quit OpenUsage, move the old app aside, copy
`src-tauri/target/release/bundle/macos/OpenUsage.app` to `/Applications`, then
`env -u CLAUDE_CONFIG_DIR open -a OpenUsage`.

Bump the version in `package.json`, `src-tauri/tauri.conf.json`, `src-tauri/Cargo.toml`, and the
`openusage` entry in `src-tauri/Cargo.lock` together.

## Ideas For Later

- Per-provider pins with a metric choice (Session vs Weekly per pin) instead of one global metric.
- A "provider chip" list that shows icons next to names in Settings → Pinned Providers.
- Generic "extra Claude account" support: any `~/.claude-*` dir becomes a card, configured in
  Settings instead of a generated plugin.
- Cherry-pick useful Tauri-era upstream fixes (Cursor, Codex, pricing) from tags `v0.6.14`–`v0.6.28`
  when needed; they are already in this tree, later ones do not exist.
- Sign the build with a local Developer ID so the keychain prompt goes away.
