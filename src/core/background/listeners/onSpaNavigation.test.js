import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  sendMessage: vi.fn(),
  historyStateAddListener: vi.fn(),
  referenceFragmentAddListener: vi.fn(),
  debug: vi.fn(),
}));

vi.mock('webextension-polyfill', () => ({
  default: {
    tabs: { sendMessage: mocks.sendMessage },
    webNavigation: {
      onHistoryStateUpdated: { addListener: mocks.historyStateAddListener },
      onReferenceFragmentUpdated: { addListener: mocks.referenceFragmentAddListener },
    },
  },
}));

vi.mock('@/shared/logging/logger.js', () => ({
  getScopedLogger: () => ({ debug: mocks.debug }),
}));

vi.mock('@/shared/logging/logConstants.js', () => ({
  LOG_COMPONENTS: { BACKGROUND: 'background' },
}));

import { MessageActions } from '@/shared/messaging/core/MessageActions.js';
import { handleSpaNavigation } from './onSpaNavigation.js';

describe('SPA navigation listener', () => {
  beforeEach(() => {
    mocks.sendMessage.mockClear();
    mocks.debug.mockClear();
    mocks.sendMessage.mockResolvedValue(undefined);
  });

  it('registers once with webNavigation history updates', () => {
    expect(mocks.historyStateAddListener).toHaveBeenCalledTimes(1);
    expect(mocks.historyStateAddListener).toHaveBeenCalledWith(handleSpaNavigation);
  });

  it('registers the same handler for reference fragment updates', () => {
    expect(mocks.referenceFragmentAddListener).toHaveBeenCalledTimes(1);
    expect(mocks.referenceFragmentAddListener).toHaveBeenCalledWith(handleSpaNavigation);
  });

  it('forwards top-frame navigation without trusting URL payload', async () => {
    await handleSpaNavigation({ tabId: 42, frameId: 0, url: 'https://ignored.example/' });

    expect(mocks.sendMessage).toHaveBeenCalledWith(42, {
      action: MessageActions.SPA_NAVIGATION,
    }, {
      frameId: 0,
    });
  });

  it('ignores subframe navigation', async () => {
    await handleSpaNavigation({ tabId: 42, frameId: 3 });

    expect(mocks.sendMessage).not.toHaveBeenCalled();
  });

  it('contains tab message failures', async () => {
    mocks.sendMessage.mockRejectedValue(new Error('tab closed'));

    await expect(handleSpaNavigation({ tabId: 42, frameId: 0 })).resolves.toBeUndefined();
    expect(mocks.debug).toHaveBeenCalled();
  });
});
