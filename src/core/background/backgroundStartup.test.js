import { describe, expect, it, vi } from 'vitest';
import { initializeBackgroundService } from './backgroundStartup.js';

describe('initializeBackgroundService', () => {
  it('retries transient lifecycle failure and runs post-initialization once', async () => {
    const service = { initialize: vi.fn().mockRejectedValueOnce(new Error('transient')).mockResolvedValueOnce() };
    const postInitialize = vi.fn().mockResolvedValue();
    const sleep = vi.fn().mockResolvedValue();

    await initializeBackgroundService(service, postInitialize, { sleep });

    expect(service.initialize).toHaveBeenCalledTimes(2);
    expect(postInitialize).toHaveBeenCalledOnce();
    expect(sleep).toHaveBeenCalledOnce();
  });

  it('stops after bounded repeated failures without post-initialization', async () => {
    const error = new Error('permanent');
    const service = { initialize: vi.fn().mockRejectedValue(error) };
    const postInitialize = vi.fn();

    await expect(initializeBackgroundService(service, postInitialize, { sleep: vi.fn() })).rejects.toBe(error);

    expect(service.initialize).toHaveBeenCalledTimes(2);
    expect(postInitialize).not.toHaveBeenCalled();
  });

  it('does not retry successful startup', async () => {
    const service = { initialize: vi.fn().mockResolvedValue() };
    const postInitialize = vi.fn().mockResolvedValue();

    await initializeBackgroundService(service, postInitialize, { sleep: vi.fn() });

    expect(service.initialize).toHaveBeenCalledOnce();
    expect(postInitialize).toHaveBeenCalledOnce();
  });

  it('does not retry when shouldRetry is false', async () => {
    const error = new Error('context invalidated');
    const service = { initialize: vi.fn().mockRejectedValue(error) };
    const postInitialize = vi.fn();
    const sleep = vi.fn();
    const shouldRetry = vi.fn().mockReturnValue(false);

    await expect(initializeBackgroundService(service, postInitialize, { sleep, shouldRetry })).rejects.toBe(error);

    expect(service.initialize).toHaveBeenCalledTimes(1);
    expect(shouldRetry).toHaveBeenCalledWith(error);
    expect(sleep).not.toHaveBeenCalled();
    expect(postInitialize).not.toHaveBeenCalled();
  });
});
