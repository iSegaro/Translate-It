import { beforeEach, describe, expect, it, vi } from 'vitest';
import browser from 'webextension-polyfill';
import { MessageActions } from '@/shared/messaging/core/MessageActions.js';
import { ActionReasons } from '@/shared/messaging/core/MessagingConstants.js';
import { tabPermissionChecker } from '@/core/tabPermissions.js';
import { handlePageTranslation } from './handlePageTranslation.js';

vi.mock('webextension-polyfill', () => ({
  default: {
    runtime: {
      sendMessage: vi.fn(),
    },
    tabs: {
      query: vi.fn(),
      sendMessage: vi.fn(),
      onRemoved: { addListener: vi.fn() },
    },
    webNavigation: {
      getAllFrames: vi.fn(),
      onCommitted: { addListener: vi.fn() },
    },
  },
}));

vi.mock('@/shared/logging/logger.js', () => ({
  getScopedLogger: () => ({
    debug: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
  }),
}));

vi.mock('@/core/extensionContext.js', () => ({
  default: {
    isContextError: vi.fn(() => false),
    handleContextError: vi.fn(),
  },
}));

vi.mock('@/core/services/translation/UnifiedTranslationService.js', () => ({
  unifiedTranslationService: {
    handleTranslationRequest: vi.fn(),
    clearPageSourceSession: vi.fn(),
  },
}));

vi.mock('@/features/translation/core/TranslationStatsManager.js', () => ({
  statsManager: {
    printSummary: vi.fn(),
    clearSession: vi.fn(),
  },
}));

vi.mock('@/core/tabPermissions.js', () => ({
  tabPermissionChecker: {
    checkTabAccess: vi.fn(),
  },
}));

const sender = { tab: { id: 42 } };

function setupFrames(frameResults, { activeTabId = 42 } = {}) {
  browser.tabs.query.mockResolvedValue([{ id: activeTabId }]);
  tabPermissionChecker.checkTabAccess.mockResolvedValue({
    isAccessible: true,
  });
  browser.webNavigation.getAllFrames.mockResolvedValue(
    frameResults.map(({ frameId }) => ({
      frameId,
      url: frameId === 0 ? 'https://example.com' : `https://frame-${frameId}.example`,
    }))
  );
  browser.tabs.sendMessage.mockImplementation((_tabId, _message, { frameId }) => {
    const frame = frameResults.find(candidate => candidate.frameId === frameId);
    if (frame?.error) return Promise.reject(frame.error);
    return Promise.resolve(frame?.response);
  });
}

