import { describe, expect, it, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import LiveDubbingControl from './LiveDubbingControl.vue'

const sendMessage = vi.hoisted(() => vi.fn())

vi.mock('@/shared/messaging/composables/useMessaging.js', () => ({
  useMessaging: () => ({ sendMessage })
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
      data: { targetLanguage: 'de' }
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
      error: 'LIVE_DUBBING_PROVIDER_CREDENTIAL_UNAVAILABLE'
    })

    const wrapper = mount(LiveDubbingControl, { props: { targetLanguage: 'de' } })
    await Promise.resolve()
    await wrapper.vm.$nextTick()

    expect(wrapper.find('.ti-live-dubbing-control-status').text()).toBe('Error')
    expect(wrapper.text()).toContain('A Gemini API key is required for live dubbing.')
  })

  it('disables start for an unsupported background response', async () => {
    sendMessage.mockResolvedValue({ success: false, error: 'LIVE_DUBBING_UNSUPPORTED' })

    const wrapper = mount(LiveDubbingControl, { props: { targetLanguage: 'de' } })
    await Promise.resolve()
    await wrapper.vm.$nextTick()

    expect(wrapper.find('button[aria-label="Start live dubbing"]').attributes('disabled')).toBeDefined()
    expect(wrapper.text()).toContain('Live dubbing is not supported in this browser.')
  })
})
