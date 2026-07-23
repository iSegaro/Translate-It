const FORMAT_LABELS = Object.freeze({
  txt: 'TXT',
  markdown: 'Markdown',
  html: 'HTML'
})

function formatLabel(format) {
  return FORMAT_LABELS[format] ?? format
}

const HANDLERS = Object.freeze({
  'export-completed': (toast, result) => {
    const label = formatLabel(result?.format)
    toast.success(`${label} exported successfully`)
  },
  'export-failed': (toast, result) => {
    toast.error(result?.error || 'Export failed')
  },
  'ocr-failed': (toast) => {
    toast.error('OCR failed. Please try again.')
  },
  'ocr-language-missing': (toast) => {
    toast.error('No OCR language is installed. Open Manage Languages from the OCR menu to download one.')
  },
  'region-ocr-no-text': (toast) => {
    toast.warning('No text found in the selected region.')
  },
  'region-ocr-failed': (toast) => {
    toast.error('Region OCR failed. Please try another region.')
  }
})

/**
 * Toast Adapter — maps Operation Results to vue-sonner toasts.
 *
 * Only result types that produce a toast have handlers.
 * Missing handler = silent no-op.
 *
 * @param {object} options
 * @param {object} options.toast — vue-sonner toast API { success, error, warning, info }
 * @returns {{ dispatch: (result: object) => void }}
 */
export function createToastAdapter({ toast } = {}) {
  if (!toast) {
    throw new TypeError('Toast adapter requires a toast API')
  }

  function dispatch(result) {
    const handler = HANDLERS[result?.type]

    if (typeof handler !== 'function') return

    return handler(toast, result)
  }

  return Object.freeze({ dispatch })
}
