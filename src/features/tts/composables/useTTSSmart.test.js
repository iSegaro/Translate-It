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

    return composable
  }

  const getSpeakMessage = () => sendMessageMock.mock.calls[1][0]

  beforeEach(() => {
    sendMessageMock.mockReset().mockResolvedValue({ success: true })
  })

  afterEach(() => {
    app?.unmount()
    app = null
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
})
