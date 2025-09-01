// src/services/HistoryService.js
class HistoryService {
  constructor(storageManager) {
    this.storageManager = storageManager;
    this.historyKey = 'translationHistory';
  }

  async getHistory() {
    return (await this.storageManager.get(this.historyKey)) || [];
  }

  async addTranslation(sourceText, sourceLang, targetLang, translatedText) {
    const history = await this.getHistory();
    const newEntry = {
      id: Date.now(),
      sourceText,
      sourceLang,
      targetLang,
      translatedText,
      timestamp: new Date().toISOString(),
    };
    history.unshift(newEntry); // Add to the beginning
    await this.storageManager.set(this.historyKey, history);
  }

  async clearHistory() {
    await this.storageManager.remove(this.historyKey);
  }
}

export default HistoryService;
