function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value))
}

function normalizeInputRect(rect, viewport, minimumSize) {
  const x1 = clamp(Number(rect?.x) || 0, 0, viewport.width)
  const y1 = clamp(Number(rect?.y) || 0, 0, viewport.height)
  const x2 = clamp((Number(rect?.x) || 0) + (Number(rect?.width) || 0), 0, viewport.width)
  const y2 = clamp((Number(rect?.y) || 0) + (Number(rect?.height) || 0), 0, viewport.height)
  const normalized = {
    x: Math.min(x1, x2),
    y: Math.min(y1, y2),
    width: Math.abs(x2 - x1),
    height: Math.abs(y2 - y1)
  }

  if (normalized.width <= 0 || normalized.height <= 0) {
    throw new RangeError('Region must intersect the page viewport')
  }
  if (minimumSize && (
    normalized.width < minimumSize.width ||
    normalized.height < minimumSize.height
  )) {
    throw new RangeError('Region is below minimum selection size')
  }

  return normalized
}

function mapRegionBounds(rect, currentViewport, targetViewport) {
  const corners = [
    [rect.x, rect.y],
    [rect.x + rect.width, rect.y],
    [rect.x, rect.y + rect.height],
    [rect.x + rect.width, rect.y + rect.height]
  ].map(([x, y]) => {
    const pdfPoint = currentViewport.convertToPdfPoint(x, y)
    return targetViewport.convertToViewportPoint(...pdfPoint)
  })

  const xs = corners.map(([x]) => x)
  const ys = corners.map(([, y]) => y)
  const x = clamp(Math.floor(Math.min(...xs)), 0, Math.ceil(targetViewport.width))
  const y = clamp(Math.floor(Math.min(...ys)), 0, Math.ceil(targetViewport.height))
  const right = clamp(Math.ceil(Math.max(...xs)), x, Math.ceil(targetViewport.width))
  const bottom = clamp(Math.ceil(Math.max(...ys)), y, Math.ceil(targetViewport.height))

  return {
    x,
    y,
    width: right - x,
    height: bottom - y,
    corners
  }
}

/**
 * Prototype only: renders a page region into a region-sized canvas.
 * Returns cancellation immediately while rendering continues through `promise`.
 */
export function renderPdfRegionPrototype({
  page,
  currentViewport,
  rect,
  targetScale,
  minimumSize = null,
  createCanvas = () => document.createElement('canvas'),
  isCurrent = () => true,
  now = () => performance.now()
}) {
  let renderTask = null
  let cancelled = false

  const cancel = () => {
    cancelled = true
    renderTask?.cancel?.()
  }

  const promise = (async () => {
    if (!page?.getViewport || !page?.render) throw new TypeError('A PDFPageProxy is required')
    if (!currentViewport?.convertToPdfPoint) throw new TypeError('A current PageViewport is required')
    if (!Number.isFinite(targetScale) || targetScale <= 0) throw new RangeError('Target scale must be positive')
    if (!isCurrent()) throw new Error('PDF region render became stale')

    const inputRect = normalizeInputRect(rect, currentViewport, minimumSize)
    const targetViewport = page.getViewport({
      scale: targetScale,
      rotation: currentViewport.rotation
    })
    const bounds = mapRegionBounds(inputRect, currentViewport, targetViewport)
    if (bounds.width <= 0 || bounds.height <= 0) throw new RangeError('Mapped region is empty')

    const canvas = createCanvas()
    canvas.width = bounds.width
    canvas.height = bounds.height
    const transform = [1, 0, 0, 1, -bounds.x, -bounds.y]
    const startedAt = now()

    try {
      renderTask = page.render({
        canvas,
        viewport: targetViewport,
        transform,
        intent: 'display'
      })
      if (cancelled) renderTask.cancel?.()

      await renderTask.promise
      if (cancelled || !isCurrent()) {
        throw new Error('PDF region render became stale')
      }
    } catch (error) {
      canvas.width = 0
      canvas.height = 0
      throw error
    }

    const renderLatencyMs = now() - startedAt
    return {
      canvas,
      release() {
        canvas.width = 0
        canvas.height = 0
      },
      diagnostics: {
        inputRect,
        mappedBounds: bounds,
        transform,
        targetScale,
        rotation: targetViewport.rotation,
        targetCanvasWidth: canvas.width,
        targetCanvasHeight: canvas.height,
        targetPixelCount: canvas.width * canvas.height,
        estimatedCanvasBytes: canvas.width * canvas.height * 4,
        fullPagePixelCount: Math.ceil(targetViewport.width) * Math.ceil(targetViewport.height),
        renderLatencyMs
      }
    }
  })()

  return { promise, cancel }
}
