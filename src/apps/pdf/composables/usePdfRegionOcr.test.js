import { defineComponent, h, nextTick } from 'vue'
import { mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { usePdfRegionOcr } from './usePdfRegionOcr.js'
import { createPdfRegion } from '@/features/pdf-translation/core/PdfRegion.js'

const region = createPdfRegion({ pageNumber: 1, left: 1, top: 4, right: 3, bottom: 2 })

let wrapper

function deferredOutcome() {
  let resolve
  const promise = new Promise((res) => {
    resolve = res
  })
  return { promise, resolve }
}

function mountRegionOcr(createExecutor, options = {}) {
  let api
  wrapper = mount(defineComponent({
    setup() {
      api = usePdfRegionOcr({ createExecutor, ...options })
      return () => h('div')
    }
  }))
  return api
}

afterEach(() => {
  wrapper?.unmount()
  wrapper = null
  vi.restoreAllMocks()
})

describe('usePdfRegionOcr', () => {
  it('creates an executor operation with canonical PdfRegion input', async () => {
    const execute = vi.fn(() => ({
      promise: Promise.resolve({ status: 'recognized', data: { text: 'ok', lines: [], confidence: 1 } }),
      cancel: vi.fn()
    }))
    const createExecutor = vi.fn(() => ({ execute }))
    const pdfDocument = { getPage: vi.fn() }
    const api = mountRegionOcr(createExecutor)

    await api.executeRegionOcr({ region, pdfDocument, scale: 2, language: 'eng' })

    expect(createExecutor).toHaveBeenCalledWith({ pdfDocument })
    expect(execute).toHaveBeenCalledWith({ region, scale: 2, language: 'eng' })
    expect(api.outcome.value).toEqual({ status: 'recognized', data: { text: 'ok', lines: [], confidence: 1 } })
  })

  it('cancels the previous run before starting a new run', async () => {
    const first = deferredOutcome()
    const second = deferredOutcome()
    const firstCancel = vi.fn()
    const secondCancel = vi.fn()
    const execute = vi.fn()
      .mockReturnValueOnce({ promise: first.promise, cancel: firstCancel })
      .mockReturnValueOnce({ promise: second.promise, cancel: secondCancel })
    const api = mountRegionOcr(() => ({ execute }))

    const firstRun = api.executeRegionOcr({ region, pdfDocument: {}, scale: 1, language: 'eng' })
    const secondRun = api.executeRegionOcr({ region, pdfDocument: {}, scale: 1, language: 'eng' })
    first.resolve({ status: 'cancelled' })
    second.resolve({ status: 'recognized', data: { text: 'new', lines: [], confidence: 1 } })
    await Promise.all([firstRun, secondRun])

    expect(firstCancel).toHaveBeenCalledOnce()
    expect(secondCancel).not.toHaveBeenCalled()
    expect(api.outcome.value).toEqual({ status: 'recognized', data: { text: 'new', lines: [], confidence: 1 } })
  })

  it('suppresses stale results from older runs', async () => {
    const first = deferredOutcome()
    const second = deferredOutcome()
    const execute = vi.fn()
      .mockReturnValueOnce({ promise: first.promise, cancel: vi.fn() })
      .mockReturnValueOnce({ promise: second.promise, cancel: vi.fn() })
    const api = mountRegionOcr(() => ({ execute }))

    const firstRun = api.executeRegionOcr({ region, pdfDocument: {}, scale: 1, language: 'eng' })
    const secondRun = api.executeRegionOcr({ region, pdfDocument: {}, scale: 1, language: 'eng' })
    second.resolve({ status: 'recognized', data: { text: 'latest', lines: [], confidence: 2 } })
    await secondRun
    first.resolve({ status: 'recognized', data: { text: 'stale', lines: [], confidence: 1 } })
    await firstRun

    expect(api.outcome.value).toEqual({ status: 'recognized', data: { text: 'latest', lines: [], confidence: 2 } })
  })

  it.each([
    { status: 'cancelled' },
    { status: 'failed', error: new Error('failed') },
    { status: 'recognized', data: { text: 'ok', lines: [], confidence: 1 } }
  ])('stores $status outcome', async (result) => {
    const api = mountRegionOcr(() => ({
      execute: () => ({ promise: Promise.resolve(result), cancel: vi.fn() })
    }))

    await api.executeRegionOcr({ region, pdfDocument: {}, scale: 1, language: 'eng' })

    expect(api.outcome.value).toEqual(result)
    expect(api.isProcessing.value).toBe(false)
  })

  it('keeps concurrent execution results isolated by run identity', async () => {
    const first = deferredOutcome()
    const second = deferredOutcome()
    const execute = vi.fn()
      .mockReturnValueOnce({ promise: first.promise, cancel: vi.fn() })
      .mockReturnValueOnce({ promise: second.promise, cancel: vi.fn() })
    const api = mountRegionOcr(() => ({ execute }))

    const firstRun = api.executeRegionOcr({ region, pdfDocument: {}, scale: 1, language: 'eng' })
    const secondRun = api.executeRegionOcr({ region, pdfDocument: {}, scale: 1, language: 'eng' })
    first.resolve({ status: 'recognized', data: { text: 'first', lines: [], confidence: 1 } })
    second.resolve({ status: 'recognized', data: { text: 'second', lines: [], confidence: 2 } })
    await Promise.all([firstRun, secondRun])

    expect(api.outcome.value.data.text).toBe('second')
  })

  it('cancels active operation on unmount', async () => {
    const pending = deferredOutcome()
    const cancel = vi.fn()
    const api = mountRegionOcr(() => ({
      execute: () => ({ promise: pending.promise, cancel })
    }))

    api.executeRegionOcr({ region, pdfDocument: {}, scale: 1, language: 'eng' })
    await nextTick()
    wrapper.unmount()
    wrapper = null

    expect(cancel).toHaveBeenCalledOnce()
    expect(api.isProcessing.value).toBe(false)
  })

  it('cancels a pending operation immediately and suppresses its late result', async () => {
    const pending = deferredOutcome()
    const cancel = vi.fn()
    const api = mountRegionOcr(() => ({
      execute: () => ({ promise: pending.promise, cancel })
    }))

    api.executeRegionOcr({ region, pdfDocument: {}, scale: 1, language: 'eng' })
    await nextTick()
    expect(api.isProcessing.value).toBe(true)

    api.cancelRegionOcr()
    expect(cancel).toHaveBeenCalledOnce()
    expect(api.isProcessing.value).toBe(false)

    pending.resolve({ status: 'recognized', data: { text: 'late', lines: [], confidence: 1 } })
    await pending.promise
    await nextTick()

    expect(api.outcome.value).toBeNull()
    expect(api.isProcessing.value).toBe(false)
  })

  it('runs normally after a cancelled operation resolves late', async () => {
    const first = deferredOutcome()
    const second = deferredOutcome()
    const execute = vi.fn()
      .mockReturnValueOnce({ promise: first.promise, cancel: vi.fn() })
      .mockReturnValueOnce({ promise: second.promise, cancel: vi.fn() })
    const api = mountRegionOcr(() => ({ execute }))

    const cancelledRun = api.executeRegionOcr({ region, pdfDocument: {}, scale: 1, language: 'eng' })
    api.cancelRegionOcr()
    const nextRun = api.executeRegionOcr({ region, pdfDocument: {}, scale: 1, language: 'eng' })

    first.resolve({ status: 'failed', error: new Error('late') })
    second.resolve({ status: 'recognized', data: { text: 'ok', lines: [], confidence: 1 } })
    await Promise.all([cancelledRun, nextRun])

    expect(api.outcome.value).toEqual({ status: 'recognized', data: { text: 'ok', lines: [], confidence: 1 } })
    expect(api.isProcessing.value).toBe(false)
  })

  it('invokes recognized callback only for current recognized outcome', async () => {
    const first = deferredOutcome()
    const second = deferredOutcome()
    const onRecognized = vi.fn()
    const execute = vi.fn()
      .mockReturnValueOnce({ promise: first.promise, cancel: vi.fn() })
      .mockReturnValueOnce({ promise: second.promise, cancel: vi.fn() })
    const api = mountRegionOcr(() => ({ execute }), { onRecognized })

    const staleRun = api.executeRegionOcr({ region, pdfDocument: {}, scale: 1, language: 'eng' })
    const currentRun = api.executeRegionOcr({ region, pdfDocument: {}, scale: 1, language: 'eng' })
    first.resolve({ status: 'recognized', data: { text: 'stale', lines: [], confidence: 1 } })
    second.resolve({ status: 'recognized', data: { text: 'current', lines: [], confidence: 2 } })
    await Promise.all([staleRun, currentRun])

    expect(onRecognized).toHaveBeenCalledOnce()
    expect(onRecognized).toHaveBeenCalledWith({ text: 'current', lines: [], confidence: 2 })
  })
})
