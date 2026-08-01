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
  it('shows acknowledgement success', () => {
    const toast = createMockToast()
    const adapter = createToastAdapter({ toast })

    adapter.dispatch({ intent: 'acknowledgement', severity: 'success', message: 'TXT exported successfully' })

    expect(toast.success).toHaveBeenCalledWith('TXT exported successfully')
  })

  it('shows acknowledgement error', () => {
    const toast = createMockToast()
    const adapter = createToastAdapter({ toast })

    adapter.dispatch({ intent: 'acknowledgement', severity: 'error', message: 'Disk full' })

    expect(toast.error).toHaveBeenCalledWith('Disk full')
  })

  it('shows acknowledgement warning', () => {
    const toast = createMockToast()
    const adapter = createToastAdapter({ toast })

    adapter.dispatch({ intent: 'acknowledgement', severity: 'warning', message: 'No text found' })

    expect(toast.warning).toHaveBeenCalledWith('No text found')
  })

  it('does nothing for non-acknowledgement intent', () => {
    const toast = createMockToast()
    const adapter = createToastAdapter({ toast })

    adapter.dispatch({ intent: 'outcome', notification: {} })

    expect(toast.success).not.toHaveBeenCalled()
    expect(toast.error).not.toHaveBeenCalled()
    expect(toast.warning).not.toHaveBeenCalled()
  })

  it('does nothing when severity is missing', () => {
    const toast = createMockToast()
    const adapter = createToastAdapter({ toast })

    adapter.dispatch({ intent: 'acknowledgement', message: 'Hello' })

    expect(toast.success).not.toHaveBeenCalled()
  })

  it('does nothing when message is missing', () => {
    const toast = createMockToast()
    const adapter = createToastAdapter({ toast })

    adapter.dispatch({ intent: 'acknowledgement', severity: 'error' })

    expect(toast.success).not.toHaveBeenCalled()
  })

  it('does nothing for null input', () => {
    const toast = createMockToast()
    const adapter = createToastAdapter({ toast })

    adapter.dispatch(null)

    expect(toast.success).not.toHaveBeenCalled()
  })

  it('propagates error when toast throws', () => {
    const error = new Error('Toast unavailable')
    const toast = { success: () => { throw error }, error: vi.fn(), warning: vi.fn(), info: vi.fn() }
    const adapter = createToastAdapter({ toast })

    expect(() => adapter.dispatch({ intent: 'acknowledgement', severity: 'success', message: 'Hello' }))
      .toThrow(error)
  })

  it('returns frozen adapter', () => {
    const adapter = createToastAdapter({ toast: createMockToast() })
    expect(Object.isFrozen(adapter)).toBe(true)
  })

  it('ignores unknown severity', () => {
    const toast = createMockToast()
    const adapter = createToastAdapter({ toast })

    adapter.dispatch({ intent: 'acknowledgement', severity: 'unknown_severity', message: 'Hello' })

    expect(toast.success).not.toHaveBeenCalled()
    expect(toast.error).not.toHaveBeenCalled()
  })

  it('throws when created without toast API', () => {
    expect(() => createToastAdapter()).toThrow(TypeError)
  })
})
