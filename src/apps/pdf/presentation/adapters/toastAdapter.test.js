import { describe, expect, it, vi } from 'vitest'

import { createToastAdapter } from './toastAdapter.js'

function createMockToast() {
  return {
    success: vi.fn(),
    error: vi.fn(),
    warning: vi.fn(),
    info: vi.fn()
  }
}

describe('Toast Adapter', () => {
  it('shows toast for export-completed (txt)', () => {
    const toast = createMockToast()
    const adapter = createToastAdapter({ toast })

    adapter.dispatch({ type: 'export-completed', format: 'txt' })

    expect(toast.success).toHaveBeenCalledWith('TXT exported successfully')
  })

  it('shows toast for export-completed (markdown)', () => {
    const toast = createMockToast()
    const adapter = createToastAdapter({ toast })

    adapter.dispatch({ type: 'export-completed', format: 'markdown' })

    expect(toast.success).toHaveBeenCalledWith('Markdown exported successfully')
  })

  it('shows toast for export-completed (html)', () => {
    const toast = createMockToast()
    const adapter = createToastAdapter({ toast })

    adapter.dispatch({ type: 'export-completed', format: 'html' })

    expect(toast.success).toHaveBeenCalledWith('HTML exported successfully')
  })

  it('shows toast for export-failed with explicit error', () => {
    const toast = createMockToast()
    const adapter = createToastAdapter({ toast })

    adapter.dispatch({ type: 'export-failed', error: 'Disk full' })

    expect(toast.error).toHaveBeenCalledWith('Disk full')
  })

  it('shows fallback message for export-failed without error', () => {
    const toast = createMockToast()
    const adapter = createToastAdapter({ toast })

    adapter.dispatch({ type: 'export-failed' })

    expect(toast.error).toHaveBeenCalledWith('Export failed')
  })

  it('shows toast for ocr-language-missing', () => {
    const toast = createMockToast()
    const adapter = createToastAdapter({ toast })

    adapter.dispatch({ type: 'ocr-language-missing' })

    expect(toast.error).toHaveBeenCalledWith(
      'No OCR language is installed. Open Manage Languages from the OCR menu to download one.'
    )
  })

  it('shows toast for ocr-failed', () => {
    const toast = createMockToast()
    const adapter = createToastAdapter({ toast })

    adapter.dispatch({ type: 'ocr-failed' })

    expect(toast.error).toHaveBeenCalledWith('OCR failed. Please try again.')
  })

  it('shows toast for region-ocr-no-text', () => {
    const toast = createMockToast()
    const adapter = createToastAdapter({ toast })

    adapter.dispatch({ type: 'region-ocr-no-text' })

    expect(toast.warning).toHaveBeenCalledWith('No text found in the selected region.')
  })

  it('shows toast for region-ocr-failed', () => {
    const toast = createMockToast()
    const adapter = createToastAdapter({ toast })

    adapter.dispatch({ type: 'region-ocr-failed' })

    expect(toast.error).toHaveBeenCalledWith('Region OCR failed. Please try another region.')
  })

  it('does not show toast for ocr-completed', () => {
    const toast = createMockToast()
    const adapter = createToastAdapter({ toast })

    adapter.dispatch({ type: 'ocr-completed' })

    expect(toast.success).not.toHaveBeenCalled()
    expect(toast.error).not.toHaveBeenCalled()
    expect(toast.warning).not.toHaveBeenCalled()
    expect(toast.info).not.toHaveBeenCalled()
  })

  it('does not show toast for region-ocr-completed', () => {
    const toast = createMockToast()
    const adapter = createToastAdapter({ toast })

    adapter.dispatch({ type: 'region-ocr-completed' })

    expect(toast.success).not.toHaveBeenCalled()
    expect(toast.error).not.toHaveBeenCalled()
    expect(toast.warning).not.toHaveBeenCalled()
    expect(toast.info).not.toHaveBeenCalled()
  })

  it('does not show toast for page-ocr-complete', () => {
    const toast = createMockToast()
    const adapter = createToastAdapter({ toast })

    adapter.dispatch({ type: 'page-ocr-complete' })

    expect(toast.success).not.toHaveBeenCalled()
    expect(toast.error).not.toHaveBeenCalled()
    expect(toast.warning).not.toHaveBeenCalled()
    expect(toast.info).not.toHaveBeenCalled()
  })

  it('does not show toast for unknown result type', () => {
    const toast = createMockToast()
    const adapter = createToastAdapter({ toast })

    adapter.dispatch({ type: 'nonexistent-type' })

    expect(toast.success).not.toHaveBeenCalled()
    expect(toast.error).not.toHaveBeenCalled()
    expect(toast.warning).not.toHaveBeenCalled()
    expect(toast.info).not.toHaveBeenCalled()
  })

  it('does not show toast for null result', () => {
    const toast = createMockToast()
    const adapter = createToastAdapter({ toast })

    adapter.dispatch(null)

    expect(toast.success).not.toHaveBeenCalled()
    expect(toast.error).not.toHaveBeenCalled()
    expect(toast.warning).not.toHaveBeenCalled()
    expect(toast.info).not.toHaveBeenCalled()
  })

  it('propagates error when toast throws', () => {
    const error = new Error('Toast unavailable')
    const toast = { success: () => { throw error }, error: vi.fn(), warning: vi.fn(), info: vi.fn() }
    const adapter = createToastAdapter({ toast })

    expect(() => adapter.dispatch({ type: 'export-completed', format: 'txt' }))
      .toThrow(error)
  })

  it('returns frozen adapter', () => {
    const adapter = createToastAdapter({ toast: createMockToast() })

    expect(Object.isFrozen(adapter)).toBe(true)
  })

  it('uses injected toast dependency', () => {
    const toast = createMockToast()
    const adapter = createToastAdapter({ toast })

    adapter.dispatch({ type: 'export-completed', format: 'txt' })
    adapter.dispatch({ type: 'ocr-failed' })

    expect(toast.success).toHaveBeenCalledTimes(1)
    expect(toast.error).toHaveBeenCalledTimes(1)
  })

  it('throws when created without toast API', () => {
    expect(() => createToastAdapter()).toThrow(TypeError)
  })
})
