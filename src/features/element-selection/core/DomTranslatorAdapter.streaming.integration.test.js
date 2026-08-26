import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import browser from 'webextension-polyfill';
import { DomTranslatorAdapter } from './DomTranslatorAdapter.js';
import { contentScriptIntegration } from '@/shared/messaging/core/ContentScriptIntegration.js';
import { unifiedTranslationCoordinator } from '@/shared/messaging/core/UnifiedTranslationCoordinator.js';
import { streamingTimeoutManager } from '@/shared/messaging/core/StreamingTimeoutManager.js';
import { MessageFormat } from '@/shared/messaging/core/MessagingCore.js';
import { MessageActions } from '@/shared/messaging/core/MessageActions.js';
import { ErrorTypes } from '@/shared/error-management/ErrorTypes.js';

const routeStream = vi.hoisted(() => vi.fn());

vi.mock('webextension-polyfill', () => ({
  default: {
    runtime: {
      sendMessage: vi.fn(),
      getURL: vi.fn(),
    },
    tabs: {
      sendMessage: vi.fn(),
    },
    storage: {
      local: {
        get: vi.fn().mockResolvedValue({}),
        set: vi.fn().mockResolvedValue({}),
      },
    },
  },
}));

vi.mock('@/shared/logging/logger.js', () => ({
  getScopedLogger: vi.fn(() => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    operation: vi.fn(),
  })),
}));

vi.mock('@/config.js', () => ({
  getEffectiveProviderAsync: vi.fn(() => Promise.resolve('gemini')),
  getTargetLanguageAsync: vi.fn(() => Promise.resolve('fa')),
  getAIContextTranslationEnabledAsync: vi.fn(() => Promise.resolve(false)),
  getSourceLanguageAsync: vi.fn(() => Promise.resolve('en')),
  getFeatureSemanticBlockGroupingAsync: vi.fn(() => Promise.resolve(false)),
}));

vi.mock('@/shared/config/config.js', () => ({
  getEffectiveProviderAsync: vi.fn(() => Promise.resolve('gemini')),
  TranslationMode: { Select_Element: 'select-element' },
}));

vi.mock('@/core/contextCore.js', () => ({
  isValidSync: vi.fn(() => true),
  isContextError: vi.fn(() => false),
  contextState: { isInvalidated: false, notificationShown: false },
}));

vi.mock('@/core/extensionContext.js', () => ({
  default: {
    isValidSync: vi.fn(() => true),
    isContextError: vi.fn(() => false),
    handleContextError: vi.fn(),
  },
}));

vi.mock('@/shared/error-management/ErrorHandler.js', () => ({
  ErrorHandler: {
    getInstance: vi.fn(() => ({
      handle: vi.fn(() => Promise.resolve()),
    })),
  },
}));

vi.mock('@/core/memory/ResourceTracker.js', () => ({
  default: class ResourceTracker {
    cleanup() {}
  },
}));

vi.mock('@/core/PageEventBus.js', () => ({
  pageEventBus: { emit: vi.fn() },
}));

vi.mock('@/utils/dom/DomDirectionManager.js', () => ({
  detectDirectionFromContent: vi.fn(() => 'ltr'),
  applyNodeDirection: vi.fn(),
  applyElementDirection: vi.fn(),
  captureNodeDirectionState: vi.fn(() => []),
  restoreNodeDirectionState: vi.fn(() => []),
}));

vi.mock('@/features/shared/hover-preview/HoverPreviewLookup.js', () => ({
  hoverPreviewLookup: {
    add: vi.fn(),
    get: vi.fn(),
    delete: vi.fn(),
  },
}));

vi.mock('@/features/page-translation/PageTranslationConstants.js', () => ({
  PAGE_TRANSLATION_ATTRIBUTES: { HAS_ORIGINAL: 'data-has-original' },
}));

vi.mock('./DomTranslatorUtils.js', () => ({
  collectTextNodes: vi.fn((element) => Array.from(element.childNodes)
    .filter(node => node.nodeType === Node.TEXT_NODE)
    .map((node, index) => ({
      node,
      text: node.nodeValue,
      uid: `n${index + 1}`,
      blockId: `b${index + 1}`,
      role: 'div',
    }))),
  collectBlockGroups: vi.fn(),
  generateElementId: vi.fn(() => 'integration-element'),
  extractContextMetadata: vi.fn(() => ({ contextSummary: 'integration' })),
}));

