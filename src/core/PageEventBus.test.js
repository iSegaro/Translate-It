import { describe, it, expect, vi, beforeEach } from 'vitest';
import { pageEventBus, WINDOWS_MANAGER_EVENTS, WindowsManagerEvents } from './PageEventBus.js';

// Mock logger
vi.mock('../shared/logging/logger.js', () => ({
  getScopedLogger: vi.fn(() => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  }))
}));

describe('PageEventBus', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Clear all listeners from the window to ensure test isolation
    // Since pageEventBus uses window as the bus
  });

  it('should subscribe to and emit events', () => {
    const callback = vi.fn();
    const eventName = 'test-event';
    const payload = { data: 'test-data' };

    pageEventBus.on(eventName, callback);
    pageEventBus.emit(eventName, payload);

    expect(callback).toHaveBeenCalledWith(payload);
  });

  it('should allow unsubscribing from events', () => {
    const callback = vi.fn();
    const eventName = 'test-event';

    const unsubscribe = pageEventBus.on(eventName, callback);
    unsubscribe();
    pageEventBus.emit(eventName, { data: 'test' });

    expect(callback).not.toHaveBeenCalled();
  });

  it('should allow unsubscribing using off()', () => {
    const callback = vi.fn();
    const eventName = 'test-event';

    pageEventBus.on(eventName, callback);
    pageEventBus.off(eventName, callback);
    pageEventBus.emit(eventName, { data: 'test' });

    expect(callback).not.toHaveBeenCalled();
  });

  it('should handle multiple listeners for the same event', () => {
    const callback1 = vi.fn();
    const callback2 = vi.fn();
    const eventName = 'test-event';

    pageEventBus.on(eventName, callback1);
    pageEventBus.on(eventName, callback2);
    pageEventBus.emit(eventName, { data: 'test' });

    expect(callback1).toHaveBeenCalled();
    expect(callback2).toHaveBeenCalled();
  });
});

describe('WindowsManagerEvents', () => {
  it('should emit SHOW_WINDOW event with correct payload', () => {
    const callback = vi.fn();
    pageEventBus.on(WINDOWS_MANAGER_EVENTS.SHOW_WINDOW, callback);

    const payload = { id: 'test-id', text: 'hello' };
    WindowsManagerEvents.showWindow(payload);

    expect(callback).toHaveBeenCalledWith(payload);
  });

  it('should emit UPDATE_WINDOW event with id in payload', () => {
    const callback = vi.fn();
    pageEventBus.on(WINDOWS_MANAGER_EVENTS.UPDATE_WINDOW, callback);

    const id = 'test-id';
    const detail = { translatedText: 'salam' };
    WindowsManagerEvents.updateWindow(id, detail);

    expect(callback).toHaveBeenCalledWith({ id, ...detail });
  });

  it('should emit DISMISS_WINDOW event', () => {
    const callback = vi.fn();
    pageEventBus.on(WINDOWS_MANAGER_EVENTS.DISMISS_WINDOW, callback);

    const id = 'test-id';
    WindowsManagerEvents.dismissWindow(id, false);

    expect(callback).toHaveBeenCalledWith({ id, withAnimation: false });
  });

  it('should emit DISMISS_ICON event', () => {
    const callback = vi.fn();
    pageEventBus.on(WINDOWS_MANAGER_EVENTS.DISMISS_ICON, callback);

    const id = 'test-id';
    WindowsManagerEvents.dismissIcon(id);

    expect(callback).toHaveBeenCalledWith({ id });
  });

  it('should emit ICON_CLICKED event', () => {
    const callback = vi.fn();
    pageEventBus.on(WINDOWS_MANAGER_EVENTS.ICON_CLICKED, callback);

    const payload = { id: 'test-id', x: 10, y: 20 };
    WindowsManagerEvents.iconClicked(payload);

    expect(callback).toHaveBeenCalledWith(payload);
  });
});
