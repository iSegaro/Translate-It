import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useSubtitleTranslation } from './useSubtitleTranslation.js';
import { MessageActions } from '@/shared/messaging/core/MessageActions.js';

const { subscribeMock, sendToBackgroundMock, presentSubtitleTranslationErrorMock } = vi.hoisted(() => ({
  subscribeMock: vi.fn(),
  sendToBackgroundMock: vi.fn(),
  presentSubtitleTranslationErrorMock: vi.fn()
}));

vi.mock('@/shared/messaging/core/MessagingBus.js', () => ({
  MessagingBus: {
    subscribe: subscribeMock,
    sendToBackground: sendToBackgroundMock
  }
}));

vi.mock('../presentation/SubtitleTranslationErrorPresenter.js', () => ({
  presentSubtitleTranslationError: presentSubtitleTranslationErrorMock.mockImplementation(async ({ errorDetails }) => {
    if (['USER_CANCELLED', 'TRANSLATION_CANCELLED', 'CONTEXT', 'EXTENSION_CONTEXT_INVALIDATED'].includes(errorDetails?.type)) {
      return { kind: 'silent' };
    }
    return {
      kind: 'display',
      message: errorDetails ? 'Safe subtitle error' : 'Localized TRANSLATION_FAILED'
    };
  })
}));

describe('useSubtitleTranslation error presentation', () => {
  let onMessage;

  beforeEach(() => {
    vi.clearAllMocks();
    subscribeMock.mockImplementation((_context, callback) => {
      onMessage = callback;
      return vi.fn();
    });
  });

  it('maps structured terminal errors and hides raw diagnostics', async () => {
    const state = useSubtitleTranslation();

    await onMessage({
      action: MessageActions.SUBTITLE_TRANSLATE_ERROR,
      data: {
        jobId: state.jobId.value,
        error: 'raw provider body',
        errorDetails: { message: 'raw diagnostic', type: 'MODEL_NOT_FOUND' }
      }
    });
    await Promise.resolve();

    expect(state.status.value).toBe('error');
    expect(state.error.value).toBe('Safe subtitle error');
    expect(state.error.value).not.toContain('raw provider');
    expect(state.errorDetails.value.type).toBe('MODEL_NOT_FOUND');
  });

  it('uses safe generic presentation for string-only failures', async () => {
    const state = useSubtitleTranslation();

    await onMessage({
      action: MessageActions.SUBTITLE_TRANSLATE_ERROR,
      data: { jobId: state.jobId.value, error: 'legacy failure' }
    });
    await Promise.resolve();

    expect(state.status.value).toBe('error');
    expect(state.error.value).toBe('Localized TRANSLATION_FAILED');
  });

  it('keeps cancellation/context failures invisible', async () => {
    const state = useSubtitleTranslation();

    await onMessage({
      action: MessageActions.SUBTITLE_TRANSLATE_ERROR,
      data: {
        jobId: state.jobId.value,
        error: 'raw context failure',
        errorDetails: { message: 'context failure', type: 'CONTEXT' }
      }
    });
    await Promise.resolve();

    expect(state.status.value).toBe('idle');
    expect(state.error.value).toBeNull();
  });

  it('retains terminal structured details with completed partial progress', async () => {
    const state = useSubtitleTranslation();
    const errorDetails = { message: 'raw provider diagnostic', type: 'API_KEY_INVALID' };

    await onMessage({
      action: MessageActions.SUBTITLE_TRANSLATE_COMPLETE,
      data: {
        jobId: state.jobId.value,
        content: 'partial content',
        errorDetails,
        stats: {
          percent: 100,
          translated: 1,
          failed: 1,
          total: 2,
          terminalError: 'raw provider body',
          terminalErrorDetails: errorDetails
        }
      }
    });

    expect(state.status.value).toBe('completed');
    expect(state.translatedContent.value).toBe('partial content');
    expect(state.progress.failed).toBe(1);
    expect(state.progress.terminalErrorDetails).toEqual(errorDetails);
  });

  it('reconstructs direct canonical rejection identity before presentation', async () => {
    const state = useSubtitleTranslation();
    const rejectedError = Object.assign(new Error('raw model diagnostic'), {
      type: 'MODEL_NOT_FOUND',
      statusCode: 404,
      providerName: 'Provider'
    });
    sendToBackgroundMock.mockRejectedValueOnce(rejectedError);

    await state.startTranslation('subtitle', 'sample.srt', {
      sourceLanguage: 'en',
      targetLanguage: 'fa',
      providerId: 'provider'
    });

    const detail = presentSubtitleTranslationErrorMock.mock.calls.at(-1)[0];
    expect(detail.error).toBe('raw model diagnostic');
    expect(detail.errorDetails).toMatchObject({
      message: 'raw model diagnostic',
      type: 'MODEL_NOT_FOUND',
      statusCode: 404,
      providerName: 'Provider'
    });
    expect(state.error.value).toBe('Safe subtitle error');
    expect(state.error.value).not.toContain('raw model diagnostic');
  });

  it('keeps rejected errorDetails authoritative over canonical Error fields', async () => {
    const state = useSubtitleTranslation();
    const errorDetails = {
      message: 'structured diagnostic',
      type: 'API_KEY_INVALID',
      providerName: 'Structured Provider'
    };
    const rejectedError = Object.assign(new Error('raw model diagnostic'), {
      type: 'MODEL_NOT_FOUND',
      errorDetails
    });
    sendToBackgroundMock.mockRejectedValueOnce(rejectedError);

    await state.startTranslation('subtitle', 'sample.srt', {
      sourceLanguage: 'en',
      targetLanguage: 'fa',
      providerId: 'provider'
    });

    const detail = presentSubtitleTranslationErrorMock.mock.calls.at(-1)[0];
    expect(detail.errorDetails).toBe(errorDetails);
    expect(detail.errorDetails.type).toBe('API_KEY_INVALID');
  });

  it('uses safe generic presentation for ordinary local rejection', async () => {
    const state = useSubtitleTranslation();
    sendToBackgroundMock.mockRejectedValueOnce(new Error('Failed to read subtitle file'));

    await state.startTranslation('subtitle', 'sample.srt', {
      sourceLanguage: 'en',
      targetLanguage: 'fa',
      providerId: 'provider'
    });

    const detail = presentSubtitleTranslationErrorMock.mock.calls.at(-1)[0];
    expect(detail.errorDetails).toBeUndefined();
    expect(state.error.value).toBe('Localized TRANSLATION_FAILED');
  });

  it.each(['USER_CANCELLED', 'CONTEXT', 'EXTENSION_CONTEXT_INVALIDATED'])('silences direct %s rejection', async (type) => {
    const state = useSubtitleTranslation();
    sendToBackgroundMock.mockRejectedValueOnce(Object.assign(new Error('raw context diagnostic'), { type }));

    await state.startTranslation('subtitle', 'sample.srt', {
      sourceLanguage: 'en',
      targetLanguage: 'fa',
      providerId: 'provider'
    });

    expect(state.status.value).toBe('idle');
    expect(state.error.value).toBeNull();
  });
});
