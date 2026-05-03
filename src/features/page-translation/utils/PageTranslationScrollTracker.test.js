import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { PageTranslationScrollTracker } from './PageTranslationScrollTracker.js';

vi.mock('@/shared/logging/logger.js', () => ({
  getScopedLogger: vi.fn(() => ({
    debug: vi.fn(),
    error: vi.fn()
  }))
}));

describe('PageTranslationScrollTracker', () => {
  let tracker;
  let startCallback;
  let stopCallback;

  beforeEach(() => {
    vi.useFakeTimers();
    startCallback = vi.fn();
    stopCallback = vi.fn();
    tracker = new PageTranslationScrollTracker(stopCallback, startCallback);
  });

  afterEach(() => {
    tracker.destroy();
    vi.useRealTimers();
  });

  it('should start and stop listening for scroll events', () => {
    const addSpy = vi.spyOn(window, 'addEventListener');
    const removeSpy = vi.spyOn(window, 'removeEventListener');

    tracker.start(500);
    expect(addSpy).toHaveBeenCalledWith('scroll', expect.any(Function), expect.any(Object));

    tracker.stop();
    expect(removeSpy).toHaveBeenCalledWith('scroll', expect.any(Function));
  });

  it('should trigger callbacks on scroll and debounce stop', () => {
    tracker.start(500);

    // Simulate scroll event
    window.dispatchEvent(new Event('scroll'));
    expect(startCallback).toHaveBeenCalled();
    expect(stopCallback).not.toHaveBeenCalled();

    // Advance time slightly
    vi.advanceTimersByTime(250);
    window.dispatchEvent(new Event('scroll')); // Reset timer
    
    vi.advanceTimersByTime(250);
    expect(stopCallback).not.toHaveBeenCalled(); // 250+250 = 500 but second scroll reset it

    vi.advanceTimersByTime(250);
    expect(stopCallback).toHaveBeenCalled();
  });

  it('should handle notifyActivity', () => {
    tracker.start(500);
    tracker.notifyActivity();
    
    expect(startCallback).toHaveBeenCalled();
    vi.advanceTimersByTime(500);
    expect(stopCallback).toHaveBeenCalled();
  });

  it('should throttle notifyActivity', () => {
    tracker.start(500);
    const resetSpy = vi.spyOn(tracker, '_resetTimer');
    
    tracker.notifyActivity();
    tracker.notifyActivity(); // Should be throttled (< 50ms)
    
    expect(resetSpy).toHaveBeenCalledTimes(1);
  });
});
