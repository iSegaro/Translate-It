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
  PAGE_TRANSLATE_STOP_AUTO: 'PAGE_TRANSLATE_STOP_AUTO'
};

describe('MainFrameCoordinator Hover error normalization', () => {
  let emitSpy;
  let aggregator;

  beforeEach(() => {
    vi.clearAllMocks();
    emitSpy = vi.spyOn(pageEventBus, 'emit');
    aggregator = {
      clearAll: vi.fn(),
      updateFrameData: vi.fn(),
      emitAggregateProgress: vi.fn()
    };
    new MainFrameCoordinator(aggregator, MessageActions, null);
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

  it('keeps PAGE_TRANSLATE command intent out of aggregate state', () => {
    pageEventBus.emit(MessageActions.PAGE_TRANSLATE, { isAuto: false });

    expect(aggregator.updateFrameData).not.toHaveBeenCalled();
    expect(aggregator.clearAll).not.toHaveBeenCalled();
  });

  it('starts only main frame on accepted local START', () => {
    const data = { messageId: 'main-session', isAutoTranslating: false };

    pageEventBus.emit(MessageActions.PAGE_TRANSLATE_START, data);

    expect(aggregator.updateFrameData).toHaveBeenCalledWith('main', expect.objectContaining({
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

  it('starts only iframe frame on accepted iframe START', () => {
    const data = {
      frameUrl: 'https://frame.example/',
      messageId: 'iframe-session',
      isAutoTranslating: true
    };

    dispatchIframeEvent('TRANSLATE_IT_PAGE_EVENT', {
      source: 'translate-it-iframe',
      type: 'TRANSLATE_IT_PAGE_EVENT',
      action: MessageActions.PAGE_TRANSLATE_START,
      data
    });

    expect(aggregator.updateFrameData).toHaveBeenCalledWith('https://frame.example/', expect.objectContaining({
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

  it('reconciles main-frame errors without clearing other frame state', () => {
    const data = { error: 'translation failed', isFatal: true };

    pageEventBus.emit(MessageActions.PAGE_TRANSLATE_ERROR, data);

    expect(aggregator.updateFrameData).toHaveBeenCalledWith('main', expect.objectContaining({
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
    const data = { error: 'retryable failure', isFatal: false };

    pageEventBus.emit(MessageActions.PAGE_TRANSLATE_ERROR, data);

    expect(aggregator.updateFrameData).toHaveBeenCalledWith('main', expect.objectContaining({
      isTranslating: false,
      status: 'error'
    }));
    expect(aggregator.emitAggregateProgress).not.toHaveBeenCalledWith(
      MessageActions.PAGE_TRANSLATE_ERROR,
      data
    );
  });
});
