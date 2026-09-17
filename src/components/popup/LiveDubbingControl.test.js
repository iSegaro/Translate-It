import { describe, expect, it, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import LiveDubbingControl from './LiveDubbingControl.vue'

const sendMessage = vi.hoisted(() => vi.fn())
let runtimeListener

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
    runtimeListener = null
    vi.stubGlobal('browser', {
      runtime: {
        id: 'extension-id',
        getURL: (path = '') => `chrome-extension://extension-id/${path}`,
        onMessage: {
          addListener: vi.fn(listener => { runtimeListener = listener }),
          removeListener: vi.fn()
        }
      }
    })
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

  it('shows a reopened idle terminal outcome without blocking Start', async () => {
    sendMessage.mockResolvedValue({
      success: true,
      status: 'idle',
      terminalOutcome: {
        providerId: 'gemini',
        error: 'PROVIDER_SESSION_ENDED',
        occurredAt: 123,
        providerDiagnostic: { raw: 'must not render' }
      }
    })

    const wrapper = mount(LiveDubbingControl, { props: { targetLanguage: 'de' } })
    await Promise.resolve()
    await wrapper.vm.$nextTick()

    expect(browser.runtime.onMessage.addListener).toHaveBeenCalledWith(runtimeListener)
    expect(browser.runtime.onMessage.addListener.mock.invocationCallOrder[0])
      .toBeLessThan(sendMessage.mock.invocationCallOrder[0])
    expect(wrapper.find('button[aria-label="Start live dubbing"]').attributes('disabled')).toBeUndefined()
    expect(wrapper.find('button[aria-label="Stop live dubbing"]').exists()).toBe(false)
    expect(wrapper.text()).toContain('PROVIDER_SESSION_ENDED')
    expect(wrapper.text()).not.toContain('must not render')
  })

  it('ignores unsafe terminal error prose and provider diagnostics', async () => {
    sendMessage.mockResolvedValue({
      status: 'idle',
      terminalOutcome: {
        providerId: 'gemini',
        error: 'Provider session ended.',
        occurredAt: 123,
        providerDiagnostic: { raw: 'must not render' }
      }
    })

    const wrapper = mount(LiveDubbingControl, { props: { targetLanguage: 'de' } })
    await Promise.resolve()
    await wrapper.vm.$nextTick()

    expect(wrapper.vm.terminalOutcome).toBe(null)
    expect(wrapper.text()).not.toContain('Provider session ended.')
    expect(wrapper.text()).not.toContain('must not render')
  })

  it('treats an authenticated terminal notification as invalidation and re-reads status', async () => {
    let statusReads = 0
    sendMessage.mockImplementation(({ action }) => {
      if (action === 'GET_LIVE_DUBBING_STATUS') {
        statusReads += 1
        return Promise.resolve(statusReads === 1
          ? { status: { status: 'RUNNING', sessionId: 'session-1' } }
          : { status: 'idle', terminalOutcome: { providerId: 'gemini', error: 'PROVIDER_SESSION_ENDED', occurredAt: 2 } })
      }
      return Promise.resolve({ status: { status: 'RUNNING', sessionId: 'session-1' } })
    })

    const wrapper = mount(LiveDubbingControl, { props: { targetLanguage: 'de' } })
    await Promise.resolve()
    await wrapper.vm.$nextTick()
    expect(wrapper.find('button[aria-label="Stop live dubbing"]').exists()).toBe(true)

    runtimeListener({ action: 'LIVE_DUBBING_TERMINAL_OUTCOME', data: { error: 'do not render' } }, {
      id: 'extension-id', url: 'chrome-extension://extension-id/'
    })
    await Promise.resolve()
    await wrapper.vm.$nextTick()

    expect(statusReads).toBe(2)
    expect(wrapper.find('button[aria-label="Start live dubbing"]').exists()).toBe(true)
    expect(wrapper.find('button[aria-label="Stop live dubbing"]').exists()).toBe(false)
    expect(wrapper.text()).toContain('PROVIDER_SESSION_ENDED')
    expect(wrapper.text()).not.toContain('do not render')
  })

  it('ignores invalid or untrusted terminal notifications', async () => {
    const wrapper = mount(LiveDubbingControl, { props: { targetLanguage: 'de' } })
    await Promise.resolve()
    await wrapper.vm.$nextTick()
    const initialReads = sendMessage.mock.calls.filter(([message]) => message.action === 'GET_LIVE_DUBBING_STATUS').length

    runtimeListener({ action: 'OTHER_ACTION', data: {} }, { id: 'extension-id' })
    runtimeListener({ action: 'LIVE_DUBBING_TERMINAL_OUTCOME', data: {} }, { id: 'other-id' })
    runtimeListener({ action: 'LIVE_DUBBING_TERMINAL_OUTCOME', data: {} }, { id: 'extension-id', documentId: 'popup' })

    expect(sendMessage.mock.calls.filter(([message]) => message.action === 'GET_LIVE_DUBBING_STATUS')).toHaveLength(initialReads)
  })

  it('removes the exact runtime listener on unmount', async () => {
    const wrapper = mount(LiveDubbingControl, { props: { targetLanguage: 'de' } })
    await Promise.resolve()
    wrapper.unmount()

    expect(browser.runtime.onMessage.removeListener).toHaveBeenCalledWith(runtimeListener)
  })

  it('keeps cleanup pending when notification status retains a session', async () => {
    let statusReads = 0
    sendMessage.mockImplementation(({ action }) => {
      if (action === 'GET_LIVE_DUBBING_STATUS') {
        statusReads += 1
        return Promise.resolve(statusReads === 1
          ? { status: 'idle' }
          : {
              status: { status: 'ERROR', sessionId: 'retained-session', lastError: 'Cleanup is required.' },
              terminalOutcome: { providerId: 'gemini', error: 'PROVIDER_SESSION_ENDED', occurredAt: 3 }
            })
      }
      return Promise.resolve({ status: 'idle' })
    })

    const wrapper = mount(LiveDubbingControl, { props: { targetLanguage: 'de' } })
    await Promise.resolve()
    await wrapper.vm.$nextTick()
    runtimeListener({ action: 'LIVE_DUBBING_TERMINAL_OUTCOME', data: {} }, {
      id: 'extension-id', url: 'chrome-extension://extension-id/'
    })
    await Promise.resolve()
    await wrapper.vm.$nextTick()

    expect(wrapper.find('button[aria-label="Clean up live dubbing"]').exists()).toBe(true)
    expect(wrapper.find('button[aria-label="Start live dubbing"]').attributes('disabled')).toBeDefined()
    expect(wrapper.text()).toContain('Cleanup is required.')
  })

  it('does not let a late notification read overwrite a newer start', async () => {
    let resolveNotificationStatus
    let statusReads = 0
    sendMessage.mockImplementation(({ action }) => {
      if (action === 'GET_LIVE_DUBBING_STATUS') {
        statusReads += 1
        return statusReads === 1 ? Promise.resolve({ status: 'idle' }) : new Promise(resolve => {
          resolveNotificationStatus = resolve
        })
      }
      if (action === 'START_LIVE_DUBBING') return Promise.resolve({ status: 'running', sessionId: 'new-session' })
      return Promise.resolve({ status: 'idle' })
    })

    const wrapper = mount(LiveDubbingControl, { props: { targetLanguage: 'de' } })
    await Promise.resolve()
    await wrapper.vm.$nextTick()
    runtimeListener({ action: 'LIVE_DUBBING_TERMINAL_OUTCOME', data: {} }, {
      id: 'extension-id', url: 'chrome-extension://extension-id/'
    })
    await wrapper.find('button[aria-label="Start live dubbing"]').trigger('click')
    await Promise.resolve()
    await wrapper.vm.$nextTick()
    resolveNotificationStatus({ status: { status: 'ERROR', sessionId: 'old-session', lastError: 'stale' } })
    await Promise.resolve()
    await wrapper.vm.$nextTick()

    expect(wrapper.find('button[aria-label="Stop live dubbing"]').exists()).toBe(true)
    expect(wrapper.text()).not.toContain('stale')
  })

  it('clears historical outcome only after a successful new start', async () => {
    sendMessage.mockImplementation(({ action }) => action === 'GET_LIVE_DUBBING_STATUS'
      ? Promise.resolve({ status: 'idle', terminalOutcome: { providerId: 'gemini', error: 'OLD_OUTCOME', occurredAt: 1 } })
      : Promise.resolve({ status: 'running', sessionId: 'new-session' }))

    const wrapper = mount(LiveDubbingControl, { props: { targetLanguage: 'de' } })
    await Promise.resolve()
    await wrapper.vm.$nextTick()
    await wrapper.find('button[aria-label="Start live dubbing"]').trigger('click')
    await Promise.resolve()
    await wrapper.vm.$nextTick()

    expect(wrapper.text()).not.toContain('OLD_OUTCOME')
  })

  it('does not clear historical outcome when a new start fails', async () => {
    sendMessage.mockImplementation(({ action }) => {
      if (action === 'GET_LIVE_DUBBING_STATUS') return Promise.resolve({
        status: 'idle',
        terminalOutcome: { providerId: 'gemini', error: 'PREVIOUS_TERMINAL_FAILURE', occurredAt: 1 }
      })
      const failure = { success: false, error: 'START_FAILED', status: 'idle', terminalOutcome: {
        providerId: 'gemini', error: 'PREVIOUS_TERMINAL_FAILURE', occurredAt: 1
      } }
      return Promise.reject(Object.assign(new Error('START_FAILED'), { data: failure }))
    })

    const wrapper = mount(LiveDubbingControl, { props: { targetLanguage: 'de' } })
    await Promise.resolve()
    await wrapper.vm.$nextTick()
    await wrapper.find('button[aria-label="Start live dubbing"]').trigger('click')
    await Promise.resolve()
    await wrapper.vm.$nextTick()

    expect(wrapper.vm.terminalOutcome.error).toBe('PREVIOUS_TERMINAL_FAILURE')
    expect(wrapper.text()).toContain('START_FAILED')
  })

  it('does not resurrect history when notification status clears it during a pending start', async () => {
    let resolveStart
    let statusReads = 0
    sendMessage.mockImplementation(({ action }) => {
      if (action === 'GET_LIVE_DUBBING_STATUS') {
        statusReads += 1
        return statusReads === 1
          ? Promise.resolve({
              status: 'idle',
              terminalOutcome: { providerId: 'gemini', error: 'OLD_OUTCOME', occurredAt: 1 }
            })
          : Promise.resolve({
              status: { status: 'RUNNING', sessionId: 'session-1' },
              terminalOutcome: null
            })
      }
      if (action === 'START_LIVE_DUBBING') return new Promise(resolve => { resolveStart = resolve })
      if (action === 'STOP_LIVE_DUBBING') return Promise.resolve({ status: 'idle', terminalOutcome: null })
      return Promise.resolve({ status: 'idle' })
    })

    const wrapper = mount(LiveDubbingControl, { props: { targetLanguage: 'de' } })
    await Promise.resolve()
    await wrapper.vm.$nextTick()
    await wrapper.find('button[aria-label="Start live dubbing"]').trigger('click')

    runtimeListener({ action: 'LIVE_DUBBING_TERMINAL_OUTCOME', data: {} }, {
      id: 'extension-id', url: 'chrome-extension://extension-id/'
    })
    await Promise.resolve()
    await wrapper.vm.$nextTick()
    expect(wrapper.vm.terminalOutcome).toBe(null)

    resolveStart({ status: 'running', sessionId: 'late-session' })
    await Promise.resolve()
    await wrapper.vm.$nextTick()

    await wrapper.find('button[aria-label="Stop live dubbing"]').trigger('click')
    await Promise.resolve()
    await wrapper.vm.$nextTick()

    expect(wrapper.vm.terminalOutcome).toBe(null)
    expect(wrapper.text()).not.toContain('OLD_OUTCOME')
  })
})
