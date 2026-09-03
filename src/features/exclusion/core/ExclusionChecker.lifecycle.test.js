import { describe, it, expect, vi, beforeEach } from 'vitest';

const settingsManagerMock = vi.hoisted(() => ({
  initialize: vi.fn(),
  onChange: vi.fn(() => vi.fn()),
}));

vi.mock('@/shared/managers/SettingsManager.js', () => ({
  settingsManager: settingsManagerMock,
  default: settingsManagerMock,
}));

vi.mock('@/shared/logging/logger.js', () => ({
  getScopedLogger: () => ({ init: vi.fn(), debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));
vi.mock('@/shared/error-management/ErrorHandler.js', () => ({
  ErrorHandler: { getInstance: () => ({ handle: vi.fn() }) },
}));
vi.mock('@/shared/error-management/ErrorTypes.js', () => ({ ErrorTypes: { SERVICE: 'service' } }));
vi.mock('@/utils/UtilsFactory.js', () => ({ utilsFactory: { getUIUtils: vi.fn().mockResolvedValue({ isUrlExcluded: () => false, isUrlExcluded_TEXT_FIELDS_ICON: () => false }) } }));
vi.mock('@/core/PageEventBus.js', () => ({ pageEventBus: { emit: vi.fn() } }));

import { ExclusionChecker } from './ExclusionChecker.js';

describe('ExclusionChecker lifecycle behavioral', () => {
  beforeEach(() => {
    ExclusionChecker.resetInstance();
    vi.clearAllMocks();
    settingsManagerMock.initialize.mockReset();
    settingsManagerMock.onChange.mockReset().mockReturnValue(vi.fn());
  });

  it('rejects, remains not initialized, retries and registers listeners once', async () => {
    const checker = ExclusionChecker.getInstance();
    settingsManagerMock.initialize.mockRejectedValueOnce(new Error('settings fail'));
    await expect(checker.initialize()).rejects.toThrow('settings fail');
    expect(checker.initialized).toBe(false);
    expect(checker.listenersSetup).toBe(false);
    expect(settingsManagerMock.onChange).not.toHaveBeenCalled();

    settingsManagerMock.initialize.mockResolvedValue();
    await expect(checker.initialize()).resolves.toBeUndefined();
    expect(checker.initialized).toBe(true);
    expect(checker.listenersSetup).toBe(true);
    expect(settingsManagerMock.onChange).toHaveBeenCalled();

    const callCount = settingsManagerMock.onChange.mock.calls.length;
    await checker.initialize();
    expect(settingsManagerMock.onChange).toHaveBeenCalledTimes(callCount);
  });
});
