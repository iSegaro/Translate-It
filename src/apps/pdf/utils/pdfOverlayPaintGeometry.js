/**
 * PdfOverlayPaintGeometry — pure helpers for conservative overlay paint bounds.
 *
 * Used by the active block/line overlay branches to extend the painted
 * background slightly above and below tightly-fit PDF glyph boxes without
 * changing translation layout or affecting cell-mask rendering.
 */

export const TEXT_VERTICAL_PAINT_BLEED = 4

export function buildVerticalPaintBleedBoxShadow(backgroundColor, bleed = TEXT_VERTICAL_PAINT_BLEED) {
  if (!backgroundColor || !Number.isFinite(bleed) || bleed <= 0) {
    return 'none'
  }

  const bleedPx = `${Math.round(bleed)}px`
  return `0 ${bleedPx} 0 0 ${backgroundColor}, 0 -${bleedPx} 0 0 ${backgroundColor}`
}
