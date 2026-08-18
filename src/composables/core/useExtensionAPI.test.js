import { describe, expect, it, vi } from 'vitest';
import { MessageActions } from '@/shared/messaging/core/MessageActions.js';

const sendMessage = vi.hoisted(() => vi.fn());

vi.mock('@/shared/messaging/composables/useMessaging.js', () => ({
  useMessaging: () => ({
    createMessage: (action, data) => ({ action, data }),
    sendMessage
  })
}));

vi.mock('@/shared/logging/logger.js', () => ({
  getScopedLogger: () => ({ error: vi.fn() })
}));

import { useExtensionAPI } from './useExtensionAPI.js';

describe('useExtensionAPI.translateText', () => {
  it('keeps successful response behavior unchanged', async () => {
    const response = { success: true, translation: 'سلام' };
    sendMessage.mockResolvedValue(response);

    await expect(useExtensionAPI().translateText('Hello')).resolves.toBe(response);
    expect(sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({ action: MessageActions.TRANSLATE_TEXT })
    );
  });

  it('keeps legacy thrown error message behavior unchanged', async () => {
    sendMessage.mockRejectedValue(new Error('Provider failed'));

    await expect(useExtensionAPI().translateText('Hello')).rejects.toThrow('Provider failed');
  });
});
