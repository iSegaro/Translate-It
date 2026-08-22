import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { HoverTranslationManager } from './HoverTranslationManager.js';
import { HoverTextDetector } from './HoverTextDetector.js';
import { pageEventBus } from '@/core/PageEventBus.js';
import { settingsManager } from '@/shared/managers/SettingsManager.js';
import { contentScriptIntegration } from '@/shared/messaging/core/ContentScriptIntegration.js';
import ExtensionContextManager from '@/core/extensionContext.js';
import { ErrorTypes } from '@/shared/error-management/ErrorTypes.js';
import { getErrorMessage } from '@/shared/error-management/ErrorMessages.js';
import { mapCanonicalTranslationError } from '@/shared/error-management/PublicTranslationErrorPolicy.js';
import { createLegacyDisplayError } from '@/shared/error-management/PublicTranslationErrorAdapter.js';

const { mockErrorHandler } = vi.hoisted(() => ({
  mockErrorHandler: {
    handle: vi.fn().mockResolvedValue(undefined)
  }
}));

// Mock dependencies
vi.mock('@/shared/logging/logger.js', () => ({
  getScopedLogger: vi.fn(() => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  }))
}));

vi.mock('./HoverTextDetector.js', () => ({
  HoverTextDetector: {
    detect: vi.fn()
  }
}));

vi.mock('@/shared/managers/SettingsManager.js', () => ({
  settingsManager: {
    get: vi.fn((key, def) => def)
  }
}));

vi.mock('@/shared/messaging/core/ContentScriptIntegration.js', () => ({
  contentScriptIntegration: {
    sendTranslationRequest: vi.fn(),
    cancelTranslationRequest: vi.fn()
  },
  registerTranslation: vi.fn()
}));

vi.mock('@/shared/error-management/ErrorHandler.js', () => ({
  ErrorHandler: {
    getInstance: vi.fn(() => mockErrorHandler)
  }
}));

vi.mock('@/shared/services/ElementDetectionService.js', () => ({
  ElementDetectionService: {
    getInstance: vi.fn(() => ({
      isUIElement: vi.fn(() => false)
    }))
  }
}));

vi.mock('@/core/helpers.js', () => ({
  isEditable: vi.fn(() => false)
}));

import { isEditable } from '@/core/helpers.js';

