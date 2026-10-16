import { beforeEach, describe, expect, it, vi } from 'vitest';
import browser from 'webextension-polyfill';
import { tabPermissionChecker } from '@/core/tabPermissions.js';
import { handleRevertTranslation } from './handleRevertTranslation.js';

vi.mock('webextension-polyfill', () => ({
  default: {
    tabs: {
      query: vi.fn(),
      sendMessage: vi.fn()
    }
  }
}));

vi.mock('@/shared/error-management/ErrorHandler.js', () => ({
  ErrorHandler: class { handle = vi.fn(); }
}));

vi.mock('@/shared/error-management/ErrorTypes.js', () => ({ ErrorTypes: { TRANSLATION: 'TRANSLATION' } }));
vi.mock('@/shared/messaging/core/MessageActions.js', () => ({ MessageActions: { REVERT_SELECT_ELEMENT_MODE: 'REVERT' } }));
vi.mock('@/utils/UtilsFactory.js', () => ({ utilsFactory: { getCoreUtils: vi.fn(async () => ({ generateRevertMessageId: () => 'revert-id' })) } }));
vi.mock('@/shared/logging/logger.js', () => ({ getScopedLogger: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }) }));
vi.mock('@/shared/logging/logConstants.js', () => ({ LOG_COMPONENTS: { TRANSLATION: 'translation' } }));
vi.mock('@/core/tabPermissions.js', () => ({ tabPermissionChecker: { checkTabAccess: vi.fn() } }));

describe('handleRevertTranslation result forwarding', () => {
  let sendResponse;

  beforeEach(() => {
    vi.clearAllMocks();
    sendResponse = vi.fn();
    tabPermissionChecker.checkTabAccess.mockResolvedValue({ isAccessible: true });
    browser.tabs.sendMessage.mockResolvedValue({ success: true, revertedCount: 0 });
  });

  const invoke = () => handleRevertTranslation({ data: { tabId: 23 } }, {}, sendResponse);

  it('reports false acknowledgements as explicit failures without retrying', async () => {
    browser.tabs.sendMessage.mockResolvedValue(false);

    await invoke();

    expect(sendResponse).toHaveBeenCalledOnce();
    expect(sendResponse).toHaveBeenCalledWith(expect.objectContaining({ success: false, tabId: 23, revertedCount: 0, error: expect.any(String) }));
    expect(browser.tabs.sendMessage).toHaveBeenCalledOnce();
  });

  it.each([undefined, null])('reports a missing acknowledgement (%s) as failure', async response => {
    browser.tabs.sendMessage.mockResolvedValue(response);

    await invoke();

    expect(sendResponse).toHaveBeenCalledOnce();
    expect(sendResponse).toHaveBeenCalledWith(expect.objectContaining({ success: false, tabId: 23, revertedCount: 0, error: expect.any(String) }));
  });

  it('preserves explicit structured failure and duplicate-request reason', async () => {
    browser.tabs.sendMessage.mockResolvedValue({ success: false, error: 'Revert already running', reason: 'already_executing' });

    await invoke();

    expect(sendResponse).toHaveBeenCalledWith({ success: false, error: 'Revert already running', tabId: 23, revertedCount: 0, reason: 'already_executing' });
  });

  it('forwards successful zero and nonzero reverted counts', async () => {
    await invoke();
    expect(sendResponse).toHaveBeenLastCalledWith(expect.objectContaining({
      success: true,
      message: 'Translation reverted successfully',
      tabId: 23,
      revertedCount: 0
    }));

    sendResponse.mockClear();
    browser.tabs.sendMessage.mockResolvedValue({ success: true, revertedCount: 4, system: 'vue,legacy' });
    await invoke();
    expect(sendResponse).toHaveBeenCalledWith(expect.objectContaining({ success: true, tabId: 23, revertedCount: 4, system: 'vue,legacy' }));
  });

  it('preserves partial success count, systems, and subsystem errors', async () => {
    const errors = [{ system: 'legacy', error: 'cleanup failed' }];
    browser.tabs.sendMessage.mockResolvedValue({
      success: true,
      message: 'Translation reverted successfully',
      partial: true,
      revertedCount: 2,
      system: 'vue',
      errors
    });

    await invoke();

    expect(sendResponse).toHaveBeenCalledWith({
      success: true,
      message: 'Translation partially reverted',
      tabId: 23,
      revertedCount: 2,
      system: 'vue',
      partial: true,
      errors
    });
  });

  it('reports rejected sendMessage calls without presenting them as restricted pages', async () => {
    browser.tabs.sendMessage.mockRejectedValue(new Error('No receiver'));

    await invoke();

    expect(sendResponse).toHaveBeenCalledOnce();
    expect(sendResponse).toHaveBeenCalledWith(expect.objectContaining({ success: false, error: 'No receiver', tabId: 23, revertedCount: 0 }));
    expect(sendResponse.mock.calls[0][0]).not.toHaveProperty('isRestrictedPage');
  });

  it('keeps restricted-page responses graceful', async () => {
    tabPermissionChecker.checkTabAccess.mockResolvedValue({
      isAccessible: false,
      errorMessage: 'Unavailable on browser pages',
      fullUrl: 'chrome://settings'
    });

    await invoke();

    expect(sendResponse).toHaveBeenCalledOnce();
    expect(sendResponse).toHaveBeenCalledWith({
      success: false,
      message: 'Unavailable on browser pages',
      tabId: 23,
      revertedCount: 0,
      isRestrictedPage: true,
      tabUrl: 'chrome://settings'
    });
    expect(browser.tabs.sendMessage).not.toHaveBeenCalled();
  });
});
