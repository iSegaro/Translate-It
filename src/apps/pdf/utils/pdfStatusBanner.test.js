import { beforeEach, describe, expect, it } from 'vitest'
import { createPdfStatusBannerController } from './pdfStatusBanner.js'
import { PDF_NOTIFICATION_BODY_TYPE } from '../notifications/PdfNotificationBodyType.js'

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
      dismissible: false
    })
  })

  it('builds a translating banner', () => {
    expect(controller.build({ isTranslating: true })).toEqual({
      id: 'translating',
      visible: true,
      variant: 'info',
      title: 'Translating visible pages',
      message: 'Translating visible pages.',
      dismissible: false
    })
  })

  it('builds a cache-restore banner', () => {
    expect(controller.build({ restoredTranslationCount: 2 })).toEqual({
      id: 'cache-restored',
      visible: true,
      variant: 'success',
      title: 'Restored from cache',
      message: 'Restored 2 cached translation(s).',
      dismissible: true
    })
  })

  it('builds a partial export warning banner', () => {
    expect(controller.build({ translationStatus: 'partial' })).toEqual({
      id: 'partial-export:0',
      visible: true,
      variant: 'warning',
      title: 'Partial translation',
      message: 'Partial translation available. Not all blocks are translated yet.',
      dismissible: true
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
      dismissible: true
    })
  })

  it('builds a generic developer notification below translation outcomes', () => {
    const notification = {
      id: 'developer-notification:1',
      variant: 'success',
      title: 'Region Comparison completed',
      message: 'Winner: scale-1-eng.',
      body: { type: PDF_NOTIFICATION_BODY_TYPE.REGION_COMPARISON_RESULTS, payload: { rows: [] } }
    }

    expect(controller.build({ developerNotification: notification })).toEqual({
      ...notification,
      visible: true,
      dismissible: true
    })
    expect(controller.build({ translationStatus: 'partial', developerNotification: notification })).toMatchObject({
      id: 'partial-export:0',
      variant: 'warning'
    })
    expect(controller.build({ isLoading: true, developerNotification: notification })).toMatchObject({
      id: 'opening',
      variant: 'info'
    })
    expect(controller.build({ isTranslating: true, developerNotification: notification })).toMatchObject({
      id: 'translating',
      variant: 'info'
    })
    expect(controller.build({ error: 'PDF failed', developerNotification: notification })).toMatchObject({
      id: 'error:1',
      variant: 'error'
    })
  })

  it('keeps partial export above success', () => {
    expect(controller.build({
      translationStatus: 'partial',
      exportSuccess: {
        variant: 'success',
        title: 'HTML export ready',
        message: 'HTML export downloaded successfully.',
        detail: ''
      }
    })).toEqual({
      id: 'partial-export:0',
      visible: true,
      variant: 'warning',
      title: 'Partial translation',
      message: 'Partial translation available. Not all blocks are translated yet.',
      dismissible: true
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
      dismissible: true
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

  it('generates new id after error clears and returns', () => {
    const first = controller.build({ error: 'Same error.' })
    expect(first.id).toBe('error:1')

    controller.build({})
    const second = controller.build({ error: 'Same error.' })
    expect(second.id).toBe('error:2')
  })

  it('keeps controllers independent', () => {
    const firstController = createPdfStatusBannerController()
    const secondController = createPdfStatusBannerController()

    const first = firstController.build({ error: 'Boom' })
    const second = secondController.build({ error: 'Boom' })

    expect(first.id).toBe('error:1')
    expect(second.id).toBe('error:1')
  })

  it('uses translationOccurrenceId in partial banner id', () => {
    expect(controller.build({ translationStatus: 'partial', translationOccurrenceId: 1 })).toMatchObject({
      id: 'partial-export:1',
      variant: 'warning'
    })
  })

  it('generates different partial ids for different occurrences', () => {
    const first = controller.build({ translationStatus: 'partial', translationOccurrenceId: 1 })
    const second = controller.build({ translationStatus: 'partial', translationOccurrenceId: 2 })
    expect(first.id).toBe('partial-export:1')
    expect(second.id).toBe('partial-export:2')
    expect(first.id).not.toBe(second.id)
  })

  it('keeps same partial id across same-occurrence recomputations', () => {
    const first = controller.build({ translationStatus: 'partial', translationOccurrenceId: 5 })
    const second = controller.build({ translationStatus: 'partial', translationOccurrenceId: 5 })
    expect(first.id).toBe('partial-export:5')
    expect(second.id).toBe(first.id)
  })

  it('uses new partial id after successful translation between partials', () => {
    const first = controller.build({ translationStatus: 'partial', translationOccurrenceId: 1 })
    expect(first.id).toBe('partial-export:1')

    controller.build({ translationStatus: 'translated', translationOccurrenceId: 2 })

    const third = controller.build({ translationStatus: 'partial', translationOccurrenceId: 3 })
    expect(third.id).toBe('partial-export:3')
  })

  it('returns null when translationStatus is idle', () => {
    expect(controller.build({ translationStatus: 'idle' })).toBeNull()
  })

  it('returns null when translationStatus is translated', () => {
    expect(controller.build({ translationStatus: 'translated' })).toBeNull()
  })

  it('returns null when translationStatus is cancelled', () => {
    expect(controller.build({ translationStatus: 'cancelled' })).toBeNull()
  })

  it('prefers error over partial status', () => {
    expect(controller.build({
      error: 'Failed.',
      translationStatus: 'partial'
    })).toMatchObject({
      id: 'error:1',
      variant: 'error',
      title: 'PDF error',
      message: 'Failed.'
    })
  })

  it('prefers loading over partial status', () => {
    expect(controller.build({
      isLoading: true,
      translationStatus: 'partial'
    })).toMatchObject({
      id: 'opening',
      variant: 'info'
    })
  })

  it('prefers translating over partial status', () => {
    expect(controller.build({
      isTranslating: true,
      translationStatus: 'partial'
    })).toMatchObject({
      id: 'translating',
      variant: 'info'
    })
  })
})
