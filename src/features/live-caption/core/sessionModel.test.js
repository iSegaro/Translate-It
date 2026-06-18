import { describe, it, expect } from 'vitest';
import { PageLiveCaptionSession } from './PageLiveCaptionSession.js';
import { VideoCaptionSession } from './VideoCaptionSession.js';
import { LiveCaptionSessionManager } from './LiveCaptionSessionManager.js';
import { LIVE_CAPTION_SESSION_STATES } from '../constants/liveCaptionSessionStates.js';
import { LIVE_CAPTION_CLEANUP_REASONS } from './contracts.js';
import { LIVE_CAPTION_CLEANUP_RESULT_STATUSES } from './LiveCaptionCleanupCoordinator.js';

describe('live-caption session model', () => {
  const canonicalIdentity = {
    sessionId: 'session-a',
    tabId: 7,
    videoFingerprint: 'video-a',
    segmentId: 'segment-1'
  };

  const createTranscriptSegment = (overrides = {}) => ({
    ...canonicalIdentity,
    text: 'hello world',
    startMs: 100,
    endMs: 200,
    revision: 1,
    sourceLanguage: 'en',
    targetLanguage: 'es',
    provider: 'provider-a',
    ...overrides
  });

  const createTranslatedCaptionSegment = (overrides = {}) => ({
    ...canonicalIdentity,
    text: 'hello world',
    translatedText: 'hola mundo',
    startMs: 100,
    endMs: 200,
    revision: 1,
    sourceLanguage: 'en',
    targetLanguage: 'es',
    provider: 'provider-a',
    ...overrides
  });

  it('initializes a page session with shell state', () => {
    const session = new PageLiveCaptionSession({ tabId: 7 });

    expect(session.tabId).toBe(7);
    expect(session.lifecycleState).toBe(LIVE_CAPTION_SESSION_STATES.IDLE);
    expect(session.activeVideoSession).toBe(null);
    expect(session.getStatus().hasActiveVideoSession).toBe(false);
  });

  it('attaches, replaces, and clears a video session', () => {
    const pageSession = new PageLiveCaptionSession({ tabId: 7 });
    const firstVideoSession = new VideoCaptionSession({ tabId: 7, videoFingerprint: 'video-a' });
    const secondVideoSession = new VideoCaptionSession({ tabId: 7, videoFingerprint: 'video-b' });

    pageSession.attachVideoSession(firstVideoSession);
    expect(pageSession.activeVideoSession).toBe(firstVideoSession);
    expect(pageSession.activeVideoSessionId).toBe(firstVideoSession.sessionId);
    expect(pageSession.activeVideoFingerprint).toBe('video-a');
    expect(pageSession.getSnapshot().activeVideoFingerprint).toBe('video-a');

    pageSession.replaceVideoSession(secondVideoSession, LIVE_CAPTION_CLEANUP_REASONS.VIDEO_CHANGED);
    expect(pageSession.activeVideoSession).toBe(secondVideoSession);
    expect(pageSession.activeVideoFingerprint).toBe('video-b');

    pageSession.clearVideoSession();
    expect(pageSession.activeVideoSession).toBe(null);
    expect(pageSession.activeVideoSessionId).toBe(null);
    expect(pageSession.activeVideoFingerprint).toBe(null);
  });

  it('models lifecycle transitions for page and video sessions', () => {
    const pageSession = new PageLiveCaptionSession({ tabId: 7 });
    const videoSession = new VideoCaptionSession({ tabId: 7, videoFingerprint: 'video-a' });

    pageSession.attachVideoSession(videoSession);

    expect(pageSession.start()).toBe(LIVE_CAPTION_SESSION_STATES.ACTIVE);
    expect(videoSession.lifecycleState).toBe(LIVE_CAPTION_SESSION_STATES.ACTIVE);

    expect(videoSession.markError(new Error('video error'))).toMatchObject({
      message: 'video error',
      reason: LIVE_CAPTION_CLEANUP_REASONS.ERROR
    });
    expect(videoSession.lifecycleState).toBe(LIVE_CAPTION_SESSION_STATES.ERROR);

    expect(pageSession.stop()).toBe(LIVE_CAPTION_SESSION_STATES.IDLE);
    expect(videoSession.lifecycleState).toBe(LIVE_CAPTION_SESSION_STATES.IDLE);
  });

  it('accumulates transcript, caption, chunk, and seek state on video sessions', () => {
    const videoSession = new VideoCaptionSession({ tabId: 7, videoFingerprint: 'video-a' });

    const chunk = videoSession.recordChunk({
      text: 'chunk',
      startMs: 100,
      endMs: 500
    });
    const transcript = videoSession.addTranscriptSegment({
      text: 'hello world',
      startMs: 100,
      endMs: 500,
      sourceLanguage: 'en'
    });
    const caption = videoSession.addTranslatedCaptionSegment({
      text: 'hola mundo',
      startMs: 100,
      endMs: 500,
      sourceLanguage: 'en',
      targetLanguage: 'es',
      provider: 'openai'
    });
    const seekState = videoSession.setSeekState({
      seekToMs: 1200,
      direction: 'forward',
      source: 'user'
    });

    expect(chunk.segmentId).toBeTypeOf('string');
    expect(videoSession.chunkState.chunks).toHaveLength(1);
    expect(videoSession.transcriptSegments).toHaveLength(1);
    expect(videoSession.translatedCaptionSegments).toHaveLength(1);
    expect(videoSession.getStatus().chunkCount).toBe(1);
    expect(transcript.text).toBe('hello world');
    expect(caption.targetLanguage).toBe('es');
    expect(seekState.seekToMs).toBe(1200);
  });

  it('stores valid timeline anchors and preserves insertion order', () => {
    const videoSession = new VideoCaptionSession({ tabId: 7, videoFingerprint: 'video-a' });

    const firstAnchor = videoSession.addTimelineAnchor({
      reason: 'start',
      sourceMs: 0,
      mediaMs: 5000,
      playbackRate: 1,
      sessionId: 'session-a',
      videoFingerprint: 'video-a',
      sourceTimelineType: 'provider'
    });
    const secondAnchor = videoSession.addTimelineAnchor({
      reason: 'resume',
      sourceMs: 1000,
      mediaMs: 6000,
      playbackRate: 1,
      sessionId: 'session-a',
      videoFingerprint: 'video-a',
      sourceTimelineType: 'provider'
    });

    expect(firstAnchor.anchorId).toContain('live-caption:timeline-anchor');
    expect(secondAnchor.anchorId).toContain('live-caption:timeline-anchor');
    expect(videoSession.getTimelineAnchors()).toHaveLength(2);
    expect(videoSession.getTimelineAnchors()[0]).toMatchObject({
      reason: 'start',
      sourceMs: 0,
      mediaMs: 5000
    });
    expect(videoSession.getTimelineAnchors()[1]).toMatchObject({
      reason: 'resume',
      sourceMs: 1000,
      mediaMs: 6000
    });
  });

  it('ignores invalid timeline anchors and can clear anchors', () => {
    const videoSession = new VideoCaptionSession({ tabId: 7, videoFingerprint: 'video-a' });

    expect(videoSession.addTimelineAnchor({
      anchorId: ' ',
      reason: 'start',
      sourceMs: 0,
      mediaMs: 5000,
      playbackRate: 1
    })).toBe(null);
    expect(videoSession.getTimelineAnchors()).toHaveLength(0);

    videoSession.addTimelineAnchor({
      reason: 'start',
      sourceMs: 0,
      mediaMs: 5000,
      playbackRate: 1
    });
    expect(videoSession.getTimelineAnchors()).toHaveLength(1);

    const cleared = videoSession.clearTimelineAnchors();
    expect(cleared).toEqual([]);
    expect(videoSession.getTimelineAnchors()).toHaveLength(0);
  });

  it('keeps append-only transcript and translated caption behavior unchanged', () => {
    const videoSession = new VideoCaptionSession({
      tabId: canonicalIdentity.tabId,
      videoFingerprint: canonicalIdentity.videoFingerprint,
      sessionId: canonicalIdentity.sessionId
    });

    const firstTranscript = videoSession.addTranscriptSegment(createTranscriptSegment());
    const secondTranscript = videoSession.addTranscriptSegment(createTranscriptSegment({
      text: 'hello again',
      revision: 2
    }));
    const firstCaption = videoSession.addTranslatedCaptionSegment(createTranslatedCaptionSegment());
    const secondCaption = videoSession.addTranslatedCaptionSegment(createTranslatedCaptionSegment({
      text: 'hello again',
      translatedText: 'hola de nuevo',
      revision: 2
    }));

    expect(videoSession.transcriptSegments).toHaveLength(2);
    expect(videoSession.translatedCaptionSegments).toHaveLength(2);
    expect(firstTranscript.segmentId).toBe(canonicalIdentity.segmentId);
    expect(secondTranscript.segmentId).toBe(canonicalIdentity.segmentId);
    expect(firstCaption.segmentId).toBe(canonicalIdentity.segmentId);
    expect(secondCaption.segmentId).toBe(canonicalIdentity.segmentId);
  });

  it('rebuilds canonical indexes from hydrated transcript and translated caption segments', () => {
    const videoSession = new VideoCaptionSession({
      tabId: canonicalIdentity.tabId,
      videoFingerprint: canonicalIdentity.videoFingerprint,
      sessionId: canonicalIdentity.sessionId
    });

    videoSession.addTranscriptSegment(createTranscriptSegment({
      text: 'old transcript',
      revision: 1
    }));
    videoSession.addTranslatedCaptionSegment(createTranslatedCaptionSegment({
      translatedText: 'old caption',
      revision: 1
    }));

    const rebuildResult = videoSession.rebuildCanonicalIndexes();

    expect(rebuildResult).toMatchObject({
      transcriptCount: 1,
      translatedCaptionCount: 1,
      indexedTranscriptCount: 1,
      indexedTranslatedCaptionCount: 1
    });
    expect(videoSession.getTranscriptSegmentByIdentity(canonicalIdentity)).toMatchObject({
      text: 'old transcript',
      revision: 1
    });
    expect(videoSession.getTranslatedCaptionSegmentByIdentity(canonicalIdentity)).toMatchObject({
      translatedText: 'old caption',
      revision: 1
    });
  });

  it('prefers the highest revision when rebuilding duplicate canonical identities', () => {
    const videoSession = new VideoCaptionSession({
      tabId: canonicalIdentity.tabId,
      videoFingerprint: canonicalIdentity.videoFingerprint,
      sessionId: canonicalIdentity.sessionId
    });

    videoSession.addTranscriptSegment(createTranscriptSegment({
      text: 'older duplicate',
      revision: 1
    }));
    videoSession.addTranscriptSegment(createTranscriptSegment({
      text: 'newer duplicate',
      revision: 3
    }));
    videoSession.addTranslatedCaptionSegment(createTranslatedCaptionSegment({
      translatedText: 'older caption duplicate',
      revision: 1
    }));
    videoSession.addTranslatedCaptionSegment(createTranslatedCaptionSegment({
      translatedText: 'newer caption duplicate',
      revision: 3
    }));

    const rebuildResult = videoSession.rebuildCanonicalIndexes();

    expect(rebuildResult).toMatchObject({
      indexedTranscriptCount: 1,
      indexedTranslatedCaptionCount: 1
    });
    expect(videoSession.getTranscriptSegmentByIdentity(canonicalIdentity)).toMatchObject({
      text: 'newer duplicate',
      revision: 3
    });
    expect(videoSession.getTranslatedCaptionSegmentByIdentity(canonicalIdentity)).toMatchObject({
      translatedText: 'newer caption duplicate',
      revision: 3
    });
  });

  it('replaces hydrated transcript and translated caption records instead of appending duplicates', () => {
    const videoSession = new VideoCaptionSession({
      tabId: canonicalIdentity.tabId,
      videoFingerprint: canonicalIdentity.videoFingerprint,
      sessionId: canonicalIdentity.sessionId
    });

    videoSession.addTranscriptSegment(createTranscriptSegment({
      text: 'hydrated transcript',
      revision: 1
    }));
    videoSession.addTranslatedCaptionSegment(createTranslatedCaptionSegment({
      translatedText: 'hydrated caption',
      revision: 1
    }));
    videoSession.rebuildCanonicalIndexes();

    const transcriptResult = videoSession.upsertTranscriptSegment(createTranscriptSegment({
      text: 'hydrated transcript updated',
      revision: 2
    }));
    const translatedResult = videoSession.upsertTranslatedCaptionSegment(createTranslatedCaptionSegment({
      translatedText: 'hydrated caption updated',
      revision: 2
    }));

    expect(transcriptResult).toMatchObject({ status: 'replaced', replaced: true, ignored: false });
    expect(translatedResult).toMatchObject({ status: 'replaced', replaced: true, ignored: false });
    expect(videoSession.transcriptSegments).toHaveLength(1);
    expect(videoSession.translatedCaptionSegments).toHaveLength(1);
    expect(videoSession.getTranscriptSegmentByIdentity(canonicalIdentity)).toMatchObject({
      text: 'hydrated transcript updated',
      revision: 2
    });
    expect(videoSession.getTranslatedCaptionSegmentByIdentity(canonicalIdentity)).toMatchObject({
      translatedText: 'hydrated caption updated',
      revision: 2
    });
  });

  it('upserts transcript segments by canonical identity and preserves ordering', () => {
    const videoSession = new VideoCaptionSession({
      tabId: canonicalIdentity.tabId,
      videoFingerprint: canonicalIdentity.videoFingerprint,
      sessionId: canonicalIdentity.sessionId
    });
    const otherIdentity = {
      sessionId: 'session-a',
      tabId: 7,
      videoFingerprint: 'video-a',
      segmentId: 'segment-2'
    };

    const firstResult = videoSession.upsertTranscriptSegment(createTranscriptSegment());
    const secondResult = videoSession.upsertTranscriptSegment({
      ...otherIdentity,
      text: 'second segment',
      startMs: 300,
      endMs: 400,
      revision: 1,
      sourceLanguage: 'en'
    });
    const replacementResult = videoSession.upsertTranscriptSegment(createTranscriptSegment({
      text: 'hello updated',
      revision: 2
    }));

    expect(firstResult).toMatchObject({ status: 'inserted', ignored: false, replaced: false });
    expect(secondResult).toMatchObject({ status: 'inserted', ignored: false, replaced: false });
    expect(replacementResult).toMatchObject({ status: 'replaced', ignored: false, replaced: true });
    expect(videoSession.transcriptSegments).toHaveLength(2);
    expect(videoSession.transcriptSegments[0].text).toBe('hello updated');
    expect(videoSession.transcriptSegments[1].segmentId).toBe(otherIdentity.segmentId);
    expect(videoSession.getTranscriptSegmentByIdentity(canonicalIdentity)).toMatchObject({
      text: 'hello updated',
      revision: 2
    });
  });

  it('ignores stale or equal transcript revisions for canonical identity', () => {
    const videoSession = new VideoCaptionSession({
      tabId: canonicalIdentity.tabId,
      videoFingerprint: canonicalIdentity.videoFingerprint,
      sessionId: canonicalIdentity.sessionId
    });

    const insertedResult = videoSession.upsertTranscriptSegment(createTranscriptSegment({
      text: 'canonical one',
      revision: 2
    }));
    const equalResult = videoSession.upsertTranscriptSegment(createTranscriptSegment({
      text: 'canonical equal',
      revision: 2
    }));
    const staleResult = videoSession.upsertTranscriptSegment(createTranscriptSegment({
      text: 'canonical stale',
      revision: 1
    }));

    expect(insertedResult).toMatchObject({ status: 'inserted', ignored: false });
    expect(equalResult).toMatchObject({ status: 'ignored', ignored: true, reason: 'stale_revision' });
    expect(staleResult).toMatchObject({ status: 'ignored', ignored: true, reason: 'stale_revision' });
    expect(videoSession.transcriptSegments).toHaveLength(1);
    expect(videoSession.transcriptSegments[0].text).toBe('canonical one');
    expect(videoSession.getTranscriptSegmentByIdentity(canonicalIdentity)).toMatchObject({
      text: 'canonical one',
      revision: 2
    });
  });

  it('safely ignores transcript upserts that lack canonical identity', () => {
    const videoSession = new VideoCaptionSession({
      tabId: canonicalIdentity.tabId,
      videoFingerprint: canonicalIdentity.videoFingerprint,
      sessionId: canonicalIdentity.sessionId
    });

    const result = videoSession.upsertTranscriptSegment({
      text: 'missing identity',
      startMs: 100,
      endMs: 200,
      revision: 1
    });

    expect(result).toMatchObject({
      status: 'ignored',
      ignored: true,
      reason: 'missing_canonical_identity'
    });
    expect(videoSession.transcriptSegments).toHaveLength(0);
    expect(videoSession.getTranscriptSegmentByIdentity({
      ...canonicalIdentity,
      segmentId: 'missing'
    })).toBe(null);
  });

  it('replaces transcript segments by canonical identity without creating duplicates', () => {
    const videoSession = new VideoCaptionSession({
      tabId: canonicalIdentity.tabId,
      videoFingerprint: canonicalIdentity.videoFingerprint,
      sessionId: canonicalIdentity.sessionId
    });

    videoSession.upsertTranscriptSegment(createTranscriptSegment({
      text: 'canonical one',
      revision: 1
    }));

    const result = videoSession.replaceTranscriptSegment(canonicalIdentity, createTranscriptSegment({
      text: 'canonical replaced',
      revision: 1
    }));

    expect(result).toMatchObject({ status: 'replaced', ignored: false, replaced: true });
    expect(videoSession.transcriptSegments).toHaveLength(1);
    expect(videoSession.transcriptSegments[0].text).toBe('canonical replaced');
    expect(videoSession.getTranscriptSegmentByIdentity(canonicalIdentity)).toMatchObject({
      text: 'canonical replaced'
    });
  });

  it('upserts translated caption segments by canonical identity with the same behavior', () => {
    const videoSession = new VideoCaptionSession({
      tabId: canonicalIdentity.tabId,
      videoFingerprint: canonicalIdentity.videoFingerprint,
      sessionId: canonicalIdentity.sessionId
    });
    const otherIdentity = {
      sessionId: 'session-a',
      tabId: 7,
      videoFingerprint: 'video-a',
      segmentId: 'segment-2'
    };

    const firstResult = videoSession.upsertTranslatedCaptionSegment(createTranslatedCaptionSegment({
      translatedText: 'hola mundo',
      revision: 1
    }));
    const secondResult = videoSession.upsertTranslatedCaptionSegment({
      ...otherIdentity,
      text: 'second segment',
      translatedText: 'segundo segmento',
      startMs: 300,
      endMs: 400,
      revision: 1,
      sourceLanguage: 'en',
      targetLanguage: 'es',
      provider: 'provider-a'
    });
    const replacementResult = videoSession.upsertTranslatedCaptionSegment(createTranslatedCaptionSegment({
      translatedText: 'hola actualizado',
      revision: 2
    }));

    expect(firstResult).toMatchObject({ status: 'inserted', ignored: false, replaced: false });
    expect(secondResult).toMatchObject({ status: 'inserted', ignored: false, replaced: false });
    expect(replacementResult).toMatchObject({ status: 'replaced', ignored: false, replaced: true });
    expect(videoSession.translatedCaptionSegments).toHaveLength(2);
    expect(videoSession.translatedCaptionSegments[0].translatedText).toBe('hola actualizado');
    expect(videoSession.translatedCaptionSegments[1].segmentId).toBe(otherIdentity.segmentId);
    expect(videoSession.getTranslatedCaptionSegmentByIdentity(canonicalIdentity)).toMatchObject({
      translatedText: 'hola actualizado',
      revision: 2
    });
  });

  it('ignores stale or equal translated caption revisions for canonical identity', () => {
    const videoSession = new VideoCaptionSession({
      tabId: canonicalIdentity.tabId,
      videoFingerprint: canonicalIdentity.videoFingerprint,
      sessionId: canonicalIdentity.sessionId
    });

    videoSession.upsertTranslatedCaptionSegment(createTranslatedCaptionSegment({
      translatedText: 'hola uno',
      revision: 2
    }));

    const equalResult = videoSession.upsertTranslatedCaptionSegment(createTranslatedCaptionSegment({
      translatedText: 'hola igual',
      revision: 2
    }));
    const staleResult = videoSession.upsertTranslatedCaptionSegment(createTranslatedCaptionSegment({
      translatedText: 'hola viejo',
      revision: 1
    }));

    expect(equalResult).toMatchObject({ status: 'ignored', ignored: true, reason: 'stale_revision' });
    expect(staleResult).toMatchObject({ status: 'ignored', ignored: true, reason: 'stale_revision' });
    expect(videoSession.translatedCaptionSegments).toHaveLength(1);
    expect(videoSession.getTranslatedCaptionSegmentByIdentity(canonicalIdentity)).toMatchObject({
      translatedText: 'hola uno',
      revision: 2
    });
  });

  it('safely ignores translated caption upserts that lack canonical identity', () => {
    const videoSession = new VideoCaptionSession({
      tabId: canonicalIdentity.tabId,
      videoFingerprint: canonicalIdentity.videoFingerprint,
      sessionId: canonicalIdentity.sessionId
    });

    const result = videoSession.upsertTranslatedCaptionSegment({
      text: 'missing identity',
      translatedText: 'identidad faltante',
      startMs: 100,
      endMs: 200,
      revision: 1
    });

    expect(result).toMatchObject({
      status: 'ignored',
      ignored: true,
      reason: 'missing_canonical_identity'
    });
    expect(videoSession.translatedCaptionSegments).toHaveLength(0);
    expect(videoSession.getTranslatedCaptionSegmentByIdentity({
      ...canonicalIdentity,
      segmentId: 'missing'
    })).toBe(null);
  });

  it('replaces translated caption segments by canonical identity without creating duplicates', () => {
    const videoSession = new VideoCaptionSession({
      tabId: canonicalIdentity.tabId,
      videoFingerprint: canonicalIdentity.videoFingerprint,
      sessionId: canonicalIdentity.sessionId
    });

    videoSession.upsertTranslatedCaptionSegment(createTranslatedCaptionSegment({
      translatedText: 'hola uno',
      revision: 1
    }));

    const result = videoSession.replaceTranslatedCaptionSegment(canonicalIdentity, createTranslatedCaptionSegment({
      translatedText: 'hola reemplazado',
      revision: 1
    }));

    expect(result).toMatchObject({ status: 'replaced', ignored: false, replaced: true });
    expect(videoSession.translatedCaptionSegments).toHaveLength(1);
    expect(videoSession.translatedCaptionSegments[0].translatedText).toBe('hola reemplazado');
    expect(videoSession.getTranslatedCaptionSegmentByIdentity(canonicalIdentity)).toMatchObject({
      translatedText: 'hola reemplazado'
    });
  });

  it('computes mediaStartMs and mediaEndMs using mediaAnchorMs', () => {
    const videoSession = new VideoCaptionSession({
      tabId: 7,
      videoFingerprint: 'video-a',
      mediaAnchorMs: 5000
    });

    expect(videoSession.mediaAnchorMs).toBe(5000);

    const segment = videoSession.addTranscriptSegment({
      sessionId: 'session-a',
      videoFingerprint: 'video-a',
      originalText: 'Test',
      startMs: 100,
      endMs: 200
    });

    expect(segment.mediaStartMs).toBe(5100);
    expect(segment.mediaEndMs).toBe(5200);

    const transSegment = videoSession.addTranslatedCaptionSegment({
      sessionId: 'session-a',
      videoFingerprint: 'video-a',
      translatedText: 'Test Translated',
      originalText: 'Test',
      startMs: 300,
      endMs: 400
    });

    expect(transSegment.mediaStartMs).toBe(5300);
    expect(transSegment.mediaEndMs).toBe(5400);
  });

  it('falls back safely when mediaAnchorMs is missing or not a finite number', () => {
    const videoSession = new VideoCaptionSession({
      tabId: 7,
      videoFingerprint: 'video-a',
      mediaAnchorMs: null
    });

    const segment = videoSession.addTranscriptSegment({
      sessionId: 'session-a',
      videoFingerprint: 'video-a',
      originalText: 'Test',
      startMs: 100,
      endMs: 200
    });

    expect(segment.mediaStartMs).toBeNull();
    expect(segment.mediaEndMs).toBeNull();
  });

  it('normalizes numeric strings and handles invalid non-finite values safely', () => {
    const videoSession = new VideoCaptionSession({
      tabId: 7,
      videoFingerprint: 'video-a',
      mediaAnchorMs: '5000'
    });

    const segment = videoSession.addTranscriptSegment({
      sessionId: 'session-a',
      videoFingerprint: 'video-a',
      originalText: 'Test',
      startMs: '100',
      endMs: '200'
    });

    expect(segment.startMs).toBe(100);
    expect(segment.endMs).toBe(200);
    expect(segment.mediaStartMs).toBe(5100);
    expect(segment.mediaEndMs).toBe(5200);

    const videoSessionInvalid = new VideoCaptionSession({
      tabId: 7,
      videoFingerprint: 'video-a',
      mediaAnchorMs: 'invalid-anchor'
    });

    const segmentInvalid = videoSessionInvalid.addTranscriptSegment({
      sessionId: 'session-a',
      videoFingerprint: 'video-a',
      originalText: 'Test',
      startMs: 'invalid-start',
      endMs: 200
    });

    expect(segmentInvalid.startMs).toBeNull();
    expect(segmentInvalid.endMs).toBe(200);
    expect(segmentInvalid.mediaStartMs).toBeNull();
    expect(segmentInvalid.mediaEndMs).toBeNull();
  });

  it('preserves optional provider identity fields on segment normalization', () => {
    const videoSession = new VideoCaptionSession({
      tabId: 7,
      videoFingerprint: 'video-a'
    });

    const segment = videoSession.addTranscriptSegment({
      sessionId: 'session-a',
      videoFingerprint: 'video-a',
      originalText: 'Test',
      startMs: 100,
      endMs: 200,
      sourceTimelineType: 'capture',
      sourceStartMs: 80,
      sourceEndMs: 220,
      sourceClockId: 'capture-clock-1',
      sourceSequence: 11,
      sourceResetId: 'reset-1',
      providerUtteranceId: 'utt-123',
      providerSequence: 12,
      providerRevision: 3,
      providerStreamId: 'stream-xyz',
      providerChannel: 2
    });

    expect(segment.providerUtteranceId).toBe('utt-123');
    expect(segment.providerSequence).toBe(12);
    expect(segment.providerRevision).toBe(3);
    expect(segment.providerStreamId).toBe('stream-xyz');
    expect(segment.providerChannel).toBe(2);
    expect(segment.sourceTimelineType).toBe('capture');
    expect(segment.sourceStartMs).toBe(80);
    expect(segment.sourceEndMs).toBe(220);
    expect(segment.sourceClockId).toBe('capture-clock-1');
    expect(segment.sourceSequence).toBe(11);
    expect(segment.sourceResetId).toBe('reset-1');

    const transSegment = videoSession.addTranslatedCaptionSegment({
      sessionId: 'session-a',
      videoFingerprint: 'video-a',
      translatedText: 'Translated',
      startMs: 100,
      endMs: 200,
      sourceTimelineType: 'provider',
      sourceStartMs: 100,
      sourceEndMs: 200,
      sourceClockId: 'provider-session',
      sourceSequence: 99,
      sourceResetId: 'reset-2',
      providerUtteranceId: 'utt-123',
      providerSequence: 12,
      providerRevision: 3,
      providerStreamId: 'stream-xyz',
      providerChannel: 2
    });

    expect(transSegment.providerUtteranceId).toBe('utt-123');
    expect(transSegment.providerSequence).toBe(12);
    expect(transSegment.providerRevision).toBe(3);
    expect(transSegment.providerStreamId).toBe('stream-xyz');
    expect(transSegment.providerChannel).toBe(2);
    expect(transSegment.sourceTimelineType).toBe('provider');
    expect(transSegment.sourceStartMs).toBe(100);
    expect(transSegment.sourceEndMs).toBe(200);
    expect(transSegment.sourceClockId).toBe('provider-session');
    expect(transSegment.sourceSequence).toBe(99);
    expect(transSegment.sourceResetId).toBe('reset-2');
  });

  it('manages one page session per tab and cleans up fail closed', () => {
    const manager = new LiveCaptionSessionManager();

    const first = manager.createSession(7);
    const duplicate = manager.getOrCreateSession(7);
    manager.createSession(8);

    expect(duplicate).toBe(first);
    expect(manager.getSession(7)).toBe(first);
    expect(manager.getSessionStatus(7).tabId).toBe(7);
    expect(manager.getSessionSnapshot(7).tabId).toBe(7);
    expect(manager.getSnapshot(7).tabId).toBe(7);
    expect(manager.getAllSessionSnapshots()).toHaveLength(2);

    first.cleanup = () => {
      throw new Error('cleanup failed');
    };

    const snapshot = manager.failClosedCleanup(7, LIVE_CAPTION_CLEANUP_REASONS.MANUAL);
    const cleanupMetadata = manager.getSessionCleanupMetadata(7);

    expect(snapshot.tabId).toBe(7);
    expect(manager.getSession(7)).toBe(null);
    expect(manager.hasSession(8)).toBe(true);
    expect(manager.removeSession(8)).toMatchObject({ tabId: 8 });
    expect(cleanupMetadata).toMatchObject({
      tabId: 7,
      sessionId: first.sessionId,
      status: LIVE_CAPTION_CLEANUP_RESULT_STATUSES.FAIL_CLOSED,
      reason: LIVE_CAPTION_CLEANUP_REASONS.MANUAL
    });
  });
});
