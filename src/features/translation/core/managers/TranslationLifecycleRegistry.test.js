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

  it('rejects registration while retaining pre-cancelled provenance', async () => {
    await registry.cancelTranslation('pre-cancelled', false, undefined, 'stale-run')

    const firstController = registry.registerRequest('pre-cancelled', 'Hello')
    const secondController = registry.registerRequest('pre-cancelled', 'Hello')

    expect(firstController).toBeNull()
    expect(secondController).toBeNull()
    expect(registry.getCancellationReason('pre-cancelled')).toBe('stale-run')
    expect(registry.getAbortController('pre-cancelled')).toBeNull()
    expect(registry.isCancelled('pre-cancelled')).toBe(true)
  })

  it.each([
    ['document-replaced', 'document-replaced'],
    ['stale-run', 'stale-run'],
  ])('preserves %s tombstone provenance before registration', async (reason, expectedReason) => {
    await registry.cancelTranslation(`before-${reason}`, false, undefined, reason)

    const controller = registry.registerRequest(`before-${reason}`, 'Hello')

    expect(controller).toBeNull()
    expect(registry.getCancellationReason(`before-${reason}`)).toBe(expectedReason)
  })

  it('preserves explicit user provenance before registration', async () => {
    await registry.cancelTranslation('before-user', false, undefined, 'user-cancel')

    const controller = registry.registerRequest('before-user', 'Hello')

    expect(controller).toBeNull()
    expect(registry.getCancellationReason('before-user')).toBe('user-cancelled')
  })

  it('preserves timeout provenance before registration', async () => {
    await registry.cancelTranslation('before-timeout', true)

    const controller = registry.registerRequest('before-timeout', 'Hello')

    expect(controller).toBeNull()
    expect(registry.getCancellationReason('before-timeout')).toBe('timeout')
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

  it('preserves internal cancellation provenance on the abort signal', async () => {
    const controller = registry.registerRequest('replaced', 'Hello')

    await registry.cancelTranslation('replaced', false, undefined, 'document-replaced')

    expect(controller.signal.reason).toBe('document-replaced')
  })

  it('normalizes explicit user cancellation to user-cancelled', async () => {
    const controller = registry.registerRequest('user-cancel', 'Hello')

    await registry.cancelTranslation('user-cancel', false, undefined, 'user-cancel')

    expect(controller.signal.reason).toBe('user-cancelled')
  })

  it('preserves timeout classification while aborting active work', async () => {
    const controller = registry.registerRequest('timed-out', 'Hello')

    await registry.cancelTranslation('timed-out', true)

    expect(controller.signal.aborted).toBe(true)
    expect(controller.signal.reason).toBe('timeout')
    expect(cancelStreamMock).toHaveBeenCalledWith('timed-out', expect.anything(), true)
  })

  it('forwards the timeout reason to stream completion', async () => {
    await registry.cancelTranslation(
      'timed-out',
      true,
      'PROGRESS_TIMEOUT',
      'Streaming translation timed out'
    )

    expect(cancelStreamMock).toHaveBeenCalledWith(
      'timed-out',
      'Streaming translation timed out',
      true,
      'PROGRESS_TIMEOUT'
    )
  })

  it('continues rejecting duplicate delivery after active cancellation settles', async () => {
    registry.registerRequest('active', 'Hello')
    await registry.cancelTranslation('active')
    registry.unregisterRequest('active')

    expect(registry.registerRequest('active', 'Hello')).toBeNull()
    expect(registry.getCancellationReason('active')).toBe('operation-abort')
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
    registry.cancelledRequests.set('expired', {
      timestamp: Date.now() - 60_000,
      reason: 'stale-run',
    })
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
