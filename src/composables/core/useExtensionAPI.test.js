import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApp } from 'vue';
import { MessageActions } from '@/shared/messaging/core/MessageActions.js';

const sendMessage = vi.hoisted(() => vi.fn());

vi.mock('@/shared/messaging/composables/useMessaging.js', () => ({
  useMessaging: () => ({
    createMessage: (action, data) => ({ action, data }),
    sendMessage
  })
}));

vi.mock('@/shared/logging/logger.js', () => ({
  getScopedLogger: () => ({
    debug: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn()
  })
}));

import { useExtensionAPI } from './useExtensionAPI.js';

describe('useExtensionAPI.translateText', () => {
  const apps = [];

  function withSetup(composable) {
    let result;
    const app = createApp({
      setup() {
        result = composable();
        return () => null;
      },
    });
    app.mount(document.createElement('div'));
    apps.push(app);
    return result;
  }

  afterEach(() => {
    apps.splice(0).forEach(app => app.unmount());
  });

  it('keeps successful response behavior unchanged', async () => {
    const response = { success: true, translation: 'سلام' };
    sendMessage.mockResolvedValue(response);

    await expect(withSetup(useExtensionAPI).translateText('Hello')).resolves.toBe(response);
    expect(sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({ action: MessageActions.TRANSLATE_TEXT })
    );
  });

  it('keeps legacy thrown error message behavior unchanged', async () => {
    sendMessage.mockRejectedValue(new Error('Provider failed'));

    await expect(withSetup(useExtensionAPI).translateText('Hello')).rejects.toThrow('Provider failed');
  });

  it('preserves canonical identity on reconstructed translation failures', async () => {
    sendMessage.mockRejectedValue(Object.assign(new Error('Model unavailable'), {
      type: 'MODEL_NOT_FOUND',
      statusCode: 404,
      providerName: 'Provider',
      providerId: 'provider-id',
      code: 'MODEL_MISSING',
      errorCode: 'E_MODEL'
    }));

    await expect(withSetup(useExtensionAPI).translateText('Hello')).rejects.toMatchObject({
      message: 'Model unavailable',
      type: 'MODEL_NOT_FOUND',
      statusCode: 404,
      providerName: 'Provider',
      providerId: 'provider-id',
      code: 'MODEL_MISSING',
      errorCode: 'E_MODEL'
    });
  });

  it('does not expose the removed uppercase context-menu action', () => {
    expect(withSetup(useExtensionAPI)).not.toHaveProperty('updateContextMenu');
  });

  it('does not expose the removed provider status API', () => {
    expect(withSetup(useExtensionAPI)).not.toHaveProperty('getProviderStatus');
  });
});
