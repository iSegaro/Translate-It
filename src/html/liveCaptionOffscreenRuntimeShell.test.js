import { beforeEach, describe, expect, it, vi } from 'vitest';
import LiveCaptionOffscreenRuntimeShell from './liveCaptionOffscreenRuntimeShell.js';
import {
  LIVE_CAPTION_RUNTIME_ACTIONS,
  LIVE_CAPTION_RUNTIME_RESPONSE_STATUSES,
  LIVE_CAPTION_RUNTIME_SHELL_STATES
} from '@/features/live-caption/background/liveCaptionRuntimeContracts.js';

vi.mock('@/shared/logging/logger.js', () => ({
  getScopedLogger: vi.fn(() => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  }))
}));

describe('live-caption offscreen runtime shell', () => {
  beforeEach(() => {
    globalThis.chrome = {
      tabCapture: {
        capture: vi.fn()
      }
    };
  });

  it('starts, pauses, resumes, statuses, and stops without media capture', () => {
    const shell = new LiveCaptionOffscreenRuntimeShell();
    const baseMessage = {
      target: 'offscreen',
      action: LIVE_CAPTION_RUNTIME_ACTIONS.START,
      messageId: 'message-1',
      data: {
        sessionId: 'session-1',
        tabId: 7,
        videoFingerprint: 'video-a'
      }
    };

    const startResponse = shell.handleMessage(baseMessage, {});
    const statusResponse = shell.handleMessage({
      ...baseMessage,
      action: LIVE_CAPTION_RUNTIME_ACTIONS.STATUS
    }, {});
    const pauseResponse = shell.handleMessage({
      ...baseMessage,
      action: LIVE_CAPTION_RUNTIME_ACTIONS.PAUSE
    }, {});
    const resumeResponse = shell.handleMessage({
      ...baseMessage,
      action: LIVE_CAPTION_RUNTIME_ACTIONS.RESUME
    }, {});
    const stopResponse = shell.handleMessage({
      ...baseMessage,
      action: LIVE_CAPTION_RUNTIME_ACTIONS.STOP
    }, {});

    expect(startResponse.success).toBe(true);
    expect(startResponse.status).toBe(LIVE_CAPTION_RUNTIME_SHELL_STATES.RUNNING_SHELL);
    expect(statusResponse.status).toBe(LIVE_CAPTION_RUNTIME_SHELL_STATES.RUNNING_SHELL);
    expect(pauseResponse.status).toBe(LIVE_CAPTION_RUNTIME_SHELL_STATES.PAUSED_SHELL);
    expect(resumeResponse.status).toBe(LIVE_CAPTION_RUNTIME_SHELL_STATES.RUNNING_SHELL);
    expect(stopResponse.status).toBe(LIVE_CAPTION_RUNTIME_SHELL_STATES.IDLE);
    expect(shell.getSnapshot().status).toBe(LIVE_CAPTION_RUNTIME_SHELL_STATES.IDLE);
    expect(globalThis.chrome.tabCapture.capture).not.toHaveBeenCalled();
  });

  it('fails closed for invalid, unknown, and inconsistent payloads', () => {
    const shell = new LiveCaptionOffscreenRuntimeShell();

    const invalid = shell.handleMessage({ target: 'offscreen', action: LIVE_CAPTION_RUNTIME_ACTIONS.START }, {});
    const unknown = shell.handleMessage({ target: 'offscreen', action: 'unknown', data: {} }, {});
    shell.handleMessage({
      target: 'offscreen',
      action: LIVE_CAPTION_RUNTIME_ACTIONS.START,
      data: {
        sessionId: 'session-1',
        tabId: 7,
        videoFingerprint: 'video-a'
      }
    }, {});
    const inconsistent = shell.handleMessage({
      target: 'offscreen',
      action: LIVE_CAPTION_RUNTIME_ACTIONS.PAUSE,
      data: {
        sessionId: 'session-2',
        tabId: 7,
        videoFingerprint: 'video-b'
      }
    }, {});

    expect(invalid.success).toBe(false);
    expect(invalid.status).toBe(LIVE_CAPTION_RUNTIME_RESPONSE_STATUSES.FAIL_CLOSED);
    expect(unknown.success).toBe(false);
    expect(unknown.error.code).toBeDefined();
    expect(inconsistent.success).toBe(false);
    expect(inconsistent.error.reason).toBe('inconsistent_session');
    expect(inconsistent.error.code).toBe('inconsistent_session');
  });
});
