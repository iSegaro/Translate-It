function buildMessageFromError(error) {
  if (typeof error !== 'string') return ''
  return error.trim()
}

export function buildPdfStatusBannerState({
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
    return {
      visible: true,
      variant: 'error',
      title: 'PDF error',
      message: errorMessage,
      detail: ''
    }
  }

  if (isLoading) {
    return {
      visible: true,
      variant: 'info',
      title: 'Opening PDF',
      message: loadingMessage,
      detail: ''
    }
  }

  if (isTranslating) {
    return {
      visible: true,
      variant: 'info',
      title: 'Translating visible pages',
      message: translatingMessage,
      detail: ''
    }
  }

  if (isPartialExport) {
    return {
      visible: true,
      variant: 'warning',
      title: 'Partial translation',
      message: partialMessage,
      detail: ''
    }
  }

  if (exportSuccess) {
    return {
      visible: true,
      variant: exportSuccess.variant || 'success',
      title: exportSuccess.title || 'Export ready',
      message: exportSuccess.message || '',
      detail: exportSuccess.detail || ''
    }
  }

  if (restoredTranslationCount > 0) {
    return {
      visible: true,
      variant: 'success',
      title: 'Restored from cache',
      message: restoredMessage,
      detail: ''
    }
  }

  return null
}
