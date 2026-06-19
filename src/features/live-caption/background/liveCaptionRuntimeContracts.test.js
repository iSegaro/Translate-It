import { describe, it, expect } from 'vitest';
import {
  LIVE_CAPTION_RUNTIME_ACTIONS,
  LIVE_CAPTION_RUNTIME_RESPONSE_STATUSES,
  LIVE_CAPTION_RUNTIME_ERROR_CODES,
  LIVE_CAPTION_RUNTIME_SHELL_STATES,
  normalizeLiveCaptionRuntimeRequest,
  createLiveCaptionRuntimeStartRequest,
  createLiveCaptionRuntimeStopRequest,
  createLiveCaptionRuntimeStatusRequest,
  createLiveCaptionRuntimePauseRequest,
  createLiveCaptionRuntimeResumeRequest,
  createLiveCaptionRuntimeVideoChangedRequest,
  createLiveCaptionRuntimeSuccessResponse,
  createLiveCaptionRuntimeShellResponse,
  createLiveCaptionRuntimeNotImplementedResponse,
  createLiveCaptionRuntimeUnavailableResponse,
  createLiveCaptionRuntimeFailClosedResponse,
  normalizeLiveCaptionRuntimeResponse
} from './liveCaptionRuntimeContracts.js';

describe('live-caption runtime contracts', () => {
  it('creates and validates runtime requests', () => {
    const start = createLiveCaptionRuntimeStartRequest({
      tabId: 7,
      sessionId: 'session-1',
      videoFingerprint: 'video-a'
    });
    const stop = createLiveCaptionRuntimeStopRequest({
      tabId: 7,
      sessionId: 'session-1',
      videoFingerprint: 'video-a'
    });
    const status = createLiveCaptionRuntimeStatusRequest({
      tabId: 7,
      sessionId: 'session-1',
      videoFingerprint: 'video-a'
    });
    const pause = createLiveCaptionRuntimePauseRequest({
      tabId: 7,
      sessionId: 'session-1',
      videoFingerprint: 'video-a'
    });
    const resume = createLiveCaptionRuntimeResumeRequest({
      tabId: 7,
      sessionId: 'session-1',
      videoFingerprint: 'video-a'
    });
    const videoChanged = createLiveCaptionRuntimeVideoChangedRequest({
      tabId: 7,
      sessionId: 'session-1',
      videoFingerprint: 'video-a',
      eventType: 'playing',
      mediaMs: 1200,
      playbackRate: 1.25,
      wallClockMs: 42
    });

    expect(start.action).toBe(LIVE_CAPTION_RUNTIME_ACTIONS.START);
    expect(stop.action).toBe(LIVE_CAPTION_RUNTIME_ACTIONS.STOP);
    expect(status.action).toBe(LIVE_CAPTION_RUNTIME_ACTIONS.STATUS);
    expect(pause.action).toBe(LIVE_CAPTION_RUNTIME_ACTIONS.PAUSE);
    expect(resume.action).toBe(LIVE_CAPTION_RUNTIME_ACTIONS.RESUME);
    expect(videoChanged.action).toBe(LIVE_CAPTION_RUNTIME_ACTIONS.VIDEO_CHANGED);

    expect(() => normalizeLiveCaptionRuntimeRequest({ action: LIVE_CAPTION_RUNTIME_ACTIONS.START, data: {} }))
      .toThrow('requires tabId');
    expect(() => normalizeLiveCaptionRuntimeRequest({ action: 'UNKNOWN_ACTION', data: { tabId: 7 } }))
      .toThrow('Unknown live-caption runtime action');

    const normalizedVideoChanged = normalizeLiveCaptionRuntimeRequest(videoChanged, {
      senderTabId: 7
    });

    expect(normalizedVideoChanged.data).toMatchObject({
      eventType: 'playing',
      mediaMs: 1200,
      playbackRate: 1.25,
      wallClockMs: 42
    });
  });

  it('normalizes success and not-implemented runtime responses', () => {
    const response = createLiveCaptionRuntimeSuccessResponse({
      action: LIVE_CAPTION_RUNTIME_ACTIONS.STATUS,
      status: LIVE_CAPTION_RUNTIME_RESPONSE_STATUSES.OK,
      runtimeState: 'running',
      sessionId: 'session-1',
      tabId: 7,
      videoFingerprint: 'video-a'
    });
    const shell = createLiveCaptionRuntimeNotImplementedResponse(LIVE_CAPTION_RUNTIME_ACTIONS.START, {
      sessionId: 'session-1',
      tabId: 7,
      videoFingerprint: 'video-a'
    });
    const normalized = normalizeLiveCaptionRuntimeResponse(shell, {
      action: LIVE_CAPTION_RUNTIME_ACTIONS.START,
      sessionId: 'session-1',
      tabId: 7,
      videoFingerprint: 'video-a'
    });

    expect(response.success).toBe(true);
    expect(response.status).toBe(LIVE_CAPTION_RUNTIME_RESPONSE_STATUSES.OK);
    expect(shell.status).toBe(LIVE_CAPTION_RUNTIME_RESPONSE_STATUSES.START_NOT_IMPLEMENTED);
    expect(normalized.success).toBe(true);
    expect(normalized.status).toBe(LIVE_CAPTION_RUNTIME_RESPONSE_STATUSES.START_NOT_IMPLEMENTED);
    expect(normalized.offscreenStatus).toBe(LIVE_CAPTION_RUNTIME_RESPONSE_STATUSES.OFFSCREEN_NOT_READY);
    expect(normalized.captureStatus).toBe(LIVE_CAPTION_RUNTIME_RESPONSE_STATUSES.CAPTURE_NOT_AVAILABLE);
  });

  it('normalizes shell responses with shell state status', () => {
    const shell = createLiveCaptionRuntimeShellResponse(LIVE_CAPTION_RUNTIME_ACTIONS.START, {
      sessionId: 'session-1',
      tabId: 7,
      videoFingerprint: 'video-a',
      status: LIVE_CAPTION_RUNTIME_SHELL_STATES.RUNNING_SHELL
    });

    expect(shell.success).toBe(true);
    expect(shell.status).toBe(LIVE_CAPTION_RUNTIME_SHELL_STATES.RUNNING_SHELL);
    expect(shell.runtimeState).toBe('running');
    expect(shell.offscreenStatus).toBe(LIVE_CAPTION_RUNTIME_RESPONSE_STATUSES.OK);
  });

  it('creates fail-closed and unavailable responses', () => {
    const unavailable = createLiveCaptionRuntimeUnavailableResponse(LIVE_CAPTION_RUNTIME_ACTIONS.START, {
      sessionId: 'session-1',
      tabId: 7,
      videoFingerprint: 'video-a'
    });
    const failClosed = createLiveCaptionRuntimeFailClosedResponse(
      LIVE_CAPTION_RUNTIME_ACTIONS.START,
      new Error('missing payload'),
      {
        sessionId: 'session-1',
        tabId: 7,
        videoFingerprint: 'video-a'
      }
    );
    const normalized = normalizeLiveCaptionRuntimeResponse(null, {
      action: LIVE_CAPTION_RUNTIME_ACTIONS.START,
      sessionId: 'session-1',
      tabId: 7,
      videoFingerprint: 'video-a'
    });

    expect(unavailable.success).toBe(false);
    expect(unavailable.status).toBe(LIVE_CAPTION_RUNTIME_RESPONSE_STATUSES.OFFSCREEN_NOT_READY);
    expect(failClosed.success).toBe(false);
    expect(failClosed.error.message).toBe('missing payload');
    expect(normalized.success).toBe(false);
    expect(normalized.error.code).toBe(LIVE_CAPTION_RUNTIME_ERROR_CODES.CONTROLLER_UNAVAILABLE);
    expect(LIVE_CAPTION_RUNTIME_ERROR_CODES.INCONSISTENT_SESSION).toBe('inconsistent_session');
  });
});
