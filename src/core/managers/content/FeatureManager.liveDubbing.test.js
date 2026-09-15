import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LIVE_DUBBING_FEATURE_NAME } from '@/features/live-dubbing/handlers/LiveDubbingFeatureHandler.js';

const mocks = vi.hoisted(() => ({
  exclusionChecker: {
    updateUrl: vi.fn(),
    isFeatureAllowed: vi.fn(),
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

import { FeatureManager } from './FeatureManager.js';

describe('FeatureManager liveDubbing hybrid lifecycle', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    mocks.exclusionChecker.isFeatureAllowed.mockResolvedValue(true);
    await FeatureManager.resetInstance();
  });

  it('loads the liveDubbing handler through the standard case', async () => {
    const manager = FeatureManager.getInstance();
    const handler = await manager.loadFeatureHandler(LIVE_DUBBING_FEATURE_NAME);
    expect(handler).not.toBeNull();
    expect(typeof handler.activate).toBe('function');
    expect(typeof handler.deactivate).toBe('function');
    expect(handler.isActive()).toBe(false);
  });

  it('activates on explicit request when policy allows, without touching startup', async () => {
    const manager = FeatureManager.getInstance();
    const handler = await manager.requestFeatureActivation(LIVE_DUBBING_FEATURE_NAME);
    expect(handler).not.toBeNull();
    expect(manager.isFeatureActive(LIVE_DUBBING_FEATURE_NAME)).toBe(true);
    expect(handler.isActive()).toBe(true);
  });

  it('fails closed to no handler when policy blocks, with nothing marked active', async () => {
    mocks.exclusionChecker.isFeatureAllowed.mockResolvedValue(false);
    const manager = FeatureManager.getInstance();
    const handler = await manager.requestFeatureActivation(LIVE_DUBBING_FEATURE_NAME);
    expect(handler).toBeFalsy();
    expect(manager.isFeatureActive(LIVE_DUBBING_FEATURE_NAME)).toBe(false);
  });

  it('deactivates through the standard path exactly once per session end', async () => {
    const manager = FeatureManager.getInstance();
    const handler = await manager.requestFeatureActivation(LIVE_DUBBING_FEATURE_NAME);
    expect(manager.isFeatureActive(LIVE_DUBBING_FEATURE_NAME)).toBe(true);

    await manager.deactivateFeature(LIVE_DUBBING_FEATURE_NAME);
    expect(manager.isFeatureActive(LIVE_DUBBING_FEATURE_NAME)).toBe(false);
    expect(handler.isActive()).toBe(false);

    await manager.deactivateFeature(LIVE_DUBBING_FEATURE_NAME);
    expect(manager.isFeatureActive(LIVE_DUBBING_FEATURE_NAME)).toBe(false);
  });

  it('exposes only the Live Dubbing runtime preparation seam', async () => {
    const manager = FeatureManager.getInstance();
    const handler = { prepareRuntime: vi.fn().mockResolvedValue(true) };
    const descriptor = { sessionId: 'session-1', providerId: 'gemini', eventSequence: 0 };
    manager.featureHandlers.set(LIVE_DUBBING_FEATURE_NAME, handler);
    manager.activeFeatures.add(LIVE_DUBBING_FEATURE_NAME);

    await expect(manager.prepareFeatureRuntime(LIVE_DUBBING_FEATURE_NAME, descriptor)).resolves.toBe(true);
    expect(handler.prepareRuntime).toHaveBeenCalledWith(descriptor);
    await expect(manager.prepareFeatureRuntime('selectElement', descriptor)).resolves.toBe(false);
    expect(handler.prepareRuntime).toHaveBeenCalledOnce();

    manager.activeFeatures.delete(LIVE_DUBBING_FEATURE_NAME);
    await expect(manager.prepareFeatureRuntime(LIVE_DUBBING_FEATURE_NAME, descriptor)).resolves.toBe(false);
    expect(handler.prepareRuntime).toHaveBeenCalledOnce();
  });
});
