import { describe, it, expect } from 'vitest';
import { ComplexityAnalyzer } from './ComplexityAnalyzer.js';

describe('ComplexityAnalyzer', () => {
  describe('calculateTextComplexity', () => {
    it('should return 0 for empty or non-string input', () => {
      expect(ComplexityAnalyzer.calculateTextComplexity('')).toBe(0);
      expect(ComplexityAnalyzer.calculateTextComplexity(null)).toBe(0);
      expect(ComplexityAnalyzer.calculateTextComplexity(undefined)).toBe(0);
      expect(ComplexityAnalyzer.calculateTextComplexity(123)).toBe(0);
    });

    it('should calculate base complexity from length', () => {
      // 200 chars / 20 = 10
      const text = 'a'.repeat(200);
      expect(ComplexityAnalyzer.calculateTextComplexity(text)).toBe(10);
      
      // Max base complexity is 50
      const longText = 'a'.repeat(2000);
      expect(ComplexityAnalyzer.calculateTextComplexity(longText)).toBe(50);
    });

    it('should add bonus for special characters', () => {
      const text = 'Hello!!!'; // 3 special chars
      // 8 / 20 = 0.4 -> round(0.4 + 3) = 3
      expect(ComplexityAnalyzer.calculateTextComplexity(text)).toBe(3);
    });

    it('should add bonus for URLs', () => {
      const text = 'Check this: https://google.com';
      // length 30 / 20 = 1.5
      // URL bonus = 15
      // Special chars (:, :, /, /, .) = 5
      // Dot notation bonus (google.com) = 5
      // Total = 1.5 + 15 + 5 + 5 = 26.5 -> round(27)
      expect(ComplexityAnalyzer.calculateTextComplexity(text)).toBe(27);
    });

    it('should add bonus for code/HTML markers', () => {
      const text = '<div>Content</div>';
      // length 18 / 20 = 0.9
      // HTML bonus = 8
      // Special chars (<, >, /, <, >) = 5
      // Total = 0.9 + 8 + 5 = 13.9 -> round(14)
      expect(ComplexityAnalyzer.calculateTextComplexity(text)).toBe(14);
    });

    it('should add bonus for mixed scripts', () => {
      const text = 'Hello سلام';
      // length 10 / 20 = 0.5
      // Mixed script bonus = 10
      // Total = 0.5 + 10 = 10.5 -> round(11)
      expect(ComplexityAnalyzer.calculateTextComplexity(text)).toBe(11);
    });

    it('should combine multiple bonuses', () => {
      const text = 'const x = { val: "https://api.io" }; // سلام';
      // Very complex: length, special chars, URL, Code, Mixed scripts
      const score = ComplexityAnalyzer.calculateTextComplexity(text);
      expect(score).toBeGreaterThan(40);
    });
  });

  describe('getAdjustedBatchSize', () => {
    const baseSize = 20;

    it('should return base size for low complexity (<= 30)', () => {
      expect(ComplexityAnalyzer.getAdjustedBatchSize(10, baseSize)).toBe(20);
      expect(ComplexityAnalyzer.getAdjustedBatchSize(30, baseSize)).toBe(20);
    });

    it('should return 70% for medium complexity (> 30)', () => {
      expect(ComplexityAnalyzer.getAdjustedBatchSize(31, baseSize)).toBe(14);
      expect(ComplexityAnalyzer.getAdjustedBatchSize(50, baseSize)).toBe(14);
    });

    it('should return 50% for high complexity (> 50)', () => {
      expect(ComplexityAnalyzer.getAdjustedBatchSize(51, baseSize)).toBe(10);
      expect(ComplexityAnalyzer.getAdjustedBatchSize(80, baseSize)).toBe(10);
    });

    it('should return 30% for extreme complexity (> 80)', () => {
      expect(ComplexityAnalyzer.getAdjustedBatchSize(81, baseSize)).toBe(6);
    });

    it('should respect minimum limits', () => {
      const smallBase = 5;
      // 30% of 5 is 1.5, but min is 3
      expect(ComplexityAnalyzer.getAdjustedBatchSize(90, smallBase)).toBe(3);
      // 50% of 5 is 2.5, but min is 5
      expect(ComplexityAnalyzer.getAdjustedBatchSize(60, smallBase)).toBe(5);
    });
  });

  describe('calculateBatchComplexity', () => {
    it('should return 0 for empty batch', () => {
      expect(ComplexityAnalyzer.calculateBatchComplexity([])).toBe(0);
      expect(ComplexityAnalyzer.calculateBatchComplexity(null)).toBe(0);
    });

    it('should calculate average complexity of strings', () => {
      const batch = ['Short', 'A very long segment that should have higher complexity score'];
      const score = ComplexityAnalyzer.calculateBatchComplexity(batch);
      expect(score).toBeGreaterThan(0);
    });

    it('should handle object segments', () => {
      const batch = [
        { t: 'Hello' },
        { text: 'World' }
      ];
      const score = ComplexityAnalyzer.calculateBatchComplexity(batch);
      expect(score).toBeGreaterThan(0);
    });

    it('should weight special characters and technical markers', () => {
      const simpleBatch = ['Hello world'];
      const complexBatch = ['https://api.example.com/data?v=1&type=json'];
      
      const simpleScore = ComplexityAnalyzer.calculateBatchComplexity(simpleBatch);
      const complexScore = ComplexityAnalyzer.calculateBatchComplexity(complexBatch);
      
      expect(complexScore).toBeGreaterThan(simpleScore);
    });
  });
});
