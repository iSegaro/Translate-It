import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TranslationRenderer } from './TranslationRenderer.js';
import { TranslationMode, CONFIG } from '@/shared/config/config.js';
import { SimpleMarkdown } from '@/shared/utils/text/markdown.js';

// Mock webextension-polyfill
vi.mock('webextension-polyfill', () => ({
  default: {
    runtime: {
      getURL: vi.fn((path) => `chrome-extension://mock-id/${path}`)
    },
    storage: {
      local: {
        get: vi.fn().mockResolvedValue({}),
        set: vi.fn().mockResolvedValue({})
      },
      onChanged: {
        addListener: vi.fn()
      }
    }
  }
}));

// Mock other dependencies
vi.mock('@/shared/managers/SettingsManager.js', () => ({
  settingsManager: {
    get: vi.fn(() => 'en')
  }
}));

vi.mock('@/shared/utils/text/markdown.js', () => ({
  SimpleMarkdown: {
    getCleanTranslation: vi.fn((t) => t)
  }
}));

describe('TranslationRenderer', () => {
  let renderer;
  let mockFactory;
  let mockTtsManager;
  let container;

  beforeEach(() => {
    mockFactory = {
      createFirstLine: vi.fn(() => document.createElement('div')),
      createSecondLine: vi.fn(() => document.createElement('div')),
      createDragHandle: vi.fn(() => document.createElement('div')),
      createCloseButton: vi.fn(() => document.createElement('span')),
      createCopyIcon: vi.fn(() => document.createElement('img')),
      createOriginalTextSpan: vi.fn((text) => {
        const span = document.createElement('span');
        span.textContent = text;
        return span;
      }),
      createLoadingDots: vi.fn(() => document.createElement('div'))
    };

    mockTtsManager = {
      createTTSIcon: vi.fn(() => document.createElement('img'))
    };

    renderer = new TranslationRenderer(mockFactory, mockTtsManager);
    container = document.createElement('div');
    
    // Mock navigator.clipboard
    Object.assign(navigator, {
      clipboard: {
        writeText: vi.fn().mockResolvedValue(undefined)
      }
    });

    vi.clearAllMocks();
  });

  describe('renderTranslationContent', () => {
    it('should render both lines and append to container', () => {
      const result = renderer.renderTranslationContent(
        container, 
        'translated', 
        'original', 
        TranslationMode.Selection_Translation
      );

      expect(container.children.length).toBe(2);
      expect(mockFactory.createFirstLine).toHaveBeenCalled();
      expect(mockFactory.createSecondLine).toHaveBeenCalled();
      expect(result.firstLine).toBeDefined();
      expect(result.secondLine).toBeDefined();
    });

    it('should clear container before rendering', () => {
      container.innerHTML = '<span>Old Content</span>';
      renderer.renderTranslationContent(container, 'new', 'old', TranslationMode.Selection_Translation);
      expect(container.innerHTML).not.toContain('Old Content');
    });
  });

  describe('_createFirstLine', () => {
    it('should create header with all components', () => {
      renderer._createFirstLine('orig', 'trans', TranslationMode.Selection_Translation);
      
      expect(mockTtsManager.createTTSIcon).toHaveBeenCalled();
      expect(mockFactory.createCopyIcon).toHaveBeenCalled();
      expect(mockFactory.createDragHandle).toHaveBeenCalled();
      expect(mockFactory.createCloseButton).toHaveBeenCalled();
    });

    it('should include original text in dictionary mode', () => {
      renderer._createFirstLine('orig', 'trans', TranslationMode.Dictionary_Translation);
      expect(mockFactory.createOriginalTextSpan).toHaveBeenCalledWith('orig');
    });

    it('should call onClose when close button is clicked', () => {
      const onClose = vi.fn();
      const closeBtn = document.createElement('span');
      mockFactory.createCloseButton.mockReturnValue(closeBtn);
      
      renderer._createFirstLine('orig', 'trans', TranslationMode.Selection_Translation, onClose);
      
      closeBtn.click();
      expect(onClose).toHaveBeenCalled();
    });
  });

  describe('Copy functionality', () => {
    it('should copy text to clipboard on icon click', async () => {
      const copyIcon = document.createElement('img');
      mockFactory.createCopyIcon.mockReturnValue(copyIcon);
      
      renderer._createCopyIcon('text to copy');
      
      await copyIcon.dispatchEvent(new MouseEvent('click'));
      
      expect(SimpleMarkdown.getCleanTranslation).toHaveBeenCalledWith('text to copy');
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith('text to copy');
    });
  });

  describe('Text Direction', () => {
    it('should apply RTL direction for RTL text', () => {
      const element = document.createElement('div');
      renderer._applyTextDirection(element, 'سلام دنیا'); // Persian text
      
      expect(element.style.direction).toBe('rtl');
      expect(element.style.textAlign).toBe('right');
    });

    it('should apply LTR direction for LTR text', () => {
      const element = document.createElement('div');
      renderer._applyTextDirection(element, 'Hello World');
      
      expect(element.style.direction).toBe('ltr');
      expect(element.style.textAlign).toBe('left');
    });
  });

  describe('States (Error & Loading)', () => {
    it('should render error message with correct style', () => {
      renderer.renderError(container, 'Failed to translate');
      
      const errorDiv = container.querySelector('.error-text');
      expect(errorDiv.textContent).toBe('Failed to translate');
      expect(container.querySelector('.error-display-container')).toBeDefined();
    });

    it('should render loading state using factory', () => {
      renderer.renderLoading(container);
      expect(mockFactory.createLoadingDots).toHaveBeenCalled();
      expect(container.children.length).toBe(1);
    });
  });

  describe('Utility Methods', () => {
    it('updateContent should replace second line content', () => {
      const secondLine = document.createElement('div');
      secondLine.innerHTML = '<span>Old</span>';
      
      renderer.updateContent(secondLine, 'New Content');
      
      expect(secondLine.innerHTML).not.toContain('Old');
      expect(secondLine.textContent).toContain('New Content');
    });

    it('highlightContent should wrap text in mark tags', () => {
      const element = document.createElement('div');
      element.textContent = 'This is a test';
      
      renderer.highlightContent(element, 'test');
      
      expect(element.querySelector('mark')).toBeDefined();
      expect(element.querySelector('mark').textContent).toBe('test');
    });

    it('removeHighlighting should unwrap mark tags', () => {
      const element = document.createElement('div');
      element.innerHTML = 'This is a <mark>test</mark>';
      
      renderer.removeHighlighting(element);
      
      expect(element.querySelector('mark')).toBeNull();
      expect(element.textContent).toBe('This is a test');
    });
  });
});
