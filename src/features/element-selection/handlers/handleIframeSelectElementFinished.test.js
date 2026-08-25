import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/shared/logging/logger.js', () => ({
  getScopedLogger: vi.fn(() => ({
    warn: vi.fn(),
  })),
}));

vi.mock('@/shared/messaging/core/MessageActions.js', () => ({
  MessageActions: {
    DEACTIVATE_SELECT_ELEMENT_MODE: 'DEACTIVATE_SELECT_ELEMENT_MODE',
  },
}));

vi.mock('./handleDeactivateSelectElementMode.js', () => ({
  handleDeactivateSelectElementMode: vi.fn(),
}));

import { MessageActions } from '@/shared/messaging/core/MessageActions.js';
import { handleDeactivateSelectElementMode } from './handleDeactivateSelectElementMode.js';
import { handleIframeSelectElementFinished } from './handleIframeSelectElementFinished.js';

describe('handleIframeSelectElementFinished', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    handleDeactivateSelectElementMode.mockResolvedValue({ success: true, active: false });
  });

  it('delegates valid child-frame completion using browser sender identity', async () => {
    const response = await handleIframeSelectElementFinished({
      data: { tabId: 999, frameId: 999, reason: 'success' },
    }, {
      tab: { id: 42 },
      frameId: 3,
    });

    expect(response).toEqual({ success: true, active: false });
    expect(handleDeactivateSelectElementMode).toHaveBeenCalledWith(
      {
        action: MessageActions.DEACTIVATE_SELECT_ELEMENT_MODE,
        data: { reason: 'success' },
      },
      { tab: { id: 42 }, frameId: 3 },
    );
  });

  it.each([
    [{ tab: { id: 42 } }, 'missing frameId'],
    [{ tab: { id: 42 }, frameId: 0 }, 'top frame'],
    [{ tab: { id: 42 }, frameId: -1 }, 'negative frameId'],
    [{ tab: { id: 42 }, frameId: 1.5 }, 'non-integer frameId'],
    [{ frameId: 1 }, 'missing tab'],
  ])('rejects %s sender', async (sender) => {
    const response = await handleIframeSelectElementFinished({ data: { tabId: 999 } }, sender);

    expect(response).toEqual({
      success: false,
      error: 'Invalid iframe Select Element completion sender',
    });
    expect(handleDeactivateSelectElementMode).not.toHaveBeenCalled();
  });
});
