import { describe, it, expect, vi, beforeEach } from 'vitest';
import { HoverTextDetector } from './HoverTextDetector.js';

// Mock logger
vi.mock('@/shared/logging/logger.js', () => ({
  getScopedLogger: vi.fn(() => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  }))
}));

describe('HoverTextDetector', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    vi.clearAllMocks();
    
    // Mock caretRangeFromPoint
    document.caretRangeFromPoint = vi.fn();
    
    // Mock Range.getBoundingClientRect
    if (!Range.prototype.getBoundingClientRect) {
      Range.prototype.getBoundingClientRect = vi.fn(() => ({
        top: 0,
        left: 0,
        bottom: 10,
        right: 100,
        width: 100,
        height: 10
      }));
    }
  });

  it('should return null if no range is found at point', () => {
    document.caretRangeFromPoint.mockReturnValue(null);
    const result = HoverTextDetector.detect(10, 10);
    expect(result).toBeNull();
  });

  it('should return null if node is not a text node', () => {
    const div = document.createElement('div');
    document.caretRangeFromPoint.mockReturnValue({
      startContainer: div,
      startOffset: 0
    });
    
    const result = HoverTextDetector.detect(10, 10);
    expect(result).toBeNull();
  });

  it('should detect a word correctly', () => {
    const p = document.createElement('p');
    const textNode = document.createTextNode('Hello world testing');
    p.appendChild(textNode);
    document.body.appendChild(p);

    // Mock caretRangeFromPoint to return the word "world"
    // "world" starts at index 6, ends at 11
    document.caretRangeFromPoint.mockReturnValue({
      startContainer: textNode,
      startOffset: 8 // Middle of "world"
    });

    // Mock getBoundingClientRect for the word range
    vi.spyOn(Range.prototype, 'getBoundingClientRect').mockReturnValue({
      top: 5,
      left: 5,
      bottom: 15,
      right: 15,
      width: 10,
      height: 10
    });

    const result = HoverTextDetector.detect(10, 10, 'word');
    
    expect(result).not.toBeNull();
    expect(result.text).toBe('world');
    expect(result.element).toBe(p);
  });

  it('should detect a sentence correctly', () => {
    const p = document.createElement('p');
    const textNode = document.createTextNode('First sentence. Second sentence! Third?');
    p.appendChild(textNode);
    document.body.appendChild(p);

    document.caretRangeFromPoint.mockReturnValue({
      startContainer: textNode,
      startOffset: 20 // Middle of "Second sentence"
    });

    vi.spyOn(Range.prototype, 'getBoundingClientRect').mockReturnValue({
      top: 5,
      left: 5,
      bottom: 15,
      right: 15,
      width: 10,
      height: 10
    });

    const result = HoverTextDetector.detect(10, 10, 'sentence');
    
    expect(result).not.toBeNull();
    expect(result.text).toBe('Second sentence');
  });

  it('should detect a container correctly', () => {
    const container = document.createElement('div');
    const p = document.createElement('p');
    const textNode = document.createTextNode('Some text inside a paragraph.');
    p.appendChild(textNode);
    container.appendChild(p);
    document.body.appendChild(container);

    document.caretRangeFromPoint.mockReturnValue({
      startContainer: textNode,
      startOffset: 5
    });

    // Mock element.getBoundingClientRect
    vi.spyOn(p, 'getBoundingClientRect').mockReturnValue({
      top: 5,
      left: 5,
      bottom: 15,
      right: 15,
      width: 10,
      height: 10
    });

    const result = HoverTextDetector.detect(10, 10, 'container');
    
    expect(result).not.toBeNull();
    expect(result.text).toBe('Some text inside a paragraph.');
    expect(result.element).toBe(p);
  });

  it('should fail hit-test if mouse is too far from text', () => {
    const p = document.createElement('p');
    const textNode = document.createTextNode('Testing hit test');
    p.appendChild(textNode);
    document.body.appendChild(p);

    document.caretRangeFromPoint.mockReturnValue({
      startContainer: textNode,
      startOffset: 5
    });

    // Text is at (100, 100)
    vi.spyOn(Range.prototype, 'getBoundingClientRect').mockReturnValue({
      top: 100,
      left: 100,
      bottom: 110,
      right: 200,
      width: 100,
      height: 10
    });

    // Mouse is at (50, 50) -> far away
    const result = HoverTextDetector.detect(50, 50, 'word');
    
    expect(result).toBeNull();
  });

  it('should pass hit-test if mouse is within tolerance', () => {
    const p = document.createElement('p');
    const textNode = document.createTextNode('Testing tolerance');
    p.appendChild(textNode);
    document.body.appendChild(p);

    document.caretRangeFromPoint.mockReturnValue({
      startContainer: textNode,
      startOffset: 5
    });

    // Text is at (100, 100)
    vi.spyOn(Range.prototype, 'getBoundingClientRect').mockReturnValue({
      top: 100,
      left: 100,
      bottom: 110,
      right: 200,
      width: 100,
      height: 10
    });

    // Mouse is at (97, 97) -> within 5px tolerance
    const result = HoverTextDetector.detect(97, 97, 'word');
    
    expect(result).not.toBeNull();
    expect(result.text).toBe('Testing');
  });
});
