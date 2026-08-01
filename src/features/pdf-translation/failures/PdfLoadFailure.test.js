import { describe, expect, it } from 'vitest'
import { classifyPdfLoadFailure } from './PdfLoadFailure.js'

describe('classifyPdfLoadFailure', () => {
  it('classifies timeouts', () => {
    const error = new DOMException('Timed out', 'TimeoutError')

    expect(classifyPdfLoadFailure(error)).toEqual({ kind: 'TIMEOUT', details: {} })
  })

  it('classifies HTTP failures with transport details', () => {
    const error = new Error('Not Found')
    error.name = 'PdfHttpError'
    error.status = 404
    error.statusText = 'Not Found'

    expect(classifyPdfLoadFailure(error)).toEqual({
      kind: 'HTTP',
      details: { status: 404, statusText: 'Not Found' },
    })
  })

  it.each([
    ['CLEANUP', 'DOCUMENT_CLEANUP'],
    ['LOAD', 'DOCUMENT_LOAD'],
    ['INITIALIZE', 'DOCUMENT_INITIALIZATION'],
    ['PAGE_METRICS', 'PAGE_METRICS'],
  ])('classifies document %s failures', (stage, kind) => {
    const error = new Error('Document failed')
    error.name = 'PdfDocumentError'
    error.stage = stage

    expect(classifyPdfLoadFailure(error)).toEqual({ kind, details: { stage } })
  })

  it('returns an immutable failure model', () => {
    const failure = classifyPdfLoadFailure(new Error('Unknown'))

    expect(Object.isFrozen(failure)).toBe(true)
    expect(Object.isFrozen(failure.details)).toBe(true)
  })

  it('classifies unknown errors as unexpected', () => {
    expect(classifyPdfLoadFailure(new Error('Unknown'))).toEqual({ kind: 'UNEXPECTED', details: {} })
  })
})
