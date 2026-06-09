import { describe, it, expect } from 'vitest';
import { PageLiveCaptionSession } from './PageLiveCaptionSession.js';
import { VideoCaptionSession } from './VideoCaptionSession.js';
import { LiveCaptionSessionManager } from './LiveCaptionSessionManager.js';
import { LIVE_CAPTION_SESSION_STATES } from '../constants/liveCaptionSessionStates.js';
import { LIVE_CAPTION_CLEANUP_REASONS } from './contracts.js';
import { LIVE_CAPTION_CLEANUP_RESULT_STATUSES } from './LiveCaptionCleanupCoordinator.js';

describe('live-caption session model', () => {
  it('initializes a page session with shell state', () => {
    const session = new PageLiveCaptionSession({ tabId: 7 });

    expect(session.tabId).toBe(7);
    expect(session.lifecycleState).toBe(LIVE_CAPTION_SESSION_STATES.IDLE);
    expect(session.consentAccepted).toBe(false);
    expect(session.activeVideoSession).toBe(null);
    expect(session.getStatus().hasActiveVideoSession).toBe(false);
  });

  it('transitions consent state and attaches, replaces, and clears a video session', () => {
    const pageSession = new PageLiveCaptionSession({ tabId: 7 });
    const firstVideoSession = new VideoCaptionSession({ tabId: 7, videoFingerprint: 'video-a' });
    const secondVideoSession = new VideoCaptionSession({ tabId: 7, videoFingerprint: 'video-b' });

    expect(pageSession.acceptConsent()).toBe(true);
    expect(pageSession.consentAccepted).toBe(true);
    expect(pageSession.revokeConsent()).toBe(false);
    expect(pageSession.consentAccepted).toBe(false);

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
    const pageSession = new PageLiveCaptionSession({ tabId: 7, consentAccepted: true });
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