describe('handlePageTranslation response projection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it.each([
    ActionReasons.BUSY_OR_DONE,
    ActionReasons.NOT_SUITABLE,
    ActionReasons.USER_CANCELLED,
    ActionReasons.SILENT_ERROR,
  ])('promotes %s from main-frame rejection', async (reason) => {
    const mainResponse = { success: false, reason };
    setupFrames([{ frameId: 0, response: mainResponse }]);

    const result = await handlePageTranslation({ action: MessageActions.PAGE_TRANSLATE }, sender);

    expect(result).toEqual({
      success: false,
      reason,
      responses: [mainResponse],
    });
  });

  it('prefers main-frame rejection over a child-frame rejection', async () => {
    const mainResponse = { success: false, reason: ActionReasons.NOT_SUITABLE };
    const childResponse = { success: false, reason: ActionReasons.BUSY_OR_DONE };
    setupFrames([
      { frameId: 0, response: mainResponse },
      { frameId: 1, response: childResponse },
    ]);

    const result = await handlePageTranslation({ action: MessageActions.PAGE_TRANSLATE }, sender);

    expect(result.reason).toBe(ActionReasons.NOT_SUITABLE);
    expect(result.responses).toEqual([mainResponse, childResponse]);
  });

  it('uses first resolved child rejection when main frame transport fails', async () => {
    const childResponse = { success: false, reason: ActionReasons.NOT_SUITABLE };
    setupFrames([
      { frameId: 0, error: new Error('main frame unavailable') },
      { frameId: 1, response: childResponse },
    ]);

    const result = await handlePageTranslation({ action: MessageActions.PAGE_TRANSLATE }, sender);

    expect(result).toEqual({
      success: false,
      reason: ActionReasons.NOT_SUITABLE,
      responses: [childResponse],
    });
    expect(result.isTransportFailure).toBeUndefined();
  });

  it('promotes structured failure fields without mutating nested response', async () => {
    const errorDetails = {
      message: 'Provider failed',
      type: 'NETWORK_ERROR',
      providerId: 'provider-id',
      translationOutcome: { committedParentCount: 0 },
    };
    const mainResponse = {
      success: false,
      error: 'Safe provider failure',
      errorType: 'NETWORK_ERROR',
      errorDetails,
      message: 'Legacy message',
      tabId: 42,
      tabUrl: 'https://example.com',
      internalOnly: 'not-promoted',
    };
    setupFrames([{ frameId: 0, response: mainResponse }]);

    const result = await handlePageTranslation({ action: MessageActions.PAGE_TRANSLATE }, sender);

    expect(result).toMatchObject({
      success: false,
      error: 'Safe provider failure',
      errorType: 'NETWORK_ERROR',
      errorDetails,
      message: 'Legacy message',
      tabId: 42,
      tabUrl: 'https://example.com',
      responses: [mainResponse],
    });
    expect(result).not.toHaveProperty('internalOnly');
    expect(result.responses[0]).toBe(mainResponse);
  });

  it('keeps mixed-frame success semantics and nested rejection data', async () => {
    const mainResponse = { success: false, reason: ActionReasons.NOT_SUITABLE };
    const childResponse = { success: true, messageId: 'child-session' };
    setupFrames([
      { frameId: 0, response: mainResponse },
      { frameId: 1, response: childResponse },
    ]);

    const result = await handlePageTranslation({ action: MessageActions.PAGE_TRANSLATE }, sender);

    expect(result).toEqual({
      success: true,
      responses: [mainResponse, childResponse],
    });
    expect(result).not.toHaveProperty('reason');
    expect(result.isTransportFailure).toBeUndefined();
  });

  it('keeps domain rejection when another frame has a transport failure', async () => {
    const childResponse = { success: false, reason: ActionReasons.BUSY_OR_DONE };
    setupFrames([
      { frameId: 0, error: new Error('main frame unavailable') },
      { frameId: 1, response: childResponse },
    ]);

    const result = await handlePageTranslation({ action: MessageActions.PAGE_TRANSLATE }, sender);

    expect(result.reason).toBe(ActionReasons.BUSY_OR_DONE);
    expect(result.error).toBeUndefined();
    expect(result.isTransportFailure).toBeUndefined();
  });

  it('returns explicit transport failure when every frame send fails', async () => {
    setupFrames([
      { frameId: 0, error: new Error('main frame unavailable') },
      { frameId: 1, error: new Error('child frame unavailable') },
    ]);

    const result = await handlePageTranslation({ action: MessageActions.PAGE_TRANSLATE }, sender);

    expect(result).toEqual({
      success: false,
      error: 'Content script not available',
      isTransportFailure: true,
      responses: [],
    });
    expect(result.reason).toBeUndefined();
  });

  it('preserves restricted-page response without frame aggregation', async () => {
    const restrictedResponse = {
      isAccessible: false,
      errorMessage: 'Restricted page',
      fullUrl: 'about:blank',
    };
    tabPermissionChecker.checkTabAccess.mockResolvedValue(restrictedResponse);
    browser.tabs.query.mockResolvedValue([{ id: 42 }]);

    const result = await handlePageTranslation({ action: MessageActions.PAGE_TRANSLATE }, sender);

    expect(result).toEqual({
      success: false,
      message: 'Restricted page',
      isRestrictedPage: true,
      tabId: 42,
      tabUrl: 'about:blank',
    });
    expect(browser.webNavigation.getAllFrames).not.toHaveBeenCalled();
    expect(browser.tabs.sendMessage).not.toHaveBeenCalled();
  });

  it('keeps restore aggregate response shape unchanged', async () => {
    const mainResponse = { success: false, reason: ActionReasons.NOT_SUITABLE };
    setupFrames([{ frameId: 0, response: mainResponse }]);

    const result = await handlePageTranslation({ action: MessageActions.PAGE_RESTORE }, sender);

    expect(result).toEqual({
      success: false,
      responses: [mainResponse],
    });
    expect(result.reason).toBeUndefined();
  });
});

