import { getScopedLogger } from "@/shared/logging/logger.js";
import { LOG_COMPONENTS } from "@/shared/logging/logConstants.js";
import { ProviderNames } from "@/features/translation/providers/ProviderConstants.js";

const logger = getScopedLogger(LOG_COMPONENTS.TRANSLATION, 'RateLimitManager');

/**
 * Priority levels for translation requests
 */
export const TranslationPriority = {
  HIGH: 10,   // Interactive UI (Popup, Sidepanel, Selection)
  NORMAL: 5, // Default/Standard requests
  LOW: 1,    // Background tasks (Whole Page Translation)
};

/**
 * Default configurations for various providers
 */
const DEFAULT_PROVIDER_CONFIGS = {
  [ProviderNames.GOOGLE_TRANSLATE]: { maxConcurrent: 2, delayBetweenRequests: 100 },
  [ProviderNames.BING_TRANSLATE]: { maxConcurrent: 2, delayBetweenRequests: 200 },
  [ProviderNames.GEMINI]: { maxConcurrent: 2, delayBetweenRequests: 600 },
  [ProviderNames.OPENAI]: { maxConcurrent: 2, delayBetweenRequests: 500 },
  [ProviderNames.YANDEX_TRANSLATE]: { maxConcurrent: 2, delayBetweenRequests: 150 },
  [ProviderNames.DEEPL_TRANSLATE]: { maxConcurrent: 2, delayBetweenRequests: 200 },
  [ProviderNames.DEEPSEEK]: { maxConcurrent: 2, delayBetweenRequests: 500 },
  [ProviderNames.OPENROUTER]: { maxConcurrent: 2, delayBetweenRequests: 500 },
  [ProviderNames.WEBAI]: { maxConcurrent: 2, delayBetweenRequests: 500 },
};

class RateLimitManager {
  constructor() {
    this.configs = {};
    this.activeRequests = {}; 
    this.queues = {};
    this.reloadConfigurations();
  }

  /**
   * Load or reload configurations from constants
   */
  reloadConfigurations() {
    Object.entries(DEFAULT_PROVIDER_CONFIGS).forEach(([name, config]) => {
      this.setProviderConfig(name, config);
    });
    logger.debug("Provider configurations reloaded");
  }

  /**
   * Initialize configuration for a provider
   */
  setProviderConfig(providerName, config = {}) {
    this.configs[providerName] = {
      maxConcurrent: config.maxConcurrent || 2,
      delayBetweenRequests: config.delayBetweenRequests || 100,
      ...config
    };
    
    if (this.activeRequests[providerName] === undefined) {
      this.activeRequests[providerName] = 0;
    }
    
    if (!this.queues[providerName]) {
      this.queues[providerName] = {
        [TranslationPriority.HIGH]: [],
        [TranslationPriority.NORMAL]: [],
        [TranslationPriority.LOW]: []
      };
    }
  }

  /**
   * Execute a task with rate limiting and priority
   */
  async executeWithRateLimit(providerName, task, context = "", priority = TranslationPriority.NORMAL) {
    // Handle cases where provider might not be initialized with its registry ID
    // We map registry IDs to full names if needed
    let name = providerName;
    if (!this.configs[name]) {
      // Try to find full name from registry ID
      try {
        const { registryIdToName } = await import("@/features/translation/providers/ProviderConstants.js");
        name = registryIdToName(providerName) || providerName;
      } catch (e) { /* ignore */ }
      
      if (!this.configs[name]) {
        this.setProviderConfig(name);
      }
    }

    return new Promise((resolve, reject) => {
      const request = { task, resolve, reject, context, priority };
      
      const targetPriority = TranslationPriority[Object.keys(TranslationPriority).find(k => TranslationPriority[k] === priority)] 
        ? priority : TranslationPriority.NORMAL;

      this.queues[name][targetPriority].push(request);
      this._processQueue(name);
    });
  }

  /**
   * Process the next task in the queue based on priority
   */
  _processQueue(providerName) {
    const config = this.configs[providerName];
    const active = this.activeRequests[providerName];

    if (active >= config.maxConcurrent) return;

    const providerQueue = this.queues[providerName];
    let nextRequest = null;
    
    // Order: HIGH -> NORMAL -> LOW
    if (providerQueue[TranslationPriority.HIGH].length > 0) {
      nextRequest = providerQueue[TranslationPriority.HIGH].shift();
    } else if (providerQueue[TranslationPriority.NORMAL].length > 0) {
      nextRequest = providerQueue[TranslationPriority.NORMAL].shift();
    } else if (providerQueue[TranslationPriority.LOW].length > 0) {
      nextRequest = providerQueue[TranslationPriority.LOW].shift();
    }

    if (!nextRequest) return;

    this.activeRequests[providerName]++;

    (async () => {
      try {
        const result = await nextRequest.task();
        nextRequest.resolve(result);
      } catch (error) {
        nextRequest.reject(error);
      } finally {
        setTimeout(() => {
          this.activeRequests[providerName]--;
          this._processQueue(providerName);
        }, config.delayBetweenRequests);
      }
    })();
  }

  /**
   * Clear all pending tasks for a provider
   */
  clearQueue(providerName) {
    if (this.queues[providerName]) {
      const q = this.queues[providerName];
      [TranslationPriority.HIGH, TranslationPriority.NORMAL, TranslationPriority.LOW].forEach(p => {
        q[p].forEach(req => req.reject(new Error("Queue cleared")));
        q[p] = [];
      });
    }
    this.activeRequests[providerName] = 0;
  }
}

export const rateLimitManager = new RateLimitManager();
