import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/handlers/content/ContentMessageHandler.js', () => ({
  default: { resetInstance: vi.fn() },
}));
vi.mock('@/features/windows/managers/WindowsManager.js', () => ({
  WindowsManager: { resetInstance: vi.fn() },
}));
vi.mock('@/features/windows/managers/core/WindowsState.js', () => ({
  WindowsState: class {},
}));
vi.mock('@/features/exclusion/core/ExclusionChecker.js', () => ({
  ExclusionChecker: { getInstance: () => ({ initialize: vi.fn().mockResolvedValue(undefined) }), resetInstance: vi.fn() },
}));
vi.mock('@/shared/storage/core/StorageCore.js', () => ({
  storageManager: { on: vi.fn(), off: vi.fn() },
}));
vi.mock('@/shared/logging/logger.js', () => ({
  getScopedLogger: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(), init: vi.fn() }),
}));
vi.mock('@/shared/error-management/ErrorHandler.js', () => ({
  ErrorHandler: { getInstance: () => ({ handle: vi.fn() }) },
}));

import { FeatureManager } from './FeatureManager.js';

describe('FeatureManager policy hook', () => {
  beforeEach(() => {
    FeatureManager.resetInstance();
    vi.clearAllMocks();
  });

  it('registers and notifies generic policy change', () => {
    const fm = FeatureManager.getInstance();
    const cb = vi.fn();
    const off = fm.onPolicyChanged(cb);
    fm._notifyPolicyChanged('settings-change:EXCLUDED_SITES');
    expect(cb).toHaveBeenCalledWith('settings-change:EXCLUDED_SITES');
    off();
    cb.mockClear();
    fm._notifyPolicyChanged('url-change');
    expect(cb).not.toHaveBeenCalled();
  });

  it('does not require requestedFeatures to trigger', () => {
    const fm = FeatureManager.getInstance();
    expect(fm.requestedFeatures.size).toBe(0);
    const cb = vi.fn();
    fm.onPolicyChanged(cb);
    fm._notifyPolicyChanged('test');
    expect(cb).toHaveBeenCalled();
  });
});
