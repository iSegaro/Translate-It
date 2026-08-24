import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { pageEventBus } from '@/core/PageEventBus.js';
import { MainFrameAggregator } from './MainFrameAggregator.js';
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

describe('MainFrameCoordinator per-frame admission', () => {
  let aggregator;

  beforeAll(() => {
    aggregator = new MainFrameAggregator(MessageActions);
    new MainFrameCoordinator(aggregator, MessageActions, null);
  });

  beforeEach(() => {
    aggregator.clearAll();
  });

  it('preserves existing aggregate state when PAGE_TRANSLATE is only intent', () => {
    aggregator.updateFrameData('main', {
      isTranslated: true,
      isTranslating: false,
      translatedCount: 5,
      failedCount: 0,
      totalCount: 5,
      status: 'idle'
    });

    pageEventBus.emit(MessageActions.PAGE_TRANSLATE, { isAuto: false });

    expect(aggregator.getGlobalPageTranslationStatus()).toMatchObject({
      isTranslated: true,
      isTranslating: false,
      translatedCount: 5
    });
  });

  it('preserves main state when iframe accepts after main rejection', () => {
    aggregator.updateFrameData('main', {
      isTranslated: true,
      isTranslating: false,
      translatedCount: 5,
      failedCount: 0,
      totalCount: 5,
      status: 'idle'
    });

    window.dispatchEvent(new MessageEvent('message', {
      data: {
        source: 'translate-it-iframe',
        type: 'TRANSLATE_IT_PAGE_EVENT',
        action: MessageActions.PAGE_TRANSLATE_START,
        data: {
          frameUrl: 'https://frame.example/',
          messageId: 'iframe-session',
          isAutoTranslating: false
        }
      },
      source: null
    }));

    expect(aggregator.getGlobalPageTranslationStatus()).toMatchObject({
      isTranslated: true,
      isTranslating: true,
      translatedCount: 5
    });
  });

  it('preserves iframe state when main frame accepts a new cycle', () => {
    aggregator.updateFrameData('frame-1', {
      isTranslated: true,
      isTranslating: false,
      translatedCount: 2,
      failedCount: 0,
      totalCount: 2,
      status: 'idle'
    });

    pageEventBus.emit(MessageActions.PAGE_TRANSLATE_START, {
      messageId: 'main-session',
      isAutoTranslating: false
    });

    expect(aggregator.getGlobalPageTranslationStatus()).toMatchObject({
      isTranslated: true,
      isTranslating: true,
      translatedCount: 2
    });
  });

  it('keeps iframe state when main START is followed by main ERROR', () => {
    aggregator.updateFrameData('frame-1', {
      isTranslated: true,
      isTranslating: false,
      translatedCount: 3,
      failedCount: 0,
      totalCount: 3,
      status: 'idle'
    });

    pageEventBus.emit(MessageActions.PAGE_TRANSLATE_START, {
      messageId: 'main-session',
      isAutoTranslating: false
    });
    pageEventBus.emit(MessageActions.PAGE_TRANSLATE_ERROR, {
      error: 'main failure',
      isFatal: true
    });

    expect(aggregator.getGlobalPageTranslationStatus()).toMatchObject({
      isTranslated: true,
      isTranslating: false,
      translatedCount: 3
    });
  });
});
