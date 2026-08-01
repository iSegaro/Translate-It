import { describe, expect, it } from 'vitest'

import { PRESENTATION_SURFACE, resolveSurface } from './presentationPolicy.js'

describe('Presentation Policy', () => {
  it('exports frozen surface constants', () => {
    expect(Object.isFrozen(PRESENTATION_SURFACE)).toBe(true)
  })

  it('maps acknowledgement to toast', () => {
    expect(resolveSurface('acknowledgement')).toBe(PRESENTATION_SURFACE.TOAST)
  })

  it('maps outcome to banner', () => {
    expect(resolveSurface('outcome')).toBe(PRESENTATION_SURFACE.BANNER)
  })

  it('maps activity to progress-bar', () => {
    expect(resolveSurface('activity')).toBe(PRESENTATION_SURFACE.PROGRESS_BAR)
  })

  it('falls back to toast for unknown intent', () => {
    expect(resolveSurface('nonexistent-intent')).toBe(PRESENTATION_SURFACE.TOAST)
  })

  it('is pure — same input yields same output', () => {
    expect(resolveSurface('acknowledgement')).toBe(resolveSurface('acknowledgement'))
  })
})