describe('handlePageTranslation target tab ownership', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it.each([
    MessageActions.PAGE_TRANSLATE,
    MessageActions.PAGE_RESTORE,
    MessageActions.PAGE_TRANSLATE_GET_STATUS,
    MessageActions.PAGE_TRANSLATE_STOP_AUTO,
  ])('uses sender tab for %s instead of active tab', async (action) => {
    setupFrames([
      { frameId: 0, response: { success: true, isAggregated: action === MessageActions.PAGE_TRANSLATE_GET_STATUS } },
      { frameId: 1, response: { success: true } },
    ], { activeTabId: 20 });

    const message = {
      action,
      tabId: 20,
      ...(action === MessageActions.PAGE_TRANSLATE
        ? { data: { cancel: true, tabId: 20 } }
        : {}),
    };
    const result = await handlePageTranslation(message, { tab: { id: 10 } });

    expect(result.success).toBe(true);
    expect(browser.tabs.query).not.toHaveBeenCalled();
    expect(tabPermissionChecker.checkTabAccess).toHaveBeenCalledWith(10);
    expect(browser.webNavigation.getAllFrames).toHaveBeenCalledWith({ tabId: 10 });
    expect(browser.tabs.sendMessage).toHaveBeenCalledTimes(2);
    expect(browser.tabs.sendMessage.mock.calls.every(([tabId]) => tabId === 10)).toBe(true);
    expect(browser.tabs.sendMessage.mock.calls.some(([tabId]) => tabId === 20)).toBe(false);
  });

  it.each([{}, { tab: null }])('preserves active-tab fallback without sender tab: %o', async (sender) => {
    setupFrames([
      { frameId: 0, response: { success: true } },
      { frameId: 1, response: { success: true } },
    ], { activeTabId: 20 });

    const result = await handlePageTranslation(
      { action: MessageActions.PAGE_TRANSLATE },
      sender
    );

    expect(result.success).toBe(true);
    expect(browser.tabs.query).toHaveBeenCalledWith({ active: true, currentWindow: true });
    expect(tabPermissionChecker.checkTabAccess).toHaveBeenCalledWith(20);
    expect(browser.webNavigation.getAllFrames).toHaveBeenCalledWith({ tabId: 20 });
    expect(browser.tabs.sendMessage.mock.calls.every(([tabId]) => tabId === 20)).toBe(true);
  });

  it.each([
    { tab: {} },
    { tab: { id: null } },
    { tab: { id: '10' } },
    { tab: { id: Number.NaN } },
    { tab: { id: 1.5 } },
  ])('rejects malformed sender tab without active-tab fallback: %o', async (sender) => {
    browser.tabs.query.mockResolvedValue([{ id: 20 }]);

    const result = await handlePageTranslation(
      { action: MessageActions.PAGE_TRANSLATE },
      sender
    );

    expect(result).toEqual({ success: false, error: 'Invalid sender tab' });
    expect(browser.tabs.query).not.toHaveBeenCalled();
    expect(tabPermissionChecker.checkTabAccess).not.toHaveBeenCalled();
    expect(browser.webNavigation.getAllFrames).not.toHaveBeenCalled();
    expect(browser.tabs.sendMessage).not.toHaveBeenCalled();
  });

  it('reports restricted sender tab metadata without inspecting active tab', async () => {
    setupFrames([{ frameId: 0, response: { success: true } }], { activeTabId: 20 });
    tabPermissionChecker.checkTabAccess.mockResolvedValueOnce({
      isAccessible: false,
      errorMessage: 'Restricted tab',
      fullUrl: 'about:blank',
    });

    const result = await handlePageTranslation(
      { action: MessageActions.PAGE_TRANSLATE },
      { tab: { id: 10 } }
    );

    expect(result).toEqual({
      success: false,
      message: 'Restricted tab',
      isRestrictedPage: true,
      tabId: 10,
      tabUrl: 'about:blank',
    });
    expect(browser.tabs.query).not.toHaveBeenCalled();
    expect(browser.webNavigation.getAllFrames).not.toHaveBeenCalled();
    expect(browser.tabs.sendMessage).not.toHaveBeenCalled();
  });

  it('preserves status aggregation while targeting sender tab', async () => {
    const aggregatedResponse = {
      success: true,
      isAggregated: true,
      translatedCount: 4,
    };
    setupFrames([
      { frameId: 0, response: aggregatedResponse },
      { frameId: 1, response: { success: true, translatedCount: 2 } },
    ], { activeTabId: 20 });

    const result = await handlePageTranslation(
      { action: MessageActions.PAGE_TRANSLATE_GET_STATUS },
      { tab: { id: 10 } }
    );

    expect(result).toBe(aggregatedResponse);
    expect(browser.tabs.query).not.toHaveBeenCalled();
    expect(tabPermissionChecker.checkTabAccess).toHaveBeenCalledWith(10);
    expect(browser.webNavigation.getAllFrames).toHaveBeenCalledWith({ tabId: 10 });
    expect(browser.tabs.sendMessage.mock.calls.every(([tabId]) => tabId === 10)).toBe(true);
  });
});
