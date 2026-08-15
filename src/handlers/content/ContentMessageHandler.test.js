import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ContentMessageHandler } from './ContentMessageHandler.js';
import { TranslationMode } from '@/shared/config/config.js';
import { ErrorTypes } from '@/shared/error-management/ErrorTypes.js';

vi.mock('@/shared/logging/logger.js', () => ({
  getScopedLogger: vi.fn(() => ({
    debug: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    init: vi.fn(),
    warn: vi.fn(),
  })),
}));

vi.mock('@/core/memory/ResourceTracker.js', () => ({
  default: class ResourceTracker {
    constructor() {}
    trackResource() {}
    cleanup() {}
  },
}));

vi.mock('@/shared/error-management/ErrorHandler.js', () => ({
  ErrorHandler: {
    getInstance: vi.fn(() => ({ handle: vi.fn() })),
  },
}));

vi.mock('@/features/element-selection/utils/activationError.js', () => ({
  getSelectElementActivationErrorMessage: vi.fn(() => Promise.resolve('Could not activate Select Element mode.')),
}));

vi.mock('./RevertHandler.js', () => ({
  revertHandler: { executeRevert: vi.fn() },
}));

vi.mock('../smartTranslationIntegration.js', () => ({
  applyTranslationToTextField: vi.fn(),
}));

vi.mock('@/core/PageEventBus.js', () => ({
  pageEventBus: { emit: vi.fn() },
}));

describe('ContentMessageHandler iframe Select Element activation', () => {
  let handler;

  beforeEach(() => {
    handler = new ContentMessageHandler();
    handler.handlers.clear();
    handler.setSelectElementManager(null);
  });

  it('sanitizes direct iframe activation failures', async () => {
    const technicalMessage = 'chrome.runtime.lastError: Receiving end does not exist INTERNAL_PORT_9f81';
    handler.setSelectElementManager({
      isInitialized: true,
      activateSelectElementMode: vi.fn().mockRejectedValue(new Error(technicalMessage)),
    });

    const response = await handler.handleIFrameActivateSelectElement();

    expect(response).toMatchObject({
      success: false,
      message: 'Could not activate Select Element mode.',
      error: 'Could not activate Select Element mode.',
      errorType: ErrorTypes.SELECT_ELEMENT,
    });
    expect(JSON.stringify(response)).not.toContain('INTERNAL_PORT_9f81');
    expect(JSON.stringify(response)).not.toContain('Receiving end does not exist');
  });

  it('sanitizes coordinate activation failures through the same boundary', async () => {
    handler.setSelectElementManager({
      isInitialized: true,
      activateSelectElementMode: vi.fn().mockRejectedValue(new Error('internal coordinate failure')),
    });

    const response = await handler.handleIFrameCoordinateOperation({
      operation: TranslationMode.Select_Element,
    });

    expect(response).toMatchObject({
      success: false,
      error: 'Could not activate Select Element mode.',
      errorType: ErrorTypes.SELECT_ELEMENT,
    });
  });

  it('preserves successful iframe activation response fields', async () => {
    handler.setSelectElementManager({
      isInitialized: true,
      activateSelectElementMode: vi.fn().mockResolvedValue({
        isActive: true,
        instanceId: 'manager-1',
      }),
    });

    await expect(handler.handleIFrameActivateSelectElement()).resolves.toEqual({
      success: true,
      activated: true,
      managerId: 'manager-1',
    });
  });

  it('leaves generic non-activation error responses unchanged', async () => {
    const technicalMessage = 'unrelated internal failure';
    handler.registerHandler('UNRELATED_ACTION', async () => {
      throw new Error(technicalMessage);
    });
    const sendResponse = vi.fn();

    await handler.handleMessage({ action: 'UNRELATED_ACTION' }, {}, sendResponse);

    expect(sendResponse).toHaveBeenCalledWith({
      success: false,
      error: technicalMessage,
    });
  });
});
