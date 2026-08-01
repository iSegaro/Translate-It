import { beforeEach, describe, expect, it } from 'vitest'
import { createPdfStatusBannerController } from './pdfStatusBanner.js'
import { PDF_NOTIFICATION_BODY_TYPE } from '../notifications/PdfNotificationBodyType.js'

describe('buildPdfStatusBannerState', () => {
  let controller

  beforeEach(() => {
    controller = createPdfStatusBannerController()
  })

  it('returns null when no notification', () => {
    expect(controller.build()).toBeNull()
  })

  it('returns null when notification has no id', () => {
    expect(controller.build({ notification: { variant: 'success', message: 'Done' } })).toBeNull()
  })

  it('builds a banner from notification', () => {
    expect(controller.build({
      notification: {
        id: 'dev-notif:1',
        variant: 'success',
        title: 'Region Comparison complete',
        message: 'Winner: scale-1.5.',
        body: { type: PDF_NOTIFICATION_BODY_TYPE.REGION_COMPARISON_RESULTS, payload: { rows: [] } }
      }
    })).toEqual({
      id: 'dev-notif:1',
      variant: 'success',
      title: 'Region Comparison complete',
      message: 'Winner: scale-1.5.',
      body: { type: PDF_NOTIFICATION_BODY_TYPE.REGION_COMPARISON_RESULTS, payload: { rows: [] } },
      dismissible: true
    })
  })

  it('defaults variant to info when missing', () => {
    expect(controller.build({
      notification: { id: 'n1', title: 'T', message: 'M' }
    })).toMatchObject({
      id: 'n1',
      variant: 'info',
      title: 'T',
      message: 'M'
    })
  })

  it('defaults body to null when missing', () => {
    expect(controller.build({
      notification: { id: 'n2', variant: 'error', title: 'T', message: 'M' }
    })).toMatchObject({
      id: 'n2',
      body: null
    })
  })

  it('returns plain object result', () => {
    const result = controller.build({
      notification: { id: 'n3', variant: 'success', title: 'T', message: 'M' }
    })
    expect(result).toBeTruthy()
    expect(result.id).toBe('n3')
  })
})
