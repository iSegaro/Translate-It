import { describe, it, expect } from 'vitest';
import {
  LIVE_CAPTION_CLEANUP_REASONS,
  createLiveCaptionErrorState,
  createLiveCaptionSessionSnapshot,
  createVideoCaptionSessionSnapshot
} from './index.js';
import { PageLiveCaptionSession } from './PageLiveCaptionSession.js';
import { VideoCaptionSession } from './VideoCaptionSession.js';

describe('live-caption session contracts', () => {
  it('exposes cleanup reasons', () => {
    expect(LIVE_CAPTION_CLEANUP_REASONS.STOP).toBe('stop');
    expect(LIVE_CAPTION_CLEANUP_REASONS.VIDEO_CHANGED).toBe('video_changed');
    expect(LIVE_CAPTION_CLEANUP_REASONS.RECOVERY_FAILURE).toBe('recovery_failure');
  });

  it('normalizes error state data', () => {
    const errorState = createLiveCaptionErrorState(new Error('boom'), LIVE_CAPTION_CLEANUP_REASONS.ERROR);

    expect(errorState.message).toBe('boom');
    expect(errorState.reason).toBe(LIVE_CAPTION_CLEANUP_REASONS.ERROR);
    expect(errorState.name).toBe('Error');
  });

  it('builds page and video snapshots', () => {
    const pageSession = new PageLiveCaptionSession({ tabId: 42, consentAccepted: true });
    const videoSession = new VideoCaptionSession({ tabId: 42, videoFingerprint: 'video-42' });

    pageSession.attachVideoSession(videoSession);

    const pageSnapshot = createLiveCaptionSessionSnapshot(pageSession);
    const videoSnapshot = createVideoCaptionSessionSnapshot(videoSession);

    expect(pageSnapshot.tabId).toBe(42);
    expect(pageSnapshot.hasActiveVideoSession).toBe(true);
    expect(pageSnapshot.activeVideoSession.videoFingerprint).toBe('video-42');
    expect(videoSnapshot.tabId).toBe(42);
    expect(videoSnapshot.videoFingerprint).toBe('video-42');
  });
});
