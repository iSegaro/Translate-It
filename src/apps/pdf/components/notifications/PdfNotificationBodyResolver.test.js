import { describe, expect, it } from 'vitest'
import PdfBenchmarkNotificationBody from './PdfBenchmarkNotificationBody.vue'
import { PDF_NOTIFICATION_BODY_TYPE } from '../../notifications/PdfNotificationBodyType.js'
import { resolvePdfNotificationBody } from './PdfNotificationBodyResolver.js'

describe('PdfNotificationBodyResolver', () => {
  it('maps benchmark result notifications to their body component', () => {
    expect(resolvePdfNotificationBody(PDF_NOTIFICATION_BODY_TYPE.BENCHMARK_RESULTS)).toBe(PdfBenchmarkNotificationBody)
  })

  it('does not resolve unknown notification body types', () => {
    expect(resolvePdfNotificationBody('unknown')).toBeNull()
  })
})
