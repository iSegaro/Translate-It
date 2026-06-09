import { describe, expect, it, vi } from 'vitest';
import { LiveCaptionCaptureCoordinator } from './LiveCaptionCaptureCoordinator.js';
import { LiveCaptionOffscreenBridge } from './LiveCaptionOffscreenBridge.js';
import { LIVE_CAPTION_RUNTIME_STATES } from '../constants/liveCaptionRuntimeStates.js';
import { LIVE_CAPTION_CAPTURE_STATES } from './liveCaptionOffscreenContracts.js';

vi.mock('@/shared/logging/logger.js', () => ({
  getScopedLogger: vi.fn(() => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  }))
}));

describe('live-caption capture coordinator runtime shell', () => {
  it('models runtime lifecycle transitions without capture execution', () => {
    const bridge = new LiveCaptionOffscreenBridge();
    const coordinator = new LiveCaptionCaptureCoordinator({ bridge });

    coordinator.startRuntime({ sessionId: 'session-1', tabId: 7, videoFingerprint: 'video-a' });
    expect(coordinator.runtimeState).toBe(LIVE_CAPTION_RUNTIME_STATES.STARTING);

    coordinator.setRuntimeState(LIVE_CAPTION_RUNTIME_STATES.RUNNING);
    expect(coordinator.runtimeState).toBe(LIVE_CAPTION_RUNTIME_STATES.RUNNING);

    coordinator.pauseRuntime({ reason: 'pause' });
    expect(coordinator.runtimeState).toBe(LIVE_CAPTION_RUNTIME_STATES.PAUSED);

    coordinator.resumeRuntime({ reason: 'resume' });
    expect(coordinator.runtimeState).toBe(LIVE_CAPTION_RUNTIME_STATES.RUNNING);

    coordinator.stopRuntime({ reason: 'stop' });
    expect(coordinator.runtimeState).toBe(LIVE_CAPTION_RUNTIME_STATES.IDLE);

    const statusSnapshot = coordinator.requestRuntimeStatus();
    expect(statusSnapshot.runtimeState).toBe(LIVE_CAPTION_RUNTIME_STATES.IDLE);
    expect(coordinator.getSnapshot().lastRuntimeRequest.action).toBe('status');
    expect(globalThis.chrome?.tabCapture?.capture).toBeUndefined();
  });

  it('marks unavailable and fail-closed states deterministically', () => {
    const coordinator = new LiveCaptionCaptureCoordinator({ bridge: new LiveCaptionOffscreenBridge() });

    const unavailable = coordinator.markUnavailable('offscreen_shell_unavailable');
    const failClosed = coordinator.failClosed('reconciliation_failed', new Error('bad state'));

    expect(unavailable.runtimeState).toBe(LIVE_CAPTION_RUNTIME_STATES.ERROR);
    expect(coordinator.getSnapshot().runtimeState).toBe(LIVE_CAPTION_RUNTIME_STATES.ERROR);
    expect(failClosed.failClosed).toBe(true);
    expect(failClosed.error.reason).toBe('reconciliation_failed');
    expect(failClosed.error.code).toBeDefined();
    expect(coordinator.getSnapshot().status).toBe(LIVE_CAPTION_CAPTURE_STATES.ERROR);
  });
});
