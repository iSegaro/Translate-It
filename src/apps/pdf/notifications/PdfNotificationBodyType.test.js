import { describe, expect, it } from 'vitest'
import { PDF_NOTIFICATION_BODY_TYPE } from './PdfNotificationBodyType.js'

describe('PDF_NOTIFICATION_BODY_TYPE', () => {
  it('defines the canonical benchmark result notification type', () => {
    expect(PDF_NOTIFICATION_BODY_TYPE).toMatchObject({ BENCHMARK_RESULTS: expect.any(String) })
    expect(Object.isFrozen(PDF_NOTIFICATION_BODY_TYPE)).toBe(true)
  })
})
