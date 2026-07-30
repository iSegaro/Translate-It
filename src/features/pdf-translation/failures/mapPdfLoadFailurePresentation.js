function createPresentation(title, description, severity, retryable, icon) {
  return Object.freeze({ title, description, severity, retryable, icon })
}

const TIMEOUT = createPresentation('Connection timed out', 'The server did not respond in time. Please check your connection and try again.', 'error', true, 'offline')
const HTTP = createPresentation('Server error', 'The server returned an error when trying to load the document.', 'error', false, 'warning')
const DOCUMENT_CLEANUP = createPresentation('Could not open document', 'An error occurred while preparing the document for display.', 'error', false, 'error')
const DOCUMENT_LOAD = createPresentation('Could not read document', 'The file could not be opened. It may be unsupported or corrupted.', 'error', false, 'error')
const DOCUMENT_INITIALIZATION = createPresentation('Could not open document', 'An error occurred while initializing the document.', 'error', false, 'error')
const PAGE_METRICS = createPresentation('Could not read document', 'The document could not be processed for display.', 'error', false, 'error')
const DEFAULT = createPresentation('Could not open document', 'An unexpected error occurred.', 'error', false, 'error')

const PRESENTATIONS = Object.freeze({ TIMEOUT, HTTP, DOCUMENT_CLEANUP, DOCUMENT_LOAD, DOCUMENT_INITIALIZATION, PAGE_METRICS })

export function mapPdfLoadFailurePresentation(failure) {
  return PRESENTATIONS[failure?.kind] || DEFAULT
}
