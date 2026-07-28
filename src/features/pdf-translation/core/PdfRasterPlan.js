function requirePositiveFinite(name, value) {
  if (!Number.isFinite(value) || value <= 0) {
    throw new TypeError(`${name} must be a positive finite number`)
  }
}

function requirePositiveInteger(name, value) {
  if (!Number.isInteger(value) || value <= 0) {
    throw new TypeError(`${name} must be a positive integer`)
  }
}

function resolveBackingDimension(logicalDimension, rasterOutputScale) {
  return Math.max(1, Math.floor(logicalDimension * rasterOutputScale))
}

export function createIdentityPdfRasterPlan(logicalWidth, logicalHeight) {
  requirePositiveFinite('logicalWidth', logicalWidth)
  requirePositiveFinite('logicalHeight', logicalHeight)

  const rasterPixels = logicalWidth * logicalHeight

  return Object.freeze({
    logicalWidth,
    logicalHeight,
    rasterOutputScale: 1,
    backingWidth: logicalWidth,
    backingHeight: logicalHeight,
    rasterScaleX: 1,
    rasterScaleY: 1,
    rasterPixels,
    estimatedBytes: rasterPixels * 4,
    degraded: false,
    renderable: true
  })
}

export function resolvePdfRasterPlan({
  logicalWidth,
  logicalHeight,
  maxRasterPixels,
  maxCanvasDimension,
  maxEstimatedBytes,
  minRasterOutputScale
} = {}) {
  requirePositiveFinite('logicalWidth', logicalWidth)
  requirePositiveFinite('logicalHeight', logicalHeight)
  requirePositiveInteger('maxRasterPixels', maxRasterPixels)
  requirePositiveInteger('maxCanvasDimension', maxCanvasDimension)
  requirePositiveInteger('maxEstimatedBytes', maxEstimatedBytes)
  requirePositiveFinite('minRasterOutputScale', minRasterOutputScale)

  if (maxEstimatedBytes < 4) {
    throw new TypeError('maxEstimatedBytes must support one RGBA pixel')
  }

  if (minRasterOutputScale > 1) {
    throw new TypeError('minRasterOutputScale must not exceed 1')
  }

  const logicalPixels = logicalWidth * logicalHeight
  if (!Number.isFinite(logicalPixels)) {
    throw new TypeError('logical viewport pixels must be finite')
  }

  const rasterOutputScale = Math.min(
    1,
    Math.sqrt(maxRasterPixels / logicalPixels),
    maxCanvasDimension / logicalWidth,
    maxCanvasDimension / logicalHeight,
    Math.sqrt(maxEstimatedBytes / (logicalPixels * 4))
  )
  const backingWidth = resolveBackingDimension(logicalWidth, rasterOutputScale)
  const backingHeight = resolveBackingDimension(logicalHeight, rasterOutputScale)
  const rasterScaleX = backingWidth / logicalWidth
  const rasterScaleY = backingHeight / logicalHeight
  const rasterPixels = backingWidth * backingHeight
  const estimatedBytes = rasterPixels * 4
  if (!Number.isFinite(rasterPixels) || !Number.isFinite(estimatedBytes)) {
    throw new TypeError('backing raster dimensions must be finite')
  }

  return Object.freeze({
    logicalWidth,
    logicalHeight,
    rasterOutputScale,
    backingWidth,
    backingHeight,
    rasterScaleX,
    rasterScaleY,
    rasterPixels,
    estimatedBytes,
    degraded: rasterOutputScale < 1,
    renderable: rasterOutputScale >= minRasterOutputScale
  })
}
