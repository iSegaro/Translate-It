import { describe, it, expect } from 'vitest';
import { buildSemanticInstructions } from './SemanticPromptBuilder.js';

describe('SemanticPromptBuilder', () => {
  describe('null and malformed input', () => {
    it('returns empty string for null', () => {
      expect(buildSemanticInstructions(null)).toBe('');
    });

    it('returns empty string for undefined', () => {
      expect(buildSemanticInstructions(undefined)).toBe('');
    });

    it('returns empty string for non-object input', () => {
      expect(buildSemanticInstructions('invalid')).toBe('');
      expect(buildSemanticInstructions(42)).toBe('');
      expect(buildSemanticInstructions(true)).toBe('');
    });

    it('returns empty string when hasSemanticContext is false', () => {
      expect(buildSemanticInstructions({ hasSemanticContext: false })).toBe('');
    });

    it('returns empty string when hasSemanticContext is missing', () => {
      expect(buildSemanticInstructions({ regionTypes: ['kpi-candidate'] })).toBe('');
    });
  });

  describe('empty hint (no applicable rules)', () => {
    it('returns empty string for bare semantic context', () => {
      expect(buildSemanticInstructions({ hasSemanticContext: true })).toBe('');
    });

    it('returns empty string for empty arrays and false booleans', () => {
      expect(buildSemanticInstructions({
        hasSemanticContext: true,
        regionTypes: [],
        financialSubtypes: [],
        hasStatementFragment: false,
        hasDashboardGroup: false,
        readingRoles: [],
        relationshipRoles: []
      })).toBe('');
    });
  });

  describe('financial subtypes', () => {
    it('includes financial preservation instructions for any financial subtype', () => {
      const result = buildSemanticInstructions({
        hasSemanticContext: true,
        financialSubtypes: ['total-row']
      });
      expect(result).toContain('Preserve all numeric values exactly');
      expect(result).toContain('Preserve currency symbols');
      expect(result).toContain('Preserve percentage signs');
      expect(result).toContain('Preserve plus/minus signs');
      expect(result).toContain('Preserve parenthesized negative values');
    });

    it('adds change indicator instructions for metric-with-delta', () => {
      const result = buildSemanticInstructions({
        hasSemanticContext: true,
        financialSubtypes: ['metric-with-delta']
      });
      expect(result).toContain('Preserve change indicators exactly');
      expect(result).toContain('Translate only surrounding descriptive text');
    });

    it('does not add change indicator instructions for non-delta subtypes', () => {
      const result = buildSemanticInstructions({
        hasSemanticContext: true,
        financialSubtypes: ['total-row', 'summary-row']
      });
      expect(result).not.toContain('Preserve change indicators exactly');
    });
  });

  describe('statement fragment', () => {
    it('includes structured financial information instruction', () => {
      const result = buildSemanticInstructions({
        hasSemanticContext: true,
        hasStatementFragment: true
      });
      expect(result).toContain('This content contains structured financial information');
      expect(result).toContain('Translate labels naturally while preserving financial values and structure');
    });

    it('does not include instruction when hasStatementFragment is false', () => {
      const result = buildSemanticInstructions({
        hasSemanticContext: true,
        hasStatementFragment: false
      });
      expect(result).not.toContain('structured financial information');
    });
  });

  describe('dashboard group', () => {
    it('includes concise parallel wording instruction', () => {
      const result = buildSemanticInstructions({
        hasSemanticContext: true,
        hasDashboardGroup: true
      });
      expect(result).toContain('Maintain concise and parallel wording across related metrics');
    });

    it('does not include instruction when hasDashboardGroup is false', () => {
      const result = buildSemanticInstructions({
        hasSemanticContext: true,
        hasDashboardGroup: false
      });
      expect(result).not.toContain('concise and parallel');
    });
  });

  describe('combined rules', () => {
    it('combines all applicable instructions', () => {
      const result = buildSemanticInstructions({
        hasSemanticContext: true,
        financialSubtypes: ['metric-with-delta'],
        hasStatementFragment: true,
        hasDashboardGroup: true
      });
      expect(result).toContain('Additional translation context:');
      expect(result).toContain('Preserve all numeric values exactly');
      expect(result).toContain('Preserve change indicators exactly');
      expect(result).toContain('structured financial information');
      expect(result).toContain('concise and parallel');
    });

    it('starts with header when any rule applies', () => {
      const result = buildSemanticInstructions({
        hasSemanticContext: true,
        hasDashboardGroup: true
      });
      expect(result).toMatch(/^Additional translation context:/);
    });
  });

  describe('unknown subtypes', () => {
    it('does not generate financial instructions for unknown subtypes only', () => {
      const result = buildSemanticInstructions({
        hasSemanticContext: true,
        financialSubtypes: ['unknown-type']
      });
      expect(result).toBe('');
    });

    it('generates instructions when mix of known and unknown subtypes', () => {
      const result = buildSemanticInstructions({
        hasSemanticContext: true,
        financialSubtypes: ['unknown-type', 'total-row']
      });
      expect(result).toContain('Preserve all numeric values exactly');
    });
  });

  describe('recognized financial subtypes', () => {
    const knownSubtypes = ['metric-with-delta', 'summary-row', 'total-row', 'negative-value'];

    for (const subtype of knownSubtypes) {
      it(`triggers financial instructions for "${subtype}"`, () => {
        const result = buildSemanticInstructions({
          hasSemanticContext: true,
          financialSubtypes: [subtype]
        });
        expect(result).toContain('Preserve all numeric values exactly');
      });
    }
  });

  describe('regionTypes not included in prompt', () => {
    it('does not mention region types in instructions', () => {
      const result = buildSemanticInstructions({
        hasSemanticContext: true,
        regionTypes: ['kpi-candidate', 'key-value-candidate'],
        readingRoles: ['label', 'value'],
        relationshipRoles: ['parent', 'child']
      });
      expect(result).toBe('');
    });
  });
});
