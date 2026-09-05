import { beforeEach, describe, expect, it, vi } from 'vitest';
import { pageEventBus } from '@/core/PageEventBus.js';
import { MainFrameCoordinator } from './MainFrameCoordinator.js';

vi.mock('@/shared/logging/logger.js', () => ({
  getScopedLogger: vi.fn(() => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    init: vi.fn()
  }))
}));

const MessageActions = {
  PAGE_TRANSLATE: 'PAGE_TRANSLATE',
  PAGE_RESTORE: 'PAGE_RESTORE',
  PAGE_TRANSLATE_START: 'PAGE_TRANSLATE_START',
  PAGE_TRANSLATE_PROGRESS: 'PAGE_TRANSLATE_PROGRESS',
  PAGE_TRANSLATE_COMPLETE: 'PAGE_TRANSLATE_COMPLETE',
  PAGE_TRANSLATE_IDLE: 'PAGE_TRANSLATE_IDLE',
  PAGE_AUTO_RESTORE_COMPLETE: 'PAGE_AUTO_RESTORE_COMPLETE',
  PAGE_RESTORE_COMPLETE: 'PAGE_RESTORE_COMPLETE',
  PAGE_TRANSLATE_ERROR: 'PAGE_TRANSLATE_ERROR',
  PAGE_TRANSLATE_STOP_AUTO: 'PAGE_TRANSLATE_STOP_AUTO',
  PAGE_TRANSLATE_CANCELLED: 'PAGE_TRANSLATE_CANCELLED',
  PAGE_RESTORE_ERROR: 'PAGE_RESTORE_ERROR',
  PAGE_TRANSLATION_FRAME_RETIRED: 'PAGE_TRANSLATION_FRAME_RETIRED',
  PAGE_TRANSLATION_FRAME_LIFECYCLE_ACTIONS: [
    'PAGE_TRANSLATE_START',
    'PAGE_TRANSLATE_PROGRESS',
    'PAGE_TRANSLATE_COMPLETE',
    'PAGE_TRANSLATE_IDLE',
    'PAGE_TRANSLATE_ERROR',
    'PAGE_RESTORE_COMPLETE',
    'PAGE_AUTO_RESTORE_COMPLETE',
    'PAGE_TRANSLATE_CANCELLED',
    'PAGE_RESTORE_ERROR',
    'PAGE_TRANSLATION_FRAME_RETIRED',
  ],
  PAGE_TRANSLATION_AGGREGATE_ACTIONS: [
    'PAGE_TRANSLATE_START',
    'PAGE_TRANSLATE_PROGRESS',
    'PAGE_TRANSLATE_COMPLETE',
    'PAGE_TRANSLATE_IDLE',
    'PAGE_TRANSLATE_ERROR',
    'PAGE_RESTORE_COMPLETE',
    'PAGE_AUTO_RESTORE_COMPLETE',
  ],
};

