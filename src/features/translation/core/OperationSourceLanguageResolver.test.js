import { describe, expect, it, vi, beforeEach } from 'vitest';
import {
  canBypassSequentialGate,
  resolveOperationSourceLanguage,
  SOURCE_RESOLUTION_BYPASS_REASONS,
} from './OperationSourceLanguageResolver.js';

const { detectDetailed, getScriptFamily, applyLanguageSwapping } = vi.hoisted(() => ({
  detectDetailed: vi.fn(),
  getScriptFamily: vi.fn(),
  applyLanguageSwapping: vi.fn(),
}));

vi.mock('@/shared/services/LanguageDetectionService.js', () => ({
  DETECTION_CONFIDENCE: {
    HIGH: 'high',
    MEDIUM: 'medium',
    LOW: 'low',
    UNKNOWN: 'unknown',
  },
  DETECTION_PROVENANCE: {
    EXACT_CACHE: 'exact-cache',
    CONTEXTUAL_CACHE: 'contextual-cache',
    STATISTICAL: 'statistical',
    DETERMINISTIC_SCRIPT: 'deterministic-script',
    USER_LANGUAGE: 'user-language',
    HEURISTIC: 'heuristic',
    UNKNOWN: 'unknown',
  },
  LanguageDetectionService: {
    detectDetailed,
    getScriptFamily,
  },
  sanitizeDetectionSample: (text) => text.replace(/@@TI_SEG_[^@]+@@/g, ' ').trim(),
}));

vi.mock('@/features/translation/providers/LanguageSwappingService.js', () => ({
  LanguageSwappingService: {
    applyLanguageSwapping,
  },
}));

vi.mock('@/shared/config/config.js', () => ({
  TranslationMode: {
    Selection: 'selection',
    Page: 'page-translation-batch',
    Select_Element: 'select-element',
    PDF: 'pdf-translation',
  },
}));

const detection = (language, confidence, provenance, reliable, percentage = null) => ({
  language,
  confidence,
  provenance,
  reliable,
  percentage,
});

