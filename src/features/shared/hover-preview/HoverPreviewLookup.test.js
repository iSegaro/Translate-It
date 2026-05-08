import { describe, it, expect, beforeEach } from 'vitest';
import { HoverPreviewLookup } from './HoverPreviewLookup.js';

describe('HoverPreviewLookup', () => {
  let lookup;

  beforeEach(() => {
    lookup = new HoverPreviewLookup();
  });

  it('should store and retrieve original text for a node', () => {
    const node = document.createTextNode('translated');
    const originalText = 'original';
    
    lookup.add(node, originalText);
    expect(lookup.get(node)).toBe(originalText);
  });

  it('should return undefined for non-existent nodes', () => {
    const node = document.createTextNode('test');
    expect(lookup.get(node)).toBeUndefined();
  });

  it('should handle invalid inputs gracefully', () => {
    const node = document.createTextNode('test');
    
    lookup.add(null, 'text');
    lookup.add(node, null);
    lookup.add(node, '');
    
    expect(lookup.get(node)).toBeUndefined();
    expect(lookup.get(null)).toBeNull();
  });

  it('should clear all entries', () => {
    const node = document.createTextNode('test');
    lookup.add(node, 'original');
    
    lookup.clear();
    expect(lookup.get(node)).toBeUndefined();
  });

  it('should support Attribute nodes', () => {
    const el = document.createElement('div');
    el.setAttribute('title', 'translated title');
    const attr = el.getAttributeNode('title');
    
    lookup.add(attr, 'original title');
    expect(lookup.get(attr)).toBe('original title');
  });
});
