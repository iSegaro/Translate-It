const FALLBACK_COLOR = 'rgb(255, 255, 255)'
const MIN_READABLE_LUMINANCE = 200

const colorCache = new Map()

function cacheKey(blockId, scale) {
  return `${blockId}:${scale}`
}

function rgbaToRgb(r, g, b) {
  return `rgb(${r}, ${g}, ${b})`
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value))
}

function samplePixel(ctx, x, y) {
  try {
    const data = ctx.getImageData(x, y, 1, 1).data
    return { r: data[0], g: data[1], b: data[2] }
  } catch {
    return null
  }
}

function isLight(r, g, b) {
  const luminance = 0.299 * r + 0.587 * g + 0.114 * b
  return luminance > 128
}

function isTextPixel(r, g, b, neighborLight) {
  if (!neighborLight) return false

  const luminance = 0.299 * r + 0.587 * g + 0.114 * b
  return luminance < 80
}

function luminance(r, g, b) {
  return 0.299 * r + 0.587 * g + 0.114 * b
}

function ensureReadableLuminance(r, g, b) {
  const lum = luminance(r, g, b)
  if (lum >= MIN_READABLE_LUMINANCE) return rgbaToRgb(r, g, b)
  const blend = (MIN_READABLE_LUMINANCE - lum) / (255 - lum)
  const nr = Math.round(r + (255 - r) * blend)
  const ng = Math.round(g + (255 - g) * blend)
  const nb = Math.round(b + (255 - b) * blend)
  return rgbaToRgb(nr, ng, nb)
}

function chooseBackgroundColor(samples, neighbors) {
  const lightSamples = []

  for (let i = 0; i < samples.length; i++) {
    const s = samples[i]
    if (!s) continue

    const neighbor = neighbors[i]
    if (neighbor && isTextPixel(s.r, s.g, s.b, isLight(neighbor.r, neighbor.g, neighbor.b))) {
      continue
    }

    if (isLight(s.r, s.g, s.b)) {
      lightSamples.push(s)
    }
  }

  if (lightSamples.length === 0 && samples.length > 0) {
    return FALLBACK_COLOR
  }

  if (lightSamples.length === 0) return FALLBACK_COLOR

  let rSum = 0
  let gSum = 0
  let bSum = 0
  for (const s of lightSamples) {
    rSum += s.r
    gSum += s.g
    bSum += s.b
  }

  const count = lightSamples.length
  return ensureReadableLuminance(
    Math.round(rSum / count),
    Math.round(gSum / count),
    Math.round(bSum / count)
  )
}

function buildSamplePoints(bboxX, bboxY, bboxW, bboxH, canvasW, canvasH) {
  const insetX = bboxW * 0.2
  const insetY = bboxH * 0.2

  const points = [
    { x: bboxX + bboxW / 2, y: bboxY + bboxH / 2 },
    { x: bboxX + insetX, y: bboxY + insetY },
    { x: bboxX + bboxW - insetX, y: bboxY + insetY },
    { x: bboxX + insetX, y: bboxY + bboxH - insetY },
    { x: bboxX + bboxW - insetX, y: bboxY + bboxH - insetY },
    { x: bboxX + insetX, y: bboxY + bboxH / 2 },
    { x: bboxX + bboxW - insetX, y: bboxY + bboxH / 2 }
  ]

  const neighborOffsets = [
    { dx: -3, dy: -3 },
    { dx: -3, dy: -3 },
    { dx: 3, dy: -3 },
    { dx: -3, dy: 3 },
    { dx: 3, dy: 3 },
    { dx: -3, dy: 0 },
    { dx: 3, dy: 0 }
  ]

  return points.map((p, i) => ({
    sample: { x: clamp(Math.round(p.x), 0, canvasW - 1), y: clamp(Math.round(p.y), 0, canvasH - 1) },
    neighbor: {
      x: clamp(Math.round(p.x + neighborOffsets[i].dx), 0, canvasW - 1),
      y: clamp(Math.round(p.y + neighborOffsets[i].dy), 0, canvasH - 1)
    }
  }))
}

export function sampleCanvasBackgroundColor(canvas, boundingBox, scale, blockId) {
  if (!canvas || !boundingBox) return FALLBACK_COLOR

  const key = cacheKey(blockId, scale)
  const cached = colorCache.get(key)
  if (cached !== undefined) return cached

  let ctx
  try {
    ctx = canvas.getContext('2d')
  } catch {
    colorCache.set(key, FALLBACK_COLOR)
    return FALLBACK_COLOR
  }

  if (!ctx) {
    colorCache.set(key, FALLBACK_COLOR)
    return FALLBACK_COLOR
  }

  const canvasW = canvas.width
  const canvasH = canvas.height
  if (canvasW <= 0 || canvasH <= 0) {
    colorCache.set(key, FALLBACK_COLOR)
    return FALLBACK_COLOR
  }

  const bboxX = clamp(Math.round(boundingBox.x * scale), 0, canvasW - 1)
  const bboxY = clamp(Math.round(boundingBox.y * scale), 0, canvasH - 1)
  const bboxW = Math.round(boundingBox.width * scale)
  const bboxH = Math.round(boundingBox.height * scale)

  if (bboxW <= 0 || bboxH <= 0) {
    colorCache.set(key, FALLBACK_COLOR)
    return FALLBACK_COLOR
  }

  const points = buildSamplePoints(bboxX, bboxY, bboxW, bboxH, canvasW, canvasH)

  const samples = []
  const neighbors = []

  for (const { sample, neighbor } of points) {
    samples.push(samplePixel(ctx, sample.x, sample.y))
    neighbors.push(samplePixel(ctx, neighbor.x, neighbor.y))
  }

  const color = chooseBackgroundColor(samples, neighbors)

  colorCache.set(key, color)
  return color
}

export function clearColorCache(blockId) {
  if (blockId) {
    for (const key of colorCache.keys()) {
      if (key.startsWith(`${blockId}:`)) {
        colorCache.delete(key)
      }
    }
  } else {
    colorCache.clear()
  }
}
