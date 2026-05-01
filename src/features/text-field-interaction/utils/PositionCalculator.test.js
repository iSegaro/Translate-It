import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PositionCalculator } from './PositionCalculator.js';

// Mock logger
vi.mock('@/shared/logging/logger.js', () => ({
  getScopedLogger: vi.fn(() => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  }))
}));

describe('PositionCalculator', () => {
  const mockIconSize = { width: 28, height: 28 };
  
  beforeEach(() => {
    vi.clearAllMocks();
    
    // Mock viewport
    vi.stubGlobal('innerWidth', 1024);
    vi.stubGlobal('innerHeight', 768);
    vi.stubGlobal('pageXOffset', 0);
    vi.stubGlobal('pageYOffset', 0);
  });

  describe('calculateOptimalPosition', () => {
    it('should calculate top-right for a single-line input in center of screen', () => {
      const el = document.createElement('input');
      // Mock getBoundingClientRect
      el.getBoundingClientRect = vi.fn(() => ({
        top: 300,
        left: 400,
        bottom: 330,
        right: 600,
        width: 200,
        height: 30,
        x: 400,
        y: 300
      }));

      const result = PositionCalculator.calculateOptimalPosition(el, mockIconSize);

      // Default for single-line is top-right (rect.top - icon.height - margin, rect.right - icon.width)
      // Margin is 4, Icon height is 28.
      // Top: 300 - 28 - 4 = 268
      // Left: 600 - 28 = 572
      expect(result.top).toBe(268);
      expect(result.left).toBe(572);
      expect(result.placement).toBe('top-right');
    });

    it('should calculate inside-bottom-right for a textarea (multiline)', () => {
      const el = document.createElement('textarea');
      el.getBoundingClientRect = vi.fn(() => ({
        top: 300,
        left: 400,
        bottom: 500,
        right: 600,
        width: 200,
        height: 200,
        x: 400,
        y: 300
      }));

      const result = PositionCalculator.calculateOptimalPosition(el, mockIconSize);

      // Default for multiline is inside-bottom-right (rect.bottom - icon.height - margin, rect.right - icon.width - margin)
      // Bottom: 500 - 28 - 4 = 468
      // Right: 600 - 28 - 4 = 568
      expect(result.top).toBe(468);
      expect(result.left).toBe(568);
      expect(result.placement).toBe('inside-bottom-right');
    });

    it('should handle edge of viewport (bottom-right corner)', () => {
      const el = document.createElement('input');
      // Positioned near bottom-right of viewport (1024x768)
      el.getBoundingClientRect = vi.fn(() => ({
        top: 700,
        left: 900,
        bottom: 730,
        right: 1000,
        width: 100,
        height: 30,
        x: 900,
        y: 700
      }));

      const result = PositionCalculator.calculateOptimalPosition(el, mockIconSize);

      // Top-right would be: 700 - 28 - 4 = 668 (Valid)
      // Left: 1000 - 28 = 972. 972 + 28 = 1000 (Within 1024 - 8 margin = 1016)
      // So top-right is still valid.
      expect(result.placement).toBe('top-right');
    });

    it('should use fallback if no optimal position found', () => {
      const el = document.createElement('input');
      // Element covers the whole viewport
      el.getBoundingClientRect = vi.fn(() => ({
        top: 0,
        left: 0,
        bottom: 768,
        right: 1024,
        width: 1024,
        height: 768,
        x: 0,
        y: 0
      }));

      const result = PositionCalculator.calculateOptimalPosition(el, mockIconSize);
      expect(result.isFallback).toBe(true);
    });
  });

  describe('isMultilineElement', () => {
    it('should return true for textarea', () => {
      const el = document.createElement('textarea');
      expect(PositionCalculator.isMultilineElement(el)).toBe(true);
    });

    it('should return true for contenteditable', () => {
      const el = document.createElement('div');
      el.setAttribute('contenteditable', 'true');
      expect(PositionCalculator.isMultilineElement(el)).toBe(true);
    });

    it('should return true for tall input', () => {
      const el = document.createElement('input');
      el.getBoundingClientRect = vi.fn(() => ({ height: 50 }));
      expect(PositionCalculator.isMultilineElement(el)).toBe(true);
    });

    it('should return false for standard input', () => {
      const el = document.createElement('input');
      el.getBoundingClientRect = vi.fn(() => ({ height: 25 }));
      expect(PositionCalculator.isMultilineElement(el)).toBe(false);
    });
  });

  describe('convertToAbsolutePosition', () => {
    it('should add scroll offsets', () => {
      const position = { top: 100, left: 100 };
      const viewport = { scrollX: 50, scrollY: 200 };
      
      PositionCalculator.convertToAbsolutePosition(position, viewport);
      
      expect(position.top).toBe(300);
      expect(position.left).toBe(150);
    });
  });
});
