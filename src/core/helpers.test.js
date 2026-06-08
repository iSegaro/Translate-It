import { describe, it, expect, vi, beforeEach } from 'vitest';

const { sendMessageMock, loggerErrorMock } = vi.hoisted(() => ({
  sendMessageMock: vi.fn(),
  loggerErrorMock: vi.fn(),
}));

vi.mock('webextension-polyfill', () => ({
  default: {
    runtime: {
      sendMessage: (...args) => sendMessageMock(...args),
    },
  },
}));

vi.mock('@/shared/logging/logger.js', () => ({
  getScopedLogger: vi.fn(() => ({
    error: loggerErrorMock,
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
  })),
}));

vi.mock('@/shared/error-management/ErrorHandler.js', () => ({
  ErrorHandler: {
    getInstance: vi.fn(() => ({
      handle: vi.fn(),
    })),
  },
}));

vi.mock('@/shared/error-management/ErrorTypes.js', () => ({
  ErrorTypes: {},
}));

import { openOptionsPage } from './helpers.js';
import { MessageActions } from '@/shared/messaging/core/MessageActions.js';

describe('openOptionsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    loggerErrorMock.mockReset();
  });

  it('returns the underlying messaging response', async () => {
    sendMessageMock.mockResolvedValue({ success: true });

    await expect(openOptionsPage('providers')).resolves.toEqual({
      success: true,
    });

    expect(sendMessageMock).toHaveBeenCalledWith({
      action: MessageActions.OPEN_OPTIONS_PAGE,
      data: { anchor: 'providers' },
    });
  });

  it('logs transport failures and resolves undefined', async () => {
    sendMessageMock.mockRejectedValue(new Error('transport failed'));

    await expect(openOptionsPage('providers')).resolves.toBeUndefined();
    expect(loggerErrorMock).toHaveBeenCalledWith(
      'Error sending openOptionsPage message:',
      expect.any(Error),
    );
  });
});
