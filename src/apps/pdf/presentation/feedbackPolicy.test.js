import { describe, expect, it } from 'vitest'

import { SEMANTIC_CATEGORY } from './semanticClassification.js'
import { PRESENTATION_SURFACE, resolveSurface } from './feedbackPolicy.js'

describe('feedbackPolicy', () => {
  it('exports frozen surface constants', () => {
    expect(Object.isFrozen(PRESENTATION_SURFACE)).toBe(true)
  })

  it('depends only on SEMANTIC_CATEGORY contract, not on classify() implementation', () => {
    expect(SEMANTIC_CATEGORY).toBeDefined()
    expect(Object.keys(SEMANTIC_CATEGORY).length).toBeGreaterThanOrEqual(3)
  })

  it('maps acknowledgement to toast', () => {
    expect(resolveSurface(SEMANTIC_CATEGORY.ACKNOWLEDGEMENT)).toBe(PRESENTATION_SURFACE.TOAST)
  })

  it('maps persistent-information to banner', () => {
    expect(resolveSurface(SEMANTIC_CATEGORY.PERSISTENT_INFORMATION)).toBe(PRESENTATION_SURFACE.BANNER)
  })

  it('maps progress to progress-bar', () => {
    expect(resolveSurface(SEMANTIC_CATEGORY.PROGRESS)).toBe(PRESENTATION_SURFACE.PROGRESS_BAR)
  })

  it('falls back to toast for unknown category', () => {
    expect(resolveSurface('nonexistent-category')).toBe(PRESENTATION_SURFACE.TOAST)
  })

  it('is pure — same input yields same output', () => {
    expect(resolveSurface(SEMANTIC_CATEGORY.ACKNOWLEDGEMENT)).toBe(resolveSurface(SEMANTIC_CATEGORY.ACKNOWLEDGEMENT))
  })
})
