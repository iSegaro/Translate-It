import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useMessaging } from './useMessaging.js';
import { sendMessage as sendUnifiedMessage } from '../core/UnifiedMessaging.js';
import { MessageFormat } from '../core/MessagingCore.js';

// Mock UnifiedMessaging
vi.mock('../core/UnifiedMessaging.js', () => ({
  sendMessage: vi.fn()
}));

// Mock logger
vi.mock('@/shared/logging/logger.js', () => ({
  getScopedLogger: () => ({
    debug: vi.fn(),
    error: vi.fn()
  })
}));

// Mock ExtensionContextManager
vi.mock('@/core/extensionContext.js', () => ({
  default: {
    isContextError: vi.fn().mockReturnValue(false)
  }
}));

describe('useMessaging Composable', () => {
  const context = 'popup';
  let messaging;

  beforeEach(() => {
    vi.clearAllMocks();
    messaging = useMessaging(context);
  });

  it('should create a message with the correct context', () => {
    const action = 'TEST_ACTION';
    const data = { foo: 'bar' };
    const message = messaging.createMessage(action, data);

    expect(message.action).toBe(action);
    expect(message.data).toEqual(data);
    expect(message.context).toBe(context);
  });

  it('should call UnifiedMessaging.sendMessage when sending', async () => {
    const message = { action: 'TEST' };
    const options = { silent: true };
    sendUnifiedMessage.mockResolvedValue({ success: true });

    const response = await messaging.sendMessage(message, options);

    expect(sendUnifiedMessage).toHaveBeenCalledWith(message, options);
    expect(response.success).toBe(true);
  });

  it('should provide fire-and-forget sending', async () => {
    sendUnifiedMessage.mockResolvedValue({ success: true });
    
    messaging.sendFireAndForget('FIRE', { val: 1 });

    // It should have created and sent a message
    expect(sendUnifiedMessage).toHaveBeenCalled();
    const sentMessage = sendUnifiedMessage.mock.calls[0][0];
    expect(sentMessage.action).toBe('FIRE');
    expect(sentMessage.context).toBe(context);
  });
});
