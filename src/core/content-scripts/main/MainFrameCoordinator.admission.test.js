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
  PAGE_TRANSLATE_STOP_AUTO: 'PAGE_TRANSLATE_STOP_AUTO',
  PAGE_TRANSLATE_CANCELLED: 'PAGE_TRANSLATE_CANCELLED',
  PAGE_RESTORE_ERROR: 'PAGE_RESTORE_ERROR',
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
    aggregator.updateFrameData(0, {
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
    aggregator.updateFrameData(0, {
      isTranslated: true,
      isTranslating: false,
      translatedCount: 5,
      failedCount: 0,
      totalCount: 5,
      status: 'idle'
    });

    const coordinator = new MainFrameCoordinator(aggregator, MessageActions, null);
    coordinator.handleTrustedPageLifecycle({
      frameId: 7,
      action: MessageActions.PAGE_TRANSLATE_START,
      data: {
        frameUrl: 'https://frame.example/',
        messageId: 'iframe-session',
        isAutoTranslating: false,
      },
    });

    expect(aggregator.getGlobalPageTranslationStatus()).toMatchObject({
      isTranslated: true,
      isTranslating: true,
      translatedCount: 5
    });
  });

  it('stores trusted lifecycle state under numeric browser frame ID', () => {
    const coordinator = new MainFrameCoordinator(aggregator, MessageActions, null);

    coordinator.handleTrustedPageLifecycle({
      frameId: 7,
      action: MessageActions.PAGE_TRANSLATE_PROGRESS,
      data: {
        translatedCount: 2,
        totalCount: 3,
        frameId: 99,
        frameUrl: 'https://other-frame.example',
      },
    });

    expect(aggregator.frameProgressMap.get(7)).toMatchObject({
      translatedCount: 2,
      totalCount: 3,
    });
    expect(aggregator.frameProgressMap.has(99)).toBe(false);
    expect(aggregator.frameProgressMap.has('https://other-frame.example')).toBe(false);
  });

  it('marks aggregate stopped only after trusted Stop lifecycle from every active frame', () => {
    const coordinator = new MainFrameCoordinator(aggregator, MessageActions, null);
    aggregator.updateFrameData(0, {
      isTranslated: true,
      isTranslating: true,
      isAutoTranslating: true,
      translatedCount: 2,
      totalCount: 3,
      status: 'translating',
    });
    aggregator.updateFrameData(1, {
      isTranslated: true,
      isTranslating: true,
      isAutoTranslating: true,
      translatedCount: 1,
      totalCount: 2,
      status: 'translating',
    });

    coordinator.handleTrustedPageLifecycle({
      frameId: 0,
      action: MessageActions.PAGE_AUTO_RESTORE_COMPLETE,
      data: { translatedCount: 2, isTranslated: true, isAutoTranslating: false },
    });
    coordinator.handleTrustedPageLifecycle({
      frameId: 1,
      action: MessageActions.PAGE_AUTO_RESTORE_COMPLETE,
      data: { translatedCount: 1, isTranslated: true, isAutoTranslating: false },
    });

    expect(aggregator.getGlobalPageTranslationStatus()).toMatchObject({
      isTranslating: false,
      isAutoTranslating: false,
      isTranslated: true,
      translatedCount: 3,
    });
  });

  it('preserves iframe state when main frame accepts a new cycle', () => {
    aggregator.updateFrameData(1, {
      isTranslated: true,
      isTranslating: false,
      translatedCount: 2,
      failedCount: 0,
      totalCount: 2,
      status: 'idle'
    });

    const coordinator = new MainFrameCoordinator(aggregator, MessageActions, null);
    coordinator.handleTrustedPageLifecycle({
      frameId: 0,
      action: MessageActions.PAGE_TRANSLATE_START,
      data: {
        messageId: 'main-session',
        isAutoTranslating: false,
      },
    });

    expect(aggregator.getGlobalPageTranslationStatus()).toMatchObject({
      isTranslated: true,
      isTranslating: true,
      translatedCount: 2
    });
  });

  it('keeps iframe state when main START is followed by main ERROR', () => {
    aggregator.updateFrameData(1, {
      isTranslated: true,
      isTranslating: false,
      translatedCount: 3,
      failedCount: 0,
      totalCount: 3,
      status: 'idle'
    });

    const coordinator = new MainFrameCoordinator(aggregator, MessageActions, null);
    coordinator.handleTrustedPageLifecycle({
      frameId: 0,
      action: MessageActions.PAGE_TRANSLATE_START,
      data: { messageId: 'main-session', isAutoTranslating: false },
    });
    coordinator.handleTrustedPageLifecycle({
      frameId: 0,
      action: MessageActions.PAGE_TRANSLATE_ERROR,
      data: { error: 'main failure', isFatal: true },
    });

    expect(aggregator.getGlobalPageTranslationStatus()).toMatchObject({
      isTranslated: true,
      isTranslating: false,
      translatedCount: 3
    });
  });

  it('emits main fatal errors with aggregate counts and frame error identity', () => {
    aggregator.updateFrameData(0, {
      isTranslated: false,
      isTranslating: true,
      translatedCount: 0,
      failedCount: 0,
      totalCount: 3,
      status: 'translating'
    });
    aggregator.updateFrameData(1, {
      isTranslated: true,
      isTranslating: false,
      translatedCount: 3,
      failedCount: 0,
      totalCount: 3,
      status: 'idle'
    });

    const emitSpy = vi.spyOn(pageEventBus, 'emit');
    const errorDetails = { type: 'NETWORK_ERROR', message: 'network failure' };

    const coordinator = new MainFrameCoordinator(aggregator, MessageActions, null);
    coordinator.handleTrustedPageLifecycle({
      frameId: 0,
      action: MessageActions.PAGE_TRANSLATE_ERROR,
      data: {
        error: 'network failure',
        errorDetails,
        errorType: 'NETWORK_ERROR',
        isFatal: true,
      },
    });

    const aggregateCall = emitSpy.mock.calls.find(([, data]) => (
      data?.isAggregated === true && data.errorDetails === errorDetails
    ));
    expect(aggregateCall?.[0]).toBe(MessageActions.PAGE_TRANSLATE_ERROR);
    expect(aggregateCall?.[1]).toMatchObject({
      isAggregated: true,
      errorDetails,
      translatedCount: 3,
      failedCount: 0,
      totalCount: 6,
      isTranslating: false,
      isFatal: true
    });

    emitSpy.mockRestore();
  });

  it('keeps main committed output in an iframe fatal aggregate error', () => {
    aggregator.updateFrameData(0, {
      isTranslated: true,
      isTranslating: false,
      translatedCount: 5,
      failedCount: 0,
      totalCount: 5,
      status: 'idle'
    });
    aggregator.updateFrameData(1, {
      isTranslated: false,
      isTranslating: true,
      translatedCount: 0,
      failedCount: 0,
      totalCount: 1,
      status: 'translating'
    });

    const emitSpy = vi.spyOn(pageEventBus, 'emit');
    const errorDetails = { type: 'NETWORK_ERROR', message: 'iframe failure' };

    const coordinator = new MainFrameCoordinator(aggregator, MessageActions, null);
    coordinator.handleTrustedPageLifecycle({
      frameId: 1,
      action: MessageActions.PAGE_TRANSLATE_ERROR,
      data: {
        frameUrl: 'frame-1',
        error: 'iframe failure',
        errorDetails,
        errorType: 'NETWORK_ERROR',
        translatedCount: 0,
        isFatal: true,
      },
    });

    const aggregateCall = emitSpy.mock.calls.find(([, data]) => (
      data?.isAggregated === true && data.errorDetails === errorDetails
    ));
    expect(aggregateCall?.[1]).toMatchObject({
      translatedCount: 5,
      isFatal: true,
      errorDetails
    });

    emitSpy.mockRestore();
  });
});
