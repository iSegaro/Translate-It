import { resolvePdfFontFamily } from './pdfFontMap.js'

export const OVERLAY_BACKGROUND = 'rgb(255, 255, 255)'
export const DEFAULT_ASCENT = 0.8
const DEFAULT_DESCENT = 0.2

export function resolveFontFamily(fontFamily) {
  return resolvePdfFontFamily(fontFamily)
}

export function resolveAscent(ascent) {
  return ascent != null && Number.isFinite(ascent) ? ascent : DEFAULT_ASCENT
}

export function resolveDescent(descent) {
  return descent != null && Number.isFinite(descent) ? Math.abs(descent) : DEFAULT_DESCENT
}

export function computeLineHeight(ascent, descent) {
  return resolveAscent(ascent) + resolveDescent(descent)
}

export function detectTextDirection(text) {
  if (!text) return 'ltr'

  const rtlChars = text.match(/[\u0591-\u05FF\u0600-\u06FF\u0700-\u074F]/g)
  const ltrChars = text.match(/[a-zA-Z\u00C0-\u024F]/g)

  const rtlCount = rtlChars?.length || 0
  const ltrCount = ltrChars?.length || 0

  return rtlCount > ltrCount ? 'rtl' : 'ltr'
}

export function buildOverlayBaseStyle() {
  return {
    overflow: 'hidden',
    boxSizing: 'border-box',
    background: OVERLAY_BACKGROUND,
    pointerEvents: 'auto',
    userSelect: 'text',
    willChange: 'transform'
  }
}

export function buildOverlayPositionStyle(boundingBox, scale) {
  if (!boundingBox) return {}

  return {
    position: 'absolute',
    left: `${boundingBox.x * scale}px`,
    top: `${boundingBox.y * scale}px`,
    width: `${boundingBox.width * scale}px`,
    height: `${boundingBox.height * scale}px`
  }
}
