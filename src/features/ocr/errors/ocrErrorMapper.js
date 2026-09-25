function getErrorMessage(error) {
  if (typeof error === 'string') return error
  if (typeof error?.message === 'string') return error.message
  return ''
}

export function mapOcrError(error) {
  const message = getErrorMessage(error)

  if (message === 'model-not-installed') return 'model-not-installed'
  if (message === 'no-text') return 'no-text'

  if (error?.name === 'AbortError' || error?.name === 'RenderingCancelledException' || message === 'cancelled') {
    return 'cancelled'
  }

  return 'ocr-failed'
}
