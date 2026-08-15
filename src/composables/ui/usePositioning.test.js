import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { usePositioning } from '@/composables/ui/usePositioning.js';

const VIEW_W = 1000;
const VIEW_H = 768;

const mouseEvent = (type, x, y) => new MouseEvent(type, {
  clientX: x,
  clientY: y,
  bubbles: true,
  cancelable: true,
});

const touchEvent = (type, x, y) => {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperty(event, 'touches', {
    value: [{ clientX: x, clientY: y }],
  });
  return event;
};

const dispatchOnDocument = (event) => document.dispatchEvent(event);

const positionings = [];
const createPositioning = (position, options) => {
  const instance = usePositioning(position, options);
  positionings.push(instance);
  return instance;
};

beforeEach(() => {
  Object.defineProperty(window, 'innerWidth', { value: VIEW_W, configurable: true, writable: true });
  Object.defineProperty(window, 'innerHeight', { value: VIEW_H, configurable: true, writable: true });
  Object.defineProperty(window, 'scrollX', { value: 0, configurable: true, writable: true });
  Object.defineProperty(window, 'scrollY', { value: 0, configurable: true, writable: true });
  document.body.style.userSelect = '';
});

afterEach(() => {
  positionings.splice(0).forEach((instance) => instance.cleanup());
  document.body.style.userSelect = '';
});

