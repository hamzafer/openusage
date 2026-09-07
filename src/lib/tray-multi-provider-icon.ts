import { Image } from "@tauri-apps/api/image"
import type { MenubarIconStyle } from "@/lib/settings"
import { escapeXmlText, estimateTextWidthPx, rasterizeSvgToRgba } from "@/lib/tray-bars-icon"

/** One provider rendered in the menu bar strip when several providers are pinned. */
export type TrayProviderSegment = {
  id: string
  iconUrl?: string
  fraction?: number
  percentText: string
}

const DONUT_TRACK_OPACITY = 0.16

type SegmentSlot = {
  x: number
  width: number
}

type MultiProviderLayout = {
  width: number
  height: number
  pad: number
  iconSize: number
  fontSize: number
  textGap: number
  chartSize: number
  textY: number
  slots: SegmentSlot[]
}

export function getTrayMultiProviderLayout(args: {
  segments: TrayProviderSegment[]
  sizePx: number
  style: MenubarIconStyle
}): MultiProviderLayout {
  const { segments, sizePx, style } = args
  const pad = Math.max(1, Math.round(sizePx * 0.08))
  // Match the single-provider icon size used when a percentage is shown next to it.
  const iconSize = Math.max(6, Math.round(sizePx - pad) - 1)
  const fontSize = Math.max(9, Math.round(sizePx * 0.72))
  const textGap = Math.max(2, Math.round(sizePx * 0.08))
  const segmentGap = Math.max(3, Math.round(sizePx * 0.4))
  const chartSize = Math.max(6, sizePx - 2 * pad)
  // Optical correction + nudge down to align with the tray slot center.
  const textY = Math.round(sizePx / 2) + 2

  let x = pad
  const slots = segments.map((segment, index) => {
    const contentWidth =
      style === "donut"
        ? iconSize + textGap + chartSize
        : iconSize + textGap + estimateTextWidthPx(segment.percentText, fontSize)
    const slot = { x, width: contentWidth }
    x += contentWidth
    if (index < segments.length - 1) x += segmentGap
    return slot
  })

  return {
    width: x + pad,
    height: sizePx,
    pad,
    iconSize,
    fontSize,
    textGap,
    chartSize,
    textY,
    slots,
  }
}

export function makeTrayMultiProviderSvg(args: {
  segments: TrayProviderSegment[]
  sizePx: number
  style?: MenubarIconStyle
}): string {
  const { segments, sizePx, style = "provider" } = args
  const layout = getTrayMultiProviderLayout({ segments, sizePx, style })
  const { width, height } = layout

  const parts: string[] = []
  parts.push(
    `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">`
  )

  segments.forEach((segment, index) => {
    const slot = layout.slots[index]!
    const iconX = slot.x
    const iconY = Math.round((height - layout.iconSize) / 2)
    const href = typeof segment.iconUrl === "string" ? segment.iconUrl.trim() : ""

    if (href.length > 0) {
      parts.push(
        `<image x="${iconX}" y="${iconY}" width="${layout.iconSize}" height="${layout.iconSize}" href="${escapeXmlText(href)}" preserveAspectRatio="xMidYMid meet" />`
      )
    } else {
      const cx = iconX + layout.iconSize / 2
      const cy = iconY + layout.iconSize / 2
      const radius = Math.max(2, layout.iconSize / 2 - 1.5)
      const strokeW = Math.max(1.5, Math.round(layout.iconSize * 0.14))
      parts.push(
        `<circle cx="${cx}" cy="${cy}" r="${radius}" fill="none" stroke="black" stroke-width="${strokeW}" opacity="1" shape-rendering="geometricPrecision" />`
      )
    }

    const contentX = iconX + layout.iconSize + layout.textGap

    if (style === "donut") {
      const cx = contentX + layout.chartSize / 2
      const cy = height / 2 + 1
      const strokeW = Math.max(2, Math.round(layout.chartSize * 0.16))
      const radius = Math.max(1, Math.floor(layout.chartSize / 2 - strokeW / 2) + 0.5)
      parts.push(
        `<circle cx="${cx}" cy="${cy}" r="${radius}" fill="none" stroke="black" stroke-width="${strokeW}" opacity="${DONUT_TRACK_OPACITY}" shape-rendering="geometricPrecision" />`
      )
      const fraction = segment.fraction
      if (typeof fraction === "number" && Number.isFinite(fraction) && fraction > 0) {
        const clamped = Math.min(1, fraction)
        const circumference = 2 * Math.PI * radius
        const dash = circumference * clamped
        parts.push(
          `<circle cx="${cx}" cy="${cy}" r="${radius}" fill="none" stroke="black" stroke-width="${strokeW}" stroke-linecap="butt" stroke-dasharray="${dash} ${circumference}" transform="rotate(-90 ${cx} ${cy})" opacity="1" shape-rendering="geometricPrecision" />`
        )
      }
      return
    }

    parts.push(
      `<text x="${contentX}" y="${layout.textY}" fill="black" font-family="-apple-system,BlinkMacSystemFont,'SF Pro Text',sans-serif" font-size="${layout.fontSize}" font-weight="700" dominant-baseline="middle">${escapeXmlText(segment.percentText)}</text>`
    )
  })

  parts.push("</svg>")
  return parts.join("")
}

export async function renderTrayMultiProviderIcon(args: {
  segments: TrayProviderSegment[]
  sizePx: number
  style?: MenubarIconStyle
}): Promise<Image> {
  const { segments, sizePx, style = "provider" } = args
  const svg = makeTrayMultiProviderSvg({ segments, sizePx, style })
  const layout = getTrayMultiProviderLayout({ segments, sizePx, style })
  const rgba = await rasterizeSvgToRgba(svg, layout.width, layout.height)
  return await Image.new(rgba, layout.width, layout.height)
}
