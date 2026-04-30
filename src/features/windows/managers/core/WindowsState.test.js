import { describe, it, expect, vi, beforeEach } from 'vitest';
import { WindowsState } from './WindowsState.js';

// Mock logger
vi.mock('@/shared/logging/logger.js', () => ({
  getScopedLogger: vi.fn(() => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  }))
}));

describe('WindowsState', () => {
  let state;
  const frameId = 'test-frame-123';

  beforeEach(() => {
    vi.clearAllMocks();
    state = new WindowsState(frameId);
  });

  it('should initialize with correct default values', () => {
    expect(state.frameId).toBe(frameId);
    expect(state.isVisible).toBe(false);
    expect(state.isIconMode).toBe(false);
    expect(state.pendingTranslationWindow).toBe(false);
    expect(state.isTranslationCancelled).toBe(false);
    expect(state.originalText).toBe(null);
    expect(state.provider).toBe(null);
  });

  it('should reset to initial state', () => {
    state.setVisible(true);
    state.setIconMode(true);
    state.setOriginalText('hello');
    state.setProvider('bing');
    
    state.reset();
    
    expect(state.isVisible).toBe(false);
    expect(state.isIconMode).toBe(false);
    expect(state.originalText).toBe(null);
    expect(state.provider).toBe(null);
  });

  it('should update visibility and log changes', () => {
    state.setVisible(true);
    expect(state.isVisible).toBe(true);
    
    state.setVisible(false);
    expect(state.isVisible).toBe(false);
  });

  it('should update icon mode', () => {
    state.setIconMode(true);
    expect(state.isIconMode).toBe(true);
  });

  it('should manage translation cancellation', () => {
    state.setTranslationCancelled(true);
    expect(state.isTranslationCancelled).toBe(true);
  });

  it('should manage dragging state', () => {
    const offset = { x: 10, y: 20 };
    state.startDragging(offset);
    expect(state.isDragging).toBe(true);
    expect(state.dragOffset).toEqual(offset);
    
    state.stopDragging();
    expect(state.isDragging).toBe(false);
    expect(state.dragOffset).toEqual({ x: 0, y: 0 });
  });

  it('should compute canShowWindow correctly', () => {
    expect(state.canShowWindow).toBe(true);
    
    state.setTranslationCancelled(true);
    expect(state.canShowWindow).toBe(false);
    
    state.setTranslationCancelled(false);
    state.setPendingTranslationWindow(true);
    expect(state.canShowWindow).toBe(false);
  });

  it('should compute hasActiveElements correctly', () => {
    expect(state.hasActiveElements).toBe(false);
    
    state.setVisible(true);
    expect(state.hasActiveElements).toBe(true);
    
    state.setVisible(false);
    state.setIconMode(true);
    expect(state.hasActiveElements).toBe(true);
  });

  it('should validate state and identify issues', () => {
    // Both visible and icon mode is an issue
    state.setVisible(true);
    state.setIconMode(true);
    expect(state.validateState()).toBe(false);
    
    state.reset();
    // Dragging when not visible is an issue
    state.startDragging({ x: 0, y: 0 });
    expect(state.validateState()).toBe(false);
    
    state.reset();
    expect(state.validateState()).toBe(true);
  });

  it('should provide a snapshot of current state', () => {
    state.setVisible(true);
    state.setOriginalText('test');
    
    const snapshot = state.getSnapshot();
    expect(snapshot.isVisible).toBe(true);
    expect(snapshot.hasOriginalText).toBe(true);
    expect(snapshot.frameId).toBe(frameId);
  });
});