describe('HoverTranslationManager', () => {
  let manager;

  beforeEach(() => {
    vi.clearAllMocks();
    mockErrorHandler.handle.mockClear();
    isEditable.mockReset();
    isEditable.mockReturnValue(false);
    vi.useFakeTimers();
    manager = new HoverTranslationManager();
    
    // Set default setting mocks
    settingsManager.get.mockImplementation((key, def) => {
      if (key === 'MOUSE_HOVER_AUTO_CLOSE') return 'mouseleave';
      if (key === 'MOUSE_HOVER_TRIGGER') return 'ctrl';
      if (key === 'MOUSE_HOVER_DELAY') return 300;
      return def;
    });
  });

  afterEach(() => {
    manager.cleanup();
    vi.useRealTimers();
  });

  it('should activate and add event listeners', async () => {
    const addEventListenerSpy = vi.spyOn(document, 'addEventListener');
    await manager.activate();
    
    expect(manager.isActive).toBe(true);
    expect(addEventListenerSpy).toHaveBeenCalledWith('mousemove', expect.any(Function), expect.any(Object));
    expect(addEventListenerSpy).toHaveBeenCalledWith('keydown', expect.any(Function), expect.any(Object));
  });

  it('should deactivate and cleanup', async () => {
    await manager.activate();
    const cleanupSpy = vi.spyOn(manager, 'cleanup');
    const emitSpy = vi.spyOn(pageEventBus, 'emit');
    
    await manager.deactivate();
    
    expect(manager.isActive).toBe(false);
    expect(cleanupSpy).toHaveBeenCalled();
    expect(emitSpy).toHaveBeenCalledWith('MOUSE_HOVER_HIDE_TOOLTIP');
  });

  describe('handleMouseMove', () => {
    it('should debounce detection', async () => {
      await manager.activate();
      
      const event = { clientX: 10, clientY: 10, target: document.body, ctrlKey: true };
      manager.handleMouseMove(event);

      expect(HoverTextDetector.detect).not.toHaveBeenCalled();

      vi.advanceTimersByTime(301);
      expect(HoverTextDetector.detect).toHaveBeenCalled();
    });

    it('should skip detection if mouse is inside rectangle cache', async () => {
      await manager.activate();
      manager.currentRect = { top: 0, left: 0, bottom: 100, right: 100 };
      manager.lastPosition = { x: 50, y: 50 };

      // Move slightly but still inside rect
      const event = { clientX: 60, clientY: 60, target: document.body, ctrlKey: true };
      manager.handleMouseMove(event);

      vi.advanceTimersByTime(400);
      expect(HoverTextDetector.detect).not.toHaveBeenCalled();
    });

    it('should cancel pending hover if mouse moves away before delay', async () => {
      await manager.activate();
      
      // First move
      manager.handleMouseMove({ clientX: 10, clientY: 10, target: document.body, ctrlKey: true });
      vi.advanceTimersByTime(200);
      
      // Second move (cancels first)
      manager.handleMouseMove({ clientX: 100, clientY: 100, target: document.body, ctrlKey: true });
      
      vi.advanceTimersByTime(200); // Only 200ms since 2nd move
      expect(HoverTextDetector.detect).not.toHaveBeenCalled();

      vi.advanceTimersByTime(101); // Now 301ms since 2nd move
      expect(HoverTextDetector.detect).toHaveBeenCalledTimes(1);
    });

    it('should respect modifier key settings', async () => {
      await manager.activate();
      settingsManager.get.mockImplementation((key, def) => {
        if (key === 'MOUSE_HOVER_TRIGGER') return 'ctrl';
        return def;
      });

      // Move without Ctrl
      manager.handleMouseMove({ clientX: 10, clientY: 10, target: document.body, ctrlKey: false });
      vi.advanceTimersByTime(600);
      expect(HoverTextDetector.detect).not.toHaveBeenCalled();

      // Move with Ctrl (different position to avoid dist < 2)
      manager.handleMouseMove({ clientX: 50, clientY: 50, target: document.body, ctrlKey: true });
      vi.advanceTimersByTime(600);
      expect(HoverTextDetector.detect).toHaveBeenCalled();
    });

    it('should skip detection if target is editable', async () => {
      await manager.activate();
      isEditable.mockReturnValue(true);

      const event = { clientX: 10, clientY: 10, target: document.createElement('input'), ctrlKey: true };
      manager.handleMouseMove(event);

      vi.advanceTimersByTime(400);
      expect(HoverTextDetector.detect).not.toHaveBeenCalled();
    });
  });

  describe('handleKeyDown', () => {
    it('should trigger translation immediately if modifier is pressed', async () => {
      await manager.activate();
      settingsManager.get.mockImplementation((key, def) => {
        if (key === 'MOUSE_HOVER_TRIGGER') return 'ctrl';
        return def;
      });

      manager.lastMouseEvent = { clientX: 10, clientY: 10, target: document.body };
      
      manager.handleKeyDown({ ctrlKey: true });
      
      vi.advanceTimersByTime(60); // Modifier trigger has 50ms delay
      expect(HoverTextDetector.detect).toHaveBeenCalled();
    });

    it('should NOT trigger translation if active element is editable', async () => {
      await manager.activate();
      settingsManager.get.mockImplementation((key, def) => {
        if (key === 'MOUSE_HOVER_TRIGGER') return 'ctrl';
        return def;
      });
      
      isEditable.mockReturnValue(true);
      manager.lastMouseEvent = { clientX: 10, clientY: 10, target: document.body };
      
      manager.handleKeyDown({ ctrlKey: true });
      
      vi.advanceTimersByTime(60);
      expect(HoverTextDetector.detect).not.toHaveBeenCalled();
    });
  });

  describe('handleMouseLeave', () => {
    it('should cancel translation request and clear currentMessageId on real mouseleave', async () => {
      await manager.activate();
      manager.currentMessageId = 'test-id-123';

      manager.handleMouseLeave();

      expect(contentScriptIntegration.cancelTranslationRequest).toHaveBeenCalledWith('test-id-123', expect.any(String));
      expect(manager.currentMessageId).toBeNull();
    });
  });

  describe('_processHover', () => {
    const runRejectedHover = async (error) => {
      HoverTextDetector.detect.mockReturnValue({
        text: 'Hello world',
        rect: { top: 10, left: 10, bottom: 20, right: 100 },
        element: document.createElement('p')
      });
      contentScriptIntegration.sendTranslationRequest.mockRejectedValueOnce(error);

      const emitSpy = vi.spyOn(pageEventBus, 'emit');
      await manager._processHover({ clientX: 15, clientY: 15 });
      const errorEvent = emitSpy.mock.calls.find(([type]) => type === 'MOUSE_HOVER_TRANSLATION_ERROR');
      emitSpy.mockRestore();

      return errorEvent?.[1]?.error;
    };

    it('should send translation request and emit event', async () => {
      await manager.activate();
      HoverTextDetector.detect.mockReturnValue({
        text: 'Hello world',
        rect: { top: 10, left: 10, bottom: 20, right: 100 },
        element: document.createElement('p')
      });

      contentScriptIntegration.sendTranslationRequest.mockResolvedValue({
        translatedText: 'سلام دنیا',
        direction: 'rtl'
      });

      const emitSpy = vi.spyOn(pageEventBus, 'emit');

      await manager._processHover({ clientX: 15, clientY: 15 });

      expect(contentScriptIntegration.sendTranslationRequest).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({ text: 'Hello world' })
      }));

      expect(emitSpy).toHaveBeenCalledWith('MOUSE_HOVER_TRANSLATION_READY', expect.objectContaining({
        originalText: 'Hello world',
        translatedText: 'سلام دنیا',
        direction: 'rtl'
      }));
    });

    it('sanitizes generic HTTP errors before local presentation', async () => {
      const canonicalError = Object.assign(new Error('raw provider HTTP body secret'), {
        type: ErrorTypes.HTTP_ERROR,
        statusCode: 404,
        providerName: 'custom'
      });

      const displayError = await runRejectedHover(canonicalError);

      expect(displayError.type).toBe(ErrorTypes.HTTP_ERROR);
      expect(displayError.message).toBe(await getErrorMessage('ERRORS_HTTP_ERROR'));
      expect(displayError.message).not.toContain('raw provider HTTP body secret');
      expect(displayError).not.toHaveProperty('statusCode');
      expect(displayError).not.toHaveProperty('providerName');
      expect(displayError).not.toHaveProperty('originalType');
      expect(displayError.cause).toBe(canonicalError);
      expect(Object.prototype.propertyIsEnumerable.call(displayError, 'cause')).toBe(false);
    });

    it.each([
      [ErrorTypes.API_ERROR, ErrorTypes.API_ERROR, 'ERRORS_API_ERROR', 'raw provider detail secret'],
      [ErrorTypes.JSON_PARSING_ERROR, ErrorTypes.API_RESPONSE_INVALID, 'ERRORS_API_ERROR', 'raw parser response secret'],
      [ErrorTypes.TRANSLATION_TIMEOUT, ErrorTypes.TRANSLATION_TIMEOUT, 'ERRORS_TRANSLATION_TIMEOUT', 'raw timeout detail secret'],
      [ErrorTypes.MODEL_MISSING, ErrorTypes.MODEL_MISSING, 'ERRORS_MODEL_MISSING', 'raw model detail secret'],
      [ErrorTypes.API_KEY_INVALID, ErrorTypes.API_KEY_INVALID, 'ERRORS_API_KEY_INVALID', 'raw key detail secret'],
      [ErrorTypes.CIRCUIT_BREAKER_OPEN, ErrorTypes.CIRCUIT_BREAKER_OPEN, 'ERRORS_CIRCUIT_BREAKER_OPEN', 'raw underlying network reason secret'],
      [undefined, ErrorTypes.TRANSLATION_FAILED, 'ERRORS_TRANSLATION_FAILED', 'raw unknown provider detail secret']
    ])('keeps %s tooltip output localized and metadata-free', async (type, expectedType, messageKey, rawMessage) => {
      const canonicalError = new Error(rawMessage);
      if (type) canonicalError.type = type;
      if (type === ErrorTypes.CIRCUIT_BREAKER_OPEN) {
        canonicalError.originalType = ErrorTypes.NETWORK_ERROR;
        canonicalError.providerName = 'custom';
        canonicalError.statusCode = 503;
      }

      const displayError = await runRejectedHover(canonicalError);

      expect(displayError.type).toBe(expectedType);
      expect(displayError.message).toBe(await getErrorMessage(messageKey));
      expect(displayError.message).not.toContain(rawMessage);
      expect(displayError).not.toHaveProperty('statusCode');
      expect(displayError).not.toHaveProperty('originalType');
      expect(displayError).not.toHaveProperty('providerName');
      expect(displayError).not.toHaveProperty('providerId');
      expect(displayError).not.toHaveProperty('translationOutcome');
      expect(displayError.cause).toBe(canonicalError);
      expect(Object.prototype.propertyIsEnumerable.call(displayError, 'cause')).toBe(false);
    });

    it('passes canonical error to ErrorHandler and emits exactly one adapted error event', async () => {
      const canonicalError = Object.assign(new Error('raw provider message'), {
        type: ErrorTypes.API_ERROR
      });
      HoverTextDetector.detect.mockReturnValue({
        text: 'Hello world',
        rect: { top: 10, left: 10, bottom: 20, right: 100 },
        element: document.createElement('p')
      });
      contentScriptIntegration.sendTranslationRequest.mockRejectedValueOnce(canonicalError);
      const emitSpy = vi.spyOn(pageEventBus, 'emit');

      await manager._processHover({ clientX: 15, clientY: 15 });

      expect(mockErrorHandler.handle).toHaveBeenCalledTimes(1);
      expect(mockErrorHandler.handle).toHaveBeenCalledWith(canonicalError, {
        context: 'hover',
        showToast: false
      });
      const errorEvents = emitSpy.mock.calls.filter(([type]) => type === 'MOUSE_HOVER_TRANSLATION_ERROR');
      expect(errorEvents).toHaveLength(1);
      expect(errorEvents[0][1].error).not.toBe(canonicalError);
      expect(errorEvents[0][1].error.message).not.toContain('raw provider message');
      emitSpy.mockRestore();
    });

    it.each([
      new Error('Handler cancelled'),
      Object.assign(new Error('cancelled'), { type: ErrorTypes.USER_CANCELLED }),
      Object.assign(new Error('aborted'), { isCancelled: true })
    ])('does not emit tooltip error for intentional cancellation', async (error) => {
      const emitSpy = vi.spyOn(pageEventBus, 'emit');
      HoverTextDetector.detect.mockReturnValue({
        text: 'Hello world',
        rect: { top: 10, left: 10, bottom: 20, right: 100 },
        element: document.createElement('p')
      });
      contentScriptIntegration.sendTranslationRequest.mockRejectedValueOnce(error);

      await manager._processHover({ clientX: 15, clientY: 15 });

      expect(emitSpy).not.toHaveBeenCalledWith('MOUSE_HOVER_TRANSLATION_ERROR', expect.anything());
      expect(mockErrorHandler.handle).not.toHaveBeenCalled();
      emitSpy.mockRestore();
    });

    it('suppresses TRANSLATION_CANCELLED through the existing public adapter path', async () => {
      const emitSpy = vi.spyOn(pageEventBus, 'emit');
      HoverTextDetector.detect.mockReturnValue({
        text: 'Hello world',
        rect: { top: 10, left: 10, bottom: 20, right: 100 },
        element: document.createElement('p')
      });
      contentScriptIntegration.sendTranslationRequest.mockRejectedValueOnce(
        Object.assign(new Error('Translation cancelled'), { type: ErrorTypes.TRANSLATION_CANCELLED })
      );

      await manager._processHover({ clientX: 15, clientY: 15 });

      expect(emitSpy).not.toHaveBeenCalledWith('MOUSE_HOVER_TRANSLATION_ERROR', expect.anything());
      emitSpy.mockRestore();
    });

    it('suppresses plain AbortError through the existing public adapter path', async () => {
      const emitSpy = vi.spyOn(pageEventBus, 'emit');
      HoverTextDetector.detect.mockReturnValue({
        text: 'Hello world',
        rect: { top: 10, left: 10, bottom: 20, right: 100 },
        element: document.createElement('p')
      });
      contentScriptIntegration.sendTranslationRequest.mockRejectedValueOnce(new DOMException('Aborted', 'AbortError'));

      await manager._processHover({ clientX: 15, clientY: 15 });

      expect(emitSpy).not.toHaveBeenCalledWith('MOUSE_HOVER_TRANSLATION_ERROR', expect.anything());
      emitSpy.mockRestore();
    });

    it('transports only adapted error identity through iframe events', async () => {
      const originalTop = Object.getOwnPropertyDescriptor(window, 'top');
      const postMessage = vi.fn();
      Object.defineProperty(window, 'top', { configurable: true, value: { postMessage } });

      try {
        const canonicalError = new Error('raw provider HTTP body secret');
        Object.assign(canonicalError, {
          type: ErrorTypes.HTTP_ERROR,
          originalType: ErrorTypes.API_ERROR,
          statusCode: 503,
          context: 'hover',
          providerName: 'Provider',
          providerId: 'provider-id',
          code: 'UPSTREAM_FAILURE',
          errorCode: 'E_UPSTREAM',
          translationOutcome: { partial: true },
          cause: 'private',
          arbitrary: { ignored: true }
        });
        const publicError = mapCanonicalTranslationError(canonicalError);
        const displayError = await createLegacyDisplayError(canonicalError, publicError);
        const localEmit = vi.spyOn(pageEventBus, 'emit');

        manager._emitPageEvent('MOUSE_HOVER_TRANSLATION_ERROR', { error: displayError });

        expect(localEmit).toHaveBeenCalledWith('MOUSE_HOVER_TRANSLATION_ERROR', { error: displayError });
        expect(postMessage).toHaveBeenCalledWith(expect.objectContaining({
          source: 'translate-it-iframe',
          type: 'MOUSE_HOVER_TRANSLATION_ERROR',
          data: {
            error: displayError.message,
            errorDetails: {
              message: displayError.message,
              type: ErrorTypes.HTTP_ERROR
            }
          }
        }), '*');
        expect(postMessage.mock.calls[0][0].data.error).not.toContain('raw provider HTTP body secret');
        expect(postMessage.mock.calls[0][0].data.errorDetails).not.toHaveProperty('cause');
        expect(postMessage.mock.calls[0][0].data.errorDetails).not.toHaveProperty('providerName');
        expect(postMessage.mock.calls[0][0].data.errorDetails).not.toHaveProperty('statusCode');
        expect(postMessage.mock.calls[0][0].data.errorDetails).not.toHaveProperty('originalType');
        expect(postMessage.mock.calls[0][0].data.errorDetails).not.toHaveProperty('arbitrary');
      } finally {
        Object.defineProperty(window, 'top', originalTop);
      }
    });

    it('should clean up highlight and caches on context invalidation error without sending cancellation to background', async () => {
      await manager.activate();
      const emitSpy = vi.spyOn(pageEventBus, 'emit');
      const contextErrorSpy = vi.spyOn(ExtensionContextManager, 'isContextError').mockReturnValue(true);
      settingsManager.get.mockImplementation((key, def) => {
        if (key === 'MOUSE_HOVER_SCOPE') return 'container';
        if (key === 'MOUSE_HOVER_SHOW_CONTAINER_BORDER') return true;
        return def;
      });

      const element = document.createElement('div');
      HoverTextDetector.detect.mockReturnValue({
        text: 'Hello world',
        rect: { top: 10, left: 10, bottom: 20, right: 100 },
        element: element
      });

      contentScriptIntegration.sendTranslationRequest.mockRejectedValue(
        new Error('Extension context invalidated')
      );

      await manager._processHover({ clientX: 15, clientY: 15 });

      expect(element.classList.contains('ti-hover-container-highlight')).toBe(false);
      expect(manager.borderedElement).toBeNull();
      expect(manager.currentRect).toBeNull();
      expect(manager.currentText).toBeNull();
      expect(manager.currentElement).toBeNull();
      expect(contentScriptIntegration.cancelTranslationRequest).not.toHaveBeenCalled();
      expect(emitSpy).not.toHaveBeenCalledWith('MOUSE_HOVER_TRANSLATION_ERROR', expect.anything());
      contextErrorSpy.mockRestore();
      emitSpy.mockRestore();
    });

    it.each([ErrorTypes.CONTEXT, ErrorTypes.EXTENSION_CONTEXT_INVALIDATED])(
      'characterizes recognized context error type %s reaching Hover error presentation',
      async (type) => {
        HoverTextDetector.detect.mockReturnValue({
          text: 'Hello world',
          rect: { top: 10, left: 10, bottom: 20, right: 100 },
          element: document.createElement('p')
        });
        contentScriptIntegration.sendTranslationRequest.mockRejectedValueOnce(
          Object.assign(new Error('context failure'), { type })
        );
        const emitSpy = vi.spyOn(pageEventBus, 'emit');

        await manager._processHover({ clientX: 15, clientY: 15 });

        expect(emitSpy).not.toHaveBeenCalledWith('MOUSE_HOVER_TRANSLATION_ERROR', expect.anything());
        emitSpy.mockRestore();
      }
    );

    it('should clean up highlight and caches on standard translation error without sending cancellation to background', async () => {
      await manager.activate();
      settingsManager.get.mockImplementation((key, def) => {
        if (key === 'MOUSE_HOVER_SCOPE') return 'container';
        if (key === 'MOUSE_HOVER_SHOW_CONTAINER_BORDER') return true;
        return def;
      });

      const element = document.createElement('div');
      HoverTextDetector.detect.mockReturnValue({
        text: 'Hello world',
        rect: { top: 10, left: 10, bottom: 20, right: 100 },
        element: element
      });

      contentScriptIntegration.sendTranslationRequest.mockRejectedValue(
        new Error('Translation failed')
      );

      await manager._processHover({ clientX: 15, clientY: 15 });

      expect(element.classList.contains('ti-hover-container-highlight')).toBe(false);
      expect(manager.borderedElement).toBeNull();
      expect(manager.currentRect).toBeNull();
      expect(manager.currentText).toBeNull();
      expect(manager.currentElement).toBeNull();
      expect(contentScriptIntegration.cancelTranslationRequest).not.toHaveBeenCalled();
    });

    it('should not clean up highlight or caches if a stale failed request finishes after a new hover started', async () => {
      await manager.activate();
      settingsManager.get.mockImplementation((key, def) => {
        if (key === 'MOUSE_HOVER_SCOPE') return 'container';
        if (key === 'MOUSE_HOVER_SHOW_CONTAINER_BORDER') return true;
        return def;
      });

      const element1 = document.createElement('div');
      const element2 = document.createElement('div');

      // 1. First hover starts
      manager.currentElement = element1;
      HoverTextDetector.detect.mockReturnValue({
        text: 'Text one',
        rect: { top: 10, left: 10, bottom: 20, right: 100 },
        element: element1
      });

      let rejectRequest1;
      const promise1 = new Promise((_, reject) => {
        rejectRequest1 = () => reject(new Error('Extension context invalidated'));
      });
      contentScriptIntegration.sendTranslationRequest.mockReturnValueOnce(promise1);

      const processPromise1 = manager._processHover({ clientX: 15, clientY: 15 });
      const firstMessageId = manager.currentMessageId;

      expect(element1.classList.contains('ti-hover-container-highlight')).toBe(true);
      expect(manager.currentText).toBe('Text one');

      // 2. Second hover starts before first completes, overriding active hover state
      manager.currentElement = element2;
      HoverTextDetector.detect.mockReturnValue({
        text: 'Text two',
        rect: { top: 20, left: 20, bottom: 30, right: 120 },
        element: element2
      });
      contentScriptIntegration.sendTranslationRequest.mockResolvedValueOnce({
        translatedText: 'Translation two',
        direction: 'ltr'
      });

      await manager._processHover({ clientX: 25, clientY: 25 });
      const secondMessageId = manager.currentMessageId;

      expect(secondMessageId).not.toBe(firstMessageId);
      expect(element2.classList.contains('ti-hover-container-highlight')).toBe(true);
      expect(manager.currentText).toBe('Text two');

      // 3. First request fails (e.g. throws context error)
      rejectRequest1();
      await processPromise1;

      // 4. Verify stale first request's failure did NOT clear the second hover's state
      expect(element2.classList.contains('ti-hover-container-highlight')).toBe(true);
      expect(manager.currentText).toBe('Text two');
      expect(manager.currentElement).toBe(element2);
      expect(manager.borderedElement).toBe(element2);
    });
  });
});