describe('OperationSourceLanguageResolver', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getScriptFamily.mockImplementation((text) => {
      if (/[\u0600-\u06ff]/u.test(text)) return 'arabic';
      if (/[A-Za-z]/.test(text)) return 'latin';
      return 'other';
    });
    applyLanguageSwapping.mockResolvedValue(['auto', 'fa']);
  });

  it('allows high-confidence statistical resolution for stateless AUTO work', async () => {
    detectDetailed.mockResolvedValue(detection('en', 'high', 'statistical', true, 96));

    const result = await resolveOperationSourceLanguage({
      items: ['This is representative English operation text.'],
      sourceLanguage: 'auto',
      targetLanguage: 'fa',
    });

    expect(result.effectiveSourceLanguage).toBe('en');
    expect(result.effectiveTargetLanguage).toBe('fa');
    expect(result.canBypassSequentialGate).toBe(true);
    expect(result.bypassReason).toBe(SOURCE_RESOLUTION_BYPASS_REASONS.HIGH_CONFIDENCE_STATISTICAL);
    expect(canBypassSequentialGate(result)).toBe(true);
  });

  it('denies medium statistical resolution', async () => {
    detectDetailed.mockResolvedValue(detection('en', 'medium', 'statistical', false, 60));

    const result = await resolveOperationSourceLanguage({ text: 'English text', targetLanguage: 'fa' });

    expect(result.canBypassSequentialGate).toBe(false);
    expect(result.bypassReason).toBe(SOURCE_RESOLUTION_BYPASS_REASONS.LOW_CONFIDENCE);
  });

  it.each([
    ['heuristic', 'low', 'heuristic', SOURCE_RESOLUTION_BYPASS_REASONS.HEURISTIC_RESULT],
    ['contextual cache', 'medium', 'contextual-cache', SOURCE_RESOLUTION_BYPASS_REASONS.CONTEXTUAL_CACHE],
    ['exact cache', 'high', 'exact-cache', SOURCE_RESOLUTION_BYPASS_REASONS.EXACT_CACHE_NOT_VERIFIED],
  ])('denies %s resolution conservatively', async (_label, confidence, provenance, reason) => {
    detectDetailed.mockResolvedValue(detection('en', confidence, provenance, confidence === 'high'));

    const result = await resolveOperationSourceLanguage({ text: 'English text', targetLanguage: 'fa' });

    expect(result.canBypassSequentialGate).toBe(false);
    expect(result.bypassReason).toBe(reason);
  });

  it('allows language-specific deterministic detection but denies general Cyrillic mapping', async () => {
    detectDetailed.mockResolvedValue(detection('fa', 'high', 'deterministic-script', true));
    const allowed = await resolveOperationSourceLanguage({ text: 'فارسی', targetLanguage: 'en' });
    expect(allowed.canBypassSequentialGate).toBe(true);
    expect(allowed.bypassReason).toBe(SOURCE_RESOLUTION_BYPASS_REASONS.LANGUAGE_SPECIFIC_DETERMINISTIC);

    detectDetailed.mockResolvedValue(detection('ru', 'high', 'deterministic-script', true));
    const denied = await resolveOperationSourceLanguage({ text: 'текст', targetLanguage: 'en' });
    expect(denied.canBypassSequentialGate).toBe(false);
    expect(denied.bypassReason).toBe(SOURCE_RESOLUTION_BYPASS_REASONS.AMBIGUOUS_DETERMINISTIC);
  });

  it('keeps AUTO when detection is unknown', async () => {
    detectDetailed.mockResolvedValue(detection(null, 'unknown', 'unknown', false));

    const result = await resolveOperationSourceLanguage({ text: '??', targetLanguage: 'fa' });

    expect(result.effectiveSourceLanguage).toBe('auto');
    expect(result.canBypassSequentialGate).toBe(false);
    expect(result.bypassReason).toBe(SOURCE_RESOLUTION_BYPASS_REASONS.UNKNOWN_LANGUAGE);
  });

  it('preserves same-language target swap semantics', async () => {
    detectDetailed.mockResolvedValue(detection('fa', 'high', 'statistical', true, 98));
    applyLanguageSwapping.mockResolvedValue(['fa', 'en']);

    const result = await resolveOperationSourceLanguage({
      text: 'فارسی',
      sourceLanguage: 'auto',
      targetLanguage: 'fa',
      mode: 'selection',
    });

    expect(applyLanguageSwapping).toHaveBeenCalledWith(
      'فارسی',
      'auto',
      'fa',
      'auto',
      expect.objectContaining({ detectedLanguage: 'fa' }),
    );
    expect(result.effectiveSourceLanguage).toBe('fa');
    expect(result.effectiveTargetLanguage).toBe('en');
    expect(result.swapApplied).toBe(true);
    expect(result.canBypassSequentialGate).toBe(true);
  });

  it('denies bypass when representative operation scripts conflict', async () => {
    detectDetailed.mockResolvedValue(detection('en', 'high', 'statistical', true, 98));

    const result = await resolveOperationSourceLanguage({
      items: ['English parent', 'فارسی parent'],
      targetLanguage: 'fa',
    });

    expect(result.mixedLanguageRisk).toBe(true);
    expect(result.canBypassSequentialGate).toBe(false);
    expect(result.bypassReason).toBe(SOURCE_RESOLUTION_BYPASS_REASONS.MIXED_LANGUAGE_RISK);
  });

  it('does not require AUTO detection for explicit source language', async () => {
    const result = await resolveOperationSourceLanguage({
      text: 'Any text',
      sourceLanguage: 'de',
      targetLanguage: 'fa',
    });

    expect(detectDetailed).not.toHaveBeenCalled();
    expect(applyLanguageSwapping).not.toHaveBeenCalled();
    expect(result.effectiveSourceLanguage).toBe('de');
    expect(result.canBypassSequentialGate).toBe(true);
    expect(result.bypassReason).toBe(SOURCE_RESOLUTION_BYPASS_REASONS.EXPLICIT_SOURCE);
  });

  it('can preserve provider capability boundaries without adding provider policy', async () => {
    detectDetailed.mockResolvedValue(detection('en', 'high', 'statistical', true, 98));

    const result = await resolveOperationSourceLanguage({
      text: 'English text',
      targetLanguage: 'fa',
      supportsBilingual: false,
    });

    expect(applyLanguageSwapping).not.toHaveBeenCalled();
    expect(result.effectiveSourceLanguage).toBe('en');
    expect(result.canBypassSequentialGate).toBe(true);
  });

  it('keeps history-enabled operations in the ordered lane', async () => {
    detectDetailed.mockResolvedValue(detection('en', 'high', 'statistical', true, 98));

    const result = await resolveOperationSourceLanguage({
      text: 'English text',
      targetLanguage: 'fa',
      historyEnabled: true,
    });

    expect(result.effectiveSourceLanguage).toBe('en');
    expect(result.canBypassSequentialGate).toBe(false);
    expect(result.bypassReason).toBe(SOURCE_RESOLUTION_BYPASS_REASONS.HISTORY_ORDERING_REQUIRED);
  });

  it('builds bounded representative samples and strips V3 markers before detection', async () => {
    detectDetailed.mockResolvedValue(detection('en', 'medium', 'statistical', false, 60));
    const items = Array.from({ length: 20 }, (_, index) => `item-${index} @@TI_SEG_sabc_n${index + 1}@@`);

    const result = await resolveOperationSourceLanguage({ items, targetLanguage: 'fa' });

    expect(result.sample.length).toBeLessThanOrEqual(2000);
    expect(result.sample).not.toContain('@@TI_SEG_');
    expect(detectDetailed).toHaveBeenCalledWith(result.sample, { url: undefined, tabId: undefined });
  });
});
