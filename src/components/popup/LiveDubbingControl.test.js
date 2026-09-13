import { describe, expect, it, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import LiveDubbingControl from './LiveDubbingControl.vue'

const sendMessage = vi.hoisted(() => vi.fn())

vi.mock('@/shared/messaging/composables/useMessaging.js', () => ({
  useMessaging: () => ({ sendMessage })
}))

vi.mock('@/composables/shared/useUnifiedI18n.js', () => ({
  useUnifiedI18n: () => ({
    t: (key) => ({
      live_dubbing_provider_bootstrap_gemini_error: 'Unable to initialize Gemini Live Dubbing. Check your Gemini API key and connection, then try again.',
      live_dubbing_provider_bootstrap_openai_error: 'Unable to initialize OpenAI Live Dubbing. Check your OpenAI API key and connection, then try again.'
    }[key] || key)
  })
}))

vi.mock('webextension-polyfill', () => ({
  default: { runtime: { getURL: (path) => path } }
}))

describe('LiveDubbingControl', () => {
  beforeEach(() => {
    sendMessage.mockReset()
    sendMessage.mockImplementation(({ action }) => {
      if (action === 'GET_LIVE_DUBBING_STATUS') return Promise.resolve({ status: 'idle' })
      if (action === 'START_LIVE_DUBBING') return Promise.resolve({ status: 'running', sessionId: 'session-1' })
      return Promise.resolve({ status: 'idle' })
    })
  })

  it('queries status and sends target language and resolved session on start/stop', async () => {
    const wrapper = mount(LiveDubbingControl, { props: { targetLanguage: 'de' } })
    await Promise.resolve()
    await wrapper.vm.$nextTick()

    expect(sendMessage).toHaveBeenCalledWith({ action: 'GET_LIVE_DUBBING_STATUS' })

    await wrapper.find('button').trigger('click')
    expect(sendMessage).toHaveBeenCalledWith({
      action: 'START_LIVE_DUBBING',
      data: { targetLanguage: 'de', providerId: 'gemini' }
    })

    await Promise.resolve()
    await wrapper.find('button').trigger('click')
    expect(sendMessage).toHaveBeenCalledWith({
      action: 'STOP_LIVE_DUBBING',
      data: { sessionId: 'session-1' }
    })
  })

  it('offers cleanup for retained incomplete sessions and blocks start', async () => {
    sendMessage.mockImplementation(({ action }) => {
      if (action === 'GET_LIVE_DUBBING_STATUS') {
        return Promise.resolve({ status: 'ERROR', sessionId: 'retained-session', lastError: 'Capture failed' })
      }
      if (action === 'STOP_LIVE_DUBBING') return Promise.resolve({ status: 'idle' })
      return Promise.resolve({ status: 'idle' })
    })

    const wrapper = mount(LiveDubbingControl, { props: { targetLanguage: 'de' } })
    await Promise.resolve()
    await wrapper.vm.$nextTick()

    const cleanupButton = wrapper.find('button[aria-label="Clean up live dubbing"]')
    expect(cleanupButton.exists()).toBe(true)
    expect(wrapper.find('button[aria-label="Start live dubbing"]').attributes('disabled')).toBeDefined()
    expect(wrapper.text()).toContain('Capture failed')

    await cleanupButton.trigger('click')
    expect(sendMessage).toHaveBeenLastCalledWith({
      action: 'STOP_LIVE_DUBBING',
      data: { sessionId: 'retained-session' }
    })
  })

  it('keeps cleanup enabled after stop failure and retries with retained session', async () => {
    let stopAttempts = 0
    sendMessage.mockImplementation(({ action }) => {
      if (action === 'GET_LIVE_DUBBING_STATUS') {
        return Promise.resolve({ status: 'ERROR', sessionId: 'retained-session', lastError: 'Capture failed' })
      }
      if (action === 'STOP_LIVE_DUBBING') {
        stopAttempts += 1
        return stopAttempts === 1
          ? Promise.reject(new Error('Background transport failed'))
          : Promise.resolve({ status: 'idle' })
      }
      return Promise.resolve({ status: 'idle' })
    })

    const wrapper = mount(LiveDubbingControl, { props: { targetLanguage: 'de' } })
    await Promise.resolve()
    await wrapper.vm.$nextTick()

    const cleanupButton = () => wrapper.find('button[aria-label="Clean up live dubbing"]')
    await cleanupButton().trigger('click')
    await Promise.resolve()
    await wrapper.vm.$nextTick()

    expect(cleanupButton().exists()).toBe(true)
    expect(wrapper.text()).toContain('Background transport failed')

    await cleanupButton().trigger('click')
    expect(sendMessage).toHaveBeenLastCalledWith({
      action: 'STOP_LIVE_DUBBING',
      data: { sessionId: 'retained-session' }
    })
    expect(cleanupButton().exists()).toBe(false)
  })

  it.each([
    ['PREPARING_CAPTURE', 'Preparing capture…'],
    ['CONNECTING_PROVIDER', 'Connecting to provider…'],
    ['RUNNING', 'Running'],
    ['STOPPING', 'Stopping…'],
    ['ERROR', 'Error']
  ])('presents the authoritative %s status', async (status, label) => {
    sendMessage.mockImplementation(({ action }) => (
      action === 'GET_LIVE_DUBBING_STATUS'
        ? Promise.resolve({ status: { status, sessionId: 'session-1' } })
        : Promise.resolve({ status: { status, sessionId: 'session-1' } })
    ))

    const wrapper = mount(LiveDubbingControl, { props: { targetLanguage: 'de' } })
    await Promise.resolve()
    await wrapper.vm.$nextTick()

    expect(wrapper.find('.ti-live-dubbing-control-status').text()).toBe(label)
  })

  it('presents safe background errors without remapping status', async () => {
    sendMessage.mockResolvedValue({
      success: false,
      error: 'LIVE_DUBBING_PROVIDER_BOOTSTRAP_UNAVAILABLE'
    })

    const wrapper = mount(LiveDubbingControl, { props: { targetLanguage: 'de' } })
    await Promise.resolve()
    await wrapper.vm.$nextTick()

    expect(wrapper.find('.ti-live-dubbing-control-status').text()).toBe('Error')
    expect(wrapper.text()).toContain('Unable to initialize Gemini Live Dubbing.')
  })

  it('disables start for an unsupported background response', async () => {
    sendMessage.mockResolvedValue({ success: false, error: 'LIVE_DUBBING_UNSUPPORTED' })

    const wrapper = mount(LiveDubbingControl, { props: { targetLanguage: 'de' } })
    await Promise.resolve()
    await wrapper.vm.$nextTick()

    expect(wrapper.find('button[aria-label="Start live dubbing"]').attributes('disabled')).toBeDefined()
    expect(wrapper.text()).toContain('Live dubbing is not supported in this browser.')
  })

  it('presents OpenAI bootstrap failure for an OpenAI session', async () => {
    sendMessage.mockImplementation(({ action }) => action === 'GET_LIVE_DUBBING_STATUS'
      ? Promise.resolve({ status: { status: 'ERROR', sessionId: 'session-1', providerId: 'openai', lastError: 'LIVE_DUBBING_PROVIDER_BOOTSTRAP_UNAVAILABLE' } })
      : Promise.resolve({ status: 'idle' }))

    const wrapper = mount(LiveDubbingControl, { props: { targetLanguage: 'de', providerId: 'openai' } })
    await Promise.resolve()
    await wrapper.vm.$nextTick()

    expect(wrapper.text()).toContain('Unable to initialize OpenAI Live Dubbing.')
    expect(wrapper.text()).not.toContain('Unable to initialize Gemini Live Dubbing.')
  })

  it('keeps active session provider for error guidance after prop flips to Gemini', async () => {
    sendMessage.mockImplementation(({ action }) => action === 'GET_LIVE_DUBBING_STATUS'
      ? Promise.resolve({ status: { status: 'ERROR', sessionId: 'session-1', providerId: 'openai', lastError: 'LIVE_DUBBING_PROVIDER_BOOTSTRAP_UNAVAILABLE' } })
      : Promise.resolve({ status: 'idle' }))

    const wrapper = mount(LiveDubbingControl, { props: { targetLanguage: 'de', providerId: 'gemini' } })
    await Promise.resolve()
    await wrapper.vm.$nextTick()

    expect(wrapper.text()).toContain('Unable to initialize OpenAI Live Dubbing.')
    expect(wrapper.text()).not.toContain('Unable to initialize Gemini Live Dubbing.')
  })

  it.each([
    ['gemini', 'gemini'],
    ['openai', 'openai']
  ])('START sends providerId: %s when prop is %s', async (prop, expected) => {
    const wrapper = mount(LiveDubbingControl, { props: { targetLanguage: 'de', providerId: prop } })
    await Promise.resolve()
    await wrapper.vm.$nextTick()

    await wrapper.find('button[aria-label="Start live dubbing"]').trigger('click')
    expect(sendMessage).toHaveBeenCalledWith({
      action: 'START_LIVE_DUBBING',
      data: { targetLanguage: 'de', providerId: expected }
    })
  })

  it('retains active OpenAI session through prop flip and uses new provider after session ends', async () => {
    let stopCallCount = 0
    sendMessage.mockImplementation(({ action }) => {
      if (action === 'GET_LIVE_DUBBING_STATUS') return Promise.resolve({ status: 'idle' })
      if (action === 'START_LIVE_DUBBING') {
        return Promise.resolve({ status: { status: 'RUNNING', sessionId: 'session-1', providerId: 'openai' } })
      }
      if (action === 'STOP_LIVE_DUBBING') {
        stopCallCount += 1
        if (stopCallCount === 1) {
          return Promise.resolve({
            status: { status: 'ERROR', sessionId: 'session-1', providerId: 'openai', lastError: 'LIVE_DUBBING_PROVIDER_BOOTSTRAP_UNAVAILABLE' }
          })
        }
        return Promise.resolve({ status: 'idle' })
      }
      return Promise.resolve({ status: 'idle' })
    })

    const wrapper = mount(LiveDubbingControl, { props: { targetLanguage: 'de', providerId: 'openai' } })
    await Promise.resolve()
    await wrapper.vm.$nextTick()

    // Phase 1: Start an openai session
    await wrapper.find('button[aria-label="Start live dubbing"]').trigger('click')
    await Promise.resolve()
    await wrapper.vm.$nextTick()
    expect(wrapper.find('.ti-live-dubbing-control-status').text()).toBe('Running')
    sendMessage.mockClear()

    // Phase 2: Flip prop to gemini — no restart, no mutation
    await wrapper.setProps({ providerId: 'gemini' })
    await Promise.resolve()
    await wrapper.vm.$nextTick()

    expect(sendMessage).not.toHaveBeenCalledWith(expect.objectContaining({ action: 'START_LIVE_DUBBING' }))
    expect(wrapper.find('.ti-live-dubbing-control-status').text()).toBe('Running')
    expect(wrapper.find('button[aria-label="Stop live dubbing"]').exists()).toBe(true)

    // Phase 3: Stop encounters provider error — feedback uses OpenAI despite gemini prop
    await wrapper.find('button[aria-label="Stop live dubbing"]').trigger('click')
    await Promise.resolve()
    await wrapper.vm.$nextTick()

    expect(wrapper.text()).toContain('Unable to initialize OpenAI Live Dubbing.')
    expect(wrapper.text()).not.toContain('Unable to initialize Gemini Live Dubbing.')
    expect(wrapper.find('button[aria-label="Clean up live dubbing"]').exists()).toBe(true)

    // Phase 4: Cleanup the retained session — session ends
    await wrapper.find('button[aria-label="Clean up live dubbing"]').trigger('click')
    await Promise.resolve()
    await wrapper.vm.$nextTick()

    // Phase 5: Session cleared — next start uses gemini
    await wrapper.find('button[aria-label="Start live dubbing"]').trigger('click')
    await Promise.resolve()
    await wrapper.vm.$nextTick()

    expect(sendMessage).toHaveBeenCalledWith(expect.objectContaining({
      action: 'START_LIVE_DUBBING',
      data: { targetLanguage: 'de', providerId: 'gemini' }
    }))
  })
})
