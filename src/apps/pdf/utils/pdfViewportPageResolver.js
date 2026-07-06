function getPageElements(container, pageSelector) {
  if (!container || !pageSelector) return []

  return [...container.querySelectorAll(pageSelector)]
}

function findPrimaryPageTarget(container, pageSelector) {
  if (!container) return null

  const containerRect = container.getBoundingClientRect()
  const pageElements = getPageElements(container, pageSelector)
  if (pageElements.length === 0) return null

  let best = null

  for (const el of pageElements) {
    const pageNumber = Number(el.dataset.pageNumber)
    if (!Number.isInteger(pageNumber) || pageNumber < 1) continue

    const rect = el.getBoundingClientRect()
    if (rect.bottom <= containerRect.top) continue
    if (rect.top >= containerRect.bottom) continue

    const dist = Math.abs(rect.top - containerRect.top)
    if (!best || dist < best.dist) {
      best = { el, rect, dist, pageNumber }
    }
  }

  if (!best) {
    for (const el of pageElements) {
      const pageNumber = Number(el.dataset.pageNumber)
      if (!Number.isInteger(pageNumber) || pageNumber < 1) continue

      const rect = el.getBoundingClientRect()
      if (rect.bottom <= containerRect.top) continue

      best = { el, rect, pageNumber }
      break
    }
  }

  return best
}

function getPrimaryPage(container, pageSelector) {
  return findPrimaryPageTarget(container, pageSelector)?.pageNumber || null
}

export {
  getPageElements,
  findPrimaryPageTarget,
  getPrimaryPage
}
