import { describe, it, expect, vi, beforeEach } from 'vitest';
import { 
  isRTL, 
  stripBiDiMarks, 
  applyNodeDirection, 
  applyElementDirection,
  restoreElementDirection
} from './DomDirectionManager.js';
import { LanguageDetectionService } from '@/shared/services/LanguageDetectionService.js';

// Mock LanguageDetectionService
vi.mock('@/shared/services/LanguageDetectionService.js', () => ({
  LanguageDetectionService: {
    isRTL: vi.fn(),
    getDirection: vi.fn()
  }
}));

describe('DomDirectionManager', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    document.body.innerHTML = '';
  });

  describe('isRTL', () => {
    it('should call LanguageDetectionService.isRTL', () => {
      LanguageDetectionService.isRTL.mockReturnValue(true);
      expect(isRTL('fa')).toBe(true);
      expect(LanguageDetectionService.isRTL).toHaveBeenCalledWith('fa');
    });
  });

  describe('stripBiDiMarks', () => {
    it('should remove RLM and LRM marks', () => {
      const text = '\u200FPersian\u200E English';
      expect(stripBiDiMarks(text)).toBe('Persian English');
    });
  });

  describe('Alignment Preservation', () => {
    it('should NOT change text-align: center when applying RTL', () => {
      const div = document.createElement('div');
      div.style.textAlign = 'center';
      div.appendChild(document.createTextNode('Translated text'));
      document.body.appendChild(div);
      const textNode = div.firstChild;

      LanguageDetectionService.isRTL.mockReturnValue(true); 
      LanguageDetectionService.getDirection.mockReturnValue('rtl');

      applyNodeDirection(textNode, 'fa');

      expect(div.style.direction).toBe('rtl');
      expect(div.style.textAlign).toBe('center'); 
    });

    it('should NOT change text-align: justify when applying RTL', () => {
      const div = document.createElement('div');
      div.style.textAlign = 'justify';
      div.appendChild(document.createTextNode('Some long justified text'));
      document.body.appendChild(div);
      
      LanguageDetectionService.isRTL.mockReturnValue(true);
      LanguageDetectionService.getDirection.mockReturnValue('rtl');

      applyElementDirection(div, 'fa');

      expect(div.style.textAlign).toBe('justify');
    });

    it('should change default alignment to right for RTL block elements when no inline style exists', () => {
      const p = document.createElement('p'); 
      p.appendChild(document.createTextNode('Text'));
      document.body.appendChild(p);
      
      LanguageDetectionService.isRTL.mockReturnValue(true);
      LanguageDetectionService.getDirection.mockReturnValue('rtl');

      applyElementDirection(p, 'fa');

      expect(p.style.textAlign).toBe('right');
    });
  });

  describe('Layout Barriers', () => {
    it('should stop direction application at layout barriers', () => {
      const nav = document.createElement('nav'); 
      const wrapper = document.createElement('div');
      const textSpan = document.createElement('span');
      textSpan.appendChild(document.createTextNode('Hello'));
      
      wrapper.appendChild(textSpan);
      nav.appendChild(wrapper);
      document.body.appendChild(nav);

      LanguageDetectionService.isRTL.mockReturnValue(true);
      LanguageDetectionService.getDirection.mockReturnValue('rtl');

      applyNodeDirection(textSpan.firstChild, 'fa');

      expect(textSpan.style.direction).toBe('rtl');
      expect(wrapper.style.direction).toBe('rtl');
      expect(nav.style.direction).toBe('');
    });
  });

  describe('Restoration', () => {
    it('should perfectly restore original styles', () => {
      const div = document.createElement('div');
      // Use classes or defaults instead of inline if we want to test automatic alignment change
      div.innerText = 'Original';
      document.body.appendChild(div);

      LanguageDetectionService.isRTL.mockReturnValue(true);
      LanguageDetectionService.getDirection.mockReturnValue('rtl');

      applyElementDirection(div, 'fa');
      expect(div.style.direction).toBe('rtl');
      expect(div.style.textAlign).toBe('right');

      restoreElementDirection(div);
      expect(div.style.direction).toBe('');
      expect(div.style.textAlign).toBe('');
    });

    it('should remove properties if they were not present initially', () => {
      const div = document.createElement('div');
      div.innerText = 'No initial style';
      document.body.appendChild(div);

      applyElementDirection(div, 'fa');
      restoreElementDirection(div);

      expect(div.style.direction).toBe('');
      expect(div.style.textAlign).toBe('');
      expect(div.getAttribute('dir')).toBeNull();
    });

    it('should restore original dir attribute', () => {
      const div = document.createElement('div');
      div.setAttribute('dir', 'ltr');
      document.body.appendChild(div);

      applyElementDirection(div, 'fa');
      expect(div.style.direction).toBe('rtl');
      
      restoreElementDirection(div);
      expect(div.getAttribute('dir')).toBe('ltr');
    });
  });

  describe('Edge Cases & Advanced Logic', () => {
    it('should apply unicode-bidi: isolate for directional isolation', () => {
      const div = document.createElement('div');
      div.innerText = 'Isolated text';
      document.body.appendChild(div);

      applyElementDirection(div, 'fa');
      expect(div.style.unicodeBidi).toBe('isolate');
    });

    it('should apply max-width: 100% to block elements to prevent layout break', () => {
      const div = document.createElement('div'); // Block by default
      div.innerText = 'Long text...';
      document.body.appendChild(div);

      applyElementDirection(div, 'fa');
      expect(div.style.maxWidth).toBe('100%');
    });

    it('should respect rootElement surgical stop', () => {
      const root = document.createElement('div');
      const inner = document.createElement('div');
      const span = document.createElement('span');
      span.appendChild(document.createTextNode('Text'));
      
      inner.appendChild(span);
      root.appendChild(inner);
      document.body.appendChild(root);

      LanguageDetectionService.isRTL.mockReturnValue(true);
      LanguageDetectionService.getDirection.mockReturnValue('rtl');

      // Set root as the stop point
      applyNodeDirection(span.firstChild, 'fa', root);

      expect(span.style.direction).toBe('rtl');
      expect(inner.style.direction).toBe('rtl');
      expect(root.style.direction).toBe('rtl');
      
      // Document body should NOT be affected because we stopped at root
      expect(document.body.style.direction).toBe('');
    });

    it('should handle complex layout barriers (ARIA roles)', () => {
      const section = document.createElement('section');
      section.setAttribute('role', 'navigation'); // Barrier
      const div = document.createElement('div');
      const span = document.createElement('span');
      span.appendChild(document.createTextNode('Nav Item'));
      
      div.appendChild(span);
      section.appendChild(div);
      document.body.appendChild(section);

      applyNodeDirection(span.firstChild, 'fa');

      expect(span.style.direction).toBe('rtl');
      expect(div.style.direction).toBe('rtl');
      expect(section.style.direction).toBe(''); // Barrier respected
    });

    it('should identify Flex containers as layout barriers', () => {
      const flexContainer = document.createElement('div');
      flexContainer.style.display = 'flex'; // Barrier
      const item = document.createElement('div');
      const text = document.createTextNode('Flex Item');
      
      item.appendChild(text);
      flexContainer.appendChild(item);
      document.body.appendChild(flexContainer);

      applyNodeDirection(text, 'fa');

      expect(item.style.direction).toBe('rtl');
      expect(flexContainer.style.direction).toBe(''); // Barrier respected
    });

    it('should handle explicit dir attribute update', () => {
      const div = document.createElement('div');
      div.setAttribute('dir', 'ltr');
      div.appendChild(document.createTextNode('Text'));
      document.body.appendChild(div);

      LanguageDetectionService.isRTL.mockReturnValue(true);
      LanguageDetectionService.getDirection.mockReturnValue('rtl');

      applyNodeDirection(div.firstChild, 'fa');
      
      // Note: The implementation currently uses style.direction, not always attribute dir
      expect(div.style.direction).toBe('rtl');
      expect(div.getAttribute('data-translate-dir')).toBe('rtl');
    });
  });
});
