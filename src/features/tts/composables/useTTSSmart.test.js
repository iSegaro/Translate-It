import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp, h, isProxy, isReactive, reactive } from 'vue'
import { MessageActions } from '@/shared/messaging/core/MessageActions.js'
import { useTTSSmart } from './useTTSSmart.js'

const { sendMessageMock } = vi.hoisted(() => ({
  sendMessageMock: vi.fn()
}))

vi.mock('@/shared/messaging/core/UnifiedMessaging.js', () => ({
  sendMessage: sendMessageMock
}))

vi.mock('@/shared/logging/logger.js', () => ({
  getScopedLogger: () => ({
    debug: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn()
  })
}))

vi.mock('@/core/extensionContext.js', () => ({
  default: {
    handleContextError: vi.fn(),
    isContextError: vi.fn(() => false)
  }
}))

describe('useTTSSmart', () => {
  let app
  const apps = []

  const mountComposable = () => {
    let composable
    const host = document.createElement('div')

    app = createApp({
      setup() {
        composable = useTTSSmart()
        return () => h('div')
      }
    })
    app.mount(host)
    apps.push(app)

    return composable
  }

  const getSpeakMessage = () => sendMessageMock.mock.calls[1][0]

  beforeEach(() => {
    sendMessageMock.mockReset().mockResolvedValue({ success: true })
  })

  afterEach(() => {
    apps.forEach((mountedApp) => mountedApp.unmount())
    apps.length = 0
    app = null
    vi.unstubAllGlobals()
  })

  it('snapshots reactive preferred voices before sending the TTS message', async () => {
    const composable = mountComposable()
    const preferredVoices = reactive({
      en: {
        engine: 'edge',
        voice: 'en-US-AriaNeural',
        options: { gender: 'female', region: 'US' }
      },
      fa: {
        engine: 'google',
        voice: 'fa'
      }
    })

    await expect(composable.speak('Preview text', 'auto', {
      engine: 'edge',
      preferredVoices
    })).resolves.toBe(true)

    const message = getSpeakMessage()
    const sentPreferredVoices = message.data.preferredVoices

    expect(message).toMatchObject({
      action: MessageActions.GOOGLE_TTS_SPEAK,
      context: 'tts-smart',
      data: {
        text: 'Preview text',
        language: 'auto',
        engine: 'edge'
      }
    })
    expect(message.messageId).toMatch(/^tts-speak-tts_/)
    expect(message.data.ttsId).toMatch(/^tts_/)
    expect(sentPreferredVoices).toEqual({
      en: {
        engine: 'edge',
        voice: 'en-US-AriaNeural',
        options: { gender: 'female', region: 'US' }
      },
      fa: {
        engine: 'google',
        voice: 'fa'
      }
    })
    expect(sentPreferredVoices).not.toBe(preferredVoices)
    expect(isProxy(sentPreferredVoices)).toBe(false)
    expect(isReactive(sentPreferredVoices)).toBe(false)
    expect(isProxy(sentPreferredVoices.en)).toBe(false)
    expect(Object.getPrototypeOf(sentPreferredVoices)).toBe(Object.prototype)
    expect(() => structuredClone(sentPreferredVoices)).not.toThrow()
  })

  it('keeps undefined preferred voices valid in the payload', async () => {
    const composable = mountComposable()

    await expect(composable.speak('Preview text', 'auto', {
      engine: 'google',
      preferredVoices: undefined
    })).resolves.toBe(true)

    const message = getSpeakMessage()

    expect(message.data).toHaveProperty('preferredVoices', undefined)
    expect(message.data.engine).toBe('google')
    expect(message.action).toBe(MessageActions.GOOGLE_TTS_SPEAK)
  })

  it('serializes rapid requests, cancels a displaced start, and ignores unrelated terminal messages', async () => {
    const listeners = new Set()
    vi.stubGlobal('browser', {
      runtime: {
        onMessage: {
          addListener: vi.fn((listener) => listeners.add(listener)),
          removeListener: vi.fn((listener) => listeners.delete(listener)),
        },
      },
    })
    let resolveFirstStart
    sendMessageMock.mockImplementation((message) => {
      if (message.action === MessageActions.GOOGLE_TTS_SPEAK && !resolveFirstStart) {
        return new Promise((resolve) => { resolveFirstStart = resolve })
      }
      return Promise.resolve({ success: true })
    })
    const first = mountComposable()
    const second = mountComposable()

    const firstSpeak = first.speak('source', 'auto')
    await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
    const firstId = first.currentTTSId.value
    expect(sendMessageMock.mock.calls.map(([message]) => message.action)).toEqual([
      MessageActions.TTS_STOP, MessageActions.GOOGLE_TTS_SPEAK,
    ])

    const secondSpeak = second.speak('translated', 'auto')
    expect(first.ttsState.value).toBe('idle')
    resolveFirstStart({ success: true })
    await expect(firstSpeak).resolves.toBe(false)
    await expect(secondSpeak).resolves.toBe(true)

    const messages = sendMessageMock.mock.calls.map(([message]) => message)
    const cancel = messages.find((message) =>
      message.action === MessageActions.TTS_STOP && message.data?.ttsId === firstId,
    )
    expect(cancel).toMatchObject({
      action: MessageActions.TTS_STOP,
      data: { ttsId: firstId, stopOnlyIfOwner: true },
    })
    const starts = messages.filter((message) => message.action === MessageActions.GOOGLE_TTS_SPEAK)
    expect(starts.map((message) => message.data.text)).toEqual(['source', 'translated'])
    expect(second.ttsState.value).toBe('playing')

    const secondId = second.currentTTSId.value
    listeners.forEach((listener) => listener({ action: MessageActions.GOOGLE_TTS_ENDED, status: 'error' }))
    expect(second.ttsState.value).toBe('playing')
    second.currentTTSId.value = secondId
    // A tagged completion for the displaced request cannot affect the winner.
    listeners.forEach((listener) => listener({
      action: MessageActions.GOOGLE_TTS_ENDED, ttsId: firstId, status: 'completed',
    }))
    expect(second.ttsState.value).toBe('playing')
  })

  it('hands off a deferred stop to the latest request before dispatching a start', async () => {
    let releaseStop
    sendMessageMock.mockImplementationOnce(() => new Promise((resolve) => { releaseStop = resolve }))
    const first = mountComposable()
    const second = mountComposable()

    const firstSpeak = first.speak('source', 'auto')
    while (!releaseStop) await Promise.resolve()
    const secondSpeak = second.speak('translated', 'auto')
    releaseStop({ success: true })

    await expect(firstSpeak).resolves.toBe(false)
    await expect(secondSpeak).resolves.toBe(true)
    expect(sendMessageMock.mock.calls
      .filter(([message]) => message.action === MessageActions.GOOGLE_TTS_SPEAK)
      .map(([message]) => message.data.text)).toEqual(['translated'])
  })

  it('does not dispatch a pending request after its owner unmounts', async () => {
    const releaseStops = []
    sendMessageMock.mockImplementation((message) => message.action === MessageActions.TTS_STOP
      ? new Promise((resolve) => { releaseStops.push(resolve) })
      : Promise.resolve({ success: true }))
    const composable = mountComposable()
    const pendingSpeak = composable.speak('text', 'auto')
    while (!releaseStops.length) await Promise.resolve()
    apps[apps.length - 1].unmount()
    releaseStops.forEach((release) => release({ success: true }))
    await expect(pendingSpeak).resolves.toBe(false)
    expect(sendMessageMock.mock.calls.some(([message]) => message.action === MessageActions.GOOGLE_TTS_SPEAK)).toBe(false)
  })

  it('cancels an owned dispatched request on unmount with an ID-scoped stop', async () => {
    const composable = mountComposable()
    await composable.speak('text', 'auto')
    const id = composable.currentTTSId.value
    apps[apps.length - 1].unmount()
    expect(sendMessageMock).toHaveBeenLastCalledWith(expect.objectContaining({
      action: MessageActions.TTS_STOP,
      data: { ttsId: id, stopOnlyIfOwner: true },
    }))
  })

  it('does not restore playing when a matching terminal arrives before the start response resolves', async () => {
    const listeners = new Set()
    vi.stubGlobal('browser', {
      runtime: {
        onMessage: {
          addListener: (listener) => listeners.add(listener),
          removeListener: (listener) => listeners.delete(listener),
        },
      },
    })
    let resolveStart
    sendMessageMock.mockImplementation((message) => message.action === MessageActions.GOOGLE_TTS_SPEAK
      ? new Promise((resolve) => { resolveStart = resolve })
      : Promise.resolve({ success: true }))
    const composable = mountComposable()
    const speaking = composable.speak('text', 'auto')
    while (!resolveStart) await Promise.resolve()

    listeners.forEach((listener) => listener({
      action: MessageActions.GOOGLE_TTS_ENDED,
      ttsId: composable.currentTTSId.value,
      status: 'completed',
    }))
    expect(composable.ttsState.value).toBe('idle')

    resolveStart({ success: true })
    await expect(speaking).resolves.toBe(false)
    expect(composable.ttsState.value).toBe('idle')
  })

  it('keeps an early error terminal even when the start response succeeds later', async () => {
    const listeners = new Set()
    vi.stubGlobal('browser', {
      runtime: {
        onMessage: {
          addListener: (listener) => listeners.add(listener),
          removeListener: (listener) => listeners.delete(listener),
        },
      },
    })
    let resolveStart
    sendMessageMock.mockImplementation((message) => message.action === MessageActions.GOOGLE_TTS_SPEAK
      ? new Promise((resolve) => { resolveStart = resolve })
      : Promise.resolve({ success: true }))
    const composable = mountComposable()
    const speaking = composable.speak('text', 'auto')
    while (!resolveStart) await Promise.resolve()

    listeners.forEach((listener) => listener({
      action: MessageActions.GOOGLE_TTS_ENDED,
      ttsId: composable.currentTTSId.value,
      status: 'error',
      error: 'engine failed',
      errorType: 'ERRORS_TTS_FAILED',
    }))
    expect(composable.ttsState.value).toBe('error')

    resolveStart({ success: true })
    await expect(speaking).resolves.toBe(false)
    expect(composable.ttsState.value).toBe('error')
    expect(composable.errorMessage.value).toBe('engine failed')
  })
})
