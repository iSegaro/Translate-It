import { describe, expect, it } from 'vitest'
import { createPdfRegion } from '@/features/pdf-translation/core/PdfRegion.js'
import { createExecutionMetadata } from './ExecutionMetadata.js'

function createMetadata(overrides = {}) {
  const region = createPdfRegion({ pageNumber: 2, left: 1, top: 4, right: 3, bottom: 2 })
  return createExecutionMetadata({
    startedAt: 100,
    completedAt: 140,
    totalElapsedMs: 40,
    pageNumber: 2,
    region,
    ...overrides
  })
}

describe('ExecutionMetadata', () => {
  it('creates immutable metadata with canonical region identity', () => {
    const region = createPdfRegion({ pageNumber: 2, left: 1, top: 4, right: 3, bottom: 2 })
    const metadata = createMetadata({ region })

    expect(metadata.region).toBe(region)
    expect(Object.isFrozen(metadata)).toBe(true)
  })

  it.each(['startedAt', 'completedAt', 'totalElapsedMs', 'pageNumber', 'region'])('rejects missing %s', field => {
    const value = {
      startedAt: 100,
      completedAt: 140,
      totalElapsedMs: 40,
      pageNumber: 2,
      region: createPdfRegion({ pageNumber: 2, left: 1, top: 4, right: 3, bottom: 2 })
    }
    delete value[field]

    expect(() => createExecutionMetadata(value)).toThrow(`ExecutionMetadata requires ${field}`)
  })
})
