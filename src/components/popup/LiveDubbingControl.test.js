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

  it('retains session and offers cleanup after a structured START failure', async () => {
    const retained = {
      status: 'ERROR',
      sessionId: 'session-9',
      providerId: 'gemini',
      lastError: 'LIVE_DUBBING_START_FAILED'
    }
    sendMessage.mockImplementation(({ action }) => {
      if (action === 'GET_LIVE_DUBBING_STATUS') return Promise.resolve({ status: 'idle' })
      if (action === 'START_LIVE_DUBBING') {
        const failure = {
          success: false,
          error: 'LIVE_DUBBING_START_FAILED',
          retryable: true,
          cleanupPending: true,
          status: retained,
          providerDiagnostic: { stage: 'CONNECT_PROVIDER', code: 'GEMINI_LIVE_REMOTE_ERROR' }
        }
        return Promise.reject(Object.assign(new Error('LIVE_DUBBING_START_FAILED'), { data: failure }))
      }
      if (action === 'STOP_LIVE_DUBBING') return Promise.resolve({ status: 'idle' })
      return Promise.resolve({ status: 'idle' })
    })

    const wrapper = mount(LiveDubbingControl, { props: { targetLanguage: 'de' } })
    await Promise.resolve()
    await wrapper.vm.$nextTick()

    await wrapper.find('button[aria-label="Start live dubbing"]').trigger('click')
    await Promise.resolve()
    await wrapper.vm.$nextTick()

    // Failed START with a retained session stays stoppable, never clean idle.
    expect(wrapper.find('button[aria-label="Start live dubbing"]').attributes('disabled')).toBeDefined()
    const cleanupButton = wrapper.find('button[aria-label="Clean up live dubbing"]')
    expect(cleanupButton.exists()).toBe(true)
    expect(wrapper.text()).toContain('LIVE_DUBBING_START_FAILED')

    await cleanupButton.trigger('click')
    expect(sendMessage).toHaveBeenLastCalledWith({
      action: 'STOP_LIVE_DUBBING',
      data: { sessionId: 'session-9' }
    })

    await Promise.resolve()
    await wrapper.vm.$nextTick()
    expect(wrapper.find('button[aria-label="Start live dubbing"]').exists()).toBe(true)
    expect(wrapper.find('button[aria-label="Clean up live dubbing"]').exists()).toBe(false)
  })

  it('keeps retained error session provider for guidance across prop flips', async () => {
    sendMessage.mockImplementation(({ action }) => {
      if (action === 'GET_LIVE_DUBBING_STATUS') return Promise.resolve({ status: 'idle' })
      if (action === 'START_LIVE_DUBBING') {
        const failure = {
          success: false,
          error: 'LIVE_DUBBING_PROVIDER_BOOTSTRAP_UNAVAILABLE',
          retryable: true,
          cleanupPending: true,
          status: {
            status: 'ERROR',
            sessionId: 'session-1',
            providerId: 'openai',
            lastError: 'LIVE_DUBBING_PROVIDER_BOOTSTRAP_UNAVAILABLE'
          }
        }
        return Promise.reject(Object.assign(new Error('LIVE_DUBBING_PROVIDER_BOOTSTRAP_UNAVAILABLE'), { data: failure }))
      }
      if (action === 'STOP_LIVE_DUBBING') return Promise.resolve({ status: 'idle' })
      return Promise.resolve({ status: 'idle' })
    })

    const wrapper = mount(LiveDubbingControl, { props: { targetLanguage: 'de', providerId: 'openai' } })
    await Promise.resolve()
    await wrapper.vm.$nextTick()

    await wrapper.find('button[aria-label="Start live dubbing"]').trigger('click')
    await Promise.resolve()
    await wrapper.vm.$nextTick()

    expect(wrapper.text()).toContain('Unable to initialize OpenAI Live Dubbing.')
    sendMessage.mockClear()

    // A future provider change never alters the authoritative active identity.
    await wrapper.setProps({ providerId: 'gemini' })
    await Promise.resolve()
    await wrapper.vm.$nextTick()

    expect(sendMessage).not.toHaveBeenCalledWith(expect.objectContaining({ action: 'START_LIVE_DUBBING' }))
    expect(wrapper.text()).toContain('Unable to initialize OpenAI Live Dubbing.')
    expect(wrapper.text()).not.toContain('Unable to initialize Gemini Live Dubbing.')
    expect(wrapper.find('button[aria-label="Clean up live dubbing"]').exists()).toBe(true)

    await wrapper.find('button[aria-label="Clean up live dubbing"]').trigger('click')
    await Promise.resolve()
    await wrapper.vm.$nextTick()

    // Session cleared — the next START uses the current prop.
    await wrapper.find('button[aria-label="Start live dubbing"]').trigger('click')
    expect(sendMessage).toHaveBeenLastCalledWith({
      action: 'START_LIVE_DUBBING',
      data: { targetLanguage: 'de', providerId: 'gemini' }
    })
  })

  it('reconstructs retained cleanup on close/reopen from authoritative STATUS', async () => {
    sendMessage.mockImplementation(({ action }) => {
      if (action === 'GET_LIVE_DUBBING_STATUS') {
        return Promise.resolve({ status: { status: 'ERROR', sessionId: 'retained-session', lastError: 'Capture failed' } })
      }
      if (action === 'STOP_LIVE_DUBBING') return Promise.resolve({ status: 'idle' })
      return Promise.resolve({ status: 'idle' })
    })

    const first = mount(LiveDubbingControl, { props: { targetLanguage: 'de' } })
    await Promise.resolve()
    await first.vm.$nextTick()
    expect(first.find('button[aria-label="Clean up live dubbing"]').exists()).toBe(true)
    first.unmount()

    const second = mount(LiveDubbingControl, { props: { targetLanguage: 'de' } })
    await Promise.resolve()
    await second.vm.$nextTick()
    expect(second.find('button[aria-label="Clean up live dubbing"]').exists()).toBe(true)

    await second.find('button[aria-label="Clean up live dubbing"]').trigger('click')
    expect(sendMessage).toHaveBeenLastCalledWith({
      action: 'STOP_LIVE_DUBBING',
      data: { sessionId: 'retained-session' }
    })
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

  // Phase 4 Firefox capability gate — Popup/UI boundary owns browser/provider check
  // Recovery fix: STATUS always runs when visible; unsupported UI only when no session.
  describe('Firefox capability gate (Popup/UI boundary)', () => {
    it('Firefox+Gemini is supported: queries status and Start is usable with providerId gemini', async () => {
      const wrapper = mount(LiveDubbingControl, {
        props: { targetLanguage: 'de', providerId: 'gemini', isSupported: true, unsupportedReason: '' }
      })
      await Promise.resolve()
      await wrapper.vm.$nextTick()
      expect(sendMessage).toHaveBeenCalledWith({ action: 'GET_LIVE_DUBBING_STATUS' })
      expect(wrapper.find('button[aria-label="Start live dubbing"]').attributes('disabled')).toBeUndefined()
      sendMessage.mockClear()
      await wrapper.find('button[aria-label="Start live dubbing"]').trigger('click')
      expect(sendMessage).toHaveBeenCalledWith({
        action: 'START_LIVE_DUBBING',
        data: { targetLanguage: 'de', providerId: 'gemini' }
      })
    })

    it('Firefox+OpenAI unsupported with no session: still queries STATUS, Start disabled, shows message, no START', async () => {
      // No session (idle) + unsupported must still send GET and then show unsupported UI
      sendMessage.mockImplementation(({ action }) => {
        if (action === 'GET_LIVE_DUBBING_STATUS') return Promise.resolve({ status: 'idle' })
        return Promise.resolve({ status: 'idle' })
      })
      const wrapper = mount(LiveDubbingControl, {
        props: {
          targetLanguage: 'de',
          providerId: 'openai',
          isSupported: false,
          unsupportedReason: 'OpenAI Live Dubbing is not supported on Firefox yet.'
        }
      })
      await Promise.resolve()
      await wrapper.vm.$nextTick()
      // Must not silently replace persisted openai with gemini
      expect(wrapper.props('providerId')).toBe('openai')
      // Always queries authoritative status even when capability unsupported
      expect(sendMessage).toHaveBeenCalledWith({ action: 'GET_LIVE_DUBBING_STATUS' })
      expect(wrapper.text()).toContain('OpenAI Live Dubbing is not supported on Firefox yet.')
      const startBtn = wrapper.find('button[aria-label="Start live dubbing"]')
      expect(startBtn.exists()).toBe(true)
      expect(startBtn.attributes('disabled')).toBeDefined()
      // Attempting Start must not send unsupported START to discover incompatibility
      sendMessage.mockClear()
      await startBtn.trigger('click')
      await Promise.resolve()
      await wrapper.vm.$nextTick()
      expect(sendMessage).not.toHaveBeenCalledWith(expect.objectContaining({ action: 'START_LIVE_DUBBING' }))
      expect(wrapper.text()).toContain('OpenAI Live Dubbing is not supported on Firefox yet.')
    })

    it('Firefox+OpenAI unsupported recovers to supported when provider flips to Gemini (queries status)', async () => {
      sendMessage.mockImplementation(({ action }) => {
        if (action === 'GET_LIVE_DUBBING_STATUS') return Promise.resolve({ status: 'idle' })
        return Promise.resolve({ status: 'idle' })
      })
      const wrapper = mount(LiveDubbingControl, {
        props: {
          targetLanguage: 'de',
          providerId: 'openai',
          isSupported: false,
          unsupportedReason: 'OpenAI Live Dubbing is not supported on Firefox yet.'
        }
      })
      await Promise.resolve()
      await wrapper.vm.$nextTick()
      expect(sendMessage).toHaveBeenCalledWith({ action: 'GET_LIVE_DUBBING_STATUS' })
      expect(wrapper.text()).toContain('OpenAI Live Dubbing is not supported on Firefox yet.')
      sendMessage.mockClear()
      await wrapper.setProps({ providerId: 'gemini', isSupported: true, unsupportedReason: '' })
      await Promise.resolve()
      await wrapper.vm.$nextTick()
      expect(sendMessage).toHaveBeenCalledWith({ action: 'GET_LIVE_DUBBING_STATUS' })
      expect(wrapper.find('button[aria-label="Start live dubbing"]').attributes('disabled')).toBeUndefined()
      expect(wrapper.text()).not.toContain('OpenAI Live Dubbing is not supported on Firefox yet.')
    })

    it('Chrome+OpenAI remains supported (normal Start)', async () => {
      const wrapper = mount(LiveDubbingControl, {
        props: { targetLanguage: 'de', providerId: 'openai', isSupported: true, unsupportedReason: '' }
      })
      await Promise.resolve()
      await wrapper.vm.$nextTick()
      expect(sendMessage).toHaveBeenCalledWith({ action: 'GET_LIVE_DUBBING_STATUS' })
      await wrapper.find('button[aria-label="Start live dubbing"]').trigger('click')
      expect(sendMessage).toHaveBeenCalledWith({
        action: 'START_LIVE_DUBBING',
        data: { targetLanguage: 'de', providerId: 'openai' }
      })
    })
  })

  // Popup recovery: Firefox+OpenAI must still allow Gemini session recovery
  describe('Popup recovery (Firefox+OpenAI must still query STATUS)', () => {
    it('1 Firefox+OpenAI still sends GET_LIVE_DUBBING_STATUS', async () => {
      sendMessage.mockImplementation(({ action }) => {
        if (action === 'GET_LIVE_DUBBING_STATUS') return Promise.resolve({ status: 'idle' })
        return Promise.resolve({ status: 'idle' })
      })
      const wrapper = mount(LiveDubbingControl, {
        props: {
          targetLanguage: 'de',
          providerId: 'openai',
          isSupported: false,
          unsupportedReason: 'OpenAI Live Dubbing is not supported on Firefox yet.'
        }
      })
      await Promise.resolve()
      await wrapper.vm.$nextTick()
      expect(sendMessage).toHaveBeenCalledWith({ action: 'GET_LIVE_DUBBING_STATUS' })
      wrapper.unmount()
    })

    it('2 no-session → unsupported disabled (shows Firefox OpenAI message, Start disabled)', async () => {
      sendMessage.mockImplementation(({ action }) => {
        if (action === 'GET_LIVE_DUBBING_STATUS') return Promise.resolve({ status: 'idle' })
        return Promise.resolve({ status: 'idle' })
      })
      const wrapper = mount(LiveDubbingControl, {
        props: {
          targetLanguage: 'de',
          providerId: 'openai',
          isSupported: false,
          unsupportedReason: 'OpenAI Live Dubbing is not supported on Firefox yet.'
        }
      })
      await Promise.resolve()
      await wrapper.vm.$nextTick()
      expect(wrapper.text()).toContain('OpenAI Live Dubbing is not supported on Firefox yet.')
      const startBtn = wrapper.find('button[aria-label="Start live dubbing"]')
      expect(startBtn.exists()).toBe(true)
      expect(startBtn.attributes('disabled')).toBeDefined()
      expect(wrapper.find('.ti-live-dubbing-control-status').text()).toBe('Unavailable')
      wrapper.unmount()
    })

    it('3 RUNNING Gemini shows Running+Stop even though props providerId is openai unsupported', async () => {
      sendMessage.mockImplementation(({ action }) => {
        if (action === 'GET_LIVE_DUBBING_STATUS') {
          return Promise.resolve({ status: { status: 'RUNNING', sessionId: 'gemini-sess-1', providerId: 'gemini' } })
        }
        return Promise.resolve({ status: 'idle' })
      })
      const wrapper = mount(LiveDubbingControl, {
        props: {
          targetLanguage: 'de',
          providerId: 'openai',
          isSupported: false,
          unsupportedReason: 'OpenAI Live Dubbing is not supported on Firefox yet.'
        }
      })
      await Promise.resolve()
      await wrapper.vm.$nextTick()
      expect(sendMessage).toHaveBeenCalledWith({ action: 'GET_LIVE_DUBBING_STATUS' })
      // Authoritative Gemini session overrides capability gate
      expect(wrapper.find('.ti-live-dubbing-control-status').text()).toBe('Running')
      expect(wrapper.text()).not.toContain('OpenAI Live Dubbing is not supported on Firefox yet.')
      const stopBtn = wrapper.find('button[aria-label="Stop live dubbing"]')
      expect(stopBtn.exists()).toBe(true)
      expect(stopBtn.attributes('disabled')).toBeUndefined()
      // Start should not be shown when running
      expect(wrapper.find('button[aria-label="Start live dubbing"]').exists()).toBe(false)
      wrapper.unmount()
    })

    it('4 STOP sends Gemini session id (descriptor provider, not props openai)', async () => {
      sendMessage.mockImplementation(({ action }) => {
        if (action === 'GET_LIVE_DUBBING_STATUS') {
          return Promise.resolve({ status: { status: 'RUNNING', sessionId: 'gemini-sess-1', providerId: 'gemini' } })
        }
        if (action === 'STOP_LIVE_DUBBING') return Promise.resolve({ status: 'idle' })
        return Promise.resolve({ status: 'idle' })
      })
      const wrapper = mount(LiveDubbingControl, {
        props: {
          targetLanguage: 'de',
          providerId: 'openai',
          isSupported: false,
          unsupportedReason: 'OpenAI Live Dubbing is not supported on Firefox yet.'
        }
      })
      await Promise.resolve()
      await wrapper.vm.$nextTick()
      await wrapper.find('button[aria-label="Stop live dubbing"]').trigger('click')
      await Promise.resolve()
      await wrapper.vm.$nextTick()
      expect(sendMessage).toHaveBeenCalledWith({
        action: 'STOP_LIVE_DUBBING',
        data: { sessionId: 'gemini-sess-1' }
      })
      wrapper.unmount()
    })

    it('5 no START with OpenAI when unsupported (Firefox)', async () => {
      sendMessage.mockImplementation(({ action }) => {
        if (action === 'GET_LIVE_DUBBING_STATUS') return Promise.resolve({ status: 'idle' })
        return Promise.resolve({ status: 'idle' })
      })
      const wrapper = mount(LiveDubbingControl, {
        props: {
          targetLanguage: 'de',
          providerId: 'openai',
          isSupported: false,
          unsupportedReason: 'OpenAI Live Dubbing is not supported on Firefox yet.'
        }
      })
      await Promise.resolve()
      await wrapper.vm.$nextTick()
      sendMessage.mockClear()
      const startBtn = wrapper.find('button[aria-label="Start live dubbing"]')
      await startBtn.trigger('click')
      await Promise.resolve()
      await wrapper.vm.$nextTick()
      expect(sendMessage).not.toHaveBeenCalledWith(expect.objectContaining({ action: 'START_LIVE_DUBBING' }))
      expect(sendMessage).not.toHaveBeenCalledWith(expect.objectContaining({ action: 'GET_LIVE_DUBBING_STATUS' }) && expect.objectContaining({ data: expect.objectContaining({ providerId: 'openai' }) }))
      wrapper.unmount()
    })

    it('6 cleanupPending remains cleanable under Firefox+OpenAI unsupported', async () => {
      sendMessage.mockImplementation(({ action }) => {
        if (action === 'GET_LIVE_DUBBING_STATUS') {
          return Promise.resolve({ status: { status: 'ERROR', sessionId: 'retained-gemini', providerId: 'gemini', lastError: 'Capture failed' } })
        }
        if (action === 'STOP_LIVE_DUBBING') return Promise.resolve({ status: 'idle' })
        return Promise.resolve({ status: 'idle' })
      })
      const wrapper = mount(LiveDubbingControl, {
        props: {
          targetLanguage: 'de',
          providerId: 'openai',
          isSupported: false,
          unsupportedReason: 'OpenAI Live Dubbing is not supported on Firefox yet.'
        }
      })
      await Promise.resolve()
      await wrapper.vm.$nextTick()
      // Must show authoritative cleanup, not unsupported
      expect(wrapper.find('.ti-live-dubbing-control-status').text()).toBe('Error')
      expect(wrapper.text()).toContain('Capture failed')
      expect(wrapper.text()).not.toContain('OpenAI Live Dubbing is not supported on Firefox yet.')
      const cleanupBtn = wrapper.find('button[aria-label="Clean up live dubbing"]')
      expect(cleanupBtn.exists()).toBe(true)
      expect(cleanupBtn.attributes('disabled')).toBeUndefined()
      await cleanupBtn.trigger('click')
      expect(sendMessage).toHaveBeenCalledWith({
        action: 'STOP_LIVE_DUBBING',
        data: { sessionId: 'retained-gemini' }
      })
      wrapper.unmount()
    })

    it('7 OpenAI→Gemini flip with no active session returns to normal Ready flow', async () => {
      sendMessage.mockImplementation(({ action }) => {
        if (action === 'GET_LIVE_DUBBING_STATUS') return Promise.resolve({ status: 'idle' })
        return Promise.resolve({ status: 'idle' })
      })
      const wrapper = mount(LiveDubbingControl, {
        props: {
          targetLanguage: 'de',
          providerId: 'openai',
          isSupported: false,
          unsupportedReason: 'OpenAI Live Dubbing is not supported on Firefox yet.'
        }
      })
      await Promise.resolve()
      await wrapper.vm.$nextTick()
      expect(wrapper.text()).toContain('OpenAI Live Dubbing is not supported on Firefox yet.')
      expect(wrapper.props('providerId')).toBe('openai')
      sendMessage.mockClear()
      // Flip to Gemini supported
      await wrapper.setProps({ providerId: 'gemini', isSupported: true, unsupportedReason: '' })
      await Promise.resolve()
      await wrapper.vm.$nextTick()
      // Must not silently keep unsupported UI; should be Ready and Start enabled
      expect(sendMessage).toHaveBeenCalledWith({ action: 'GET_LIVE_DUBBING_STATUS' })
      expect(wrapper.find('.ti-live-dubbing-control-status').text()).toBe('Ready')
      expect(wrapper.find('button[aria-label="Start live dubbing"]').attributes('disabled')).toBeUndefined()
      expect(wrapper.text()).not.toContain('OpenAI Live Dubbing is not supported on Firefox yet.')
      // Must not silently switch persisted provider check still passes (props is gemini now, but previous openai persisted not mutated)
      expect(wrapper.props('providerId')).toBe('gemini')
      wrapper.unmount()
    })

    it('8 Chrome unchanged (Chrome+OpenAI normal, Chrome+Gemini normal)', async () => {
      // Chrome+OpenAI
      sendMessage.mockImplementation(({ action }) => {
        if (action === 'GET_LIVE_DUBBING_STATUS') return Promise.resolve({ status: 'idle' })
        if (action === 'START_LIVE_DUBBING') return Promise.resolve({ status: { status: 'RUNNING', sessionId: 's1', providerId: 'openai' } })
        return Promise.resolve({ status: 'idle' })
      })
      const chromeOpenAI = mount(LiveDubbingControl, {
        props: { targetLanguage: 'de', providerId: 'openai', isSupported: true, unsupportedReason: '' }
      })
      await Promise.resolve()
      await chromeOpenAI.vm.$nextTick()
      expect(sendMessage).toHaveBeenCalledWith({ action: 'GET_LIVE_DUBBING_STATUS' })
      await chromeOpenAI.find('button[aria-label="Start live dubbing"]').trigger('click')
      expect(sendMessage).toHaveBeenCalledWith({
        action: 'START_LIVE_DUBBING',
        data: { targetLanguage: 'de', providerId: 'openai' }
      })
      chromeOpenAI.unmount()
      sendMessage.mockClear()
      // Chrome+Gemini
      sendMessage.mockImplementation(({ action }) => {
        if (action === 'GET_LIVE_DUBBING_STATUS') return Promise.resolve({ status: 'idle' })
        if (action === 'START_LIVE_DUBBING') return Promise.resolve({ status: { status: 'RUNNING', sessionId: 's2', providerId: 'gemini' } })
        return Promise.resolve({ status: 'idle' })
      })
      const chromeGemini = mount(LiveDubbingControl, {
        props: { targetLanguage: 'de', providerId: 'gemini', isSupported: true, unsupportedReason: '' }
      })
      await Promise.resolve()
      await chromeGemini.vm.$nextTick()
      expect(sendMessage).toHaveBeenCalledWith({ action: 'GET_LIVE_DUBBING_STATUS' })
      await chromeGemini.find('button[aria-label="Start live dubbing"]').trigger('click')
      expect(sendMessage).toHaveBeenCalledWith({
        action: 'START_LIVE_DUBBING',
        data: { targetLanguage: 'de', providerId: 'gemini' }
      })
      chromeGemini.unmount()
    })
  })
})
