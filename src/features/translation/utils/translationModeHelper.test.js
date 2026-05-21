import { describe, it, expect, vi, beforeEach } from 'vitest';
import { 
  checkProviderSupportsDictionary, 
  isEligibleForDictionaryUpgrade, 
  resolveTranslationMode 
} from './translationModeHelper.js';
import { TranslationMode, getEnableDictionaryAsync } from "@/shared/config/config.js";
import { isSingleWordOrShortPhrase } from "@/shared/utils/text/textAnalysis.js";
import { findProviderByName } from "@/features/translation/providers/ProviderManifest.js";

// Mock configuration & utility modules
vi.mock("@/shared/config/config.js", () => ({
  TranslationMode: {
    Selection: 'selection',
    MouseHover: 'mouse_hover',
    Popup_Translate: 'popup_translate',
    Sidepanel_Translate: 'sidepanel_translate',
    Mobile_Translate: 'mobile_translate',
    Dictionary_Translation: 'dictionary',
    Select_Element: 'select_element',
    Page: 'page',
    Field: 'field'
  },
  getEnableDictionaryAsync: vi.fn()
}));

vi.mock("@/shared/utils/text/textAnalysis.js", () => ({
  isSingleWordOrShortPhrase: vi.fn()
}));

vi.mock("@/features/translation/providers/ProviderManifest.js", () => ({
  findProviderByName: vi.fn()
}));

describe('translationModeHelper', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('checkProviderSupportsDictionary', () => {
    it('should return false if provider is null/undefined', () => {
      expect(checkProviderSupportsDictionary(null)).toBe(false);
      expect(checkProviderSupportsDictionary(undefined)).toBe(false);
    });

    it('should resolve provider capability by string name using ProviderManifest', () => {
      findProviderByName.mockReturnValueOnce({ features: ['translation', 'dictionary'] });
      expect(checkProviderSupportsDictionary('GoogleTranslate')).toBe(true);
      expect(findProviderByName).toHaveBeenCalledWith('GoogleTranslate');

      findProviderByName.mockReturnValueOnce({ features: ['translation'] });
      expect(checkProviderSupportsDictionary('MicrosoftEdge')).toBe(false);
    });

    it('should return false if ProviderManifest cannot find provider by name', () => {
      findProviderByName.mockReturnValueOnce(null);
      expect(checkProviderSupportsDictionary('UnknownProvider')).toBe(false);
    });

    it('should resolve provider capability by class constructor object', () => {
      const mockClassSupports = class { static supportsDictionary = true; };
      expect(checkProviderSupportsDictionary(mockClassSupports)).toBe(true);

      const mockClassUnsupported = class { static supportsDictionary = false; };
      expect(checkProviderSupportsDictionary(mockClassUnsupported)).toBe(false);

      const mockClassMissing = class {};
      expect(checkProviderSupportsDictionary(mockClassMissing)).toBe(false);
    });
  });

  describe('isEligibleForDictionaryUpgrade', () => {
    it('should return false if text is not a string', async () => {
      expect(await isEligibleForDictionaryUpgrade(null, TranslationMode.Selection)).toBe(false);
      expect(await isEligibleForDictionaryUpgrade(123, TranslationMode.Selection)).toBe(false);
    });

    it('should return false if local config disables dictionary', async () => {
      // 1. In root data object
      expect(await isEligibleForDictionaryUpgrade('apple', TranslationMode.Selection, { enableDictionary: false })).toBe(false);
      // 2. In options child object
      expect(await isEligibleForDictionaryUpgrade('apple', TranslationMode.Selection, { options: { enableDictionary: false } })).toBe(false);
    });

    it('should return false if translation mode is structural/bulk', async () => {
      expect(await isEligibleForDictionaryUpgrade('apple', TranslationMode.Select_Element)).toBe(false);
      expect(await isEligibleForDictionaryUpgrade('apple', TranslationMode.Page)).toBe(false);
      expect(await isEligibleForDictionaryUpgrade('apple', TranslationMode.Field)).toBe(false);
    });

    it('should return false if mode is not whitelisted for dictionary', async () => {
      expect(await isEligibleForDictionaryUpgrade('apple', 'unknown_mode')).toBe(false);
    });

    it('should return false if global dictionary is disabled', async () => {
      getEnableDictionaryAsync.mockResolvedValue(false);
      const result = await isEligibleForDictionaryUpgrade('apple', TranslationMode.Selection);
      expect(result).toBe(false);
      expect(getEnableDictionaryAsync).toHaveBeenCalled();
    });

    it('should return true if text is single word and dictionary is globally enabled', async () => {
      getEnableDictionaryAsync.mockResolvedValue(true);
      isSingleWordOrShortPhrase.mockReturnValue(true);

      const result = await isEligibleForDictionaryUpgrade('apple', TranslationMode.Selection);
      expect(result).toBe(true);
      expect(isSingleWordOrShortPhrase).toHaveBeenCalledWith('apple');
    });

    it('should return false if text is long/not a short phrase', async () => {
      getEnableDictionaryAsync.mockResolvedValue(true);
      isSingleWordOrShortPhrase.mockReturnValue(false);

      const result = await isEligibleForDictionaryUpgrade('this is a very long sentence', TranslationMode.Selection);
      expect(result).toBe(false);
    });
  });

  describe('resolveTranslationMode', () => {
    it('should downgrade dictionary mode if provider does not support it', async () => {
      // Provider supportsDictionary is false
      const mockClass = class { static supportsDictionary = false; };
      const data = { mode: TranslationMode.Dictionary_Translation, text: 'word' };

      const result = await resolveTranslationMode(data, mockClass);
      expect(result).toBe(TranslationMode.Selection);
    });

    it('should retain dictionary mode if provider supports it', async () => {
      const mockClass = class { static supportsDictionary = true; };
      const data = { mode: TranslationMode.Dictionary_Translation, text: 'word' };

      const result = await resolveTranslationMode(data, mockClass);
      expect(result).toBe(TranslationMode.Dictionary_Translation);
    });

    it('should upgrade to dictionary if eligible and provider supports dictionary', async () => {
      getEnableDictionaryAsync.mockResolvedValue(true);
      isSingleWordOrShortPhrase.mockReturnValue(true);
      
      const mockClass = class { static supportsDictionary = true; };
      const data = { mode: TranslationMode.Selection, text: 'apple' };

      const result = await resolveTranslationMode(data, mockClass);
      expect(result).toBe(TranslationMode.Dictionary_Translation);
    });

    it('should NOT upgrade if eligible but provider does not support dictionary', async () => {
      getEnableDictionaryAsync.mockResolvedValue(true);
      isSingleWordOrShortPhrase.mockReturnValue(true);

      const mockClass = class { static supportsDictionary = false; };
      const data = { mode: TranslationMode.Selection, text: 'apple' };

      const result = await resolveTranslationMode(data, mockClass);
      expect(result).toBe(TranslationMode.Selection); // Stays selection
    });

    it('should NOT upgrade if not eligible even if provider supports dictionary', async () => {
      getEnableDictionaryAsync.mockResolvedValue(true);
      isSingleWordOrShortPhrase.mockReturnValue(false); // Not single word

      const mockClass = class { static supportsDictionary = true; };
      const data = { mode: TranslationMode.Selection, text: 'this is a sentence' };

      const result = await resolveTranslationMode(data, mockClass);
      expect(result).toBe(TranslationMode.Selection);
    });
  });
});
