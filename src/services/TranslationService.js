// src/services/TranslationService.js
class TranslationService {
  constructor(providerFactory, historyService) {
    this.providerFactory = providerFactory;
    this.historyService = historyService;
  }

  async translate(text, sourceLang, targetLang, providerId) {
    const provider = this.providerFactory.getProvider(providerId);
    if (!provider) {
      throw new Error(`Translation provider ${providerId} not found.`);
    }
    const result = await provider.translate(text, sourceLang, targetLang);
    this.historyService.addTranslation(text, sourceLang, targetLang, result);
    return result;
  }
}

export default TranslationService;
