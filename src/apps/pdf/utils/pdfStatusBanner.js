function buildMessageFromError(error) {
  if (typeof error !== 'string') return ''
  return error.trim()
}

function createErrorBannerIdFactory() {
  let sequence = 0
  let lastKind = ''
  let lastSource = ''
  let lastId = ''

  return {
    next(kind, source) {
      const signatureChanged = lastKind !== kind || lastSource !== source
      if (signatureChanged) {
        sequence += 1
        lastKind = kind
        lastSource = source
        lastId = `${kind}:${sequence}`
      }

      return lastId || `${kind}:${sequence}`
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
    isPartialExport = false
  } = {}) {
    const loadingMessage = 'Loading PDF and rebuilding visible pages.'
    const translatingMessage = 'Translating visible pages.'
    const restoredMessage = restoredTranslationCount > 0
      ? `Restored ${restoredTranslationCount} cached translation(s).`
      : ''
    const partialMessage = 'Partial translation available. Not all blocks are translated yet.'

    const errorMessage = buildMessageFromError(error) || buildMessageFromError(exportError) || buildMessageFromError(ocrError)
    if (errorMessage) {
      const kind = error ? 'error' : exportError ? 'export-error' : 'ocr-error'
      const source = error || exportError || ocrError || ''

      return {
        id: errorIdFactory.next(kind, source),
        visible: true,
        variant: 'error',
        title: 'PDF error',
        message: errorMessage,
        detail: ''
      }
    }

    if (isLoading) {
      return {
        id: 'opening',
        visible: true,
        variant: 'info',
        title: 'Opening PDF',
        message: loadingMessage,
        detail: ''
      }
    }

    if (isTranslating) {
      return {
        id: 'translating',
        visible: true,
        variant: 'info',
        title: 'Translating visible pages',
        message: translatingMessage,
        detail: ''
      }
    }

    if (isPartialExport) {
      return {
        id: 'partial-export',
        visible: true,
        variant: 'warning',
        title: 'Partial translation',
        message: partialMessage,
        detail: ''
      }
    }

    if (exportSuccess) {
      return {
        id: 'export-success',
        visible: true,
        variant: exportSuccess.variant || 'success',
        title: exportSuccess.title || 'Export ready',
        message: exportSuccess.message || '',
        detail: exportSuccess.detail || ''
      }
    }

    if (restoredTranslationCount > 0) {
      return {
        id: 'cache-restored',
        visible: true,
        variant: 'success',
        title: 'Restored from cache',
        message: restoredMessage,
        detail: ''
      }
    }

    return null
  }

  return { build }
}
