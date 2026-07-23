import { describe, expect, it } from 'vitest'

import {
  COMPARISON_RESULTS,
  LOCAL_RESULTS,
  EXPORT_RESULTS,
  OCR_RESULTS,
  REGION_OCR_RESULTS,
  TRANSLATION_RESULTS
} from './operationResults.js'

describe('operationResults', () => {
  it('exports all result type groups as frozen objects', () => {
    expect(Object.isFrozen(EXPORT_RESULTS)).toBe(true)
    expect(Object.isFrozen(COMPARISON_RESULTS)).toBe(true)
    expect(Object.isFrozen(OCR_RESULTS)).toBe(true)
    expect(Object.isFrozen(REGION_OCR_RESULTS)).toBe(true)
    expect(Object.isFrozen(TRANSLATION_RESULTS)).toBe(true)
    expect(Object.isFrozen(LOCAL_RESULTS)).toBe(true)
  })

  it('export results include completed and failed', () => {
    expect(EXPORT_RESULTS.COMPLETED).toBe('export-completed')
    expect(EXPORT_RESULTS.FAILED).toBe('export-failed')
  })

  it('comparison results include completed, failed, and progress', () => {
    expect(COMPARISON_RESULTS.COMPLETED).toBe('comparison-completed')
    expect(COMPARISON_RESULTS.FAILED).toBe('comparison-failed')
    expect(COMPARISON_RESULTS.PROGRESS).toBe('comparison-progress')
  })

  it('ocr results include completed, failed, language-missing, and progress', () => {
    expect(OCR_RESULTS.COMPLETED).toBe('ocr-completed')
    expect(OCR_RESULTS.FAILED).toBe('ocr-failed')
    expect(OCR_RESULTS.LANGUAGE_MISSING).toBe('ocr-language-missing')
    expect(OCR_RESULTS.PROGRESS).toBe('ocr-progress')
  })

  it('region ocr results include completed, failed, no-text, and progress', () => {
    expect(REGION_OCR_RESULTS.COMPLETED).toBe('region-ocr-completed')
    expect(REGION_OCR_RESULTS.FAILED).toBe('region-ocr-failed')
    expect(REGION_OCR_RESULTS.NO_TEXT).toBe('region-ocr-no-text')
    expect(REGION_OCR_RESULTS.PROGRESS).toBe('region-ocr-progress')
  })

  it('translation results include progress and partial', () => {
    expect(TRANSLATION_RESULTS.PROGRESS).toBe('translation-progress')
    expect(TRANSLATION_RESULTS.PARTIAL).toBe('translation-partial')
  })

  it('local results include pane, page, and block types', () => {
    expect(LOCAL_RESULTS.PANE_EMPTY).toBe('pane-empty')
    expect(LOCAL_RESULTS.PAGE_OCR_COMPLETE).toBe('page-ocr-complete')
    expect(LOCAL_RESULTS.BLOCK_LOADING).toBe('block-translation-loading')
    expect(LOCAL_RESULTS.BLOCK_ERROR).toBe('block-translation-error')
  })
})
