import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  translateFieldViaSmartHandler: vi.fn(),
  errorHandler: { handle: vi.fn(() => Promise.resolve()) },
  isFieldTranslationRequestError: vi.fn(() => false),
  getFieldTranslationErrorPresentation: vi.fn(),
}));

vi.mock('@/shared/logging/logger.js', () => ({
  getScopedLogger: vi.fn(() => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  })),
}));

vi.mock('@/core/memory/ResourceTracker.js', () => ({
  default: class ResourceTracker {
    constructor() {}
    addEventListener() {}
    cleanup() {}
    destroy() {}
  },
}));

vi.mock('@/core/managers/content/shortcuts/ShortcutManager.js', () => ({
  shortcutManager: {},
}));

vi.mock('@/core/managers/core/NotificationManager.js', () => ({
  default: class NotificationManager {},
}));

vi.mock('@/shared/error-management/ErrorHandler.js', () => ({
  ErrorHandler: {
    getInstance: vi.fn(() => mocks.errorHandler),
  },
}));

vi.mock('@/shared/error-management/ErrorTypes.js', () => ({
  ErrorTypes: {
    SERVICE: 'SERVICE',
  },
}));

vi.mock('@/utils/UtilsFactory.js', () => ({
  utilsFactory: {},
}));

vi.mock('@/shared/constants/detection.js', () => ({
  INPUT_TYPES: {
    ALL_TEXT_FIELDS: ['text', 'search', 'tel', 'url', 'email', 'password', 'number'],
  },
}));

vi.mock('@/shared/constants/ui.js', () => ({
  NOTIFICATION_TIME: 4000,
}));

vi.mock('@/handlers/smartTranslationIntegration.js', () => ({
  translateFieldViaSmartHandler: mocks.translateFieldViaSmartHandler,
}));

vi.mock('@/handlers/smart-translation/translationErrorOwnership.js', () => ({
  isFieldTranslationRequestError: mocks.isFieldTranslationRequestError,
}));

vi.mock('@/features/text-field-interaction/utils/FieldTranslationErrorPresenter.js', () => ({
  getFieldTranslationErrorPresentation: mocks.getFieldTranslationErrorPresentation,
}));

import { ShortcutHandler } from './ShortcutHandler.js';

describe('ShortcutHandler Field translation error boundary', () => {
  let handler;

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.isFieldTranslationRequestError.mockReturnValue(false);
    mocks.getFieldTranslationErrorPresentation.mockResolvedValue(null);
    mocks.translateFieldViaSmartHandler.mockResolvedValue(undefined);
    handler = new ShortcutHandler();
  });

  it('presents marked request failures with adapted Error and current context', async () => {
    const requestError = Object.assign(new Error('raw HTTP provider body'), {
      type: 'HTTP_ERROR',
      statusCode: 502,
    });
    const displayError = Object.assign(new Error('safe HTTP message'), {
      type: 'HTTP_ERROR',
    });
    mocks.translateFieldViaSmartHandler.mockRejectedValue(requestError);
    mocks.isFieldTranslationRequestError.mockReturnValue(true);
    mocks.getFieldTranslationErrorPresentation.mockResolvedValue({
      canonicalError: requestError,
      displayError,
      publicError: { type: 'REQUEST_FAILURE' },
      canonicalType: 'HTTP_ERROR',
    });

    await handler.triggerTextFieldTranslation({ tagName: 'TEXTAREA' }, 'hello');

    expect(mocks.getFieldTranslationErrorPresentation).toHaveBeenCalledWith(requestError);
    expect(mocks.errorHandler.handle).toHaveBeenCalledTimes(1);
    expect(mocks.errorHandler.handle).toHaveBeenCalledWith(displayError, {
      context: 'shortcut-field-translation',
      showToast: true,
      type: 'HTTP_ERROR',
    });
    expect(mocks.errorHandler.handle.mock.calls[0][0]).not.toBe(requestError);
    expect(mocks.errorHandler.handle.mock.calls[0][0].message).not.toContain('raw HTTP provider body');
  });

  it('keeps unmarked Field-owned failures on existing ErrorHandler path', async () => {
    const fieldError = new Error('DOM mutation failed');
    mocks.translateFieldViaSmartHandler.mockRejectedValue(fieldError);

    await handler.triggerTextFieldTranslation({ tagName: 'TEXTAREA' }, 'hello');

    expect(mocks.getFieldTranslationErrorPresentation).not.toHaveBeenCalled();
    expect(mocks.errorHandler.handle).toHaveBeenCalledTimes(1);
    expect(mocks.errorHandler.handle).toHaveBeenCalledWith(fieldError, {
      context: 'shortcut-field-translation',
      showToast: true,
    });
  });

  it('does not present when marked error has no presentation', async () => {
    const cancellation = Object.assign(new Error('cancelled'), { type: 'USER_CANCELLED' });
    mocks.translateFieldViaSmartHandler.mockRejectedValue(cancellation);
    mocks.isFieldTranslationRequestError.mockReturnValue(true);
    mocks.getFieldTranslationErrorPresentation.mockResolvedValue(null);

    await handler.triggerTextFieldTranslation({ tagName: 'TEXTAREA' }, 'hello');

    expect(mocks.getFieldTranslationErrorPresentation).toHaveBeenCalledWith(cancellation);
    expect(mocks.errorHandler.handle).not.toHaveBeenCalled();
  });

  it('keeps successful Field translation unchanged', async () => {
    await handler.triggerTextFieldTranslation({ tagName: 'TEXTAREA' }, 'hello');

    expect(mocks.translateFieldViaSmartHandler).toHaveBeenCalledWith({
      text: 'hello',
      target: { tagName: 'TEXTAREA' },
    });
    expect(mocks.errorHandler.handle).not.toHaveBeenCalled();
  });
});
