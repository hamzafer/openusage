import crypto from "node:crypto"
import { readFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { beforeAll, beforeEach, describe, expect, it } from "vitest"
import { makeCtx } from "../test-helpers.js"
import {
  generateClaudeWorkManifest,
  generateClaudeWorkPlugin,
} from "../../scripts/sync-claude-work-plugin.mjs"

const here = path.dirname(fileURLToPath(import.meta.url))
const claudeDir = path.join(here, "..", "claude")
const HOME = "/Users/test"
const expectedHash = (value) => crypto.createHash("sha256").update(value).digest("hex").slice(0, 8)
const WORK_SERVICE = "Claude Code-credentials-" + expectedHash(HOME + "/.claude-work")

let plugin = null

beforeAll(async () => {
  await import("./plugin.js")
  plugin = globalThis.__openusage_plugin
})

beforeEach(() => {
  plugin?._resetState()
})

const usageResponse = () => ({
  status: 200,
  bodyText: JSON.stringify({
    five_hour: { utilization: 30, resets_at: "2099-01-01T00:00:00.000Z" },
    seven_day: { utilization: 5, resets_at: "2099-01-04T00:00:00.000Z" },
  }),
})

const workCredentials = () =>
  JSON.stringify({ claudeAiOauth: { accessToken: "work-token", subscriptionType: "team" } })

const workCtx = () => {
  const ctx = makeCtx()
  ctx.host.env.get.mockImplementation((name) => {
    if (name === "HOME") return HOME
    // A shell that exports the OTHER account's dir must not leak into this plugin.
    if (name === "CLAUDE_CONFIG_DIR") return HOME + "/.claude"
    return null
  })
  return ctx
}

describe("claude-work plugin", () => {
  it("is generated from the current Claude plugin (run `bun run sync:claude-work`)", () => {
    const claudeSource = readFileSync(path.join(claudeDir, "plugin.js"), "utf8")
    const workSource = readFileSync(path.join(here, "plugin.js"), "utf8")
    expect(workSource).toBe(generateClaudeWorkPlugin(claudeSource))

    const claudeManifest = readFileSync(path.join(claudeDir, "plugin.json"), "utf8")
    const workManifest = readFileSync(path.join(here, "plugin.json"), "utf8")
    expect(JSON.parse(workManifest)).toEqual(JSON.parse(generateClaudeWorkManifest(claudeManifest)))
  })

  it("registers under its own id", () => {
    expect(plugin.id).toBe("claude-work")
  })

  it("reads credentials from ~/.claude-work even when CLAUDE_CONFIG_DIR points elsewhere", () => {
    const ctx = workCtx()
    const credentialsPath = "~/.claude-work/.credentials.json"
    ctx.host.fs.exists = (p) => p === credentialsPath
    ctx.host.fs.readText = (p) => (p === credentialsPath ? workCredentials() : undefined)
    ctx.host.http.request.mockReturnValue(usageResponse())

    const result = plugin.probe(ctx)
    const session = result.lines.find((line) => line.label === "Session")
    expect(session).toBeTruthy()
    expect(session.used).toBe(30)
    expect(JSON.stringify(ctx.host.http.request.mock.calls[0][0])).toContain("work-token")
  })

  it("looks up the keychain service hashed from the expanded ~/.claude-work path", () => {
    const ctx = workCtx()
    ctx.host.fs.exists = () => false
    ctx.host.keychain.readGenericPasswordForCurrentUser.mockImplementation((service) => {
      if (service === WORK_SERVICE) return workCredentials()
      throw new Error("keychain item not found")
    })
    ctx.host.http.request.mockReturnValue(usageResponse())

    const result = plugin.probe(ctx)
    expect(result.lines.find((line) => line.label === "Session")).toBeTruthy()
    expect(ctx.host.keychain.readGenericPasswordForCurrentUser.mock.calls[0][0]).toBe(WORK_SERVICE)
    expect(ctx.host.keychain.readGenericPasswordForCurrentUser).not.toHaveBeenCalledWith(
      "Claude Code-credentials-" + expectedHash(HOME + "/.claude")
    )
  })

  it("never falls back to the unhashed (personal) keychain item", () => {
    const ctx = workCtx()
    ctx.host.fs.exists = () => false
    ctx.host.keychain.readGenericPasswordForCurrentUser.mockImplementation(() => {
      throw new Error("keychain item not found")
    })
    ctx.host.keychain.readGenericPassword.mockImplementation(() => {
      throw new Error("keychain item not found")
    })

    expect(() => plugin.probe(ctx)).toThrow("Not logged in")
    const services = ctx.host.keychain.readGenericPasswordForCurrentUser.mock.calls.map((c) => c[0])
    expect(services).toEqual([WORK_SERVICE])
    expect(ctx.host.keychain.readGenericPassword).not.toHaveBeenCalledWith("Claude Code-credentials")
  })

  it("derives the home dir from appDataDir when HOME is not exposed by the host", () => {
    const ctx = makeCtx()
    ctx.host.env.get.mockReturnValue(null)
    ctx.app.appDataDir = HOME + "/Library/Application Support/com.sunstory.openusage"
    ctx.host.fs.exists = () => false
    ctx.host.keychain.readGenericPasswordForCurrentUser.mockImplementation((service) => {
      if (service === WORK_SERVICE) return workCredentials()
      throw new Error("keychain item not found")
    })
    ctx.host.http.request.mockReturnValue(usageResponse())

    const result = plugin.probe(ctx)
    expect(result.lines.find((line) => line.label === "Session")).toBeTruthy()
    expect(ctx.host.keychain.readGenericPasswordForCurrentUser.mock.calls[0][0]).toBe(WORK_SERVICE)
    expect(ctx.host.ccusage.query).toHaveBeenCalledWith(
      expect.objectContaining({ homePath: HOME + "/.claude-work" })
    )
  })

  it("passes the expanded work dir to the ccusage runner", () => {
    const ctx = workCtx()
    const credentialsPath = "~/.claude-work/.credentials.json"
    ctx.host.fs.exists = (p) => p === credentialsPath
    ctx.host.fs.readText = () => workCredentials()
    ctx.host.http.request.mockReturnValue(usageResponse())

    plugin.probe(ctx)
    expect(ctx.host.ccusage.query).toHaveBeenCalledWith(
      expect.objectContaining({ homePath: HOME + "/.claude-work" })
    )
  })

  it("keeps the tilde path when neither HOME nor a macOS app data dir is available", () => {
    const ctx = makeCtx()
    ctx.host.env.get.mockReturnValue(null)
    ctx.app.appDataDir = "/tmp/openusage-test"
    const credentialsPath = "~/.claude-work/.credentials.json"
    ctx.host.fs.exists = (p) => p === credentialsPath
    ctx.host.fs.readText = () => workCredentials()
    ctx.host.http.request.mockReturnValue(usageResponse())

    plugin.probe(ctx)
    expect(ctx.host.ccusage.query).toHaveBeenCalledWith(
      expect.objectContaining({ homePath: "~/.claude-work" })
    )
  })

  it("generator refuses a Claude plugin whose anchors moved", () => {
    expect(() => generateClaudeWorkPlugin("nothing to see here")).toThrow(/expected exactly 1 match/)
  })
})