describe('Select Element streaming provenance integration', () => {
  let adapter;

  beforeEach(() => {
    vi.clearAllMocks();
    routeStream.mockReset();
    contentScriptIntegration.cleanup();
    unifiedTranslationCoordinator.cleanup();
    streamingTimeoutManager.cleanup();
    browser.runtime.sendMessage.mockImplementation((message) => {
      if (message.action === MessageActions.TRANSLATE) {
        setTimeout(() => routeStream(message.messageId), 0);
        return Promise.resolve({ success: true, streaming: true, conversationAcceptance: false });
      }
      if (message.action === MessageActions.PARENT_ACCEPTANCE_ACK) {
        return Promise.resolve({ success: true, status: 'ACCEPTED' });
      }
      return Promise.resolve({ success: true });
    });
    adapter = new DomTranslatorAdapter();
  });

  afterEach(() => {
    adapter.cleanup();
    contentScriptIntegration.cleanup();
    unifiedTranslationCoordinator.cleanup();
    streamingTimeoutManager.cleanup();
  });

  function createElement(...texts) {
    const element = document.createElement('div');
    element.replaceChildren(...texts.map(text => document.createTextNode(text)));
    document.body.appendChild(element);
    return element;
  }

  async function route(messageId, messages) {
    for (const data of messages) {
      await contentScriptIntegration.handleMessage({
        action: data.action || MessageActions.TRANSLATION_STREAM_END,
        messageId,
        data: data.data || data,
      });
    }
  }

  function createCanonicalInternalAbortResult(cancellationReason) {
    const serializedError = MessageFormat.serializeTranslationError({
      message: 'Lifecycle cleanup',
      operationAborted: true,
      cancellationReason,
    });

    return {
      success: false,
      streaming: true,
      error: serializedError,
      errorDetails: serializedError,
    };
  }

  it('settles zero-commit generic internal abort through real routing', async () => {
    routeStream.mockImplementation((messageId) => route(messageId, [
      createCanonicalInternalAbortResult('lifecycle-cleanup'),
    ]));
    const element = createElement('Hello');

    const rejection = adapter.translateElement(element);
    await expect(rejection).rejects.toMatchObject({
      type: ErrorTypes.TRANSLATION_ERROR,
      operationAborted: true,
      cancellationReason: 'lifecycle-cleanup',
      translationOutcome: { committedParentCount: 0 },
    });

    const messageId = contentScriptIntegration.streamingHandler
      .getStatus().activeHandlers[0]?.messageId;
    expect(messageId).toBeUndefined();
    expect(element.textContent).toBe('Hello');
    element.remove();
  });

  it.each([ErrorTypes.TRANSLATION_TIMEOUT, ErrorTypes.NETWORK_ERROR])(
    'preserves typed %s plus internal abort through real routing', async (type) => {
      routeStream.mockImplementation((messageId) => route(messageId, [{
        success: false,
        errorDetails: {
          message: `${type} failure`,
          type,
          operationAborted: true,
          cancellationReason: 'operation-abort',
        },
      }]));
      const element = createElement('Hello');

      await expect(adapter.translateElement(element)).rejects.toMatchObject({
        type,
        operationAborted: true,
        cancellationReason: 'operation-abort',
      });
      expect(contentScriptIntegration.streamingHandler.getStatus().activeHandlerCount).toBe(0);
      element.remove();
    },
  );

  it('preserves committed DOM and settles partial internal abort', async () => {
    routeStream.mockImplementation((messageId) => route(messageId, [
      {
        action: MessageActions.TRANSLATION_STREAM_UPDATE,
        data: { success: true, data: [{ t: 'Uno', i: 'n1' }] },
      },
      createCanonicalInternalAbortResult('lifecycle-cleanup'),
    ]));
    const element = createElement('A', 'B');

    await expect(adapter.translateElement(element)).rejects.toMatchObject({
      operationAborted: true,
      translationOutcome: {
        committedParentCount: 1,
        totalParentCount: 2,
        cancelled: false,
      },
    });

    expect(element.textContent).toBe('UnoB');
    expect(contentScriptIntegration.streamingHandler.getStatus().activeHandlerCount).toBe(0);
    element.remove();
  });

  it('treats failed streaming result update as terminal', async () => {
    routeStream.mockImplementation((messageId) => route(messageId, [{
      action: MessageActions.TRANSLATION_RESULT_UPDATE,
      data: {
        success: false,
        streaming: true,
        errorDetails: {
          message: 'Timed out',
          type: ErrorTypes.TRANSLATION_TIMEOUT,
          operationAborted: true,
          cancellationReason: 'operation-abort',
        },
      },
    }]));
    const element = createElement('Hello');

    await expect(adapter.translateElement(element)).rejects.toMatchObject({
      type: ErrorTypes.TRANSLATION_TIMEOUT,
      operationAborted: true,
      cancellationReason: 'operation-abort',
    });
    expect(contentScriptIntegration.streamingHandler.getStatus().activeHandlerCount).toBe(0);
    element.remove();
  });

  it('latches acceptance from an early streamed parent through real routing', async () => {
    browser.runtime.sendMessage.mockImplementation((message) => {
      if (message.action === MessageActions.TRANSLATE) {
        return new Promise(resolve => {
          setTimeout(async () => {
            await route(message.messageId, [
              {
                action: MessageActions.TRANSLATION_STREAM_UPDATE,
                data: {
                  success: true,
                  conversationAcceptance: true,
                  data: [{ t: 'Hola', i: 'n1' }],
                },
              },
              { action: MessageActions.TRANSLATION_STREAM_END, data: { success: true } },
            ]);
            resolve({ success: true, streaming: true });
          }, 0);
        });
      }
      if (message.action === MessageActions.PARENT_ACCEPTANCE_ACK) {
        return Promise.resolve({ success: true, status: 'ACCEPTED' });
      }
      return Promise.resolve({ success: true });
    });

    const element = createElement('Hello');
    await expect(adapter.translateElement(element)).resolves.toMatchObject({ success: true });

    const acceptedAcks = browser.runtime.sendMessage.mock.calls
      .map(([message]) => message)
      .filter(message => message.action === MessageActions.PARENT_ACCEPTANCE_ACK && message.data?.accepted === true);
    expect(acceptedAcks).toHaveLength(1);
    expect(element.textContent).toBe('Hola');
    element.remove();
  });

  it('preserves explicit user cancellation through real routing', async () => {
    routeStream.mockImplementation((messageId) => route(messageId, [{
      success: false,
      errorDetails: {
        message: 'Cancelled by user',
        type: ErrorTypes.USER_CANCELLED,
      },
    }]));
    const element = createElement('Hello');

    await expect(adapter.translateElement(element)).rejects.toMatchObject({
      type: ErrorTypes.USER_CANCELLED,
    });
    expect(contentScriptIntegration.streamingHandler.getStatus().activeHandlerCount).toBe(0);
    element.remove();
  });
});
