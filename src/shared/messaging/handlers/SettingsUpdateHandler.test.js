import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MessageHandler } from '@/shared/messaging/core/MessageHandler.js'
import { MessageActions } from '@/shared/messaging/core/MessageActions.js'

const mocks = vi.hoisted(() => ({
  addListener: vi.fn(),
  removeListener: vi.fn(),
  refreshSettings: vi.fn()
}))

vi.mock('webextension-polyfill', () => ({
  default: {
    runtime: {
      onMessage: {
        addListener: mocks.addListener,
        removeListener: mocks.removeListener
      }
    }
  }
}))

vi.mock('@/shared/managers/SettingsManager.js', () => ({
  settingsManager: {
    refreshSettings: mocks.refreshSettings
  },
  default: {
    refreshSettings: mocks.refreshSettings
  }
}))

vi.mock('@/shared/logging/logger.js', () => ({
  getScopedLogger: () => ({
    debug: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn()
  })
}))

vi.mock('@/shared/logging/logConstants.js', () => ({
  LOG_COMPONENTS: { MESSAGING: 'messaging' }
}))

describe('SettingsUpdateHandler router ownership', () => {
  let previousBrowser

  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    mocks.refreshSettings.mockResolvedValue(undefined)
    previousBrowser = globalThis.browser
    globalThis.browser = {
      runtime: {
        onMessage: {
          addListener: mocks.addListener,
          removeListener: mocks.removeListener
        }
      }
    }
  })

  afterEach(() => {
    if (previousBrowser === undefined) {
      delete globalThis.browser
    } else {
      globalThis.browser = previousBrowser
    }
  })

  it('does not register a runtime listener when imported', async () => {
    await import('./SettingsUpdateHandler.js')

    expect(mocks.addListener).not.toHaveBeenCalled()
  })

  it('refreshes once per sequential canonical routed message', async () => {
    const { handleSettingsUpdatedLazy } = await import('@/core/background/handlers/lazy/handleCommonLazy.js')
    const handler = new MessageHandler()
    const sendResponse = vi.fn()
    handler.registerHandler(MessageActions.SETTINGS_UPDATED, handleSettingsUpdatedLazy)
    handler.listen()

    expect(mocks.addListener).toHaveBeenCalledTimes(1)

    await handler._handleMessage({ action: MessageActions.SETTINGS_UPDATED }, {}, sendResponse)
    expect(mocks.refreshSettings).toHaveBeenCalledTimes(1)
    expect(sendResponse).toHaveBeenCalledTimes(1)
    expect(mocks.addListener).toHaveBeenCalledTimes(1)

    await handler._handleMessage({ action: MessageActions.SETTINGS_UPDATED }, {}, sendResponse)
    expect(mocks.refreshSettings).toHaveBeenCalledTimes(2)
    expect(sendResponse).toHaveBeenCalledTimes(2)
    expect(mocks.addListener).toHaveBeenCalledTimes(1)
  })

  it('does not refresh settings for unrelated actions', async () => {
    const { handleSettingsUpdatedLazy } = await import('@/core/background/handlers/lazy/handleCommonLazy.js')
    const handler = new MessageHandler()
    handler.registerHandler(MessageActions.SETTINGS_UPDATED, handleSettingsUpdatedLazy)

    expect(handler._handleMessage({ action: 'UNRELATED_ACTION' }, {}, vi.fn())).toBe(false)
    expect(mocks.refreshSettings).not.toHaveBeenCalled()
  })
})
