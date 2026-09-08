import { beforeEach, describe, expect, it, vi } from 'vitest'

const registeredHandlers = new Map()
const registerHandlerMock = vi.fn((action, handler) => registeredHandlers.set(action, handler))
const translateTextHandler = vi.fn()
const settingsUpdatedHandler = vi.fn()
const loggerWarnMock = vi.hoisted(() => vi.fn())
const loggerDebugMock = vi.hoisted(() => vi.fn())

vi.mock('webextension-polyfill', () => ({ default: {} }))
vi.mock('@/core/background/feature-loader.js', () => ({ featureLoader: {} }))
vi.mock('@/features/translation/core/translation-engine.js', () => ({ TranslationEngine: vi.fn() }))
vi.mock('@/shared/messaging/core/MessageHandler.js', () => ({
  createMessageHandler: () => ({ registerHandler: registerHandlerMock, isListenerActive: false })
}))
vi.mock('@/core/background/handlers/index.js', async (importOriginal) => ({
  ...await importOriginal(),
  handleTranslateTextLazy: translateTextHandler,
  handleSettingsUpdatedLazy: settingsUpdatedHandler,
  handlerNamespaceMetadata: { source: 'test' }
}))
vi.mock('@/shared/logging/logger.js', () => ({
  getScopedLogger: () => ({ debug: loggerDebugMock, info: vi.fn(), warn: loggerWarnMock, error: vi.fn() })
}))
vi.mock('@/core/browserHandlers.js', () => ({ addBrowserSpecificHandlers: vi.fn() }))
vi.mock('@/utils/UtilsFactory.js', () => ({ utilsFactory: {} }))

const { MessageActions } = await import('@/shared/messaging/core/MessageActions.js')
const Handlers = await import('@/core/background/handlers/index.js')
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
    expect(registeredHandlers.get(MessageActions.SETTINGS_UPDATED)).toBe(settingsUpdatedHandler)
    expect(registeredHandlers.get(MessageActions.IFRAME_SELECT_ELEMENT_FINISHED)).toEqual(expect.any(Function))
    expect(registeredHandlers.get(MessageActions.SELECT_ELEMENT_FRAME_READY)).toEqual(expect.any(Function))
    expect(registeredHandlers.has(MessageActions.TRANSLATION_RESULT_UPDATE)).toBe(false)
    expect(registeredHandlers.has('providerStatus')).toBe(false)
    expect(registerHandlerMock.mock.calls.filter(([action]) => action === MessageActions.TRANSLATE_TEXT)).toHaveLength(1)
    expect(registerHandlerMock.mock.calls.filter(([action]) => action === 'translateText')).toHaveLength(1)
    expect(registerHandlerMock.mock.calls.filter(([action]) => action === MessageActions.SELECT_ELEMENT_FRAME_READY)).toHaveLength(1)
  })

  it('keeps refresh action registered without an undefined action mapping', () => {
    const manager = new LifecycleManager()
    manager.registerMessageHandlers()

    expect(registeredHandlers.get(MessageActions.REFRESH_CONTEXT_MENUS)).toEqual(expect.any(Function))
    expect(registeredHandlers.has('undefined')).toBe(false)
  })

  it('does not register live-dubbing routes in Firefox builds', () => {
    vi.stubGlobal('__BROWSER__', 'firefox')
    const manager = new LifecycleManager()

    manager.registerMessageHandlers()

    expect(registeredHandlers.has(MessageActions.START_LIVE_DUBBING)).toBe(false)
    expect(registeredHandlers.has(MessageActions.STOP_LIVE_DUBBING)).toBe(false)
    expect(registeredHandlers.has(MessageActions.GET_LIVE_DUBBING_STATUS)).toBe(false)
    vi.unstubAllGlobals()
  })
})

describe('LifecycleManager legacy Select Element handler removal', () => {
  const LAZY_SELECT_ELEMENT_HANDLERS = [
    'handleActivateSelectElementModeLazy',
    'handleDeactivateSelectElementModeLazy',
    'handleSetSelectElementStateLazy',
    'handleGetSelectElementStateLazy',
    'handleIframeSelectElementFinishedLazy',
    'handleSelectElementFrameReadyLazy'
  ]

  beforeEach(() => {
    registeredHandlers.clear()
    registerHandlerMock.mockClear()
  })

  it('no longer exports the legacy handleSelectElement while keeping lazy routing', async () => {
    const Handlers = await import('@/core/background/handlers/index.js')

    expect('handleSelectElement' in Handlers).toBe(false)
    for (const name of LAZY_SELECT_ELEMENT_HANDLERS) {
      expect(Handlers[name]).toEqual(expect.any(Function))
    }
  })

  it('registration leaves no unmapped legacy handleSelectElement warning source', async () => {
    const Handlers = await import('@/core/background/handlers/index.js')
    const manager = new LifecycleManager()
    manager.registerMessageHandlers()

    const mappedHandlers = new Set(registerHandlerMock.mock.calls.map(([, handler]) => handler))
    const unmappedNames = Object.entries(Handlers)
      .filter(([, value]) => typeof value === 'function' && !mappedHandlers.has(value))
      .map(([name]) => name)

    expect(unmappedNames).not.toContain('handleSelectElement')
    for (const name of LAZY_SELECT_ELEMENT_HANDLERS) {
      expect(mappedHandlers.has(Handlers[name])).toBe(true)
    }
  })
})

describe('LifecycleManager handler mapping validation', () => {
  beforeEach(() => {
    loggerWarnMock.mockClear()
    loggerDebugMock.mockClear()
  })

  it('ignores non-function namespace exports', () => {
    const firstFunction = Object.values(Handlers).find((handler) => typeof handler === 'function')
    const manager = new LifecycleManager()

    manager.validateHandlerMappings({ mapped: firstFunction })

    expect(loggerWarnMock).toHaveBeenCalledTimes(1)
    expect(loggerWarnMock.mock.calls[0][0]).not.toContain('handlerNamespaceMetadata')
  })

  it('warns with unmapped function export names as one string argument', () => {
    const manager = new LifecycleManager()

    manager.validateHandlerMappings({})

    expect(loggerWarnMock).toHaveBeenCalledTimes(1)
    const [message, ...extraArguments] = loggerWarnMock.mock.calls[0]
    expect(message).toContain('Unmapped handlers detected (consider adding to handlerMappings):')
    expect(message).toContain('handleTranslateTextLazy')
    expect(extraArguments).toHaveLength(0)
  })

  it('does not warn when all function exports are mapped', () => {
    const allFunctionMappings = Object.fromEntries(
      Object.entries(Handlers)
        .filter(([, handler]) => typeof handler === 'function')
        .map(([name, handler]) => [name, handler])
    )
    const manager = new LifecycleManager()

    manager.validateHandlerMappings(allFunctionMappings)

    expect(loggerWarnMock).not.toHaveBeenCalled()
  })
})

describe('LifecycleManager context menu refresh failures', () => {
  it('propagates context menu refresh failure after emergency fallback', async () => {
    const manager = new LifecycleManager()
    const error = new Error('context menu setup failed')
    manager.featureLoader = {
      loadContextMenuManager: vi.fn().mockRejectedValue(error)
    }
    manager.createContextMenuDirectly = vi.fn().mockResolvedValue(undefined)

    await expect(manager.refreshContextMenus()).rejects.toBe(error)
    expect(manager.createContextMenuDirectly).toHaveBeenCalledOnce()
  })
})
