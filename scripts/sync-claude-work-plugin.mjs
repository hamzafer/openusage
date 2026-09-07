#!/usr/bin/env node
// Regenerates plugins/claude-work from plugins/claude.
//
// The work plugin is the Claude plugin pinned to a second config dir (~/.claude-work) so a
// second Claude Code login shows up as its own card. Keeping it generated means every fix
// that lands in plugins/claude carries over with `bun run sync:claude-work`.
//
// Each replacement below must match exactly once; the script fails loudly otherwise so an
// upstream refactor cannot silently produce a broken work plugin.
import { readFileSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

export const WORK_PLUGIN_ID = "claude-work"
export const WORK_PLUGIN_NAME = "Claude (Work)"
export const WORK_CLAUDE_HOME = "~/.claude-work"
export const WORK_BRAND_COLOR = "#FF5500"

const REPLACEMENTS = [
  {
    from: '  const DEFAULT_CLAUDE_HOME = "~/.claude"\n',
    to:
      "  // claude-work: a second Claude Code login kept in its own config dir. Generated from\n" +
      "  // plugins/claude/plugin.js by scripts/sync-claude-work-plugin.mjs. Do not edit by hand.\n" +
      `  const DEFAULT_CLAUDE_HOME = "${WORK_CLAUDE_HOME}"\n`,
  },
  {
    from:
      "  function getClaudeHomePath(ctx) {\n" +
      '    return readEnvText(ctx, "CLAUDE_CONFIG_DIR") || DEFAULT_CLAUDE_HOME\n' +
      "  }\n" +
      "\n" +
      "  function getClaudeHomeOverride(ctx) {\n" +
      '    return readEnvText(ctx, "CLAUDE_CONFIG_DIR")\n' +
      "  }\n",
    to:
      "  function expandHomePath(ctx, path) {\n" +
      '    if (path.indexOf("~/") !== 0) return path\n' +
      '    let home = readEnvText(ctx, "HOME")\n' +
      "    if (!home) {\n" +
      "      // The host only exposes whitelisted env vars; derive the home dir from the\n" +
      "      // app data dir (~/Library/Application Support/...) when HOME is unavailable.\n" +
      '      const dataDir = ctx.app && typeof ctx.app.appDataDir === "string" ? ctx.app.appDataDir : ""\n' +
      '      const libraryIndex = dataDir.indexOf("/Library/")\n' +
      "      if (libraryIndex > 0) home = dataDir.slice(0, libraryIndex)\n" +
      "    }\n" +
      "    if (!home) return path\n" +
      '    return home.replace(/\\/+$/, "") + path.slice(1)\n' +
      "  }\n" +
      "\n" +
      "  // claude-work: always use the dedicated config dir and ignore CLAUDE_CONFIG_DIR, so a\n" +
      "  // shell that exports it can never make both Claude cards read the same account.\n" +
      "  function getClaudeHomePath(ctx) {\n" +
      "    return DEFAULT_CLAUDE_HOME\n" +
      "  }\n" +
      "\n" +
      "  function getClaudeHomeOverride(ctx) {\n" +
      "    return expandHomePath(ctx, DEFAULT_CLAUDE_HOME)\n" +
      "  }\n",
  },
  {
    from:
      '    const explicitConfigDir = readEnvText(ctx, "CLAUDE_CONFIG_DIR")\n' +
      "    if (!explicitConfigDir) return null\n",
    to:
      "    // claude-work: Claude Code hashes the CLAUDE_CONFIG_DIR value it was launched with,\n" +
      "    // which for this account is the expanded path (e.g. /Users/you/.claude-work).\n" +
      "    const explicitConfigDir = expandHomePath(ctx, DEFAULT_CLAUDE_HOME)\n" +
      "    if (!explicitConfigDir) return null\n",
  },
  {
    from:
      "  function getClaudeKeychainServiceCandidates(ctx) {\n" +
      "    const base = buildClaudeBaseKeychainService(ctx)\n" +
      "    const candidates = []\n" +
      "    const hash = computeKeychainHashSuffix(ctx)\n" +
      '    if (hash) candidates.push(base + "-" + hash)  // hashed (CLAUDE_CONFIG_DIR set)\n' +
      "    candidates.push(base)                          // legacy / default\n" +
      "    return candidates\n" +
      "  }\n",
    to:
      "  // claude-work: only the hashed service belongs to this account. Never fall back to the\n" +
      "  // unhashed default item, which is the personal login.\n" +
      "  function getClaudeKeychainServiceCandidates(ctx) {\n" +
      "    const base = buildClaudeBaseKeychainService(ctx)\n" +
      "    const hash = computeKeychainHashSuffix(ctx)\n" +
      '    return hash ? [base + "-" + hash] : []\n' +
      "  }\n",
  },
  {
    from: '  globalThis.__openusage_plugin = { id: "claude", probe, _resetState }\n',
    to: `  globalThis.__openusage_plugin = { id: "${WORK_PLUGIN_ID}", probe, _resetState }\n`,
  },
]

export function generateClaudeWorkPlugin(claudeSource) {
  let out = claudeSource
  for (const { from, to } of REPLACEMENTS) {
    const count = out.split(from).length - 1
    if (count !== 1) {
      throw new Error(
        `sync-claude-work-plugin: expected exactly 1 match, found ${count} for:\n${from}`
      )
    }
    out = out.replace(from, to)
  }
  if (out.includes('readEnvText(ctx, "CLAUDE_CONFIG_DIR")')) {
    throw new Error("sync-claude-work-plugin: a CLAUDE_CONFIG_DIR read survived generation")
  }
  return out
}

export function generateClaudeWorkManifest(claudeManifestJson) {
  const manifest = JSON.parse(claudeManifestJson)
  return JSON.stringify(
    { ...manifest, id: WORK_PLUGIN_ID, name: WORK_PLUGIN_NAME, brandColor: WORK_BRAND_COLOR },
    null,
    2
  ) + "\n"
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]
if (isMain) {
  const root = join(dirname(fileURLToPath(import.meta.url)), "..")
  const claudeDir = join(root, "plugins", "claude")
  const workDir = join(root, "plugins", WORK_PLUGIN_ID)
  writeFileSync(
    join(workDir, "plugin.js"),
    generateClaudeWorkPlugin(readFileSync(join(claudeDir, "plugin.js"), "utf8"))
  )
  writeFileSync(
    join(workDir, "plugin.json"),
    generateClaudeWorkManifest(readFileSync(join(claudeDir, "plugin.json"), "utf8"))
  )
  console.log(`Regenerated plugins/${WORK_PLUGIN_ID} from plugins/claude`)
}
