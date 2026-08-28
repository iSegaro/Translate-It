import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  loadFeature: vi.fn(),
  pageEventBus: { on: vi.fn() },
  topPostMessage: vi.fn(),
}));

vi.mock('webextension-polyfill', () => ({
  default: {
    runtime: { getURL: (path) => `moz-extension://test/${path}` },
  },
}));

vi.mock('@/shared/vue/vue-utils.js', () => ({
  setupTrustedTypesCompatibility: vi.fn(),
}));

vi.mock('@/features/exclusion/utils/exclusion-utils.js', () => ({
  checkUrlExclusionAsync: vi.fn().mockResolvedValue(false),
}));

vi.mock('./IFrameContentScriptCore.js', () => ({
  IFrameContentScriptCore: class {
    async initializeCritical() {
      return true;
    }

    async injectMainDOMStyles() {}

    async loadFeature(feature) {
      mocks.loadFeature(feature);
      return null;
    }
  },
}));

vi.mock('./InteractionCoordinator.js', () => ({
  interactionCoordinator: { initialize: vi.fn().mockResolvedValue(undefined) },
}));

vi.mock('@/features/windows/managers/crossframe/TextSelectionWindowRelay.js', () => ({
  getTextSelectionWindowRelay: vi.fn(),
}));

vi.mock('@/shared/messaging/core/MessageActions.js', () => ({
  MessageActions: {
    PAGE_TRANSLATE_PROGRESS: 'PAGE_TRANSLATE_PROGRESS',
    PAGE_TRANSLATE_COMPLETE: 'PAGE_TRANSLATE_COMPLETE',
    PAGE_AUTO_RESTORE_COMPLETE: 'PAGE_AUTO_RESTORE_COMPLETE',
    PAGE_TRANSLATE: 'PAGE_TRANSLATE',
    PAGE_RESTORE: 'PAGE_RESTORE',
    PAGE_TRANSLATE_STOP_AUTO: 'PAGE_TRANSLATE_STOP_AUTO',
  },
}));

describe('iframe page translation transport', () => {
  let previousTop;

  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    mocks.loadFeature.mockClear();
    mocks.pageEventBus.on.mockClear();
    mocks.topPostMessage.mockClear();
    mocks.loadFeature.mockResolvedValue(null);

    previousTop = window.top;
    Object.defineProperty(window, 'top', {
      configurable: true,
      value: { postMessage: mocks.topPostMessage },
    });
    window.pageEventBus = mocks.pageEventBus;
    delete window.translateItContentCore;
    delete window.translateItContentScriptCore;
    delete window.translateItContentScriptLoaded;
    delete window._translateItProgressForwarderSet;
  });

  afterEach(() => {
    Object.defineProperty(window, 'top', {
      configurable: true,
      value: previousTop,
    });
  });

  it('does not install page-visible lifecycle forwarders', async () => {
    await import('./index-iframe.js');

    expect(mocks.pageEventBus.on).not.toHaveBeenCalledWith(
      'PAGE_TRANSLATE_PROGRESS',
      expect.any(Function)
    );
    expect(mocks.pageEventBus.on).not.toHaveBeenCalledWith(
      'PAGE_TRANSLATE_COMPLETE',
      expect.any(Function)
    );
    window.dispatchEvent(new CustomEvent('page-translate-progress', {
      detail: { translatedCount: 999, totalCount: 999 },
    }));
    expect(mocks.topPostMessage).not.toHaveBeenCalled();
  });
});
