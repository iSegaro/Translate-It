import { beforeEach, describe, expect, it, vi } from 'vitest'

const registeredHandlers = new Map()
const registerHandlerMock = vi.fn((action, handler) => registeredHandlers.set(action, handler))
const translateTextHandler = vi.fn()

vi.mock('webextension-polyfill', () => ({ default: {} }))
vi.mock('@/core/background/feature-loader.js', () => ({ featureLoader: {} }))
vi.mock('@/features/translation/core/translation-engine.js', () => ({ TranslationEngine: vi.fn() }))
vi.mock('@/shared/messaging/core/MessageHandler.js', () => ({
  createMessageHandler: () => ({ registerHandler: registerHandlerMock, isListenerActive: false })
}))
vi.mock('@/core/background/handlers/index.js', async (importOriginal) => ({
  ...await importOriginal(),
  handleTranslateTextLazy: translateTextHandler
}))
vi.mock('@/shared/logging/logger.js', () => ({
  getScopedLogger: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() })
}))
vi.mock('@/core/browserHandlers.js', () => ({ addBrowserSpecificHandlers: vi.fn() }))
vi.mock('@/utils/UtilsFactory.js', () => ({ utilsFactory: {} }))

const { MessageActions } = await import('@/shared/messaging/core/MessageActions.js')
const { LifecycleManager } = await import('./LifecycleManager.js')

describe('LifecycleManager translation text routing', () => {
  beforeEach(() => {
    registeredHandlers.clear()
    registerHandlerMock.mockClear()
  })

  it('routes enum and legacy actions through the same handler without duplicate registration', () => {
    const manager = new LifecycleManager()
    manager.registerMessageHandlers()

    expect(registeredHandlers.get(MessageActions.TRANSLATE_TEXT)).toBe(translateTextHandler)
    expect(registeredHandlers.get('translateText')).toBe(translateTextHandler)
    expect(registerHandlerMock.mock.calls.filter(([action]) => action === MessageActions.TRANSLATE_TEXT)).toHaveLength(1)
    expect(registerHandlerMock.mock.calls.filter(([action]) => action === 'translateText')).toHaveLength(1)
  })
})
