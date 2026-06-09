/* eslint-disable vue/one-component-per-file */
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { defineComponent, nextTick, ref } from 'vue';
import { mount } from '@vue/test-utils';
import { useLiveCaptionOverlay } from './useLiveCaptionOverlay.js';

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
      top: '448px',
      left: '58px',
      width: '624px',
      maxWidth: '624px',
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
});
