import { describe, it, expect, vi } from 'vitest';
import { PageLiveCaptionSession } from './PageLiveCaptionSession.js';
import { VideoCaptionSession } from './VideoCaptionSession.js';
import {
  LiveCaptionVideoHandoffCoordinator,
  LIVE_CAPTION_VIDEO_HANDOFF_ACTIONS,
  LIVE_CAPTION_VIDEO_HANDOFF_RESULT_STATUSES,
  LIVE_CAPTION_VIDEO_HANDOFF_STEP_TYPES,
  createLiveCaptionVideoHandoffPlan,
  createLiveCaptionVideoHandoffResult
} from './LiveCaptionVideoHandoffCoordinator.js';
import { LIVE_CAPTION_CLEANUP_REASONS } from './contracts.js';
import { LIVE_CAPTION_SESSION_STATES } from '../constants/liveCaptionSessionStates.js';

vi.mock('@/shared/logging/logger.js', () => ({
  getScopedLogger: vi.fn(() => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  }))
}));

describe('live-caption video handoff coordinator', () => {
  it('returns a no-op plan when the active video does not change', () => {
    const currentVideo = new VideoCaptionSession({ tabId: 9, videoFingerprint: 'video-a' });
    const nextVideo = new VideoCaptionSession({ tabId: 9, videoFingerprint: 'video-a' });

    const plan = createLiveCaptionVideoHandoffPlan({
      currentVideoSession: currentVideo,
      nextVideoSession: nextVideo
    });

    expect(plan.action).toBe(LIVE_CAPTION_VIDEO_HANDOFF_ACTIONS.NO_OP);
    expect(plan.status).toBe(LIVE_CAPTION_VIDEO_HANDOFF_RESULT_STATUSES.NO_OP);
    expect(plan.preserveCacheIdentity).toBe(true);
    expect(plan.clearOverlayState).toBe(false);
    expect(plan.cleanupCurrentVideoSession).toBe(false);
    expect(plan.createNextVideoSession).toBe(false);
    expect(plan.cleanupPlan).toBe(null);
    expect(plan.steps.map((step) => step.type)).toEqual([
      LIVE_CAPTION_VIDEO_HANDOFF_STEP_TYPES.NO_OP,
      LIVE_CAPTION_VIDEO_HANDOFF_STEP_TYPES.PRESERVE_CACHE_IDENTITY
    ]);
    expect(currentVideo.lifecycleState).toBe(LIVE_CAPTION_SESSION_STATES.IDLE);
    expect(nextVideo.lifecycleState).toBe(LIVE_CAPTION_SESSION_STATES.IDLE);
  });

  it('returns a replacement plan when the active video changes', () => {
    const pageSession = new PageLiveCaptionSession({ tabId: 9 });
    const currentVideo = new VideoCaptionSession({ tabId: 9, videoFingerprint: 'video-a' });
    const nextVideo = new VideoCaptionSession({ tabId: 9, videoFingerprint: 'video-b' });

    pageSession.attachVideoSession(currentVideo);

    const plan = createLiveCaptionVideoHandoffPlan({
      currentVideoSession: currentVideo,
      nextVideoSession: nextVideo,
      reason: LIVE_CAPTION_CLEANUP_REASONS.VIDEO_CHANGED
    });

    expect(plan.action).toBe(LIVE_CAPTION_VIDEO_HANDOFF_ACTIONS.REPLACE_ACTIVE_VIDEO);
    expect(plan.status).toBe(LIVE_CAPTION_VIDEO_HANDOFF_RESULT_STATUSES.PLANNED);
    expect(plan.preserveCacheIdentity).toBe(false);
    expect(plan.clearOverlayState).toBe(true);
    expect(plan.cleanupCurrentVideoSession).toBe(true);
    expect(plan.createNextVideoSession).toBe(true);
    expect(plan.cleanupPlan).not.toBe(null);
    expect(plan.cleanupPlan.reason).toBe(LIVE_CAPTION_CLEANUP_REASONS.VIDEO_CHANGED);
    expect(plan.cleanupPlan.notifyContent).toBe(false);
    expect(plan.steps.map((step) => step.type)).toEqual([
      LIVE_CAPTION_VIDEO_HANDOFF_STEP_TYPES.CLEANUP_OLD_VIDEO_SESSION,
      LIVE_CAPTION_VIDEO_HANDOFF_STEP_TYPES.CLEAR_OVERLAY_STATE,
      LIVE_CAPTION_VIDEO_HANDOFF_STEP_TYPES.RESET_CACHE_IDENTITY,
      LIVE_CAPTION_VIDEO_HANDOFF_STEP_TYPES.CREATE_NEW_VIDEO_SESSION
    ]);
  });

  it('returns a cleanup-only plan when the active video disappears', () => {
    const currentVideo = new VideoCaptionSession({ tabId: 9, videoFingerprint: 'video-a' });

    const plan = createLiveCaptionVideoHandoffPlan({
      currentVideoSession: currentVideo,
      nextVideoSession: null
    });

    expect(plan.action).toBe(LIVE_CAPTION_VIDEO_HANDOFF_ACTIONS.CLEANUP_OLD_VIDEO_SESSION);
    expect(plan.createNextVideoSession).toBe(false);
    expect(plan.clearOverlayState).toBe(true);
    expect(plan.cleanupPlan).not.toBe(null);
    expect(plan.cleanupPlan.notifyContent).toBe(true);
    expect(plan.steps.map((step) => step.type)).toContain(LIVE_CAPTION_VIDEO_HANDOFF_STEP_TYPES.CLEANUP_OLD_VIDEO_SESSION);
    expect(plan.steps.map((step) => step.type)).toContain(LIVE_CAPTION_VIDEO_HANDOFF_STEP_TYPES.CLEAR_OVERLAY_STATE);
    expect(plan.steps.map((step) => step.type)).toContain(LIVE_CAPTION_VIDEO_HANDOFF_STEP_TYPES.RESET_CACHE_IDENTITY);
  });

  it('returns a pure handoff result without mutating runtime state', () => {
    const currentVideo = new VideoCaptionSession({ tabId: 9, videoFingerprint: 'video-a' });
    const nextVideo = new VideoCaptionSession({ tabId: 9, videoFingerprint: 'video-b' });

    const result = createLiveCaptionVideoHandoffResult({
      currentVideoSession: currentVideo,
      nextVideoSession: nextVideo
    });

    expect(result.resultStatus).toBe(LIVE_CAPTION_VIDEO_HANDOFF_RESULT_STATUSES.PLANNED);
    expect(result.currentVideoFingerprint).toBe('video-a');
    expect(result.nextVideoFingerprint).toBe('video-b');
    expect(currentVideo.lifecycleState).toBe(LIVE_CAPTION_SESSION_STATES.IDLE);
    expect(nextVideo.lifecycleState).toBe(LIVE_CAPTION_SESSION_STATES.IDLE);
  });

  it('supports the coordinator wrapper without runtime side effects', () => {
    const coordinator = new LiveCaptionVideoHandoffCoordinator();
    const currentVideo = new VideoCaptionSession({ tabId: 9, videoFingerprint: 'video-a' });
    const nextVideo = new VideoCaptionSession({ tabId: 9, videoFingerprint: 'video-b' });

    const plan = coordinator.createHandoffPlan({
      currentVideoSession: currentVideo,
      nextVideoSession: nextVideo
    });
    const result = coordinator.createHandoffResult({
      currentVideoSession: currentVideo,
      nextVideoSession: nextVideo
    });

    expect(plan.action).toBe(LIVE_CAPTION_VIDEO_HANDOFF_ACTIONS.REPLACE_ACTIVE_VIDEO);
    expect(result.resultStatus).toBe(LIVE_CAPTION_VIDEO_HANDOFF_RESULT_STATUSES.PLANNED);
    expect(currentVideo.lifecycleState).toBe(LIVE_CAPTION_SESSION_STATES.IDLE);
    expect(nextVideo.lifecycleState).toBe(LIVE_CAPTION_SESSION_STATES.IDLE);
  });
});
