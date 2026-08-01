export function mapOcrError(error) {
  if (error?.message === 'model-not-installed') return 'model-not-installed'

  if (error?.name === 'AbortError' || error?.name === 'RenderingCancelledException' || error?.message === 'cancelled') {
    return 'cancelled'
  }

  return 'ocr-failed'
}
