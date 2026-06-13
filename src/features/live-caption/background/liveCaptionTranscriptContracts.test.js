import { describe, expect, it } from 'vitest';
import {
  LIVE_CAPTION_TRANSCRIPT_EVENT_TYPES,
  normalizeLiveCaptionTranscriptEvent
} from './liveCaptionTranscriptContracts.js';
import {
  STT_PROVIDER_MODES,
  STT_PROVIDER_EXECUTION_LOCATIONS
} from '../stt/liveCaptionSTTProviderContracts.js';

describe('live-caption transcript contracts', () => {
  it('exposes transcript event and STT execution constants', () => {
    expect(LIVE_CAPTION_TRANSCRIPT_EVENT_TYPES).toEqual({
      PARTIAL: 'partial',
      FINAL: 'final',
      CORRECTION: 'correction',
      ERROR: 'error'
    });
    expect(STT_PROVIDER_MODES).toEqual({
      BATCH: 'batch',
      STREAMING: 'streaming'
    });
    expect(STT_PROVIDER_EXECUTION_LOCATIONS).toEqual({
      BACKGROUND: 'background',
      OFFSCREEN: 'offscreen'
    });
  });

  it('normalizes a final transcript event', () => {
    const event = normalizeLiveCaptionTranscriptEvent({
      eventId: 'event-1',
      eventType: LIVE_CAPTION_TRANSCRIPT_EVENT_TYPES.FINAL,
      providerId: 'openai_whisper',
      providerMode: STT_PROVIDER_MODES.BATCH,
      sessionId: 'session-1',
      tabId: '7',
      videoFingerprint: 'video-a',
      segmentId: 'segment-1',
      revision: '2',
      segmentStartMs: '100',
      segmentEndMs: 250,
      text: 'Hello world',
      sourceLanguage: 'en',
      targetLanguage: 'fa',
      confidence: '0.93',
      isFinal: false,
      createdAt: '123',
      metadata: {
        source: 'batch'
      }
    });

    expect(event).toMatchObject({
      eventId: 'event-1',
      eventType: LIVE_CAPTION_TRANSCRIPT_EVENT_TYPES.FINAL,
      providerId: 'openai_whisper',
      providerMode: STT_PROVIDER_MODES.BATCH,
      sessionId: 'session-1',
      tabId: 7,
      videoFingerprint: 'video-a',
      segmentId: 'segment-1',
      revision: 2,
      segmentStartMs: 100,
      segmentEndMs: 250,
      text: 'Hello world',
      sourceLanguage: 'en',
      targetLanguage: 'fa',
      confidence: 0.93,
      isFinal: true,
      supersedesEventId: null,
      supersedesSegmentId: null,
      error: null,
      createdAt: 123,
      updatedAt: null,
      metadata: {
        source: 'batch'
      }
    });
  });

  it('normalizes an error transcript event', () => {
    const event = normalizeLiveCaptionTranscriptEvent({
      eventId: 'event-2',
      eventType: LIVE_CAPTION_TRANSCRIPT_EVENT_TYPES.ERROR,
      providerId: 'local_whisper',
      providerMode: STT_PROVIDER_MODES.BATCH,
      sessionId: 'session-1',
      tabId: '8',
      videoFingerprint: 'video-b',
      error: {
        code: 'provider_error',
        message: 'Boom',
        status: '503',
        retryable: true,
        details: {
          attempt: 2
        }
      },
      createdAt: 456,
      metadata: {
        reason: 'disconnect'
      }
    });

    expect(event).toMatchObject({
      eventId: 'event-2',
      eventType: LIVE_CAPTION_TRANSCRIPT_EVENT_TYPES.ERROR,
      providerId: 'local_whisper',
      providerMode: STT_PROVIDER_MODES.BATCH,
      sessionId: 'session-1',
      tabId: 8,
      videoFingerprint: 'video-b',
      segmentId: null,
      revision: null,
      segmentStartMs: null,
      segmentEndMs: null,
      text: null,
      isFinal: false,
      error: {
        code: 'provider_error',
        message: 'Boom',
        type: null,
        providerId: null,
        providerName: null,
        statusCode: 503,
        retryable: true,
        details: {
          attempt: 2
        }
      },
      createdAt: 456,
      updatedAt: null,
      metadata: {
        reason: 'disconnect'
      }
    });
  });

  it('normalizes a correction transcript event as canonical final', () => {
    const event = normalizeLiveCaptionTranscriptEvent({
      eventId: 'event-3',
      eventType: LIVE_CAPTION_TRANSCRIPT_EVENT_TYPES.CORRECTION,
      providerId: 'whisperlivekit',
      providerMode: STT_PROVIDER_MODES.STREAMING,
      sessionId: 'session-1',
      tabId: 9,
      videoFingerprint: 'video-c',
      segmentId: 'segment-3',
      revision: 4,
      segmentStartMs: 300,
      segmentEndMs: 500,
      text: 'Corrected text',
      supersedesSegmentId: 'segment-2',
      isFinal: false
    });

    expect(event).toMatchObject({
      eventId: 'event-3',
      eventType: LIVE_CAPTION_TRANSCRIPT_EVENT_TYPES.CORRECTION,
      providerId: 'whisperlivekit',
      providerMode: STT_PROVIDER_MODES.STREAMING,
      sessionId: 'session-1',
      tabId: 9,
      videoFingerprint: 'video-c',
      segmentId: 'segment-3',
      revision: 4,
      segmentStartMs: 300,
      segmentEndMs: 500,
      text: 'Corrected text',
      isFinal: true,
      supersedesSegmentId: 'segment-2',
      supersedesEventId: null,
      error: null
    });
  });

  it('rejects invalid transcript events', () => {
    expect(() => normalizeLiveCaptionTranscriptEvent({})).toThrow(/eventType/i);
    expect(() => normalizeLiveCaptionTranscriptEvent({
      eventType: LIVE_CAPTION_TRANSCRIPT_EVENT_TYPES.FINAL,
      providerId: 'openai_whisper',
      providerMode: STT_PROVIDER_MODES.BATCH,
      sessionId: 'session-1',
      tabId: 7,
      videoFingerprint: 'video-a',
      segmentId: 'segment-1',
      revision: 1,
      segmentStartMs: 100,
      segmentEndMs: 200
    })).toThrow(/requires text/i);
  });
});
