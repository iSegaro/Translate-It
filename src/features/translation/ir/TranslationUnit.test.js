import { describe, it, expect } from 'vitest';
import { TranslationUnit } from './TranslationUnit.js';

describe('TranslationUnit', () => {
  it('should successfully instantiate with all required and optional parameters', () => {
    const unit = new TranslationUnit({
      id: 'n1',
      blockId: 'g1',
      text: 'hello world',
      leadingWS: '  ',
      trailingWS: ' \n',
      preWhitespace: false,
      directionHint: 'ltr',
      inlineParentTags: ['b', 'i'],
      mode: 'standard'
    });

    expect(unit.id).toBe('n1');
    expect(unit.blockId).toBe('g1');
    expect(unit.text).toBe('hello world');
    expect(unit.leadingWS).toBe('  ');
    expect(unit.trailingWS).toBe(' \n');
    expect(unit.preWhitespace).toBe(false);
    expect(unit.directionHint).toBe('ltr');
    expect(unit.inlineParentTags).toEqual(['b', 'i']);
    expect(unit.mode).toBe('standard');
  });

  it('should apply correct defaults for optional fields', () => {
    const unit = new TranslationUnit({
      id: 'n2',
      blockId: 'g2',
      text: 'hello'
    });

    expect(unit.leadingWS).toBe('');
    expect(unit.trailingWS).toBe('');
    expect(unit.preWhitespace).toBe(false);
    expect(unit.directionHint).toBeNull();
    expect(unit.inlineParentTags).toEqual([]);
    expect(unit.mode).toBe('standard');
  });

  it('should throw an error if critical fields are missing or invalid', () => {
    expect(() => new TranslationUnit({ blockId: 'g1', text: 'hi' })).toThrow();
    expect(() => new TranslationUnit({ id: '', blockId: 'g1', text: 'hi' })).toThrow();
    expect(() => new TranslationUnit({ id: 'n1', text: 'hi' })).toThrow();
    expect(() => new TranslationUnit({ id: 'n1', blockId: '' })).toThrow();
    expect(() => new TranslationUnit({ id: 'n1', blockId: 'g1' })).toThrow();
  });

  it('should correctly serialize to a plain JSON object', () => {
    const unit = new TranslationUnit({
      id: 'n3',
      blockId: 'g3',
      text: 'test',
      leadingWS: ' ',
      trailingWS: ' ',
      preWhitespace: true,
      directionHint: 'rtl',
      inlineParentTags: ['span'],
      mode: 'V2_PASSTHROUGH'
    });

    const json = unit.toJSON();
    expect(json).toEqual({
      id: 'n3',
      blockId: 'g3',
      text: 'test',
      leadingWS: ' ',
      trailingWS: ' ',
      preWhitespace: true,
      directionHint: 'rtl',
      inlineParentTags: ['span'],
      mode: 'V2_PASSTHROUGH'
    });

    // Verify bidi tags are cloned and immutable from original changes
    unit.inlineParentTags.push('b');
    expect(json.inlineParentTags).toEqual(['span']);
  });
});