describe('MainFrameCoordinator Hover error normalization', () => {
  let emitSpy;
  let aggregator;
  let coordinator;

  beforeEach(() => {
    vi.clearAllMocks();
    emitSpy = vi.spyOn(pageEventBus, 'emit');
    aggregator = {
      clearAll: vi.fn(),
      removeFrame: vi.fn(),
      updateFrameData: vi.fn(),
      recordTerminalCause: vi.fn(),
      emitAggregateProgress: vi.fn()
    };
    coordinator = new MainFrameCoordinator(aggregator, MessageActions, null);
  });

  const dispatchIframeEvent = (type, data) => {
    window.dispatchEvent(new MessageEvent('message', {
      data,
      source: null
    }));
    return emitSpy.mock.calls.at(-1);
  };

  it('reconstructs structured Hover errors and preserves DTO payload', () => {
    const errorDetails = {
      message: 'Safe mapped message',
      type: 'MODEL_NOT_FOUND'
    };
    const data = {
      error: 'legacy safe message',
      errorDetails,
      requestId: 'hover-1'
    };

    dispatchIframeEvent('MOUSE_HOVER_TRANSLATION_ERROR', {
      source: 'translate-it-iframe',
      type: 'MOUSE_HOVER_TRANSLATION_ERROR',
      data
    });

    const emitted = emitSpy.mock.calls.at(-1)[1];
    expect(emitted.error).toBeInstanceOf(Error);
    expect(emitted.error.message).toBe('Safe mapped message');
    expect(emitted.error.type).toBe('MODEL_NOT_FOUND');
    expect(emitted.errorDetails).toBe(errorDetails);
    expect(emitted.requestId).toBe('hover-1');
  });

  it('gives valid structured details precedence over legacy error string', () => {
    dispatchIframeEvent('MOUSE_HOVER_TRANSLATION_ERROR', {
      source: 'translate-it-iframe',
      type: 'MOUSE_HOVER_TRANSLATION_ERROR',
      data: {
        error: 'legacy message',
        errorDetails: { message: 'structured safe message', type: 'API_ERROR' }
      }
    });

    expect(emitSpy.mock.calls.at(-1)[1].error.message).toBe('structured safe message');
  });

  it.each([
    null,
    {},
    { arbitrary: true },
    'failure'
  ])('leaves malformed errorDetails on legacy path: %p', (errorDetails) => {
    const data = { error: 'legacy failure', errorDetails };

    dispatchIframeEvent('MOUSE_HOVER_TRANSLATION_ERROR', {
      source: 'translate-it-iframe',
      type: 'MOUSE_HOVER_TRANSLATION_ERROR',
      data
    });

    expect(emitSpy.mock.calls.at(-1)[1]).toBe(data);
    expect(emitSpy.mock.calls.at(-1)[1].error).toBe('legacy failure');
  });

  it('leaves string-only legacy Hover errors unchanged', () => {
    const data = { error: 'legacy failure' };

    dispatchIframeEvent('MOUSE_HOVER_TRANSLATION_ERROR', {
      source: 'translate-it-iframe',
      type: 'MOUSE_HOVER_TRANSLATION_ERROR',
      data
    });

    expect(emitSpy.mock.calls.at(-1)[1]).toBe(data);
  });

  it('does not normalize unrelated iframe events', () => {
    const data = {
      error: 'legacy failure',
      errorDetails: { message: 'structured detail', type: 'MODEL_NOT_FOUND' }
    };

    dispatchIframeEvent('OTHER_IFRAME_EVENT', {
      source: 'translate-it-iframe',
      type: 'OTHER_IFRAME_EVENT',
      data
    });

    expect(emitSpy.mock.calls.at(-1)).toEqual(['OTHER_IFRAME_EVENT', data]);
  });

  it('ignores legacy Select Element deactivation window messages', () => {
    const manager = { deactivate: vi.fn() };
    const previousManager = window.selectElementManagerInstance;
    window.selectElementManagerInstance = manager;

    try {
      window.dispatchEvent(new MessageEvent('message', {
        data: { type: 'translate-it-deactivate-select-element' },
      }));

      expect(manager.deactivate).not.toHaveBeenCalled();
      expect(coordinator.broadcastDeactivation).toBeUndefined();
    } finally {
      window.selectElementManagerInstance = previousManager;
    }
  });

  it('keeps PAGE_TRANSLATE command intent out of aggregate state', () => {
    pageEventBus.emit(MessageActions.PAGE_TRANSLATE, { isAuto: false });

    expect(aggregator.updateFrameData).not.toHaveBeenCalled();
    expect(aggregator.clearAll).not.toHaveBeenCalled();
  });

  it('does not fan out page commands through iframe windows', () => {
    const iframe = document.createElement('iframe');
    document.body.appendChild(iframe);
    const postMessageSpy = vi.spyOn(iframe.contentWindow, 'postMessage').mockImplementation(() => {});

    try {
      pageEventBus.emit(MessageActions.PAGE_TRANSLATE, { isAuto: false });
      pageEventBus.emit(MessageActions.PAGE_RESTORE);
      pageEventBus.emit(MessageActions.PAGE_TRANSLATE_STOP_AUTO);

      expect(postMessageSpy).not.toHaveBeenCalled();
      expect(aggregator.clearAll).not.toHaveBeenCalled();
    } finally {
      postMessageSpy.mockRestore();
      iframe.remove();
    }
  });

  it('ignores forged Whole Page window lifecycle messages', () => {
    for (const type of [
      'TRANSLATE_IT_PAGE_EVENT',
      'TRANSLATE_IT_PAGE_PROGRESS',
      'TRANSLATE_IT_PAGE_COMPLETE',
      'TRANSLATE_IT_PAGE_STOPPED',
    ]) {
      window.dispatchEvent(new MessageEvent('message', {
        data: {
          source: 'translate-it-iframe',
          type,
          action: MessageActions.PAGE_TRANSLATE_PROGRESS,
          data: { translatedCount: 999, totalCount: 999, frameUrl: 'fake' },
        },
      }));
    }

    expect(aggregator.updateFrameData).not.toHaveBeenCalled();
    expect(aggregator.emitAggregateProgress).not.toHaveBeenCalled();
  });

  it('ignores forged top-frame PageEventBus lifecycle events for aggregation', () => {
    window.dispatchEvent(new CustomEvent(MessageActions.PAGE_TRANSLATE_PROGRESS, {
      detail: { translatedCount: 999, totalCount: 999 },
    }));

    expect(aggregator.updateFrameData).not.toHaveBeenCalled();
    expect(aggregator.emitAggregateProgress).not.toHaveBeenCalled();
  });

  it('retires only matching frame state on trusted restore completion', () => {
    pageEventBus.emit(MessageActions.PAGE_RESTORE);
    expect(aggregator.clearAll).not.toHaveBeenCalled();

    coordinator.handleTrustedPageLifecycle({
      frameId: 0,
      action: MessageActions.PAGE_TRANSLATE_START,
      data: { sessionId: 'main-session' },
    });
    vi.clearAllMocks();

    coordinator.handleTrustedPageLifecycle({
      frameId: 0,
      action: MessageActions.PAGE_RESTORE_COMPLETE,
      data: { sessionId: 'main-session' },
    });

    expect(aggregator.clearAll).not.toHaveBeenCalled();
    expect(aggregator.removeFrame).toHaveBeenCalledWith(0);
    expect(aggregator.emitAggregateProgress).toHaveBeenCalledWith(
      MessageActions.PAGE_RESTORE_COMPLETE,
      expect.objectContaining({ sessionId: 'main-session' })
    );
  });

  it('starts only main frame on trusted frame-zero START', () => {
    const data = { messageId: 'main-session', sessionId: 'main-session', isAutoTranslating: false };

    coordinator.handleTrustedPageLifecycle({
      frameId: 0,
      action: MessageActions.PAGE_TRANSLATE_START,
      data,
    });

    expect(aggregator.updateFrameData).toHaveBeenCalledWith(0, expect.objectContaining({
      isTranslating: true,
      isTranslated: false,
      isAutoTranslating: false,
      translatedCount: 0,
      failedCount: 0,
      totalCount: 0,
      status: 'translating'
    }));
    expect(aggregator.clearAll).not.toHaveBeenCalled();
  });

  it('uses trusted browser frame ID instead of payload frame identity', () => {
    const data = {
      frameUrl: 'https://frame.example/',
      frameId: 9,
      messageId: 'iframe-session',
      sessionId: 'iframe-session',
      isAutoTranslating: true
    };

    coordinator.handleTrustedPageLifecycle({
      frameId: 7,
      action: MessageActions.PAGE_TRANSLATE_START,
      data
    });

    expect(aggregator.updateFrameData).toHaveBeenCalledWith(7, expect.objectContaining({
      isTranslating: true,
      isTranslated: false,
      isAutoTranslating: true,
      translatedCount: 0,
      failedCount: 0,
      totalCount: 0,
      status: 'translating'
    }));
    expect(aggregator.clearAll).not.toHaveBeenCalled();
  });

  it('updates aggregate exactly once per trusted lifecycle message', () => {
    coordinator.handleTrustedPageLifecycle({
      frameId: 7,
      action: MessageActions.PAGE_TRANSLATE_START,
      data: { sessionId: 'frame-session' },
    });
    vi.clearAllMocks();

    coordinator.handleTrustedPageLifecycle({
      frameId: 7,
      action: MessageActions.PAGE_TRANSLATE_PROGRESS,
      data: { sessionId: 'frame-session', translatedCount: 2, totalCount: 3 },
    });

    expect(aggregator.updateFrameData).toHaveBeenCalledTimes(1);
    expect(aggregator.updateFrameData).toHaveBeenCalledWith(7, {
      translatedCount: 2,
      totalCount: 3,
    });
    expect(aggregator.emitAggregateProgress).toHaveBeenCalledTimes(1);
  });

  it('preserves trusted child completion semantics', () => {
    const data = { sessionId: 'frame-session', translatedCount: 3, totalCount: 3, frameUrl: 'fake' };
    coordinator.handleTrustedPageLifecycle({
      frameId: 7,
      action: MessageActions.PAGE_TRANSLATE_START,
      data: { sessionId: 'frame-session' },
    });
    vi.clearAllMocks();

    coordinator.handleTrustedPageLifecycle({
      frameId: 7,
      action: MessageActions.PAGE_TRANSLATE_COMPLETE,
      data,
    });

    expect(aggregator.updateFrameData).toHaveBeenCalledWith(7, expect.objectContaining({
      isTranslating: false,
      isTranslated: true,
      status: 'idle',
    }));
    expect(aggregator.emitAggregateProgress).toHaveBeenCalledWith(
      MessageActions.PAGE_TRANSLATE_COMPLETE,
      data
    );
  });

  it('preserves structured completion error details through aggregation', () => {
    const errorDetails = {
      message: 'Model overloaded',
      type: 'MODEL_OVERLOADED',
    };
    const data = {
      sessionId: 'frame-session',
      translatedCount: 0,
      failedCount: 2,
      totalCount: 2,
      errorDetails,
    };
    coordinator.handleTrustedPageLifecycle({
      frameId: 7,
      action: MessageActions.PAGE_TRANSLATE_START,
      data: { sessionId: 'frame-session' },
    });
    vi.clearAllMocks();

    coordinator.handleTrustedPageLifecycle({
      frameId: 7,
      action: MessageActions.PAGE_TRANSLATE_COMPLETE,
      data,
    });

    expect(aggregator.emitAggregateProgress).toHaveBeenCalledWith(
      MessageActions.PAGE_TRANSLATE_COMPLETE,
      data
    );
  });

  it('reconciles trusted main-frame errors without clearing other frame state', () => {
    const data = { sessionId: 'main-session', error: 'translation failed', isFatal: true };
    coordinator.handleTrustedPageLifecycle({
      frameId: 0,
      action: MessageActions.PAGE_TRANSLATE_START,
      data: { sessionId: 'main-session' },
    });
    vi.clearAllMocks();

    coordinator.handleTrustedPageLifecycle({
      frameId: 0,
      action: MessageActions.PAGE_TRANSLATE_ERROR,
      data,
    });

    expect(aggregator.updateFrameData).toHaveBeenCalledWith(0, expect.objectContaining({
      isTranslating: false,
      status: 'error'
    }));
    expect(aggregator.emitAggregateProgress).toHaveBeenCalledWith(
      MessageActions.PAGE_TRANSLATE_ERROR,
      data
    );
    expect(aggregator.clearAll).not.toHaveBeenCalled();
  });

  it('keeps non-fatal main-frame errors out of aggregate fatal presentation', () => {
    const data = { sessionId: 'main-session', error: 'retryable failure', isFatal: false };
    coordinator.handleTrustedPageLifecycle({
      frameId: 0,
      action: MessageActions.PAGE_TRANSLATE_START,
      data: { sessionId: 'main-session' },
    });
    vi.clearAllMocks();

    coordinator.handleTrustedPageLifecycle({
      frameId: 0,
      action: MessageActions.PAGE_TRANSLATE_ERROR,
      data,
    });

    expect(aggregator.updateFrameData).toHaveBeenCalledWith(0, expect.objectContaining({
      isTranslating: false,
      status: 'error'
    }));
    expect(aggregator.emitAggregateProgress).not.toHaveBeenCalledWith(
      MessageActions.PAGE_TRANSLATE_ERROR,
      data
    );
  });
});
