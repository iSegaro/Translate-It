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
const PRE_FANOUT_TIMEOUT_MS = 1500;
const PRE_FANOUT_TIMEOUT_REASON = 'pre_fanout_command_timeout';
const onCommittedListener = browser.webNavigation.onCommitted.addListener.mock.calls[0][0];

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

async function expectPreFanoutTimeout(resultPromise) {
  await vi.advanceTimersByTimeAsync(PRE_FANOUT_TIMEOUT_MS);
  await expect(resultPromise).resolves.toEqual({
    success: false,
    reason: PRE_FANOUT_TIMEOUT_REASON,
    isTransportFailure: true,
  });
  expect(browser.tabs.sendMessage).not.toHaveBeenCalled();
  expect(vi.getTimerCount()).toBe(0);
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
      frames: [{ frameId: 0, success: true }],
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
    expect(result.frames).toEqual([
      { frameId: 0, success: true },
      { frameId: 1, success: true },
    ]);
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
      frames: [
        { frameId: 0, success: false },
        { frameId: 1, success: true },
      ],
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
      frames: [
        { frameId: 0, success: true },
        { frameId: 1, success: true },
      ],
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
      frames: [
        { frameId: 0, success: false },
        { frameId: 1, success: false },
      ],
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
      frames: [{ frameId: 0, success: true }],
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

  it('keeps Stop as command fan-out when one frame is unavailable', async () => {
    setupFrames([
      { frameId: 0, response: { success: true } },
      { frameId: 1, error: new Error('child frame unavailable') },
      { frameId: 2, response: { success: true } },
    ]);

    const result = await handlePageTranslation(
      { action: MessageActions.PAGE_TRANSLATE_STOP_AUTO },
      sender
    );

    expect(browser.tabs.sendMessage).toHaveBeenCalledTimes(3);
    expect(browser.tabs.sendMessage.mock.calls).toEqual(expect.arrayContaining([
      [42, expect.objectContaining({ action: MessageActions.PAGE_TRANSLATE_STOP_AUTO }), { frameId: 0 }],
      [42, expect.objectContaining({ action: MessageActions.PAGE_TRANSLATE_STOP_AUTO }), { frameId: 1 }],
      [42, expect.objectContaining({ action: MessageActions.PAGE_TRANSLATE_STOP_AUTO }), { frameId: 2 }],
    ]));
    expect(result).toEqual({
      success: true,
      responses: [{ success: true }, { success: true }],
      frames: [
        { frameId: 0, success: true },
        { frameId: 1, success: false },
        { frameId: 2, success: true },
      ],
    });
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

  it('bounds stalled active-tab lookup before fan-out', async () => {
    vi.useFakeTimers();
    try {
      browser.tabs.query.mockReturnValue(new Promise(() => {}));

      const resultPromise = handlePageTranslation(
        { action: MessageActions.PAGE_TRANSLATE },
        {}
      );

      await expectPreFanoutTimeout(resultPromise);
    } finally {
      vi.useRealTimers();
    }
  });

  it('bounds stalled tab-access lookup before fan-out', async () => {
    vi.useFakeTimers();
    try {
      tabPermissionChecker.checkTabAccess.mockReturnValue(new Promise(() => {}));

      const resultPromise = handlePageTranslation(
        { action: MessageActions.PAGE_TRANSLATE },
        sender
      );

      await expectPreFanoutTimeout(resultPromise);
    } finally {
      vi.useRealTimers();
    }
  });

  it('bounds stalled frame discovery before fan-out', async () => {
    vi.useFakeTimers();
    try {
      tabPermissionChecker.checkTabAccess.mockResolvedValue({ isAccessible: true });
      browser.webNavigation.getAllFrames.mockReturnValue(new Promise(() => {}));

      const resultPromise = handlePageTranslation(
        { action: MessageActions.PAGE_TRANSLATE },
        sender
      );

      await expectPreFanoutTimeout(resultPromise);
    } finally {
      vi.useRealTimers();
    }
  });

  it.each([
    MessageActions.PAGE_TRANSLATE,
    MessageActions.PAGE_RESTORE,
    MessageActions.PAGE_TRANSLATE_GET_STATUS,
    MessageActions.PAGE_TRANSLATE_STOP_AUTO,
  ])('bounds shared preparation for %s', async (action) => {
    vi.useFakeTimers();
    try {
      tabPermissionChecker.checkTabAccess.mockResolvedValue({ isAccessible: true });
      browser.webNavigation.getAllFrames.mockReturnValue(new Promise(() => {}));

      const resultPromise = handlePageTranslation({ action }, sender);

      await expectPreFanoutTimeout(resultPromise);
    } finally {
      vi.useRealTimers();
    }
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

describe('trusted frame lifecycle relay', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    browser.tabs.sendMessage.mockResolvedValue({ success: true, aggregated: true });
  });

  it('authenticates sender tab/frame and ignores payload frame identity', async () => {
    const data = {
      translatedCount: 2,
      totalCount: 3,
      frameId: 99,
      frameUrl: 'https://attacker.example',
    };

    const result = await handlePageTranslation({
      action: MessageActions.PAGE_TRANSLATION_FRAME_LIFECYCLE,
      data: {
        action: MessageActions.PAGE_TRANSLATE_PROGRESS,
        data,
      },
    }, { tab: { id: 42 }, frameId: 7 });

    expect(result).toEqual({ success: true, aggregated: true });
    expect(browser.tabs.sendMessage).toHaveBeenCalledWith(42, {
      action: MessageActions.PAGE_TRANSLATION_FRAME_LIFECYCLE,
      data: {
        frameId: 7,
        action: MessageActions.PAGE_TRANSLATE_PROGRESS,
        data,
      },
      context: 'page-translation-frame-lifecycle-relay',
    }, { frameId: 0 });
  });

  it('relays retirement with sender frame identity and top-frame targeting', async () => {
    const result = await handlePageTranslation({
      action: MessageActions.PAGE_TRANSLATION_FRAME_LIFECYCLE,
      data: {
        action: MessageActions.PAGE_TRANSLATION_FRAME_RETIRED,
        tabId: 99,
        frameId: 99,
        data: { sessionId: 'child-session', tabId: 98, frameId: 98 },
      },
    }, { tab: { id: 42 }, frameId: 7 });

    expect(result).toEqual({ success: true, aggregated: true });
    expect(browser.tabs.sendMessage).toHaveBeenCalledWith(42, {
      action: MessageActions.PAGE_TRANSLATION_FRAME_LIFECYCLE,
      data: {
        frameId: 7,
        action: MessageActions.PAGE_TRANSLATION_FRAME_RETIRED,
        data: { sessionId: 'child-session', tabId: 98, frameId: 98 },
      },
      context: 'page-translation-frame-lifecycle-relay',
      }, { frameId: 0 });
  });

  it.each([
    {},
    { sessionId: 'session-a' },
    { data: { sessionId: '' } },
    { data: { sessionId: 42 } },
  ])('ignores runtime retirement without valid nested session: %o', async (retirementData) => {
    const result = await handlePageTranslation({
      action: MessageActions.PAGE_TRANSLATION_FRAME_LIFECYCLE,
      data: {
        action: MessageActions.PAGE_TRANSLATION_FRAME_RETIRED,
        ...retirementData,
      },
    }, { tab: { id: 42 }, frameId: 7 });

    expect(result).toEqual({ success: true, ignored: true, reason: 'missing-session' });
    expect(browser.tabs.sendMessage).not.toHaveBeenCalled();
  });

  it('relays top-frame lifecycle with sender frame zero', async () => {
    await handlePageTranslation({
      action: MessageActions.PAGE_TRANSLATION_FRAME_LIFECYCLE,
      data: {
        action: MessageActions.PAGE_TRANSLATE_START,
        data: { messageId: 'top-session' },
      },
    }, { tab: { id: 42 }, frameId: 0 });

    expect(browser.tabs.sendMessage).toHaveBeenCalledWith(
      42,
      expect.objectContaining({ data: expect.objectContaining({ frameId: 0 }) }),
      { frameId: 0 }
    );
  });

  it.each([
    {},
    { tab: null },
    { tab: { id: '42' }, frameId: 7 },
    { tab: { id: 42 }, frameId: undefined },
    { tab: { id: 42 }, frameId: -1 },
  ])('fails closed for malformed lifecycle sender: %o', async (sender) => {
    const result = await handlePageTranslation({
      action: MessageActions.PAGE_TRANSLATION_FRAME_LIFECYCLE,
      data: { action: MessageActions.PAGE_TRANSLATE_PROGRESS, data: {} },
    }, sender);

    expect(result).toEqual({ success: false, error: 'Invalid lifecycle sender' });
    expect(browser.tabs.sendMessage).not.toHaveBeenCalled();
    expect(browser.tabs.query).not.toHaveBeenCalled();
  });

  it('rejects lifecycle actions outside allowlist', async () => {
    const result = await handlePageTranslation({
      action: MessageActions.PAGE_TRANSLATION_FRAME_LIFECYCLE,
      data: { action: 'PAGE_TRANSLATE', data: {} },
    }, { tab: { id: 42 }, frameId: 7 });

    expect(result).toEqual({ success: false, error: 'Unsupported page lifecycle action' });
    expect(browser.tabs.sendMessage).not.toHaveBeenCalled();
  });

  it('does not classify Stop as frame lifecycle', async () => {
    const result = await handlePageTranslation({
      action: MessageActions.PAGE_TRANSLATION_FRAME_LIFECYCLE,
      data: { action: MessageActions.PAGE_TRANSLATE_STOP_AUTO, data: {} },
    }, { tab: { id: 42 }, frameId: 7 });

    expect(result).toEqual({ success: false, error: 'Unsupported page lifecycle action' });
    expect(browser.tabs.sendMessage).not.toHaveBeenCalled();
  });
});

describe('trusted subframe navigation retirement', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    browser.runtime.sendMessage.mockResolvedValue({ success: true });
    browser.tabs.sendMessage.mockResolvedValue({ success: true, retired: true });
  });

  it('retires subframe state before relaying replacement lifecycle', async () => {
    let resolveRetirement;
    const retirementResponse = new Promise(resolve => {
      resolveRetirement = resolve;
    });

    browser.tabs.sendMessage.mockImplementation((_tabId, message) => {
      if (message.data?.action === MessageActions.PAGE_TRANSLATION_FRAME_RETIRED) {
        return retirementResponse;
      }
      return Promise.resolve({ success: true, aggregated: true });
    });

    const navigation = onCommittedListener({ tabId: 42, frameId: 7, transitionType: 'link' });
    const lifecycle = handlePageTranslation({
      action: MessageActions.PAGE_TRANSLATION_FRAME_LIFECYCLE,
      data: {
        action: MessageActions.PAGE_TRANSLATE_START,
        data: { sessionId: 'replacement-session' },
      },
    }, { tab: { id: 42 }, frameId: 7 });

    await vi.waitFor(() => expect(browser.tabs.sendMessage).toHaveBeenCalledTimes(1));
    expect(browser.tabs.sendMessage).toHaveBeenNthCalledWith(1, 42, {
      action: MessageActions.PAGE_TRANSLATION_FRAME_LIFECYCLE,
      data: {
        frameId: 7,
        action: MessageActions.PAGE_TRANSLATION_FRAME_RETIRED,
      },
      context: 'page-translation-frame-retirement',
    }, { frameId: 0 });

    resolveRetirement({ success: true, retired: true });
    await expect(navigation).resolves.toEqual({ success: true, retired: true });
    await expect(lifecycle).resolves.toEqual({ success: true, aggregated: true });

    expect(browser.tabs.sendMessage.mock.calls.map(([, message]) => message.data.action)).toEqual([
      MessageActions.PAGE_TRANSLATION_FRAME_RETIRED,
      MessageActions.PAGE_TRANSLATE_START,
    ]);
  });

  it('keeps top-level navigation on existing auto-translation path', async () => {
    await handlePageTranslation({
      action: MessageActions.PAGE_TRANSLATE_COMPLETE,
      data: {
        sessionId: 'auto-session',
        translatedCount: 1,
        totalCount: 1,
        isAutoTranslating: true,
      },
    }, sender);

    await onCommittedListener({ tabId: 42, frameId: 0, transitionType: 'reload' });

    expect(browser.tabs.sendMessage).not.toHaveBeenCalled();
  });
});

