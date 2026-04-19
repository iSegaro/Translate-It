/**
 * Translation Stats Manager - Centralized tracking for API requests
 * Provides real-time statistics, request counters, and session summaries
 */
import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';
import { safeConsole } from '@/shared/logging/SafeConsole.js';
import { CONFIG } from '@/shared/config/config.js';
import { storageManager } from '@/shared/storage/core/StorageCore.js';

const logger = getScopedLogger(LOG_COMPONENTS.TRANSLATION, 'StatsManager');

class TranslationStatsManager {
  constructor() {
    this.reset();
  }

  reset() {
    this.global = {
      totalCalls: 0,
      totalChars: 0,
      totalOriginalChars: 0,
      totalErrors: 0,
      startTime: Date.now()
    };
    
    this.providers = new Map(); // providerName -> { calls, chars, errors, originalChars }
    this.sessions = new Map();  // sessionId -> { calls, chars, errors, originalChars, startTime, provider }
  }

  /**
   * Record an API request start
   */
  recordRequest(providerName, sessionId, networkChars, originalChars = 0) {
    this.global.totalCalls++;
    this.global.totalChars += networkChars;
    this.global.totalOriginalChars += originalChars;

    // Update provider stats
    if (!this.providers.has(providerName)) {
      this.providers.set(providerName, { calls: 0, chars: 0, errors: 0, originalChars: 0 });
    }
    const pStats = this.providers.get(providerName);
    pStats.calls++;
    pStats.chars += networkChars;
    pStats.originalChars += originalChars;

    // Use sessionId if provided, otherwise stats are just global
    if (sessionId) {
      if (!this.sessions.has(sessionId)) {
        logger.debug(`Starting stats tracking for new session: ${sessionId}`);
        this.sessions.set(sessionId, { 
          calls: 0, 
          chars: 0, 
          errors: 0, 
          originalChars: 0,
          startTime: Date.now(),
          provider: providerName 
        });
      }
      const sStats = this.sessions.get(sessionId);
      sStats.calls++;
      sStats.chars += networkChars;
      sStats.originalChars += originalChars;
      
      return {
        globalCallId: this.global.totalCalls,
        sessionCallId: sStats.calls
      };
    }

    return {
      globalCallId: this.global.totalCalls,
      sessionCallId: 0
    };
  }

  /**
   * Record an API error
   */
  recordError(providerName, sessionId) {
    this.global.totalErrors++;
    
    if (this.providers.has(providerName)) {
      this.providers.get(providerName).errors++;
    }
    
    if (sessionId && this.sessions.has(sessionId)) {
      this.sessions.get(sessionId).errors++;
    }
  }

  /**
   * Get session summary for reporting
   */
  getSessionSummary(sessionId) {
    const stats = this.sessions.get(sessionId);
    if (!stats) return null;

    return {
      ...stats,
      duration: Date.now() - stats.startTime
    };
  }

  /**
   * Clean up session data to prevent memory leaks
   */
  clearSession(sessionId) {
    if (sessionId) {
      this.sessions.delete(sessionId);
    }
  }

  /**
   * Print a formatted summary for a session
   * @param {string} sessionId - Session identifier
   * @param {Object} options - Options
   * @param {string} [options.status] - Status label (e.g. 'Complete', 'Progress')
   * @param {boolean} [options.success] - Whether the operation was successful
   * @param {boolean} [options.clear] - Whether to clear the session after printing
   * @param {number} [options.batchChars] - Optional chars for THIS specific batch
   */
  printSummary(sessionId, { status = 'Complete', success = true, clear = false, batchChars = null, batchOriginalChars = null } = {}) {
    const summary = this.getSessionSummary(sessionId);
    if (!summary || summary.calls === 0) return;

    const durationStr = (summary.duration / 1000).toFixed(1) + 's';
    
    // Choose appropriate icon
    let icon = success ? '✅' : '❌';
    if (status === 'Progress' || status === 'Batch') icon = '📊';
    else if (status === 'Stopped' || status === 'Cancelled') icon = 'ℹ️';
    else if (status === 'Restored' || status === 'Page Restored') icon = '🔄';

    // Build characters display string for total
    const totalCharsDisplay = summary.originalChars > 0 && Math.abs(summary.originalChars - summary.chars) > 5
      ? `${summary.originalChars.toLocaleString()} (Network: ${summary.chars.toLocaleString()})`
      : summary.chars.toLocaleString();

    // Build the message
    let message = `${icon} [${status} Summary: ${sessionId}] Provider: ${summary.provider} | `;
    
    if (batchChars !== null) {
      const bOriginal = batchOriginalChars !== null ? batchOriginalChars : batchChars;
      const batchCharsDisplay = Math.abs(bOriginal - batchChars) > 5
        ? `${bOriginal.toLocaleString()} (Network: ${batchChars.toLocaleString()})`
        : batchChars.toLocaleString();
      message += `Batch Chars: ${batchCharsDisplay} | `;
    }
    
    message += `Total Requests: ${summary.calls} | Total Chars: ${totalCharsDisplay} | Errors: ${summary.errors} | Total Time: ${durationStr}`;

    // Check if debug mode is active via StorageManager cache for performance
    const isDebugActive = storageManager.getCached('DEBUG_MODE', CONFIG.DEBUG_MODE);

    if (isDebugActive) {
      // If debug is on, we want to see these important stats at level 1, 
      // but without the yellow "warn" appearance. We bypass the Logger layer 
      // by using safeConsole.info directly, formatting it to match regular logs.
      const timestamp = new Date().toLocaleTimeString("en-US", {
        hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit"
      });
      safeConsole.info(`[${timestamp}] Translation.StatsManager: ${message}`);
    }

    if (clear) {
      this.clearSession(sessionId);
    }
  }

  /**
   * Print a clean table of current statistics to the console
   */
  showStats() {
    const tableData = [];
    this.providers.forEach((stats, name) => {
      tableData.push({
        Provider: name,
        Calls: stats.calls,
        Characters: stats.chars,
        Errors: stats.errors,
        'Avg Chars/Call': Math.round(stats.chars / stats.calls) || 0
      });
    });

    if (tableData.length === 0) {
      logger.info('📊 [TranslationStats] No API calls recorded yet.');
      return;
    }

    // Check if logging is enabled for this component/level
    if (logger.isDebugEnabled?.() !== false) {
      safeConsole.group('📊 Translation API Statistics');
      safeConsole.table(tableData);
      safeConsole.log(`Total Global Calls: ${this.global.totalCalls}`);
      safeConsole.log(`Total Characters: ${this.global.totalChars.toLocaleString()}`);
      safeConsole.log(`Uptime: ${Math.round((Date.now() - this.global.startTime) / 1000)}s`);
      safeConsole.groupEnd();
    }
  }
}

// Singleton instance
export const statsManager = new TranslationStatsManager();

// Export for console debugging
if (typeof window !== 'undefined') {
  window.showTranslationStats = () => statsManager.showStats();
  window.resetTranslationStats = () => statsManager.reset();
}

export default statsManager;
