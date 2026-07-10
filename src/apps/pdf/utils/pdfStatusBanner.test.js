import { beforeEach, describe, expect, it } from 'vitest'
import { createPdfStatusBannerController } from './pdfStatusBanner.js'

describe('buildPdfStatusBannerState', () => {
  let controller

  beforeEach(() => {
    controller = createPdfStatusBannerController()
  })

  it('returns null when idle', () => {
    expect(controller.build()).toBeNull()
  })

  it('builds a loading banner', () => {
    expect(controller.build({ isLoading: true })).toEqual({
      id: 'opening',
      visible: true,
      variant: 'info',
      title: 'Opening PDF',
      message: 'Loading PDF and rebuilding visible pages.',
      detail: ''
    })
  })

  it('builds a translating banner', () => {
    expect(controller.build({ isTranslating: true })).toEqual({
      id: 'translating',
      visible: true,
      variant: 'info',
      title: 'Translating visible pages',
      message: 'Translating visible pages.',
      detail: ''
    })
  })

  it('builds a cache-restore banner', () => {
    expect(controller.build({ restoredTranslationCount: 2 })).toEqual({
      id: 'cache-restored',
      visible: true,
      variant: 'success',
      title: 'Restored from cache',
      message: 'Restored 2 cached translation(s).',
      detail: ''
    })
  })

  it('builds a partial export warning banner', () => {
    expect(controller.build({ isPartialExport: true })).toEqual({
      id: 'partial-export',
      visible: true,
      variant: 'warning',
      title: 'Partial translation',
      message: 'Partial translation available. Not all blocks are translated yet.',
      detail: ''
    })
  })

  it('builds an export success banner', () => {
    expect(controller.build({
      exportSuccess: {
        variant: 'success',
        title: 'TXT export ready',
        message: 'TXT export downloaded successfully.',
        detail: ''
      }
    })).toEqual({
      id: 'export-success',
      visible: true,
      variant: 'success',
      title: 'TXT export ready',
      message: 'TXT export downloaded successfully.',
      detail: ''
    })
  })

  it('keeps partial export above success', () => {
    expect(controller.build({
      isPartialExport: true,
      exportSuccess: {
        variant: 'success',
        title: 'HTML export ready',
        message: 'HTML export downloaded successfully.',
        detail: ''
      }
    })).toEqual({
      id: 'partial-export',
      visible: true,
      variant: 'warning',
      title: 'Partial translation',
      message: 'Partial translation available. Not all blocks are translated yet.',
      detail: ''
    })
  })

  it('prefers error state over other states', () => {
    expect(controller.build({
      error: 'Failed to open the PDF file.',
      isLoading: true,
      restoredTranslationCount: 3,
      exportSuccess: {
        variant: 'success',
        title: 'Markdown export ready',
        message: 'Markdown export downloaded successfully.',
        detail: ''
      }
    })).toEqual({
      id: 'error:1',
      visible: true,
      variant: 'error',
      title: 'PDF error',
      message: 'Failed to open the PDF file.',
      detail: ''
    })
  })

  it('keeps same error id until source changes or clears', () => {
    const first = controller.build({ error: 'Failed again.' })
    const second = controller.build({ error: 'Failed again.' })
    const third = controller.build({ error: 'Different error.' })

    expect(first).toMatchObject({
      id: 'error:1',
      variant: 'error',
      title: 'PDF error',
      message: 'Failed again.'
    })

    expect(second.id).toBe(first.id)
    expect(third.id).toBe('error:2')
  })

  it('keeps controllers independent', () => {
    const firstController = createPdfStatusBannerController()
    const secondController = createPdfStatusBannerController()

    const first = firstController.build({ error: 'Boom' })
    const second = secondController.build({ error: 'Boom' })

    expect(first.id).toBe('error:1')
    expect(second.id).toBe('error:1')
  })
})