describe('bounded frame command response deadline', () => {
  const RESPONSE_TIMEOUT_MS = 6000;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function setupBoundedFrames(frameHandlers, { activeTabId = 42 } = {}) {
    browser.tabs.query.mockResolvedValue([{ id: activeTabId }]);
    tabPermissionChecker.checkTabAccess.mockResolvedValue({ isAccessible: true });
    browser.webNavigation.getAllFrames.mockResolvedValue(
      frameHandlers.map((_, index) => ({
        frameId: index === 0 ? 0 : index * 7,
        url: `https://frame-${index}.example`,
      }))
    );
    browser.tabs.sendMessage.mockImplementation((_tabId, _message, { frameId }) => {
      const handler = frameHandlers.find(candidate => candidate.frameId === frameId);
      return handler ? handler.run() : Promise.resolve({ success: true });
    });
  }

  const never = () => new Promise(() => {});
  const deferred = () => {
    let resolve;
    let reject;
    const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
    return { promise, resolve, reject };
  };

  it.each([
    ['translates', MessageActions.PAGE_TRANSLATE],
    ['restores', MessageActions.PAGE_RESTORE],
    ['stops', MessageActions.PAGE_TRANSLATE_STOP_AUTO],
  ])('settles a hanging child after the inner deadline and preserves successful siblings for %s', async (_name, action) => {
    setupBoundedFrames([
      { frameId: 0, run: () => Promise.resolve({ success: true, messageId: 'main' }) },
      { frameId: 7, run: never },
      { frameId: 14, run: () => Promise.resolve({ success: true, messageId: 'child' }) },
    ]);

    const resultPromise = handlePageTranslation({ action }, sender);
    await vi.advanceTimersByTimeAsync(RESPONSE_TIMEOUT_MS + 100);
    const result = await resultPromise;

    expect(result.success).toBe(true);
    expect(result.responses).toEqual([
      { success: true, messageId: 'main' },
      { success: true, messageId: 'child' },
    ]);
    expect(result.frames).toEqual([
      { frameId: 0, success: true },
      { frameId: 7, success: false, isResponseTimeout: true, reason: 'frame_command_response_timeout' },
      { frameId: 14, success: true },
    ]);
  });

  it('classifies immediate transport rejection distinctly from response timeout', async () => {
    setupBoundedFrames([
      { frameId: 0, run: () => Promise.resolve({ success: true }) },
      { frameId: 7, run: () => Promise.reject(new Error('Could not establish connection. Receiving end does not exist.')) },
    ]);

    const result = await handlePageTranslation({ action: MessageActions.PAGE_RESTORE }, sender);

    expect(result.success).toBe(true);
    expect(result.frames).toEqual([
      { frameId: 0, success: true },
      { frameId: 7, success: false },
    ]);
    expect(result.frames.some(frame => frame.isResponseTimeout)).toBe(false);
  });

  it('returns an uncertainty result when every frame response times out', async () => {
    setupBoundedFrames([
      { frameId: 0, run: never },
      { frameId: 7, run: never },
    ]);

    const resultPromise = handlePageTranslation({ action: MessageActions.PAGE_RESTORE }, sender);
    await vi.advanceTimersByTimeAsync(RESPONSE_TIMEOUT_MS + 100);
    const result = await resultPromise;

    expect(result).toEqual({
      success: false,
      reason: 'frame_command_response_timeout',
      isTransportFailure: true,
      responses: [],
      frames: [
        { frameId: 0, success: false, isResponseTimeout: true, reason: 'frame_command_response_timeout' },
        { frameId: 7, success: false, isResponseTimeout: true, reason: 'frame_command_response_timeout' },
      ],
    });
    // No lifecycle may be synthesized by response timeouts.
    expect(browser.runtime.sendMessage).not.toHaveBeenCalled();
  });

  it('keeps Translate all-timeout semantics free of deterministic failure classification', async () => {
    setupBoundedFrames([
      { frameId: 0, run: never },
    ]);

    const resultPromise = handlePageTranslation({ action: MessageActions.PAGE_TRANSLATE }, sender);
    await vi.advanceTimersByTimeAsync(RESPONSE_TIMEOUT_MS + 100);
    const result = await resultPromise;

    expect(result.reason).toBe('frame_command_response_timeout');
    expect(result.isTransportFailure).toBe(true);
    expect(JSON.stringify(result)).not.toContain('TRANSLATION_TIMEOUT');
    expect(JSON.stringify(result)).not.toContain('TRANSLATION_FAILED');
  });

  it('returns usable top-frame aggregated status while a child hangs', async () => {
    const aggregatedResponse = { success: true, isAggregated: true, translatedCount: 4 };
    setupBoundedFrames([
      { frameId: 0, run: () => Promise.resolve(aggregatedResponse) },
      { frameId: 7, run: never },
    ]);

    const resultPromise = handlePageTranslation({ action: MessageActions.PAGE_TRANSLATE_GET_STATUS }, sender);
    await vi.advanceTimersByTimeAsync(RESPONSE_TIMEOUT_MS + 100);
    const result = await resultPromise;

    expect(result).toBe(aggregatedResponse);
    expect(browser.tabs.sendMessage).toHaveBeenCalledTimes(2);
  });

  it('reports Status uncertainty instead of no-active-translation when every frame times out', async () => {
    setupBoundedFrames([
      { frameId: 0, run: never },
      { frameId: 7, run: never },
    ]);

    const resultPromise = handlePageTranslation({ action: MessageActions.PAGE_TRANSLATE_GET_STATUS }, sender);
    await vi.advanceTimersByTimeAsync(RESPONSE_TIMEOUT_MS + 100);
    const result = await resultPromise;

    expect(result).toEqual({
      success: false,
      reason: 'frame_command_response_timeout',
      isTransportFailure: true,
    });
    expect(result.error).not.toBe('No active translation found');
  });

  it('keeps Status uncertainty when response timeout mixes with immediate rejection', async () => {
    setupBoundedFrames([
      { frameId: 0, run: () => Promise.reject(new Error('Receiving end does not exist')) },
      { frameId: 7, run: never },
    ]);

    const resultPromise = handlePageTranslation({ action: MessageActions.PAGE_TRANSLATE_GET_STATUS }, sender);
    await vi.advanceTimersByTimeAsync(RESPONSE_TIMEOUT_MS + 100);
    const result = await resultPromise;

    expect(result).toEqual({
      success: false,
      reason: 'frame_command_response_timeout',
      isTransportFailure: true,
    });
  });

  it('preserves legacy no-active-translation fallback for all-immediate rejections', async () => {
    setupBoundedFrames([
      { frameId: 0, run: () => Promise.reject(new Error('Receiving end does not exist')) },
      { frameId: 7, run: () => Promise.reject(new Error('Frame unavailable')) },
    ]);

    const result = await handlePageTranslation({ action: MessageActions.PAGE_TRANSLATE_GET_STATUS }, sender);

    expect(result).toEqual({
      success: false,
      error: 'No active translation found',
    });
    expect(result.isResponseTimeout).toBeUndefined();
    expect(result.reason).toBeUndefined();
  });

  it('ignores late responses after the fan-out has settled', async () => {
    const lateChild = deferred();
    setupBoundedFrames([
      { frameId: 0, run: () => Promise.resolve({ success: true }) },
      { frameId: 7, run: () => lateChild.promise },
    ]);

    const resultPromise = handlePageTranslation({ action: MessageActions.PAGE_RESTORE }, sender);
    await vi.advanceTimersByTimeAsync(RESPONSE_TIMEOUT_MS + 100);
    const settledResult = await resultPromise;
    const snapshot = JSON.stringify(settledResult);
    const sendCallCount = browser.tabs.sendMessage.mock.calls.length;

    lateChild.resolve({ success: true, restoredCount: 9 });
    await Promise.resolve();
    await Promise.resolve();
    await vi.advanceTimersByTimeAsync(1000);

    expect(JSON.stringify(settledResult)).toBe(snapshot);
    expect(browser.tabs.sendMessage).toHaveBeenCalledTimes(sendCallCount);
    expect(browser.runtime.sendMessage).not.toHaveBeenCalled();
  });

  it('clears pending timers once frames acknowledge before the deadline', async () => {
    setupBoundedFrames([
      { frameId: 0, run: () => Promise.resolve({ success: true }) },
      { frameId: 7, run: () => Promise.resolve({ success: true }) },
    ]);

    await handlePageTranslation({ action: MessageActions.PAGE_TRANSLATE_STOP_AUTO }, sender);

    expect(vi.getTimerCount()).toBe(0);

    await vi.advanceTimersByTimeAsync(RESPONSE_TIMEOUT_MS + 100);
    expect(browser.tabs.sendMessage).toHaveBeenCalledTimes(2);
  });
});
