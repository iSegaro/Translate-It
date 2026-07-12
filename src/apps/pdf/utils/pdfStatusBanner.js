function buildMessageFromError(error) {
  if (typeof error !== 'string') return ''
  return error.trim()
}

function createErrorBannerIdFactory() {
  let sequence = 0
  let lastKind = ''
  let lastSource = ''
  let lastActive = false

  return {
    next(kind, source) {
      const active = kind !== ''

      if (active && (!lastActive || lastKind !== kind || lastSource !== source)) {
        sequence += 1
        lastKind = kind
        lastSource = source
      }

      lastActive = active
      return active ? `${kind}:${sequence}` : ''
    }
  }
}

export function createPdfStatusBannerController() {
  const errorIdFactory = createErrorBannerIdFactory()
  function build({
    error = '',
    exportError = '',
    ocrError = '',
    isLoading = false,
    isTranslating = false,
    exportSuccess = null,
    restoredTranslationCount = 0,
    isPartialExport = false,
    // Domain-level identity for one completed translation occurrence.
    // Stable across reactive recomputations of the same occurrence.
    // UI dismiss key uses this to distinguish independent translation outcomes.
    translationOccurrenceId = 0
  } = {}) {
    const loadingMessage = 'Loading PDF and rebuilding visible pages.'
    const translatingMessage = 'Translating visible pages.'
    const restoredMessage = restoredTranslationCount > 0
      ? `Restored ${restoredTranslationCount} cached translation(s).`
      : ''
    const partialMessage = 'Partial translation available. Not all blocks are translated yet.'

    const errorMessage = buildMessageFromError(error) || buildMessageFromError(exportError) || buildMessageFromError(ocrError)
    const errorKind = errorMessage ? (error ? 'error' : exportError ? 'export-error' : 'ocr-error') : ''
    const errorSource = errorMessage || ''
    const errorId = errorIdFactory.next(errorKind, errorSource)

    if (errorMessage) {
      return {
        id: errorId,
        visible: true,
        variant: 'error',
        title: 'PDF error',
        message: errorMessage,
        detail: '',
        dismissible: true
      }
    }

    if (isLoading) {
      return {
        id: 'opening',
        visible: true,
        variant: 'info',
        title: 'Opening PDF',
        message: loadingMessage,
        detail: '',
        dismissible: false
      }
    }

    if (isTranslating) {
      return {
        id: 'translating',
        visible: true,
        variant: 'info',
        title: 'Translating visible pages',
        message: translatingMessage,
        detail: '',
        dismissible: false
      }
    }

    if (isPartialExport) {
      return {
        id: `partial-export:${translationOccurrenceId}`,
        visible: true,
        variant: 'warning',
        title: 'Partial translation',
        message: partialMessage,
        detail: '',
        dismissible: true
      }
    }

    if (exportSuccess) {
      return {
        id: 'export-success',
        visible: true,
        variant: exportSuccess.variant || 'success',
        title: exportSuccess.title || 'Export ready',
        message: exportSuccess.message || '',
        detail: exportSuccess.detail || '',
        dismissible: true
      }
    }

    if (restoredTranslationCount > 0) {
      return {
        id: 'cache-restored',
        visible: true,
        variant: 'success',
        title: 'Restored from cache',
        message: restoredMessage,
        detail: '',
        dismissible: true
      }
    }
    return null
  }

  return { build }
}
