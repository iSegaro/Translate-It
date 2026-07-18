import { beforeEach, describe, expect, it, vi } from 'vitest'

const cancelStreamMock = vi.fn()

vi.mock('@/shared/logging/logger.js', () => ({
  getScopedLogger: () => ({ debug: vi.fn(), info: vi.fn() })
}))

vi.mock('../StreamingManager.js', () => ({
  streamingManager: { cancelStream: cancelStreamMock }
}))

const { TranslationLifecycleRegistry } = await import('./TranslationLifecycleRegistry.js')

describe('TranslationLifecycleRegistry', () => {
  let registry

  beforeEach(() => {
    cancelStreamMock.mockReset()
    registry = new TranslationLifecycleRegistry()
  })

  it('rejects every registration for an ID cancelled before registration', async () => {
    await registry.cancelTranslation('pre-cancelled')

    expect(registry.registerRequest('pre-cancelled', 'Hello')).toBeNull()
    expect(registry.registerRequest('pre-cancelled', 'Hello')).toBeNull()
    expect(registry.getAbortController('pre-cancelled')).toBeNull()
    expect(registry.isCancelled('pre-cancelled')).toBe(true)
  })

  it('registers non-cancelled requests normally', () => {
    const controller = registry.registerRequest('normal', 'Hello')

    expect(controller).toBeInstanceOf(AbortController)
    expect(registry.getAbortController('normal')).toBe(controller)
  })

  it('aborts active requests and safely accepts repeated cancellation', async () => {
    const controller = registry.registerRequest('active', 'Hello')
    const abort = vi.spyOn(controller, 'abort')

    await registry.cancelTranslation('active')
    await registry.cancelTranslation('active')

    expect(abort).toHaveBeenCalledTimes(2)
    expect(controller.signal.aborted).toBe(true)
    expect(cancelStreamMock).toHaveBeenCalledTimes(2)
  })

  it('continues rejecting duplicate delivery after active cancellation settles', async () => {
    registry.registerRequest('active', 'Hello')
    await registry.cancelTranslation('active')
    registry.unregisterRequest('active')

    expect(registry.registerRequest('active', 'Hello')).toBeNull()
    expect(registry.isCancelled('active')).toBe(true)
  })

  it('bulk-cancels every active request through exact stream cancellation', async () => {
    registry.registerRequest('one', 'Hello', 'popup')
    registry.registerRequest('two', 'World', 'sidepanel')

    await expect(registry.cancelAllTranslations()).resolves.toBe(2)

    expect(cancelStreamMock).toHaveBeenCalledWith('one', expect.anything())
    expect(cancelStreamMock).toHaveBeenCalledWith('two', expect.anything())
  })

  it('bulk-cancels only matching context requests', async () => {
    const popup = registry.registerRequest('popup-id', 'Hello', 'popup')
    const sidepanel = registry.registerRequest('sidepanel-id', 'World', 'sidepanel')

    await expect(registry.cancelAllTranslations('popup')).resolves.toBe(1)

    expect(popup.signal.aborted).toBe(true)
    expect(sidepanel.signal.aborted).toBe(false)
    expect(cancelStreamMock).toHaveBeenCalledWith('popup-id', expect.anything())
    expect(cancelStreamMock).not.toHaveBeenCalledWith('sidepanel-id', expect.anything())
  })

  it('continues bulk cancellation when one exact cancellation rejects', async () => {
    registry.registerRequest('one', 'Hello')
    registry.registerRequest('two', 'World')
    const cancelTranslation = vi.spyOn(registry, 'cancelTranslation')
      .mockRejectedValueOnce(new Error('stream failed'))
      .mockResolvedValueOnce(true)

    await expect(registry.cancelAllTranslations()).resolves.toBe(1)

    expect(cancelTranslation).toHaveBeenCalledWith('one')
    expect(cancelTranslation).toHaveBeenCalledWith('two')
  })

  it('uses a snapshot so registrations after selection are not cancelled', async () => {
    registry.registerRequest('one', 'Hello')
    const cancelTranslation = vi.spyOn(registry, 'cancelTranslation').mockImplementation(async (messageId) => {
      registry.registerRequest('late', 'Later')
      return messageId === 'one'
    })

    await expect(registry.cancelAllTranslations()).resolves.toBe(1)

    expect(cancelTranslation).toHaveBeenCalledTimes(1)
    expect(cancelTranslation).toHaveBeenCalledWith('one')
    expect(registry.getAbortController('late')).not.toBeNull()
  })

  it('prunes expired unknown cancellation tombstones', () => {
    registry.cancelledRequests.set('expired', Date.now() - 60_000)
    registry.registerRequest('normal', 'Hello')

    expect(registry.isCancelled('expired')).toBe(false)
  })

  it('retains non-expired tombstones and permits registration after expiry', () => {
    registry.cancelledRequests.set('recent', Date.now())
    expect(registry.isCancelled('recent')).toBe(true)

    registry.cancelledRequests.set('expired', Date.now() - 60_000)
    expect(registry.registerRequest('expired', 'Hello')).toBeInstanceOf(AbortController)
  })
})
