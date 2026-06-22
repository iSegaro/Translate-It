import { describe, expect, it, vi, beforeEach } from 'vitest'

const mockEmit = vi.fn()
const mockOn = vi.fn()
const mockOff = vi.fn()

vi.mock('@/core/PageEventBus.js', () => ({
  pageEventBus: {
    emit: mockEmit,
    on: mockOn,
    off: mockOff
  }
}))

vi.mock('@/shared/messaging/core/UnifiedMessaging.js', () => ({
  sendRegularMessage: vi.fn()
}))

vi.mock('@/shared/config/config.js', () => ({
  TranslationMode: {
    Selection: 'selection-manager',
    Field: 'content'
  }
}))

const { usePdfSelectionAction } = await import('./usePdfSelectionAction.js')
const { sendRegularMessage } = await import('@/shared/messaging/core/UnifiedMessaging.js')

describe('usePdfSelectionAction', () => {
  let action

  beforeEach(() => {
    vi.clearAllMocks()
    action = usePdfSelectionAction()
  })

  it('starts listening to selection events', () => {
    action.start()

    expect(mockOn).toHaveBeenCalledWith('global-selection-change', expect.any(Function))
    expect(mockOn).toHaveBeenCalledWith('global-selection-clear', expect.any(Function))
  })

  it('shows action state on GLOBAL_SELECTION_CHANGE with valid text', () => {
    action.start()

    const handler = mockOn.mock.calls.find(
      (call) => call[0] === 'global-selection-change'
    )?.[1]

    handler({
      text: 'Hello world',
      position: { x: 100, y: 200, width: 50, height: 12 }
    })

    expect(action.isSelected.value).toBe(true)
    expect(action.selectedText.value).toBe('Hello world')
    expect(action.selectionPosition.value).toEqual({ x: 100, y: 200, width: 50, height: 12 })
  })

  it('ignores empty selection', () => {
    action.start()

    const handler = mockOn.mock.calls.find(
      (call) => call[0] === 'global-selection-change'
    )?.[1]

    handler({ text: '', position: { x: 0, y: 0, width: 0, height: 0 } })
    expect(action.isSelected.value).toBe(false)

    handler({ text: '   ', position: { x: 0, y: 0, width: 0, height: 0 } })
    expect(action.isSelected.value).toBe(false)
  })

  it('ignores selection without position', () => {
    action.start()

    const handler = mockOn.mock.calls.find(
      (call) => call[0] === 'global-selection-change'
    )?.[1]

    handler({ text: 'Hello' })
    expect(action.isSelected.value).toBe(false)
  })

  it('dismisses on GLOBAL_SELECTION_CLEAR', () => {
    action.start()

    const changeHandler = mockOn.mock.calls.find(
      (call) => call[0] === 'global-selection-change'
    )?.[1]
    changeHandler({ text: 'Hello', position: { x: 0, y: 0, width: 0, height: 0 } })
    expect(action.isSelected.value).toBe(true)

    const clearHandler = mockOn.mock.calls.find(
      (call) => call[0] === 'global-selection-clear'
    )?.[1]
    clearHandler()

    expect(action.isSelected.value).toBe(false)
    expect(action.selectedText.value).toBe('')
  })

  it('prevents stale result after new selection', () => {
    action.start()

    const handler = mockOn.mock.calls.find(
      (call) => call[0] === 'global-selection-change'
    )?.[1]

    action.translatedText.value = 'Old result'
    action.translationError.value = 'Old error'

    handler({ text: 'New selection', position: { x: 0, y: 0, width: 0, height: 0 } })

    expect(action.translatedText.value).toBe('')
    expect(action.translationError.value).toBe('')
  })

  it('translateSelection sends correct TranslationMode', async () => {
    sendRegularMessage.mockResolvedValue({
      success: true,
      translatedText: 'Hola mundo'
    })

    action.start()
    const handler = mockOn.mock.calls.find(
      (call) => call[0] === 'global-selection-change'
    )?.[1]
    handler({ text: 'Hello world', position: { x: 0, y: 0, width: 0, height: 0 } })

    await action.translateSelection()

    expect(sendRegularMessage).toHaveBeenCalledWith({
      action: 'TRANSLATE',
      data: {
        text: 'Hello world',
        mode: 'selection-manager'
      }
    })
    expect(action.translatedText.value).toBe('Hola mundo')
  })

  it('translateSelection handles error response', async () => {
    sendRegularMessage.mockResolvedValue({
      success: false,
      error: { message: 'Provider unavailable' }
    })

    action.start()
    const handler = mockOn.mock.calls.find(
      (call) => call[0] === 'global-selection-change'
    )?.[1]
    handler({ text: 'Hello', position: { x: 0, y: 0, width: 0, height: 0 } })

    await action.translateSelection()

    expect(action.translationError.value).toBe('Provider unavailable')
    expect(action.translatedText.value).toBe('')
  })

  it('translateSelection handles thrown error', async () => {
    sendRegularMessage.mockRejectedValue(new Error('Network error'))

    action.start()
    const handler = mockOn.mock.calls.find(
      (call) => call[0] === 'global-selection-change'
    )?.[1]
    handler({ text: 'Hello', position: { x: 0, y: 0, width: 0, height: 0 } })

    await action.translateSelection()

    expect(action.translationError.value).toBe('Network error')
  })

  it('dismiss resets all state', () => {
    action.start()
    const handler = mockOn.mock.calls.find(
      (call) => call[0] === 'global-selection-change'
    )?.[1]
    handler({ text: 'Hello', position: { x: 0, y: 0, width: 0, height: 0 } })
    action.translatedText.value = 'Result'

    action.dismiss()

    expect(action.isSelected.value).toBe(false)
    expect(action.selectedText.value).toBe('')
    expect(action.translatedText.value).toBe('')
  })

  it('stop removes event listeners', () => {
    action.start()
    action.stop()

    expect(mockOff).toHaveBeenCalledWith('global-selection-change', expect.any(Function))
    expect(mockOff).toHaveBeenCalledWith('global-selection-clear', expect.any(Function))
  })

  it('does not translate when already translating', async () => {
    let resolvePromise
    sendRegularMessage.mockImplementation(() => new Promise((resolve) => { resolvePromise = resolve }))

    action.start()
    const handler = mockOn.mock.calls.find(
      (call) => call[0] === 'global-selection-change'
    )?.[1]
    handler({ text: 'Hello', position: { x: 0, y: 0, width: 0, height: 0 } })

    const firstCall = action.translateSelection()
    const secondCall = action.translateSelection()

    resolvePromise({ success: true, translatedText: 'Done' })
    await firstCall
    await secondCall

    expect(sendRegularMessage).toHaveBeenCalledTimes(1)
  })
})
