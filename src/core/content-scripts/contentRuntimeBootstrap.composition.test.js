import { describe, expect, it, vi } from 'vitest';
import { LIVE_DUBBING_ACTIONS } from '@/features/live-dubbing/constants.js';
import { FIREFOX_CONTENT_TARGET } from '@/features/live-dubbing/firefox/firefoxContentContract.js';
import { LIVE_DUBBING_FEATURE_NAME } from '@/features/live-dubbing/handlers/LiveDubbingFeatureHandler.js';

const mocks = vi.hoisted(() => ({
  exclusionChecker: {
    updateUrl: vi.fn(),
    isFeatureAllowed: vi.fn().mockResolvedValue(true),
    refreshSettings: vi.fn(),
    initialize: vi.fn().mockResolvedValue(undefined),
  },
  storageManagerOn: vi.fn(),
  storageManagerOff: vi.fn(),
}));

vi.mock('@/features/exclusion/core/ExclusionChecker.js', () => ({
  ExclusionChecker: {
    getInstance: () => mocks.exclusionChecker,
    resetInstance: vi.fn(),
  },
}));

vi.mock('@/shared/storage/core/StorageCore.js', () => ({
  storageManager: {
    on: mocks.storageManagerOn,
    off: mocks.storageManagerOff,
  },
}));

vi.mock('@/shared/logging/logger.js', () => ({
  getScopedLogger: () => ({
    init: vi.fn(),
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

vi.mock('@/shared/error-management/ErrorHandler.js', () => ({
  ErrorHandler: { getInstance: () => ({ handle: vi.fn() }) },
}));

vi.mock('@/shared/error-management/ErrorTypes.js', () => ({
  ErrorTypes: {},
}));

vi.mock('@/handlers/content/ContentMessageHandler.js', () => ({
  default: { resetInstance: vi.fn(() => Promise.resolve()) },
}));

vi.mock('@/features/windows/managers/WindowsManager.js', () => ({
  WindowsManager: { resetInstance: vi.fn(() => Promise.resolve()) },
}));

vi.mock('@/shared/messaging/core/UnifiedMessaging.js', () => ({
  sendMessage: vi.fn().mockResolvedValue({ success: true }),
  sendRegularMessage: vi.fn(),
}));

vi.mock('@/shared/messaging/core/MessageActions.js', () => ({
  MessageActions: { DEACTIVATE_SELECT_ELEMENT_MODE: 'DEACTIVATE_SELECT_ELEMENT_MODE' },
}));

import { FeatureManager } from '@/core/managers/content/FeatureManager.js';
import { bootstrapContentRuntimeInfrastructure } from './contentRuntimeBootstrap.js';

function createRuntime() {
  const listeners = new Set();
  return {
    id: 'extension-id',
    getURL: (path = '') => `chrome-extension://extension-id/${path}`,
    onMessage: {
      addListener: vi.fn(listener => listeners.add(listener)),
      removeListener: vi.fn(listener => listeners.delete(listener)),
      listeners,
    },
  };
}

function prepareMessage() {
  return {
    target: FIREFOX_CONTENT_TARGET,
    action: LIVE_DUBBING_ACTIONS.PREPARE,
    data: {
      sessionId: 'session-1',
      providerId: 'gemini',
      tabId: 7,
      frameId: 0,
      documentId: 'doc-1',
      targetLanguage: 'en',
      eventSequence: 0,
    },
  };
}

function statusMessage() {
  return { ...prepareMessage(), action: LIVE_DUBBING_ACTIONS.STATUS };
}

describe('content runtime production composition', () => {
  it('PREPARE activates, manager-side deactivation surfaces on STATUS without reactivation', async () => {
    const runtime = createRuntime();
    const record = bootstrapContentRuntimeInfrastructure({
      browserName: 'firefox',
      browserAPI: { runtime },
    });
    expect(record).not.toBeNull();
    try {
      const [listener] = [...runtime.onMessage.listeners];
      const sender = { id: 'extension-id' };

      const ready = await listener(prepareMessage(), sender);
      expect(ready).toMatchObject({ success: true, ack: 'READY', active: true, prepared: true });
      expect(FeatureManager.getInstance().isFeatureActive(LIVE_DUBBING_FEATURE_NAME)).toBe(true);

      // Manager-side deactivation outside host control (e.g. policy change).
      await FeatureManager.getInstance().deactivateFeature(LIVE_DUBBING_FEATURE_NAME);
      expect(FeatureManager.getInstance().isFeatureActive(LIVE_DUBBING_FEATURE_NAME)).toBe(false);

      // Later STATUS reflects real manager state and never reactivates.
      const status = await listener(statusMessage(), sender);
      expect(status).toMatchObject({ success: true, prepared: true, active: false });
      expect(FeatureManager.getInstance().isFeatureActive(LIVE_DUBBING_FEATURE_NAME)).toBe(false);
    } finally {
      record.unregister();
      await FeatureManager.resetInstance();
    }
  });
});
