class TTSManager {
  constructor() {
    this.ttsService = null;
  }

  async initialize(browserType) {
    if (browserType === 'chrome') {
      const { TTSChrome } = await import('./TTSChrome.js');
      this.ttsService = new TTSChrome();
    } else if (browserType === 'firefox') {
      const { TTSFirefox } = await import('./TTSFirefox.js');
      this.ttsService = new TTSFirefox();
    } else {
      const { TTSContent } = await import('./TTSContent.js');
      this.ttsService = new TTSContent();
    }
    if (this.ttsService && this.ttsService.initialize) {
      await this.ttsService.initialize();
    }
  }

  async speak(text, lang) {
    if (this.ttsService) {
      await this.ttsService.speak(text, lang);
    }
  }

  async stop() {
    if (this.ttsService) {
      await this.ttsService.stop();
    }
  }
}

export { TTSManager };