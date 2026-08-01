const END_OF_CONTENT_CLASS = 'endOfContent'
const TEXT_LAYER_SELECTOR = '.textLayer'

const textLayers = new Map()
let listenerAbortController = null
let previousRange = null
let isPointerDown = false
let isFirefox = null

function getElementFromNode(node) {
  if (!node) return null
  if (node.nodeType === Node.ELEMENT_NODE) return node
  return node.parentElement || null
}

function isRegisteredTextLayer(element) {
  return !!element && textLayers.has(element)
}

function getRegisteredTextLayerFromNode(node) {
  const element = getElementFromNode(node)
  const textLayer = element?.closest?.(TEXT_LAYER_SELECTOR)
  return isRegisteredTextLayer(textLayer) ? textLayer : null
}

function resetTextLayer(textLayer, sentinel) {
  if (!textLayer || !sentinel) return

  textLayer.append(sentinel)
  sentinel.style.width = ''
  sentinel.style.height = ''
  sentinel.style.userSelect = ''
  textLayer.classList.remove('selecting')
}

function resetAllTextLayers() {
  for (const [textLayer, sentinel] of textLayers) {
    resetTextLayer(textLayer, sentinel)
  }
}

function hasSelectionRange(selection) {
  return !!selection && selection.rangeCount > 0
}

function collectActiveTextLayers(selection) {
  const activeTextLayers = new Set()

  if (!hasSelectionRange(selection)) {
    return activeTextLayers
  }

  for (let i = 0; i < selection.rangeCount; i += 1) {
    const range = selection.getRangeAt(i)
    for (const textLayer of textLayers.keys()) {
      if (activeTextLayers.has(textLayer)) continue
      if (range.intersectsNode(textLayer)) {
        activeTextLayers.add(textLayer)
      }
    }
  }

  return activeTextLayers
}

function resolveRangeAnchor(range, modifyStart) {
  let anchor = modifyStart ? range.startContainer : range.endContainer

  if (anchor.nodeType === Node.TEXT_NODE) {
    anchor = anchor.parentNode
  }

  if (!modifyStart && range.endOffset === 0) {
    do {
      while (anchor && !anchor.previousSibling) {
        anchor = anchor.parentNode
      }
      anchor = anchor?.previousSibling || null
    } while (anchor && !anchor.childNodes.length)
  }

  return getElementFromNode(anchor)
}

function moveSentinelToSelectionBoundary(selection) {
  const range = selection.getRangeAt(0)
  const modifyStart = previousRange &&
    (
      range.compareBoundaryPoints(Range.END_TO_END, previousRange) === 0 ||
      range.compareBoundaryPoints(Range.START_TO_END, previousRange) === 0
    )
  const anchor = resolveRangeAnchor(range, modifyStart)
  const textLayer = getRegisteredTextLayerFromNode(anchor)
  const sentinel = textLayers.get(textLayer)

  if (sentinel && anchor?.parentElement) {
    sentinel.style.width = textLayer.style.width
    sentinel.style.height = textLayer.style.height
    sentinel.style.userSelect = 'text'
    anchor.parentElement.insertBefore(sentinel, modifyStart ? anchor : anchor.nextSibling)
  }

  previousRange = range.cloneRange()
}

function handleSelectionChange() {
  const selection = document.getSelection?.()

  if (!hasSelectionRange(selection)) {
    resetAllTextLayers()
    previousRange = null
    return
  }

  const activeTextLayers = collectActiveTextLayers(selection)

  for (const [textLayer, sentinel] of textLayers) {
    if (activeTextLayers.has(textLayer)) {
      textLayer.classList.add('selecting')
    } else {
      resetTextLayer(textLayer, sentinel)
    }
  }

  if (activeTextLayers.size === 0) {
    previousRange = null
    return
  }

  isFirefox ??= getComputedStyle(textLayers.values().next().value)
    .getPropertyValue('-moz-user-select') === 'none'

  if (!isFirefox) {
    moveSentinelToSelectionBoundary(selection)
  }
}

function handlePointerDown(event) {
  isPointerDown = true

  const textLayer = getRegisteredTextLayerFromNode(event?.target)
  if (textLayer) {
    textLayer.classList.add('selecting')
  }
}

function handlePointerUp() {
  isPointerDown = false
  resetAllTextLayers()
  previousRange = null
}

function handleBlur() {
  isPointerDown = false
  resetAllTextLayers()
  previousRange = null
}

function handleKeyUp() {
  if (!isPointerDown) {
    resetAllTextLayers()
    previousRange = null
  }
}

function ensureGlobalListeners() {
  if (listenerAbortController || typeof document === 'undefined') {
    return
  }

  listenerAbortController = new AbortController()
  const { signal } = listenerAbortController

  document.addEventListener('pointerdown', handlePointerDown, { signal })
  document.addEventListener('pointerup', handlePointerUp, { signal })
  document.addEventListener('selectionchange', handleSelectionChange, { signal })
  document.addEventListener('keyup', handleKeyUp, { signal })
  window.addEventListener('blur', handleBlur, { signal })
}

function removeGlobalListenersIfIdle() {
  if (textLayers.size > 0) {
    return
  }

  listenerAbortController?.abort()
  listenerAbortController = null
  previousRange = null
  isPointerDown = false
  isFirefox = null
}

export function registerPdfTextLayerSelectionShell(textLayer) {
  if (!textLayer || textLayers.has(textLayer)) {
    return textLayers.get(textLayer) || null
  }

  const sentinel = document.createElement('div')
  sentinel.className = END_OF_CONTENT_CLASS
  textLayer.append(sentinel)
  textLayers.set(textLayer, sentinel)
  ensureGlobalListeners()

  return sentinel
}

export function unregisterPdfTextLayerSelectionShell(textLayer) {
  const sentinel = textLayers.get(textLayer)
  if (!sentinel) {
    return
  }

  resetTextLayer(textLayer, sentinel)
  sentinel.remove()
  textLayers.delete(textLayer)
  removeGlobalListenersIfIdle()
}

export function resetPdfTextLayerSelectionShellForTests() {
  resetAllTextLayers()
  textLayers.clear()
  removeGlobalListenersIfIdle()
}
