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
    isLoading = false,
    developerNotification = null,
    translationNotification = null
  } = {}) {
    const loadingMessage = 'Loading PDF and rebuilding visible pages.'

    const errorMessage = buildMessageFromError(error)
    const errorKind = errorMessage ? 'error' : ''
    const errorSource = errorMessage || ''
    const errorId = errorIdFactory.next(errorKind, errorSource)

    if (errorMessage) {
      return { id: errorId, visible: true, variant: 'error', title: 'PDF error', message: errorMessage, dismissible: true }
    }

    if (isLoading) {
      return { id: 'opening', visible: true, variant: 'info', title: 'Opening PDF', message: loadingMessage, dismissible: false }
    }

    if (translationNotification?.id) {
      return {
        ...translationNotification,
        visible: true,
        dismissible: true
      }
    }

    if (developerNotification?.id) {
      return {
        id: developerNotification.id,
        visible: true,
        variant: developerNotification.variant || 'info',
        title: developerNotification.title || 'Developer notification',
        message: developerNotification.message || '',
        body: developerNotification.body || null,
        dismissible: true
      }
    }

    return null
  }

  return { build }
}
