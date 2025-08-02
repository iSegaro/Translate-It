import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useMessaging } from '../useMessaging.js';
import { MessagingCore } from '../../core/MessagingCore.js';

// Mock MessagingCore
vi.mock('../../core/MessagingCore.js', () => ({
  MessagingCore: {
    getMessenger: vi.fn()
  }
}));

describe('useMessaging', () => {
  let mockMessenger;

  beforeEach(() => {
    // Create mock messenger with all specialized messengers
    mockMessenger = {
      sendMessage: vi.fn(),
      specialized: {
        tts: { speak: vi.fn(), stop: vi.fn() },
        capture: { captureScreen: vi.fn() },
        selection: { activateMode: vi.fn() },
        translation: { translate: vi.fn() },
        provider: { getProviders: vi.fn() },
        service: { getServiceStatus: vi.fn() },
        background: { warmupServices: vi.fn() }
      }
    };

    MessagingCore.getMessenger.mockReturnValue(mockMessenger);
  });

  it('should return messenger instance with sendMessage method', () => {
    const { sendMessage, messenger } = useMessaging('popup');

    expect(sendMessage).toBeDefined();
    expect(messenger).toBe(mockMessenger);
    expect(MessagingCore.getMessenger).toHaveBeenCalledWith('popup');
  });

  it('should expose all specialized messengers', () => {
    const { 
      tts, 
      capture, 
      selection, 
      translation,
      provider,
      service,
      background
    } = useMessaging('popup');

    // Original messengers
    expect(tts).toBe(mockMessenger.specialized.tts);
    expect(capture).toBe(mockMessenger.specialized.capture);
    expect(selection).toBe(mockMessenger.specialized.selection);
    expect(translation).toBe(mockMessenger.specialized.translation);

    // New messengers
    expect(provider).toBe(mockMessenger.specialized.provider);
    expect(service).toBe(mockMessenger.specialized.service);
    expect(background).toBe(mockMessenger.specialized.background);
  });

  it('should provide access to specialized messenger methods', () => {
    const { tts, provider, service, background } = useMessaging('popup');

    // Test that methods are accessible
    expect(typeof tts.speak).toBe('function');
    expect(typeof provider.getProviders).toBe('function');
    expect(typeof service.getServiceStatus).toBe('function');
    expect(typeof background.warmupServices).toBe('function');
  });

  it('should bind sendMessage correctly', async () => {
    const { sendMessage } = useMessaging('popup');
    const testMessage = { action: 'TEST' };

    await sendMessage(testMessage);

    expect(mockMessenger.sendMessage).toHaveBeenCalledWith(testMessage);
  });

  it('should work with different contexts', () => {
    const contexts = ['popup', 'sidepanel', 'options', 'content'];

    contexts.forEach(context => {
      const { messenger } = useMessaging(context);
      expect(MessagingCore.getMessenger).toHaveBeenCalledWith(context);
      expect(messenger).toBe(mockMessenger);
    });
  });
});