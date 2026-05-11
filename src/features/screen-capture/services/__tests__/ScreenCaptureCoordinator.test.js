import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { screenCaptureCoordinator } from '../ScreenCaptureCoordinator.js';
import { pageEventBus } from '@/core/PageEventBus.js';
import { TranslationMode } from '@/shared/config/config.js';

// Mock pageEventBus
vi.mock('@/core/PageEventBus.js', () => ({
  pageEventBus: {
    emit: vi.fn()
  }
}));

describe('ScreenCaptureCoordinator', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Mock window properties if needed
    global.window = {
      devicePixelRatio: 1,
      innerWidth: 1024,
      innerHeight: 768
    };
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('handleResult', () => {
    it('should not dispatch for empty text', async () => {
      await screenCaptureCoordinator.handleResult({ text: '' });
      expect(pageEventBus.emit).not.toHaveBeenCalled();
    });

    it('should not dispatch for whitespace-only text', async () => {
      await screenCaptureCoordinator.handleResult({ text: '   ' });
      expect(pageEventBus.emit).not.toHaveBeenCalled();
    });

    it('should dispatch for valid text', async () => {
      const coordinates = { x: 100, y: 100, width: 200, height: 100 };
      await screenCaptureCoordinator.handleResult({
        text: 'Hello World',
        coordinates
      });

      expect(pageEventBus.emit).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          text: 'Hello World',
          position: expect.objectContaining({
            _isViewportRelative: true
          }),
          options: expect.objectContaining({
            mode: TranslationMode.ScreenCapture,
            immediate: true
          })
        })
      );
    });

    it('should calculate correct position from coordinates', async () => {
      const coordinates = { x: 100, y: 100, width: 200, height: 100 };
      const dpr = window.devicePixelRatio || 1;

      await screenCaptureCoordinator.handleResult({
        text: 'Test',
        coordinates
      });

      const emitCall = pageEventBus.emit.mock.calls[0];
      const position = emitCall[1].position;

      expect(position.x).toBeCloseTo((100 + 200 / 2) / dpr); // center x
      expect(position.y).toBeCloseTo((100 + 100 + 10) / dpr); // bottom y + padding
      expect(position._isViewportRelative).toBe(true);
    });

    it('should handle fullscreen coordinates', async () => {
      const coordinates = { x: 0, y: 0, width: window.innerWidth, height: window.innerHeight };

      await screenCaptureCoordinator.handleResult({
        text: 'Full screen text',
        coordinates,
        captureType: 'fullscreen'
      });

      expect(pageEventBus.emit).toHaveBeenCalled();
      const emitCall = pageEventBus.emit.mock.calls[0];
      expect(emitCall[1].options._sourceCaptureType).toBe('fullscreen');
    });

    it('should handle missing coordinates gracefully', async () => {
      await screenCaptureCoordinator.handleResult({
        text: 'Test without coordinates'
      });

      // Should still dispatch but with default coordinates
      expect(pageEventBus.emit).toHaveBeenCalled();
      const emitCall = pageEventBus.emit.mock.calls[0];
      expect(emitCall[1].position).toBeDefined();
    });

    it('should include metadata in payload', async () => {
      const coordinates = { x: 50, y: 50, width: 150, height: 100 };

      await screenCaptureCoordinator.handleResult({
        text: 'Test',
        coordinates,
        captureType: 'area',
        timestamp: Date.now()
      });

      const emitCall = pageEventBus.emit.mock.calls[0];
      const options = emitCall[1].options;

      expect(options._sourceCoordinates).toEqual(coordinates);
      expect(options._sourceCaptureType).toBe('area');
      expect(options._coordinateSpace).toBe('device-pixel');
    });
  });
});
