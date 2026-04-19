/**
 * TTS Circuit Breaker - Prevents overwhelming failing services
 * Persists state in storage.local to survive worker suspensions.
 */
import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';
import { PROVIDER_CONFIGS } from '@/features/tts/constants/ttsProviders.js';

const logger = getScopedLogger(LOG_COMPONENTS.TTS, 'TTSCircuitBreaker');

class TTSCircuitBreaker {
  constructor() {
    this.storageKey = 'TTS_CIRCUIT_STATE';
  }

  /**
   * Check if a provider is allowed to make requests
   * @param {string} engine - Engine ID (google/edge)
   * @returns {Promise<boolean>} - True if allowed
   */
  async isAllowed(engine) {
    const state = await this._getState();
    const engineState = state[engine];

    if (!engineState || engineState.status === 'CLOSED') {
      return true;
    }

    // Check if reset timeout has passed
    const config = PROVIDER_CONFIGS[engine]?.circuitBreaker;
    if (!config) return true;

    if (Date.now() > engineState.openedAt + config.resetTimeoutMs) {
      logger.info(`[TTSCircuitBreaker] Reset timeout passed for ${engine}. Half-opening...`);
      await this.reset(engine);
      return true;
    }

    return false;
  }

  /**
   * Record a success for a provider
   */
  async recordSuccess(engine) {
    await this.reset(engine);
  }

  /**
   * Record a failure for a provider
   */
  async recordFailure(engine) {
    const config = PROVIDER_CONFIGS[engine]?.circuitBreaker;
    if (!config) return;

    const state = await this._getState();
    const engineState = state[engine] || { status: 'CLOSED', failures: [] };

    const now = Date.now();
    // Filter failures within the sliding window
    const recentFailures = engineState.failures.filter(f => now - f < config.windowMs);
    recentFailures.push(now);

    if (recentFailures.length >= config.failureThreshold) {
      logger.warn(`[TTSCircuitBreaker] Failure threshold reached for ${engine}. Opening circuit.`);
      state[engine] = {
        status: 'OPEN',
        openedAt: now,
        failures: recentFailures
      };
    } else {
      state[engine] = {
        ...engineState,
        failures: recentFailures
      };
    }

    await this._saveState(state);
  }

  /**
   * Reset the circuit for a provider
   */
  async reset(engine) {
    const state = await this._getState();
    delete state[engine];
    await this._saveState(state);
  }

  /**
   * Get current state from storage
   * @private
   */
  async _getState() {
    try {
      const browserAPI = typeof browser !== 'undefined' ? browser : chrome;
      const result = await browserAPI.storage.local.get(this.storageKey);
      return result[this.storageKey] || {};
    } catch {
      return {};
    }
  }

  /**
   * Save state to storage
   * @private
   */
  async _saveState(state) {
    try {
      const browserAPI = typeof browser !== 'undefined' ? browser : chrome;
      await browserAPI.storage.local.set({ [this.storageKey]: state });
    } catch { /* ignore */ }
  }
}

export const ttsCircuitBreaker = new TTSCircuitBreaker();
