import { describe, expect, it } from 'vitest'
import PdfRegionComparisonNotificationBody from './PdfRegionComparisonNotificationBody.vue'
import { PDF_NOTIFICATION_BODY_TYPE } from '../../notifications/PdfNotificationBodyType.js'
import { resolvePdfNotificationBody } from './PdfNotificationBodyResolver.js'

describe('PdfNotificationBodyResolver', () => {
  it('maps regionComparison result notifications to their body component', () => {
    expect(resolvePdfNotificationBody(PDF_NOTIFICATION_BODY_TYPE.REGION_COMPARISON_RESULTS)).toBe(PdfRegionComparisonNotificationBody)
  })

  it('does not resolve unknown notification body types', () => {
    expect(resolvePdfNotificationBody('unknown')).toBeNull()
  })
})
