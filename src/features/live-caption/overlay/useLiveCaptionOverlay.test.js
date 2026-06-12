/* eslint-disable vue/one-component-per-file */
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { defineComponent, nextTick, ref } from 'vue';
import { mount } from '@vue/test-utils';
import { useLiveCaptionOverlay, computeOverlayPlacement } from './useLiveCaptionOverlay.js';

describe('useLiveCaptionOverlay', () => {
  let originalResizeObserver;
  let originalGetBoundingClientRect;
  let disconnectSpy;
  let removeWindowSpy;
  let removeDocumentSpy;

  beforeEach(() => {
    removeWindowSpy = vi.spyOn(window, 'removeEventListener');
    removeDocumentSpy = vi.spyOn(document, 'removeEventListener');
    disconnectSpy = vi.fn();

    originalResizeObserver = globalThis.ResizeObserver;
    globalThis.ResizeObserver = class {
      constructor(callback) {
        this.callback = callback;
      }

      observe = vi.fn();
      disconnect = disconnectSpy;
    };

    originalGetBoundingClientRect = HTMLVideoElement.prototype.getBoundingClientRect;
    Object.defineProperty(HTMLVideoElement.prototype, 'getBoundingClientRect', {
      configurable: true,
      value: vi.fn(() => ({
        top: 100,
        left: 50,
        width: 640,
        height: 360,
        right: 690,
        bottom: 460
      }))
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    if (originalResizeObserver === undefined) {
      delete globalThis.ResizeObserver;
    } else {
      globalThis.ResizeObserver = originalResizeObserver;
    }

    if (originalGetBoundingClientRect) {
      Object.defineProperty(HTMLVideoElement.prototype, 'getBoundingClientRect', {
        configurable: true,
        value: originalGetBoundingClientRect
      });
    }
  });

  it('computes position metadata from a mocked video rect', async () => {
    const videoTarget = ref(null);
    const videoElement = {
      isConnected: true,
      getBoundingClientRect: vi.fn(() => ({
        top: 100,
        left: 50,
        width: 640,
        height: 360,
        right: 690,
        bottom: 460
      }))
    };
    const Harness = defineComponent({
      setup() {
        const overlay = useLiveCaptionOverlay(videoTarget, {
          offsetBottom: 12,
          offsetHorizontal: 8
        });

        return {
          overlay,
          overlayStyle: overlay.overlayStyle,
          overlayRect: overlay.overlayRect,
          isVisible: overlay.isVisible
        };
      },
      template: '<div />'
    });

    const wrapper = mount(Harness);
    videoTarget.value = videoElement;
    wrapper.vm.overlay.attach();
    await nextTick();
    await nextTick();

    expect(wrapper.vm.isVisible).toBe(true);
    expect(wrapper.vm.overlayRect).toEqual({
      top: 100,
      left: 50,
      width: 640,
      height: 360
    });
    expect(wrapper.vm.overlayStyle).toMatchObject({
      position: 'fixed',
      top: '468px', // rect.bottom (460) + gap (8)
      left: '58px',
      width: '624px',
      maxWidth: '624px',
      bottom: 'auto',
      transform: 'none',
      zIndex: 2147483647,
      pointerEvents: 'none'
    });
  });

  it('computes fullscreen position metadata correctly', async () => {
    const videoTarget = ref(null);
    const videoElement = {
      isConnected: true,
      ownerDocument: {
        fullscreenElement: null
      },
      getBoundingClientRect: vi.fn(() => ({
        top: 100,
        left: 50,
        width: 640,
        height: 360,
        right: 690,
        bottom: 460
      }))
    };
    videoElement.ownerDocument.fullscreenElement = videoElement;

    const Harness = defineComponent({
      setup() {
        const overlay = useLiveCaptionOverlay(videoTarget, {
          offsetBottom: 12,
          offsetHorizontal: 8
        });

        return {
          overlay,
          overlayStyle: overlay.overlayStyle,
          overlayRect: overlay.overlayRect,
          isVisible: overlay.isVisible
        };
      },
      template: '<div />'
    });

    const wrapper = mount(Harness);
    videoTarget.value = videoElement;
    wrapper.vm.overlay.attach();
    await nextTick();
    await nextTick();

    expect(wrapper.vm.isVisible).toBe(true);
    expect(wrapper.vm.overlayStyle).toMatchObject({
      position: 'fixed',
      top: '448px', // rect.bottom (460) - offsetBottom (12)
      left: '58px',
      width: '624px',
      maxWidth: '624px',
      bottom: 'auto',
      transform: 'translateY(-100%)',
      zIndex: 2147483647,
      pointerEvents: 'none'
    });
  });

  it('cleans up listeners and observers on unmount', async () => {
    const videoTarget = ref(null);
    const videoElement = {
      isConnected: true,
      getBoundingClientRect: vi.fn(() => ({
        top: 100,
        left: 50,
        width: 640,
        height: 360,
        right: 690,
        bottom: 460
      }))
    };
    const Harness = defineComponent({
      setup() {
        const overlay = useLiveCaptionOverlay(videoTarget);

        return {
          overlay,
          overlayStyle: overlay.overlayStyle
        };
      },
      template: '<div />'
    });

    const addScrollSpy = vi.spyOn(window, 'addEventListener');
    const addDocumentSpy = vi.spyOn(document, 'addEventListener');
    const wrapper = mount(Harness);
    videoTarget.value = videoElement;
    wrapper.vm.overlay.attach();
    await nextTick();
    await nextTick();
    wrapper.unmount();

    expect(addScrollSpy).toHaveBeenCalledWith('scroll', expect.any(Function), { passive: true });
    expect(addDocumentSpy).toHaveBeenCalledWith('scroll', expect.any(Function), { passive: true });
    expect(removeWindowSpy).toHaveBeenCalledWith('scroll', expect.any(Function), { passive: true });
    expect(removeWindowSpy).toHaveBeenCalledWith('resize', expect.any(Function), { passive: true });
    expect(removeDocumentSpy).toHaveBeenCalledWith('scroll', expect.any(Function), { passive: true });
    expect(disconnectSpy).toHaveBeenCalled();
  });

  it('detects fullscreen when a parent wrapper is fullscreen', async () => {
    const videoTarget = ref(null);
    let videoElement;
    const fullscreenWrapper = {
      contains: vi.fn(() => true)
    };
    videoElement = {
      isConnected: true,
      ownerDocument: {
        fullscreenElement: fullscreenWrapper
      },
      getBoundingClientRect: vi.fn(() => ({
        top: 100,
        left: 50,
        width: 640,
        height: 360,
        right: 690,
        bottom: 460
      }))
    };

    const Harness = defineComponent({
      setup() {
        const overlay = useLiveCaptionOverlay(videoTarget, {
          offsetBottom: 12,
          offsetHorizontal: 8
        });

        return {
          overlay,
          overlayStyle: overlay.overlayStyle,
          overlayRect: overlay.overlayRect,
          isVisible: overlay.isVisible
        };
      },
      template: '<div />'
    });

    const wrapper = mount(Harness);
    videoTarget.value = videoElement;
    wrapper.vm.overlay.attach();
    await nextTick();
    await nextTick();

    expect(wrapper.vm.overlayStyle).toMatchObject({
      position: 'fixed',
      top: '448px', // rect.bottom (460) - offsetBottom (12)
      left: '58px',
      width: '624px',
      maxWidth: '624px',
      bottom: 'auto',
      transform: 'translateY(-100%)',
      zIndex: 2147483647,
      pointerEvents: 'none'
    });
  });

  it('hides the overlay when the video is offscreen', async () => {
    const videoTarget = ref(null);
    const videoElement = {
      isConnected: true,
      ownerDocument: {
        defaultView: {
          innerWidth: 1024,
          innerHeight: 768
        }
      },
      getBoundingClientRect: vi.fn()
    };

    const Harness = defineComponent({
      setup() {
        const overlay = useLiveCaptionOverlay(videoTarget);
        return {
          overlay,
          isVisible: overlay.isVisible
        };
      },
      template: '<div />'
    });

    const wrapper = mount(Harness);
    videoTarget.value = videoElement;
    wrapper.vm.overlay.attach();

    // 1. Video is above the viewport
    videoElement.getBoundingClientRect.mockReturnValue({
      top: -400,
      left: 100,
      width: 640,
      height: 360,
      right: 740,
      bottom: -40
    });
    wrapper.vm.overlay.updateOverlayPosition();
    await nextTick();
    expect(wrapper.vm.isVisible).toBe(false);

    // 2. Video is below the viewport
    videoElement.getBoundingClientRect.mockReturnValue({
      top: 800,
      left: 100,
      width: 640,
      height: 360,
      right: 740,
      bottom: 1160
    });
    wrapper.vm.overlay.updateOverlayPosition();
    await nextTick();
    expect(wrapper.vm.isVisible).toBe(false);

    // 3. Video is to the left of the viewport
    videoElement.getBoundingClientRect.mockReturnValue({
      top: 100,
      left: -700,
      width: 640,
      height: 360,
      right: -60,
      bottom: 460
    });
    wrapper.vm.overlay.updateOverlayPosition();
    await nextTick();
    expect(wrapper.vm.isVisible).toBe(false);

    // 4. Video is to the right of the viewport
    videoElement.getBoundingClientRect.mockReturnValue({
      top: 100,
      left: 1100,
      width: 640,
      height: 360,
      right: 1740,
      bottom: 460
    });
    wrapper.vm.overlay.updateOverlayPosition();
    await nextTick();
    expect(wrapper.vm.isVisible).toBe(false);

    // 5. Video is in the viewport
    videoElement.getBoundingClientRect.mockReturnValue({
      top: 100,
      left: 100,
      width: 640,
      height: 360,
      right: 740,
      bottom: 460
    });
    wrapper.vm.overlay.updateOverlayPosition();
    await nextTick();
    expect(wrapper.vm.isVisible).toBe(true);
  });

  it('sets isVisible to false when video is null or disconnected', async () => {
    const videoTarget = ref(null);
    const Harness = defineComponent({
      setup() {
        const overlay = useLiveCaptionOverlay(videoTarget);
        return {
          overlay,
          isVisible: overlay.isVisible
        };
      },
      template: '<div />'
    });

    const wrapper = mount(Harness);
    wrapper.vm.overlay.updateOverlayPosition();
    await nextTick();
    expect(wrapper.vm.isVisible).toBe(false);
  });
});

describe('computeOverlayPlacement', () => {
  const defaultOptions = { offsetBottom: 16, offsetHorizontal: 16 };

  it('places overlay below video when enough space exists', () => {
    const rect = { top: 100, left: 50, width: 640, height: 360, bottom: 460, right: 690 };
    const viewport = { width: 1280, height: 720 };

    const result = computeOverlayPlacement(rect, viewport, defaultOptions);

    expect(result.top).toBe(468); // 460 + 8 gap
    expect(result.left).toBe(66); // 50 + 16 offset
    expect(result.width).toBe(608); // 640 - 32
    expect(result.transform).toBe('none');
    expect(result.insideVideo).toBe(false);
    expect(result.left + result.width).toBeLessThanOrEqual(viewport.width);
  });

  it('places overlay inside video when insufficient space below (YouTube Shorts case)', () => {
    const rect = { top: 0, left: 20, width: 375, height: 667, bottom: 667, right: 395 };
    const viewport = { width: 375, height: 667 };

    const result = computeOverlayPlacement(rect, viewport, defaultOptions);

    // spaceBelow = 667 - 667 = 0, which is < 80 + 8
    // So: top = 667 - 80 - 16 = 571
    // left = 20 + 16 = 36, but 36 + 343 = 379 > 375 viewport width
    // so left is clamped to max(0, 375 - 343) = 32
    expect(result.top).toBe(571);
    expect(result.left).toBe(32);
    expect(result.width).toBe(343); // 375 - 32
    expect(result.transform).toBe('none');
    expect(result.insideVideo).toBe(true);
    expect(result.left + result.width).toBeLessThanOrEqual(viewport.width);
  });

  it('clamps top when overlay overflows below viewport', () => {
    const rect = { top: 120, left: 0, width: 375, height: 540, bottom: 660, right: 375 };
    const viewport = { width: 375, height: 667 };

    const result = computeOverlayPlacement(rect, viewport, defaultOptions);

    // spaceBelow = 667 - 660 = 7, which is < 80 + 8
    // So: top = 660 - 80 - 16 = 564
    // 564 + 80 = 644 <= 667, so no clamp needed
    expect(result.top).toBe(564);
    expect(result.left).toBe(16);
    expect(result.width).toBe(343);
  });

  it('clamps top when computed top still overflows', () => {
    const rect = { top: 600, left: 0, width: 375, height: 100, bottom: 700, right: 375 };
    const viewport = { width: 375, height: 667 };

    const result = computeOverlayPlacement(rect, viewport, defaultOptions);

    // spaceBelow = 667 - 700 = -33, which is < 80 + 8
    // So: top = 700 - 80 - 16 = 604
    // 604 + 80 = 684 > 667, so clamp: top = max(0, 667 - 80) = 587
    expect(result.top).toBe(587);
    expect(result.left).toBe(16);
    expect(result.width).toBe(343);
  });

  it('clamps left when overlay overflows right edge', () => {
    const rect = { top: 100, left: 600, width: 400, height: 300, bottom: 400, right: 1000 };
    const viewport = { width: 800, height: 600 };

    const result = computeOverlayPlacement(rect, viewport, defaultOptions);

    // maxWidth = 400 - 32 = 368
    // left = 600 + 16 = 616, 616 + 368 = 984 > 800
    // clamp: left = max(0, 800 - 368) = 432
    expect(result.top).toBe(408); // below video
    expect(result.left).toBe(432);
    expect(result.width).toBe(368);
    expect(result.left + result.width).toBeLessThanOrEqual(viewport.width);
  });

  it('clamps width and left when overlay is wider than viewport', () => {
    const rect = { top: 100, left: 0, width: 1000, height: 300, bottom: 400, right: 1000 };
    const viewport = { width: 400, height: 600 };

    const result = computeOverlayPlacement(rect, viewport, defaultOptions);

    // maxWidth = 1000 - 32 = 968, clamped to viewport.width = 400
    // left = 0 + 16 = 16, 16 + 400 = 416 > 400
    // clamp left = max(0, 400 - 400) = 0
    expect(result.left).toBe(0);
    expect(result.width).toBe(400);
    expect(result.left + result.width).toBeLessThanOrEqual(viewport.width);
  });

  it('uses fullscreen placement when isFullscreen is true', () => {
    const rect = { top: 100, left: 50, width: 640, height: 360, bottom: 460, right: 690 };
    const viewport = { width: 1280, height: 720 };

    const result = computeOverlayPlacement(rect, viewport, { ...defaultOptions, isFullscreen: true });

    // Fullscreen: top = 460 - 16 = 444, transform = translateY(-100%)
    expect(result.top).toBe(444);
    expect(result.left).toBe(66);
    expect(result.width).toBe(608);
    expect(result.transform).toBe('translateY(-100%)');
  });

  it('handles video at viewport edge with zero space below', () => {
    const rect = { top: 0, left: 0, width: 375, height: 667, bottom: 667, right: 375 };
    const viewport = { width: 375, height: 667 };

    const result = computeOverlayPlacement(rect, viewport, defaultOptions);

    // spaceBelow = 0, overlay inside video at bottom
    // top = 667 - 80 - 16 = 571
    expect(result.top).toBe(571);
    expect(result.left).toBe(16);
  });

  it('uses overlayHeight option when provided', () => {
    const rect = { top: 0, left: 0, width: 375, height: 600, bottom: 600, right: 375 };
    const viewport = { width: 375, height: 667 };

    const result = computeOverlayPlacement(rect, viewport, { ...defaultOptions, overlayHeight: 200 });

    // spaceBelow = 667 - 600 = 67, which is < 200 + 8
    // So: top = 600 - 200 - 16 = 384, insideVideo = true
    expect(result.top).toBe(384);
    expect(result.insideVideo).toBe(true);
    expect(result.left + result.width).toBeLessThanOrEqual(viewport.width);
  });

  it('falls back to estimated height when overlayHeight is 0 or null', () => {
    const rect = { top: 0, left: 0, width: 375, height: 667, bottom: 667, right: 375 };
    const viewport = { width: 375, height: 667 };

    const resultZero = computeOverlayPlacement(rect, viewport, { ...defaultOptions, overlayHeight: 0 });
    const resultNull = computeOverlayPlacement(rect, viewport, { ...defaultOptions, overlayHeight: null });
    const resultDefault = computeOverlayPlacement(rect, viewport, defaultOptions);

    // All should use the fallback estimate (80)
    expect(resultZero.top).toBe(resultDefault.top);
    expect(resultNull.top).toBe(resultDefault.top);
    expect(resultZero.insideVideo).toBe(resultDefault.insideVideo);
  });

  it('long overlay height stays inside viewport', () => {
    const rect = { top: 0, left: 0, width: 375, height: 667, bottom: 667, right: 375 };
    const viewport = { width: 375, height: 667 };

    const result = computeOverlayPlacement(rect, viewport, { ...defaultOptions, overlayHeight: 400 });

    // spaceBelow = 0, overlay inside video
    // top = 667 - 400 - 16 = 251
    // 251 + 400 = 651 <= 667, no clamp needed
    expect(result.top).toBe(251);
    expect(result.insideVideo).toBe(true);
    expect(result.top + 400).toBeLessThanOrEqual(viewport.height);
  });

  it('very tall overlay is clamped to fit viewport', () => {
    const rect = { top: 400, left: 0, width: 375, height: 200, bottom: 600, right: 375 };
    const viewport = { width: 375, height: 667 };

    const result = computeOverlayPlacement(rect, viewport, { ...defaultOptions, overlayHeight: 350 });

    // spaceBelow = 667 - 600 = 67, which is < 350 + 8
    // top = 600 - 350 - 16 = 234
    // 234 + 350 = 584 <= 667, no clamp needed
    expect(result.top).toBe(234);
    expect(result.insideVideo).toBe(true);
  });
});

describe('useLiveCaptionOverlay - overlay measurement', () => {
  let originalResizeObserver;
  let originalGetBoundingClientRect;

  beforeEach(() => {
    originalResizeObserver = globalThis.ResizeObserver;
    globalThis.ResizeObserver = class {
      constructor() {}
      observe = vi.fn();
      disconnect = vi.fn();
    };

    originalGetBoundingClientRect = HTMLVideoElement.prototype.getBoundingClientRect;
  });

  afterEach(() => {
    if (originalResizeObserver === undefined) {
      delete globalThis.ResizeObserver;
    } else {
      globalThis.ResizeObserver = originalResizeObserver;
    }

    if (originalGetBoundingClientRect) {
      Object.defineProperty(HTMLVideoElement.prototype, 'getBoundingClientRect', {
        configurable: true,
        value: originalGetBoundingClientRect
      });
    }
  });

  it('includes maxHeight in overlay style when video fills viewport (Shorts case)', async () => {
    Object.defineProperty(HTMLVideoElement.prototype, 'getBoundingClientRect', {
      configurable: true,
      value: vi.fn(() => ({
        top: 0,
        left: 0,
        width: 375,
        height: 667,
        right: 375,
        bottom: 667
      }))
    });

    const videoTarget = ref(null);
    const videoElement = {
      isConnected: true,
      ownerDocument: {
        defaultView: {
          innerWidth: 375,
          innerHeight: 667
        }
      },
      getBoundingClientRect: HTMLVideoElement.prototype.getBoundingClientRect
    };

    const Harness = defineComponent({
      setup() {
        const overlay = useLiveCaptionOverlay(videoTarget);
        return {
          overlay,
          overlayStyle: overlay.overlayStyle
        };
      },
      template: '<div />'
    });

    const wrapper = mount(Harness);
    videoTarget.value = videoElement;
    wrapper.vm.overlay.attach();
    await nextTick();
    await nextTick();

    const style = wrapper.vm.overlayStyle;
    expect(style).not.toBeNull();
    expect(style.maxHeight).toBe('calc(100vh - 571px)');
    expect(style.overflowY).toBe('auto');
  });

  it('does not include maxHeight when enough space below video', async () => {
    Object.defineProperty(HTMLVideoElement.prototype, 'getBoundingClientRect', {
      configurable: true,
      value: vi.fn(() => ({
        top: 100,
        left: 50,
        width: 640,
        height: 360,
        right: 690,
        bottom: 460
      }))
    });

    const videoTarget = ref(null);
    const videoElement = {
      isConnected: true,
      ownerDocument: {
        defaultView: {
          innerWidth: 1280,
          innerHeight: 720
        }
      },
      getBoundingClientRect: HTMLVideoElement.prototype.getBoundingClientRect
    };

    const Harness = defineComponent({
      setup() {
        const overlay = useLiveCaptionOverlay(videoTarget);
        return {
          overlay,
          overlayStyle: overlay.overlayStyle
        };
      },
      template: '<div />'
    });

    const wrapper = mount(Harness);
    videoTarget.value = videoElement;
    wrapper.vm.overlay.attach();
    await nextTick();
    await nextTick();

    const style = wrapper.vm.overlayStyle;
    expect(style).not.toBeNull();
    expect(style.maxHeight).toBeUndefined();
    expect(style.overflowY).toBeUndefined();
  });

  it('uses fallback estimated height before measurement', async () => {
    Object.defineProperty(HTMLVideoElement.prototype, 'getBoundingClientRect', {
      configurable: true,
      value: vi.fn(() => ({
        top: 0,
        left: 0,
        width: 375,
        height: 667,
        right: 375,
        bottom: 667
      }))
    });

    const videoTarget = ref(null);
    const videoElement = {
      isConnected: true,
      ownerDocument: {
        defaultView: {
          innerWidth: 375,
          innerHeight: 667
        }
      },
      getBoundingClientRect: HTMLVideoElement.prototype.getBoundingClientRect
    };

    const Harness = defineComponent({
      setup() {
        const overlay = useLiveCaptionOverlay(videoTarget);
        return {
          overlay,
          overlayStyle: overlay.overlayStyle
        };
      },
      template: '<div />'
    });

    const wrapper = mount(Harness);
    videoTarget.value = videoElement;
    wrapper.vm.overlay.attach();
    await nextTick();
    await nextTick();

    // Before measurement, overlayHeight = null, fallback = 80
    // top = 667 - 80 - 16 = 571
    const style = wrapper.vm.overlayStyle;
    expect(style.top).toBe('571px');
    expect(style.maxHeight).toBe('calc(100vh - 571px)');
  });

  it('disconnects both ResizeObservers on cleanup', async () => {
    let observerCount = 0;
    const disconnectFn = vi.fn();
    globalThis.ResizeObserver = class {
      constructor() {
        observerCount++;
      }
      observe = vi.fn();
      disconnect = disconnectFn;
    };

    Object.defineProperty(HTMLVideoElement.prototype, 'getBoundingClientRect', {
      configurable: true,
      value: vi.fn(() => ({
        top: 0,
        left: 0,
        width: 375,
        height: 667,
        right: 375,
        bottom: 667
      }))
    });

    const videoTarget = ref(null);
    const videoElement = {
      isConnected: true,
      ownerDocument: {
        defaultView: {
          innerWidth: 375,
          innerHeight: 667
        }
      },
      getBoundingClientRect: HTMLVideoElement.prototype.getBoundingClientRect
    };

    const Harness = defineComponent({
      setup() {
        const overlay = useLiveCaptionOverlay(videoTarget);
        return { overlay };
      },
      template: '<div />'
    });

    const wrapper = mount(Harness);
    videoTarget.value = videoElement;
    wrapper.vm.overlay.attach();
    await nextTick();
    await nextTick();

    // Both video and overlay observers should be created
    expect(observerCount).toBe(2);

    wrapper.vm.overlay.cleanup();
    await nextTick();

    // disconnect called for both observers
    expect(disconnectFn).toHaveBeenCalledTimes(2);
  });
});
