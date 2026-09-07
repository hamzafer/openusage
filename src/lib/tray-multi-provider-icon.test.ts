import { describe, expect, it, vi } from "vitest"

vi.mock("@tauri-apps/api/image", () => ({
  Image: {
    new: vi.fn(async () => ({})),
  },
}))

import {
  getTrayMultiProviderLayout,
  makeTrayMultiProviderSvg,
  renderTrayMultiProviderIcon,
  type TrayProviderSegment,
} from "@/lib/tray-multi-provider-icon"

const ICON = "data:image/svg+xml;base64,ABC"

const twoSegments: TrayProviderSegment[] = [
  { id: "claude", iconUrl: ICON, fraction: 0.27, percentText: "27%" },
  { id: "claude-work", iconUrl: ICON, fraction: 0.8, percentText: "80%" },
]

describe("tray-multi-provider-icon", () => {
  it("lays segments out left to right with a gap between them", () => {
    const layout = getTrayMultiProviderLayout({ segments: twoSegments, sizePx: 36, style: "provider" })
    expect(layout.slots).toHaveLength(2)
    expect(layout.slots[1]!.x).toBeGreaterThan(layout.slots[0]!.x + layout.slots[0]!.width)
    expect(layout.width).toBeGreaterThan(layout.slots[1]!.x + layout.slots[1]!.width)
    expect(layout.height).toBe(36)
  })

  it("provider style renders one icon and one percentage per segment", () => {
    const svg = makeTrayMultiProviderSvg({ segments: twoSegments, sizePx: 36, style: "provider" })
    expect(svg.match(/<image /g)).toHaveLength(2)
    expect(svg).toContain(">27%</text>")
    expect(svg).toContain(">80%</text>")
    expect(svg).not.toContain("stroke-dasharray")
  })

  it("defaults to provider style and grows wider with more segments", () => {
    const one = makeTrayMultiProviderSvg({ segments: twoSegments.slice(0, 1), sizePx: 36 })
    const two = makeTrayMultiProviderSvg({ segments: twoSegments, sizePx: 36 })
    const widthOf = (svg: string) => Number(svg.match(/viewBox="0 0 (\d+) /)![1])
    expect(widthOf(two)).toBeGreaterThan(widthOf(one))
  })

  it("falls back to a circle glyph when a segment has no icon", () => {
    const svg = makeTrayMultiProviderSvg({
      segments: [
        { id: "a", percentText: "10%" },
        { id: "b", iconUrl: "   ", percentText: "20%" },
      ],
      sizePx: 36,
    })
    expect(svg).not.toContain("<image ")
    expect(svg.match(/<circle /g)).toHaveLength(2)
  })

  it("escapes percent text", () => {
    const svg = makeTrayMultiProviderSvg({
      segments: [{ id: "a", percentText: "<1%" }],
      sizePx: 36,
    })
    expect(svg).toContain(">&lt;1%</text>")
    expect(svg).not.toContain("><1%")
  })

  it("donut style renders a track per segment and an arc only when there is data", () => {
    const svg = makeTrayMultiProviderSvg({
      segments: [
        { id: "a", iconUrl: ICON, fraction: 0.5, percentText: "50%" },
        { id: "b", iconUrl: ICON, fraction: 0, percentText: "0%" },
        { id: "c", iconUrl: ICON, percentText: "--%" },
      ],
      sizePx: 36,
      style: "donut",
    })
    expect(svg).not.toContain("<text ")
    expect(svg.match(/<image /g)).toHaveLength(3)
    expect(svg.match(/stroke-dasharray="/g)).toHaveLength(1)
  })

  it("donut style clamps fractions above one to a full ring", () => {
    const svg = makeTrayMultiProviderSvg({
      segments: [{ id: "a", iconUrl: ICON, fraction: 1.5, percentText: "100%" }],
      sizePx: 36,
      style: "donut",
    })
    const match = svg.match(/stroke-dasharray="([\d.]+) ([\d.]+)"/)
    expect(match).toBeTruthy()
    expect(Number(match![1])).toBeCloseTo(Number(match![2]))
  })

  it("renderTrayMultiProviderIcon rasterizes the SVG into an Image", async () => {
    const originalImage = window.Image
    const originalCreateElement = document.createElement.bind(document)

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(window as any).Image = class MockImage {
      onload: null | (() => void) = null
      onerror: null | (() => void) = null
      decoding = "async"
      set src(_value: string) {
        queueMicrotask(() => this.onload?.())
      }
    }

    const ctx = {
      clearRect: () => {},
      drawImage: () => {},
      getImageData: (_x: number, _y: number, w: number, h: number) => ({
        data: new Uint8ClampedArray(w * h * 4),
      }),
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(document as any).createElement = (tag: string) => {
      const el = originalCreateElement(tag)
      if (tag === "canvas") {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ;(el as any).getContext = () => ctx
      }
      return el
    }

    try {
      const img = await renderTrayMultiProviderIcon({ segments: twoSegments, sizePx: 18 })
      expect(img).toBeTruthy()
    } finally {
      window.Image = originalImage
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ;(document as any).createElement = originalCreateElement
    }
  })
})
