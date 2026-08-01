const DOCUMENT_FAILURE_KINDS = Object.freeze({
  CLEANUP: 'DOCUMENT_CLEANUP',
  LOAD: 'DOCUMENT_LOAD',
  INITIALIZE: 'DOCUMENT_INITIALIZATION',
  PAGE_METRICS: 'PAGE_METRICS',
})

function createFailure(kind, details = {}) {
  return Object.freeze({ kind, details: Object.freeze(details) })
}

export function classifyPdfLoadFailure(error) {
  if (error?.name === 'TimeoutError') {
    return createFailure('TIMEOUT')
  }

  if (error?.name === 'PdfHttpError') {
    return createFailure('HTTP', {
      status: error.status,
      statusText: error.statusText,
    })
  }

  if (error?.name === 'PdfDocumentError' && DOCUMENT_FAILURE_KINDS[error.stage]) {
    return createFailure(DOCUMENT_FAILURE_KINDS[error.stage], { stage: error.stage })
  }

  return createFailure('UNEXPECTED')
}
