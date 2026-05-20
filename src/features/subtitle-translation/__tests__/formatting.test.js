import { describe, it, expect } from 'vitest';
import { SubtitleTextProtector } from '../formatting/SubtitleTextProtector.js';

describe('SubtitleTextProtector', () => {
  const protector = new SubtitleTextProtector();

  it('should protect and restore HTML tags', () => {
    const text = 'Hello <i>World</i> and <b>Friends</b>';
    const { text: protectedText, tokens } = protector.protect(text);
    
    expect(protectedText).toContain('[[SUB_TAG_');
    expect(tokens.size).toBe(4);
    
    const restored = protector.restore(protectedText, tokens);
    expect(restored).toBe(text);
  });

  it('should protect and restore SRT style tags', () => {
    const text = '{\\an8}Top centered text';
    const { text: protectedText, tokens } = protector.protect(text);
    
    expect(protectedText).toContain('[[SUB_STY_');
    expect(tokens.size).toBe(1);
    expect(tokens.get('[[SUB_STY_0]]')).toBe('{\\an8}');
    
    const restored = protector.restore(protectedText, tokens);
    expect(restored).toBe(text);
  });

  it('should protect and restore internal newlines', () => {
    const text = 'Line 1\nLine 2';
    const { text: protectedText, tokens } = protector.protect(text);
    
    expect(protectedText).toContain('[[SUB_NL_');
    expect(tokens.size).toBe(1);
    
    const restored = protector.restore(protectedText, tokens);
    expect(restored).toBe(text);
  });

  it('should handle multiple tag types together', () => {
    const text = '{\\an8}<i>Italic</i>\nNext line';
    const { text: protectedText, tokens } = protector.protect(text);
    
    expect(tokens.size).toBe(4); // 1 STY, 2 TAG, 1 NL
    
    const restored = protector.restore(protectedText, tokens);
    expect(restored).toBe(text);
  });

  it('should handle complex SRT tags', () => {
    const text = '{\\pos(10,20)}Positioned text';
    const { text: protectedText, tokens } = protector.protect(text);
    
    expect(tokens.get('[[SUB_STY_0]]')).toBe('{\\pos(10,20)}');
    
    const restored = protector.restore(protectedText, tokens);
    expect(restored).toBe(text);
  });
});
