import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LiveCaptionBackgroundController } from './LiveCaptionBackgroundController.js';
import {
  LIVE_CAPTION_RUNTIME_ACTIONS,
  LIVE_CAPTION_RUNTIME_RESPONSE_STATUSES,
  createLiveCaptionRuntimeStartRequest,
  createLiveCaptionRuntimeStopRequest,
  createLiveCaptionRuntimeStatusRequest,
  createLiveCaptionRuntimePauseRequest,
  createLiveCaptionRuntimeResumeRequest
} from './liveCaptionRuntimeContracts.js';
import { LIVE_CAPTION_RUNTIME_STATES } from '../constants/liveCaptionRuntimeStates.js';
import { LIVE_CAPTION_CLEANUP_RESULT_STATUSES } from '../core/LiveCaptionCleanupCoordinator.js';

vi.mock('@/shared/logging/logger.js', () => ({
  getScopedLogger: vi.fn(() => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  }))
}));

describe('live-caption background controller', () => {
  beforeEach(() => {
    globalThis.chrome = {
      tabCapture: {
        capture: vi.fn()
      }
    };
  });

  it('registers runtime handlers and routes shell requests without media work', async () => {
    const messageHandler = {
      registerHandler: vi.fn()
    };
    const controller = new LiveCaptionBackgroundController();

    controller.registerHandlers(messageHandler);

    expect(messageHandler.registerHandler).toHaveBeenCalledTimes(5);
    expect(messageHandler.registerHandler).toHaveBeenCalledWith(LIVE_CAPTION_RUNTIME_ACTIONS.START, expect.any(Function));
    expect(messageHandler.registerHandler).toHaveBeenCalledWith(LIVE_CAPTION_RUNTIME_ACTIONS.STOP, expect.any(Function));
    expect(messageHandler.registerHandler).toHaveBeenCalledWith(LIVE_CAPTION_RUNTIME_ACTIONS.STATUS, expect.any(Function));
    expect(messageHandler.registerHandler).toHaveBeenCalledWith(LIVE_CAPTION_RUNTIME_ACTIONS.PAUSE, expect.any(Function));
    expect(messageHandler.registerHandler).toHaveBeenCalledWith(LIVE_CAPTION_RUNTIME_ACTIONS.RESUME, expect.any(Function));

    const startResponse = await controller.handleRuntimeStart(
      createLiveCaptionRuntimeStartRequest({
        tabId: 7,
        sessionId: 'session-1',
        videoFingerprint: 'video-a'
      }),
      { tab: { id: 7 } }
    );
    const statusResponse = await controller.handleRuntimeStatus(
      createLiveCaptionRuntimeStatusRequest({
        tabId: 7,
        sessionId: 'session-1',
        videoFingerprint: 'video-a'
      }),
      { tab: { id: 7 } }
    );
    const pauseResponse = await controller.handleRuntimePause(
      createLiveCaptionRuntimePauseRequest({
        tabId: 7,
        sessionId: 'session-1',
        videoFingerprint: 'video-a'
      }),
      { tab: { id: 7 } }
    );
    const resumeResponse = await controller.handleRuntimeResume(
      createLiveCaptionRuntimeResumeRequest({
        tabId: 7,
        sessionId: 'session-1',
        videoFingerprint: 'video-a'
      }),
      { tab: { id: 7 } }
    );
    const stopResponse = await controller.handleRuntimeStop(
      createLiveCaptionRuntimeStopRequest({
        tabId: 7,
        sessionId: 'session-1',
        videoFingerprint: 'video-a'
      }),
      { tab: { id: 7 } }
    );

    expect(startResponse.success).toBe(true);
    expect(startResponse.status).toBe(LIVE_CAPTION_RUNTIME_RESPONSE_STATUSES.START_NOT_IMPLEMENTED);
    expect(startResponse.runtimeState).toBe('running');
    expect(statusResponse.status).toBe(LIVE_CAPTION_RUNTIME_RESPONSE_STATUSES.STATUS_NOT_IMPLEMENTED);
    expect(statusResponse.runtimeState).toBe('running');
    expect(pauseResponse.status).toBe(LIVE_CAPTION_RUNTIME_RESPONSE_STATUSES.PAUSE_NOT_IMPLEMENTED);
    expect(pauseResponse.runtimeState).toBe('paused');
    expect(resumeResponse.status).toBe(LIVE_CAPTION_RUNTIME_RESPONSE_STATUSES.RESUME_NOT_IMPLEMENTED);
    expect(resumeResponse.runtimeState).toBe('running');
    expect(stopResponse.status).toBe(LIVE_CAPTION_RUNTIME_RESPONSE_STATUSES.STOP_NOT_IMPLEMENTED);
    expect(stopResponse.runtimeState).toBe('idle');
    expect(controller.captureCoordinator.runtimeState).toBe('idle');
    expect(controller.sessionManager.getSession(7)).toBe(null);
    expect(globalThis.chrome.tabCapture.capture).not.toHaveBeenCalled();
  });

  it('fails closed for invalid runtime payloads', () => {
    const controller = new LiveCaptionBackgroundController();
    const response = controller.handleRuntimeStart({ action: LIVE_CAPTION_RUNTIME_ACTIONS.START, data: {} }, {});

    expect(response.success).toBe(false);
    expect(response.status).toBe(LIVE_CAPTION_RUNTIME_RESPONSE_STATUSES.FAIL_CLOSED);
    expect(response.error.code).toBeDefined();
  });

  it('propagates fail-closed cleanup metadata into the runtime stop response', async () => {
    const controller = new LiveCaptionBackgroundController();
    controller.sessionManager.cleanupByTabId = vi.fn(() => null);
    controller.sessionManager.getSessionCleanupMetadata = vi.fn(() => ({
      tabId: 7,
      sessionId: 'session-1',
      reason: 'stop',
      status: LIVE_CAPTION_CLEANUP_RESULT_STATUSES.FAIL_CLOSED,
      error: {
        code: 'LIVE_CAPTION_SESSION_MANAGER_CLEANUP_FAILED',
        message: 'cleanup failed'
      },
      snapshot: {
        sessionId: 'session-1',
        tabId: 7
      },
      updatedAt: Date.now()
    }));

    const response = await controller.handleRuntimeStop(
      createLiveCaptionRuntimeStopRequest({
        tabId: 7,
        sessionId: 'session-1',
        videoFingerprint: 'video-a'
      }),
      { tab: { id: 7 } }
    );

    expect(response.success).toBe(false);
    expect(response.status).toBe(LIVE_CAPTION_RUNTIME_RESPONSE_STATUSES.FAIL_CLOSED);
    expect(response.error.code).toBe('LIVE_CAPTION_SESSION_MANAGER_CLEANUP_FAILED');
    expect(controller.captureCoordinator.runtimeState).toBe(LIVE_CAPTION_RUNTIME_STATES.ERROR);
  });
});
