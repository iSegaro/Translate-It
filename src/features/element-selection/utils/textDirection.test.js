import { describe, it, expect, vi, beforeEach } from 'vitest';
import { 
  isRTLLanguage, 
  getTextDirection, 
  applyContainerDirection, 
  restoreOriginalDirection,
  createDirectionAwareContainer,
  ElementDirectionUtils
} from './textDirection.js';
import { LanguageDetectionService } from '@/shared/services/LanguageDetectionService.js';

// Mock dependencies
vi.mock('@/shared/logging/logger.js', () => ({
  getScopedLogger: vi.fn(() => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  }))
}));

vi.mock('@/shared/services/LanguageDetectionService.js', () => ({
  LanguageDetectionService: {
    isRTL: vi.fn(),
    getDirection: vi.fn()
  }
}));

describe('textDirection utils', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('isRTLLanguage', () => {
    it('should call LanguageDetectionService.isRTL', () => {
      LanguageDetectionService.isRTL.mockReturnValue(true);
      expect(isRTLLanguage('fa')).toBe(true);
      expect(LanguageDetectionService.isRTL).toHaveBeenCalledWith('fa');
    });
  });

  describe('getTextDirection', () => {
    it('should call LanguageDetectionService.getDirection', () => {
      LanguageDetectionService.getDirection.mockReturnValue('rtl');
      expect(getTextDirection('fa', 'سلام')).toBe('rtl');
      expect(LanguageDetectionService.getDirection).toHaveBeenCalledWith('سلام', 'fa');
    });
  });

  describe('applyContainerDirection', () => {
    it('should apply direction attribute to element', () => {
      const el = document.createElement('div');
      LanguageDetectionService.getDirection.mockReturnValue('rtl');
      
      applyContainerDirection(el, 'fa', 'سلام');
      
      expect(el.dir).toBe('rtl');
    });

    it('should preserve original direction if requested', () => {
      const el = document.createElement('div');
      el.dir = 'ltr';
      LanguageDetectionService.getDirection.mockReturnValue('rtl');
      
      applyContainerDirection(el, 'fa', 'سلام', { preserveOriginal: true });
      
      expect(el.dir).toBe('rtl');
      expect(el.dataset.originalDirection).toBe('ltr');
    });
  });

  describe('restoreOriginalDirection', () => {
    it('should restore direction from dataset', () => {
      const el = document.createElement('div');
      el.dir = 'rtl';
      el.dataset.originalDirection = 'ltr';
      
      restoreOriginalDirection(el);
      
      expect(el.dir).toBe('ltr');
      expect(el.dataset.originalDirection).toBeUndefined();
    });

    it('should handle missing original direction gracefully', () => {
      const el = document.createElement('div');
      el.dir = 'rtl';
      
      restoreOriginalDirection(el);
      
      expect(el.dir).toBe('rtl');
    });
  });

  describe('createDirectionAwareContainer', () => {
    it('should create an element with correct direction', () => {
      LanguageDetectionService.getDirection.mockReturnValue('rtl');
      
      const container = createDirectionAwareContainer('fa', 'سلام', {
        tagName: 'span',
        className: 'test-class',
        id: 'test-id'
      });
      
      expect(container.tagName).toBe('SPAN');
      expect(container.className).toBe('test-class');
      expect(container.id).toBe('test-id');
      expect(container.dir).toBe('rtl');
    });
  });

  describe('ElementDirectionUtils', () => {
    it('should export all functions', () => {
      expect(ElementDirectionUtils.isRTLLanguage).toBe(isRTLLanguage);
      expect(ElementDirectionUtils.getDirection).toBe(getTextDirection);
    });
  });
});
