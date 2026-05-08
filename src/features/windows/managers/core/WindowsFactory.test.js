import { describe, it, expect, vi, beforeEach } from 'vitest';
import { WindowsFactory } from './WindowsFactory.js';
import { WindowsConfig } from './WindowsConfig.js';
import browser from 'webextension-polyfill';

// Mock the webextension-polyfill
vi.mock('webextension-polyfill', () => ({
  default: {
    runtime: {
      getURL: vi.fn((path) => `chrome-extension://mock-id/${path}`)
    }
  }
}));

describe('WindowsFactory', () => {
  let factory;

  beforeEach(() => {
    factory = new WindowsFactory();
    vi.clearAllMocks();
    // Clear document body between tests
    document.body.innerHTML = '';
  });

  describe('Popup Structure', () => {
    it('should create a popup host with unique ID and ARIA dialog role', () => {
      const host = factory.createPopupHost('frame-1');
      expect(host.classList.contains(WindowsConfig.CSS_CLASSES.POPUP_HOST)).toBe(true);
      expect(host.id).toMatch(/translate-window-frame-1-\d+/);
      expect(host.getAttribute('role')).toBe('dialog');
      expect(host.getAttribute('aria-label')).toBe('Translation Window');
    });

    it('should create a popup container with shadow root and document role', () => {
      const host = document.createElement('div');
      const { shadowRoot, container } = factory.createPopupContainer(host);
      
      expect(shadowRoot).toBeDefined();
      expect(host.shadowRoot).toBe(shadowRoot);
      expect(container.classList.contains(WindowsConfig.CSS_CLASSES.POPUP_CONTAINER)).toBe(true);
      expect(container.getAttribute('role')).toBe('document');
      expect(shadowRoot.querySelector('style')).toBeDefined();
    });

    it('should create loading dots with ARIA status role', () => {
      const dots = factory.createLoadingDots();
      expect(dots.getAttribute('role')).toBe('status');
      expect(dots.getAttribute('aria-live')).toBe('polite');
      expect(dots.querySelectorAll(`.${WindowsConfig.CSS_CLASSES.LOADING_DOT}`).length).toBe(3);
    });
  });

  describe('Icon Creation and Error Handling', () => {
    it('should create a translate icon with button role and tabindex', () => {
      const icon = factory.createTranslateIcon();
      expect(icon.getAttribute('role')).toBe('button');
      expect(icon.getAttribute('tabindex')).toBe('0');
      expect(icon.id).toBe(WindowsConfig.IDS.ICON);
      expect(icon.style.position).toBe('fixed');
    });

    it('should throw error when extension context is invalidated during icon creation', () => {
      browser.runtime.getURL.mockImplementationOnce(() => {
        throw new Error('Extension context invalidated');
      });

      expect(() => factory.createTranslateIcon()).toThrow('Extension context invalidated.');
    });

    it('should create an icon host and append to body if not exists', () => {
      const host = factory.createIconHost();
      expect(document.getElementById(WindowsConfig.IDS.ICON_HOST)).toBe(host);
      expect(document.body.contains(host)).toBe(true);
    });

    it('should create TTS icon with button role and labels', () => {
      const title = 'Play Audio';
      const icon = factory.createTTSIcon(title);
      expect(icon.getAttribute('role')).toBe('button');
      expect(icon.getAttribute('tabindex')).toBe('0');
      expect(icon.getAttribute('aria-label')).toBe(title);
      expect(icon.tagName).toBe('IMG');
      expect(icon.title).toBe(title);
    });

    it('should throw error when extension context is invalidated during TTS icon creation', () => {
      browser.runtime.getURL.mockImplementationOnce(() => {
        throw new Error('Extension context invalidated');
      });

      expect(() => factory.createTTSIcon('Speak')).toThrow('Extension context invalidated.');
    });
  });

  describe('UI Component Utilities', () => {
    it('should create header (first line) and content (second line) elements', () => {
      const firstLine = factory.createFirstLine();
      const secondLine = factory.createSecondLine();
      
      expect(firstLine.classList.contains(WindowsConfig.CSS_CLASSES.FIRST_LINE)).toBe(true);
      expect(secondLine.classList.contains(WindowsConfig.CSS_CLASSES.SECOND_LINE)).toBe(true);
    });

    it('should create a functional close button with ARIA button role', () => {
      const closeBtn = factory.createCloseButton();
      expect(closeBtn.getAttribute('role')).toBe('button');
      expect(closeBtn.getAttribute('tabindex')).toBe('0');
      expect(closeBtn.getAttribute('aria-label')).toBe('Close translation');
      expect(closeBtn.textContent).toBe('✕');
    });

    it('should create an original text span with correct text', () => {
      const text = 'Original text content';
      const span = factory.createOriginalTextSpan(text);
      expect(span.textContent).toBe(text);
      expect(span.classList.contains(WindowsConfig.CSS_CLASSES.ORIGINAL_TEXT)).toBe(true);
    });

    it('should create an error element with provided message', () => {
      const msg = 'Something went wrong';
      const error = factory.createErrorElement(msg);
      expect(error.textContent).toBe(msg);
      expect(error.style.color).toBe('var(--sw-text-color)');
    });
  });
});