describe('usePositioning', () => {
  describe('initial placement', () => {
    it('places the window at the provided position', () => {
      const { currentPosition } = createPositioning({ x: 100, y: 50 });
      expect(currentPosition.value).toEqual({ x: 100, y: 50 });
    });

    it('clamps positions inside the viewport margins', () => {
      const { currentPosition } = createPositioning({ x: -50, y: -20 });
      expect(currentPosition.value).toEqual({ x: 10, y: 10 });
    });

    it('brings overflowing positions back into the viewport', () => {
      const { currentPosition } = createPositioning({ x: 2000, y: 2000 });
      expect(currentPosition.value.x).toBeGreaterThanOrEqual(10);
      expect(currentPosition.value.x).toBeLessThanOrEqual(VIEW_W - 350 - 10);
      expect(currentPosition.value.y).toBeGreaterThanOrEqual(10);
      expect(currentPosition.value.y).toBeLessThanOrEqual(VIEW_H - 180 - 10);
    });

    it('keeps viewport-relative positions without scroll adjustment', () => {
      Object.defineProperty(window, 'scrollX', { value: 500, configurable: true, writable: true });
      Object.defineProperty(window, 'scrollY', { value: 300, configurable: true, writable: true });
      const { currentPosition } = createPositioning({ x: 120, y: 80, _isViewportRelative: true });
      expect(currentPosition.value).toEqual({ x: 120, y: 80 });
    });

    it('converts absolute coordinates to viewport-relative on init', () => {
      Object.defineProperty(window, 'scrollX', { value: 500, configurable: true, writable: true });
      Object.defineProperty(window, 'scrollY', { value: 300, configurable: true, writable: true });
      const { currentPosition } = createPositioning({ x: 620, y: 380 });
      expect(currentPosition.value).toEqual({ x: 120, y: 80 });
    });
  });

  describe('mouse drag', () => {
    it('moves the window while a mouse drag is active', () => {
      const { currentPosition, isDragging, startDrag } = createPositioning(
        { x: 500, y: 300 },
        { enableDragging: true }
      );
      startDrag(mouseEvent('mousedown', 300, 200));
      expect(isDragging.value).toBe(true);
      dispatchOnDocument(mouseEvent('mousemove', 350, 250));
      expect(currentPosition.value).toEqual({ x: 550, y: 350 });
    });

    it('stops on mouseup, restores userSelect, and removes listeners', () => {
      const { currentPosition, isDragging, startDrag } = createPositioning(
        { x: 500, y: 300 },
        { enableDragging: true }
      );
      startDrag(mouseEvent('mousedown', 300, 200));
      expect(document.body.style.userSelect).toBe('none');
      dispatchOnDocument(mouseEvent('mousemove', 350, 250));
      dispatchOnDocument(mouseEvent('mouseup', 350, 250));
      expect(isDragging.value).toBe(false);
      expect(document.body.style.userSelect).toBe('');
      dispatchOnDocument(mouseEvent('mousemove', 400, 300));
      expect(currentPosition.value).toEqual({ x: 550, y: 350 });
    });
  });

  describe('touch drag', () => {
    it('moves the window on touch drag and stops on touchend', () => {
      const { currentPosition, isDragging, startDrag } = createPositioning(
        { x: 500, y: 300 },
        { enableDragging: true }
      );
      startDrag(touchEvent('touchstart', 300, 200));
      dispatchOnDocument(touchEvent('touchmove', 350, 250));
      expect(currentPosition.value).toEqual({ x: 550, y: 350 });
      dispatchOnDocument(touchEvent('touchend', 350, 250));
      expect(isDragging.value).toBe(false);
      expect(document.body.style.userSelect).toBe('');
      dispatchOnDocument(touchEvent('touchmove', 450, 350));
      expect(currentPosition.value).toEqual({ x: 550, y: 350 });
    });

    it('terminates the drag on touchcancel', () => {
      const { currentPosition, isDragging, startDrag } = createPositioning(
        { x: 500, y: 300 },
        { enableDragging: true }
      );
      startDrag(touchEvent('touchstart', 300, 200));
      dispatchOnDocument(touchEvent('touchcancel', 350, 250));
      expect(isDragging.value).toBe(false);
      expect(document.body.style.userSelect).toBe('');
      dispatchOnDocument(touchEvent('touchmove', 450, 350));
      expect(currentPosition.value).toEqual({ x: 500, y: 300 });
    });
  });

  describe('cleanup', () => {
    it('cleans up drag state and listeners during an active drag', () => {
      const { currentPosition, startDrag, cleanup, isDragging } = createPositioning(
        { x: 500, y: 300 },
        { enableDragging: true }
      );
      startDrag(touchEvent('touchstart', 300, 200));
      cleanup();
      expect(isDragging.value).toBe(false);
      expect(document.body.style.userSelect).toBe('');
      dispatchOnDocument(touchEvent('touchmove', 350, 250));
      dispatchOnDocument(touchEvent('touchend', 350, 250));
      dispatchOnDocument(touchEvent('touchcancel', 350, 250));
      expect(currentPosition.value).toEqual({ x: 500, y: 300 });
    });

    it('is safe after a completed drag session', () => {
      const { startDrag, stopDrag, cleanup } = createPositioning(
        { x: 500, y: 300 },
        { enableDragging: true }
      );
      startDrag(mouseEvent('mousedown', 300, 200));
      stopDrag();
      expect(() => cleanup()).not.toThrow();
      expect(document.body.style.userSelect).toBe('');
    });

    it('stops responding to window resize after cleanup', async () => {
      const { currentPosition, cleanup } = createPositioning({ x: 500, y: 300 });
      cleanup();
      Object.defineProperty(window, 'innerWidth', { value: 500, configurable: true, writable: true });
      window.dispatchEvent(new Event('resize'));
      await new Promise((resolve) => setTimeout(resolve, 120));
      expect(currentPosition.value).toEqual({ x: 500, y: 300 });
    });
  });

  describe('dock behavior', () => {
    it('snaps to the left dock near the left edge', () => {
      const { currentDockMode, currentPosition, startDrag } = createPositioning(
        { x: 500, y: 300 },
        { enableDragging: true }
      );
      startDrag(mouseEvent('mousedown', 10, 200));
      dispatchOnDocument(mouseEvent('mousemove', 10, 200));
      expect(currentDockMode.value).toBe('left');
      expect(currentPosition.value).toEqual({ x: 0, y: 0 });
    });

    it('snaps to the right dock near the right edge', () => {
      const { currentDockMode, currentPosition, startDrag } = createPositioning(
        { x: 500, y: 300 },
        { enableDragging: true }
      );
      startDrag(mouseEvent('mousedown', 990, 200));
      dispatchOnDocument(mouseEvent('mousemove', 990, 200));
      expect(currentDockMode.value).toBe('right');
      expect(currentPosition.value).toEqual({ x: VIEW_W - 350, y: 0 });
    });

    it('breaks away from the dock when the pointer moves inward', () => {
      const { currentDockMode, currentPosition, startDrag } = createPositioning(
        { x: 0, y: 0 },
        { enableDragging: true, dockMode: 'left', dockedWidth: 350 }
      );
      startDrag(mouseEvent('mousedown', 200, 200));
      dispatchOnDocument(mouseEvent('mousemove', 400, 200));
      expect(currentDockMode.value).toBe('none');
      expect(currentPosition.value.x).toBeGreaterThan(100);
    });
  });
});
