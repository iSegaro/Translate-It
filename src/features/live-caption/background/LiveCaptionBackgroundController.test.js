import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LiveCaptionBackgroundController } from './LiveCaptionBackgroundController.js';
import {
  LIVE_CAPTION_RUNTIME_ACTIONS,
  LIVE_CAPTION_RUNTIME_RESPONSE_STATUSES,
  LIVE_CAPTION_RUNTIME_SHELL_STATES,
  createLiveCaptionRuntimeShellResponse,
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
      runtime: {
        sendMessage: vi.fn(async (request) => {
          const shellByAction = {
            [LIVE_CAPTION_RUNTIME_ACTIONS.START]: LIVE_CAPTION_RUNTIME_SHELL_STATES.RUNNING_SHELL,
            [LIVE_CAPTION_RUNTIME_ACTIONS.STATUS]: LIVE_CAPTION_RUNTIME_SHELL_STATES.RUNNING_SHELL,
            [LIVE_CAPTION_RUNTIME_ACTIONS.PAUSE]: LIVE_CAPTION_RUNTIME_SHELL_STATES.PAUSED_SHELL,
            [LIVE_CAPTION_RUNTIME_ACTIONS.RESUME]: LIVE_CAPTION_RUNTIME_SHELL_STATES.RUNNING_SHELL,
            [LIVE_CAPTION_RUNTIME_ACTIONS.STOP]: LIVE_CAPTION_RUNTIME_SHELL_STATES.IDLE
          };

          return createLiveCaptionRuntimeShellResponse(request.action, {
            sessionId: request.data?.sessionId ?? null,
            tabId: request.data?.tabId ?? null,
            videoFingerprint: request.data?.videoFingerprint ?? null,
            requestId: request.messageId ?? null,
            status: shellByAction[request.action] ?? LIVE_CAPTION_RUNTIME_SHELL_STATES.IDLE,
            runtimeState: request.action === LIVE_CAPTION_RUNTIME_ACTIONS.PAUSE
              ? 'paused'
              : request.action === LIVE_CAPTION_RUNTIME_ACTIONS.STOP
                ? 'idle'
                : 'running',
            message: 'Live-caption offscreen shell response'
          });
        })
      },
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
    expect(startResponse.status).toBe(LIVE_CAPTION_RUNTIME_SHELL_STATES.RUNNING_SHELL);
    expect(startResponse.runtimeState).toBe('running');
    expect(statusResponse.status).toBe(LIVE_CAPTION_RUNTIME_SHELL_STATES.RUNNING_SHELL);
    expect(statusResponse.runtimeState).toBe('running');
    expect(pauseResponse.status).toBe(LIVE_CAPTION_RUNTIME_SHELL_STATES.PAUSED_SHELL);
    expect(pauseResponse.runtimeState).toBe('paused');
    expect(resumeResponse.status).toBe(LIVE_CAPTION_RUNTIME_SHELL_STATES.RUNNING_SHELL);
    expect(resumeResponse.runtimeState).toBe('running');
    expect(stopResponse.status).toBe(LIVE_CAPTION_RUNTIME_SHELL_STATES.IDLE);
    expect(stopResponse.runtimeState).toBe('idle');
    expect(controller.captureCoordinator.runtimeState).toBe('idle');
    expect(controller.sessionManager.getSession(7)).toBe(null);
    expect(globalThis.chrome.tabCapture.capture).not.toHaveBeenCalled();
  });

  it('fails closed for invalid runtime payloads', async () => {
    const controller = new LiveCaptionBackgroundController();
    const response = await controller.handleRuntimeStart({ action: LIVE_CAPTION_RUNTIME_ACTIONS.START, data: {} }, {});

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
