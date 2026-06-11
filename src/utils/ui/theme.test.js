import { describe, it, expect, beforeEach } from 'vitest';
import { applyTheme } from './theme.js';

describe('theme utility applyTheme', () => {
  beforeEach(() => {
    document.documentElement.className = '';
  });

  it('verify ContentApp does not remove theme-light or theme-dark from HTML root when targeting a specific element', () => {
    const root = document.documentElement;
    root.className = 'theme-dark argo-theme-dark some-other-class';
    
    const dummyHost = document.createElement('div');
    applyTheme('light', dummyHost);
    
    // document.documentElement should remain completely untouched
    expect(root.className).toBe('theme-dark argo-theme-dark some-other-class');
    // dummyHost should have received the theme
    expect(dummyHost.classList.contains('theme-light')).toBe(true);
  });

  it('verify applyTheme target defaults to document.documentElement and works correctly', () => {
    const root = document.documentElement;
    
    applyTheme('dark');
    expect(root.classList.contains('theme-dark')).toBe(true);
    expect(root.classList.contains('theme-light')).toBe(false);
    
    applyTheme('light');
    expect(root.classList.contains('theme-light')).toBe(true);
    expect(root.classList.contains('theme-dark')).toBe(false);
  });
});
