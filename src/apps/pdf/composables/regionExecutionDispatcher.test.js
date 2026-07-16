import { describe, expect, it, vi } from 'vitest'

import { createRegionExecutionDispatcher } from './regionExecutionDispatcher.js'
import { createRegionExecutionRequest } from './regionExecutionRequest.js'
import { createPdfRegion } from '@/features/pdf-translation/core/PdfRegion.js'

describe('RegionExecutionDispatcher', () => {
  it('routes OCR request to runner and returns result', async () => {
    const request = createRegionExecutionRequest({ region: createPdfRegion({ pageNumber: 1, left: 1, top: 4, right: 3, bottom: 2 }) })
    const runner = vi.fn().mockResolvedValue({ status: 'recognized', text: 'ok' })
    const dispatcher = createRegionExecutionDispatcher({ runners: { ocr: runner } })

    const result = await dispatcher.dispatchRegionExecution(request)

    expect(runner).toHaveBeenCalledOnce()
    expect(runner).toHaveBeenCalledWith(request)
    expect(result).toEqual({ status: 'recognized', text: 'ok' })
  })

  it('rejects unsupported target', () => {
    const dispatcher = createRegionExecutionDispatcher({ runners: {} })

    expect(() => dispatcher.dispatchRegionExecution({ target: 'benchmark' })).toThrow(RangeError)
  })

  it('does not mutate request', async () => {
    const request = createRegionExecutionRequest({ region: createPdfRegion({ pageNumber: 1, left: 1, top: 4, right: 3, bottom: 2 }) })
    const dispatcher = createRegionExecutionDispatcher({ runners: { ocr: vi.fn().mockResolvedValue({ status: 'recognized' }) } })
    const snapshot = structuredClone(request)

    await dispatcher.dispatchRegionExecution(request)

    expect(request).toEqual(snapshot)
    expect(Object.isFrozen(request)).toBe(true)
  })
})
