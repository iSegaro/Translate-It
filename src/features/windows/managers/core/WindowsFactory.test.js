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
    it('should create a popup host with unique ID', () => {
      const host = factory.createPopupHost('frame-1');
      expect(host.classList.contains(WindowsConfig.CSS_CLASSES.POPUP_HOST)).toBe(true);
      expect(host.id).toMatch(/translate-window-frame-1-\d+/);
    });

    it('should create a popup container with shadow root', () => {
      const host = document.createElement('div');
      const { shadowRoot, container } = factory.createPopupContainer(host);
      
      expect(shadowRoot).toBeDefined();
      expect(host.shadowRoot).toBe(shadowRoot);
      expect(container.classList.contains(WindowsConfig.CSS_CLASSES.POPUP_CONTAINER)).toBe(true);
      expect(shadowRoot.querySelector('style')).toBeDefined();
    });

    it('should create loading dots with 3 spans', () => {
      const dots = factory.createLoadingDots();
      expect(dots.classList.contains(WindowsConfig.CSS_CLASSES.LOADING_CONTAINER)).toBe(true);
      expect(dots.querySelectorAll(`.${WindowsConfig.CSS_CLASSES.LOADING_DOT}`).length).toBe(3);
    });
  });

  describe('Icon Creation and Error Handling', () => {
    it('should create a translate icon with correct fixed positioning', () => {
      const icon = factory.createTranslateIcon();
      expect(icon.id).toBe(WindowsConfig.IDS.ICON);
      expect(icon.style.position).toBe('fixed');
      expect(icon.style.width).toBe(`${WindowsConfig.POSITIONING.ICON_SIZE}px`);
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

    it('should create TTS icon with correct attributes', () => {
      const title = 'Play Audio';
      const icon = factory.createTTSIcon(title);
      expect(icon.tagName).toBe('IMG');
      expect(icon.title).toBe(title);
      expect(icon.classList.contains(WindowsConfig.CSS_CLASSES.TTS_ICON)).toBe(true);
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

    it('should create a functional close button', () => {
      const closeBtn = factory.createCloseButton();
      expect(closeBtn.textContent).toBe('✕');
      expect(closeBtn.style.cursor).toBe('pointer');
      expect(closeBtn.title).toBe('Close');
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
