import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TextFieldDetector, FieldTypes } from './TextFieldDetector.js';

// Mock logger
vi.mock('@/shared/logging/logger.js', () => ({
  getScopedLogger: vi.fn(() => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    trace: vi.fn()
  }))
}));

describe('TextFieldDetector', () => {
  let detector;

  beforeEach(() => {
    vi.clearAllMocks();
    detector = new TextFieldDetector();
  });

  describe('Field Classification', () => {
    it('should classify textarea as TEXT_AREA', async () => {
      const el = document.createElement('textarea');
      const result = await detector.detect(el);
      expect(result.fieldType).toBe(FieldTypes.TEXT_AREA);
    });

    it('should classify text input as TEXT_INPUT', async () => {
      const el = document.createElement('input');
      el.type = 'text';
      const result = await detector.detect(el);
      expect(result.fieldType).toBe(FieldTypes.TEXT_INPUT);
    });

    it('should classify search input as NON_EDITABLE (excluded type)', async () => {
      const el = document.createElement('input');
      el.type = 'search';
      const result = await detector.detect(el);
      expect(result.fieldType).toBe(FieldTypes.NON_EDITABLE);
    });

    it('should classify contenteditable as CONTENT_EDITABLE', async () => {
      const el = document.createElement('div');
      el.contentEditable = 'true';
      const result = await detector.detect(el);
      expect(result.fieldType).toBe(FieldTypes.CONTENT_EDITABLE);
    });

    it('should classify rich editor patterns as RICH_TEXT_EDITOR when containing block elements', async () => {
      const el = document.createElement('div');
      el.contentEditable = 'true';
      el.innerHTML = '<p>test</p>';
      const result = await detector.detect(el);
      expect(result.fieldType).toBe(FieldTypes.RICH_TEXT_EDITOR);
    });

    it('should classify password input as NON_EDITABLE', async () => {
      const el = document.createElement('input');
      el.type = 'password';
      const result = await detector.detect(el);
      expect(result.fieldType).toBe(FieldTypes.NON_EDITABLE);
    });

    it('should NOT show icon for sensitive fields (whole word match)', async () => {
      const el = document.createElement('textarea');
      el.name = 'password';
      const result = await detector.detect(el);
      expect(result.shouldShowTextFieldIcon).toBe(false);
    });
  });

  describe('Icon Display Logic', () => {
    it('should show icon for textarea', async () => {
      const el = document.createElement('textarea');
      const result = await detector.detect(el);
      expect(result.shouldShowTextFieldIcon).toBe(true);
    });

    it('should show icon for multiline contenteditable', async () => {
      const el = document.createElement('div');
      el.contentEditable = 'true';
      // Mock clientHeight for multiline detection
      Object.defineProperty(el, 'clientHeight', { value: 100 });
      
      const result = await detector.detect(el);
      expect(result.shouldShowTextFieldIcon).toBe(true);
    });

    it('should NOT show icon for single-line input by default (non-chat)', async () => {
      const el = document.createElement('input');
      el.type = 'text';
      const result = await detector.detect(el);
      expect(result.shouldShowTextFieldIcon).toBe(false);
    });

    it('should show icon for single-line input in chat context', async () => {
      const container = document.createElement('div');
      container.className = 'chat-container';
      const el = document.createElement('input');
      el.type = 'text';
      container.appendChild(el);
      document.body.appendChild(container);

      const result = await detector.detect(el);
      expect(result.shouldShowTextFieldIcon).toBe(true);

      document.body.removeChild(container);
    });

    it('should NOT show icon for sensitive fields', async () => {
      const el = document.createElement('textarea');
      el.name = 'password';
      const result = await detector.detect(el);
      expect(result.shouldShowTextFieldIcon).toBe(false);
    });

    it('should NOT show icon for search fields', async () => {
      const el = document.createElement('textarea');
      el.id = 'search-box';
      const result = await detector.detect(el);
      expect(result.shouldShowTextFieldIcon).toBe(false);
    });

    it('should NOT show icon for CodeMirror editors', async () => {
      const el = document.createElement('div');
      el.contentEditable = 'true';
      el.className = 'CodeMirror-line';
      const result = await detector.detect(el);
      expect(result.shouldShowTextFieldIcon).toBe(false);
    });
  });

  describe('Special Cases', () => {
    it('should handle null element gracefully', async () => {
      const result = await detector.detect(null);
      expect(result.fieldType).toBe(FieldTypes.UNKNOWN);
      expect(result.shouldShowTextFieldIcon).toBe(false);
    });

    it('should identify auth fields correctly', async () => {
      const el = document.createElement('input');
      el.name = 'username';
      const result = await detector.detect(el);
      expect(result.isAuthField).toBe(true);
    });

    it('should identify rich editors correctly', async () => {
      const el = document.createElement('div');
      el.className = 'ql-editor'; // Quill editor
      const result = await detector.detect(el);
      expect(result.isRichEditor).toBe(true);
    });
  });
});
