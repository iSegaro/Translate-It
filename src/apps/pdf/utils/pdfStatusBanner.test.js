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

  it('builds a translation outcome banner from presentation state', () => {
    expect(controller.build({ translationNotification: {
      id: 'translation-partial:1',
      variant: 'warning',
      title: 'Partial translation',
      message: 'Provider failed'
    } })).toEqual({
      id: 'translation-partial:1',
      visible: true,
      variant: 'warning',
      title: 'Partial translation',
      message: 'Provider failed',
      dismissible: true
    })
  })

  it('builds a generic developer notification below translation outcomes', () => {
    const notification = {
      id: 'developer-notification:1',
      variant: 'success',
      title: 'Region Comparison completed',
      message: 'Winner: scale-1.',
      body: { type: PDF_NOTIFICATION_BODY_TYPE.REGION_COMPARISON_RESULTS, payload: { rows: [] } }
    }

    expect(controller.build({ developerNotification: notification })).toEqual({
      ...notification,
      visible: true,
      dismissible: true
    })
    expect(controller.build({ translationNotification: {
      id: 'translation-partial:1', variant: 'warning', title: 'Partial translation', message: 'Partial failure'
    }, developerNotification: notification })).toMatchObject({
      id: 'translation-partial:1',
      variant: 'warning'
    })
    expect(controller.build({ isLoading: true, developerNotification: notification })).toMatchObject({
      id: 'opening',
      variant: 'info'
    })
    expect(controller.build({ error: 'PDF failed', developerNotification: notification })).toMatchObject({
      id: 'error:1',
      variant: 'error'
    })
  })

  it('prefers error state over other states', () => {
    expect(controller.build({
      error: 'Failed to open the PDF file.',
      isLoading: true
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

  it('keeps document errors above translation outcomes', () => {
    expect(controller.build({
      error: 'Failed.',
      translationNotification: { id: 'translation-failed:1', variant: 'error', title: 'Translation failed', message: 'Failed.' }
    })).toMatchObject({
      id: 'error:1',
      variant: 'error',
      title: 'PDF error'
    })
  })

})
