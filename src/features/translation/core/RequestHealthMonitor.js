/**
 * Request Health Monitor - Monitors the health and performance of translation requests
 * Provides insights for adaptive rate limiting and error recovery strategies
 */

import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';

const logger = getScopedLogger(LOG_COMPONENTS.TRANSLATION, 'RequestHealthMonitor');

export class RequestHealthMonitor {
  constructor() {
    if (RequestHealthMonitor.instance) {
      return RequestHealthMonitor.instance;
    }
    
    // Provider health statistics
    this.providerHealth = new Map();
    
    // Global statistics
    this.globalStats = {
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      averageResponseTime: 0,
      startTime: Date.now()
    };
    
    // Configuration
    this.config = {
      healthWindowSize: 50, // Last N requests to consider for health calculation
      responseTimeWindowMs: 5 * 60 * 1000, // 5 minutes for response time tracking
      alertThresholds: {
        errorRate: 0.3, // Alert if error rate > 30%
        responseTime: 10000, // Alert if avg response time > 10s
        consecutiveFailures: 5 // Alert after 5 consecutive failures
      }
    };
    
    RequestHealthMonitor.instance = this;
    logger.debug('[RequestHealthMonitor] Initialized');
  }
  
  static getInstance() {
    if (!RequestHealthMonitor.instance) {
      RequestHealthMonitor.instance = new RequestHealthMonitor();
    }
    return RequestHealthMonitor.instance;
  }
  
  /**
   * Initialize provider health tracking
   */
  _initializeProvider(providerName) {
    if (this.providerHealth.has(providerName)) {
      return this.providerHealth.get(providerName);
    }
    
    const health = {
      requests: [],
      responseTimes: [],
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      consecutiveFailures: 0,
      lastRequestTime: 0,
      lastSuccessTime: 0,
      lastFailureTime: 0,
      // Health metrics
      currentErrorRate: 0,
      averageResponseTime: 0,
      healthScore: 1.0, // 0.0 (worst) to 1.0 (best)
      isHealthy: true,
      // Error analysis
      errorTypes: new Map(),
      quotaErrors: 0,
      rateLimitErrors: 0,
      networkErrors: 0,
      // Performance trends
      performanceTrend: 'stable', // 'improving', 'stable', 'degrading'
      lastHealthCheck: Date.now()
    };
    
    this.providerHealth.set(providerName, health);
    // Health tracking initialized
    return health;
  }
  
  /**
   * Record a successful request
   */
  recordSuccess(providerName, responseTimeMs, context = {}) {
    const health = this._initializeProvider(providerName);
    const now = Date.now();
    
    // Record request
    health.requests.push({
      timestamp: now,
      success: true,
      responseTime: responseTimeMs,
      context: context
    });
    
    // Update counters
    health.totalRequests++;
    health.successfulRequests++;
    health.consecutiveFailures = 0;
    health.lastRequestTime = now;
    health.lastSuccessTime = now;
    
    // Update global stats
    this.globalStats.totalRequests++;
    this.globalStats.successfulRequests++;
    
    // Record response time
    health.responseTimes.push({
      timestamp: now,
      duration: responseTimeMs
    });
    
    // Clean old data
    this._cleanOldData(health, now);
    
    // Update health metrics
    this._updateHealthMetrics(providerName, health);
    
    // Success recorded
  }
  
  /**
   * Record a failed request
   */
  recordFailure(providerName, error, responseTimeMs = 0, context = {}) {
    const health = this._initializeProvider(providerName);
    const now = Date.now();
    
    // Record request
    health.requests.push({
      timestamp: now,
      success: false,
      responseTime: responseTimeMs,
      error: error,
      context: context
    });
    
    // Update counters
    health.totalRequests++;
    health.failedRequests++;
    health.consecutiveFailures++;
    health.lastRequestTime = now;
    health.lastFailureTime = now;
    
    // Update global stats
    this.globalStats.totalRequests++;
    this.globalStats.failedRequests++;
    
    // Categorize error
    this._categorizeError(health, error);
    
    // Clean old data
    this._cleanOldData(health, now);
    
    // Update health metrics
    this._updateHealthMetrics(providerName, health);
    
    // Check for alerts
    this._checkHealthAlerts(providerName, health);
    
    // Use debug for user cancellations (not real errors)
    const isUserCancelled = error.message?.includes('cancelled by user');
    const logLevel = isUserCancelled ? 'debug' : 'warn';
    logger[logLevel](`[RequestHealthMonitor] Recorded failure for ${providerName}: ${error.message || error}`);
  }
  
  /**
   * Categorize error types for analysis
   */
  _categorizeError(health, error) {
    const errorType = error.type || 'UNKNOWN_ERROR';
    
    // Update error type counts
    const currentCount = health.errorTypes.get(errorType) || 0;
    health.errorTypes.set(errorType, currentCount + 1);
    
    // Update specific error counters
    if (errorType === 'QUOTA_EXCEEDED') {
      health.quotaErrors++;
    } else if (errorType === 'RATE_LIMIT_EXCEEDED') {
      health.rateLimitErrors++;
    } else if (error.name === 'NetworkError' || errorType.includes('NETWORK')) {
      health.networkErrors++;
    }
  }
  
  /**
   * Clean old data to maintain memory efficiency
   */
  _cleanOldData(health, now) {
    const windowSize = this.config.healthWindowSize;
    const timeWindow = this.config.responseTimeWindowMs;
    
    // Keep only recent requests for health calculation
    if (health.requests.length > windowSize) {
      health.requests = health.requests.slice(-windowSize);
    }
    
    // Keep only recent response times
    health.responseTimes = health.responseTimes.filter(
      rt => now - rt.timestamp < timeWindow
    );
  }
  
  /**
   * Update health metrics for a provider
   */
  _updateHealthMetrics(providerName, health) {
    const now = Date.now();
    
    // Calculate error rate from recent requests
    const recentRequests = health.requests;
    if (recentRequests.length > 0) {
      const failures = recentRequests.filter(r => !r.success).length;
      health.currentErrorRate = failures / recentRequests.length;
    }
    
    // Calculate average response time
    if (health.responseTimes.length > 0) {
      const totalTime = health.responseTimes.reduce((sum, rt) => sum + rt.duration, 0);
      health.averageResponseTime = totalTime / health.responseTimes.length;
    }
    
    // Calculate health score (0.0 to 1.0)
    health.healthScore = this._calculateHealthScore(health);
    
    // Determine if provider is healthy
    health.isHealthy = health.healthScore >= 0.7 &&
                     health.currentErrorRate < this.config.alertThresholds.errorRate &&
                     health.consecutiveFailures < this.config.alertThresholds.consecutiveFailures;
    
    // Determine performance trend
    health.performanceTrend = this._calculatePerformanceTrend(health);
    
    health.lastHealthCheck = now;
    
    // Health updated
  }
  
  /**
   * Calculate overall health score (0.0 to 1.0)
   */
  _calculateHealthScore(health) {
    let score = 1.0;
    
    // Penalize based on error rate (0-50% penalty)
    score -= Math.min(health.currentErrorRate * 0.5, 0.5);
    
    // Penalize based on response time (0-30% penalty)
    if (health.averageResponseTime > 1000) {
      const responseTimePenalty = Math.min(
        (health.averageResponseTime - 1000) / 10000 * 0.3,
        0.3
      );
      score -= responseTimePenalty;
    }
    
    // Penalize consecutive failures (0-30% penalty)
    if (health.consecutiveFailures > 0) {
      const failurePenalty = Math.min(health.consecutiveFailures / 10 * 0.3, 0.3);
      score -= failurePenalty;
    }
    
    // Bonus for recent activity (up to 10% bonus)
    const timeSinceLastSuccess = Date.now() - health.lastSuccessTime;
    if (timeSinceLastSuccess < 5 * 60 * 1000) { // Last 5 minutes
      score += Math.max(0, 0.1 * (1 - timeSinceLastSuccess / (5 * 60 * 1000)));
    }
    
    return Math.max(0, Math.min(1, score));
  }
  
  /**
   * Calculate performance trend
   */
  _calculatePerformanceTrend(health) {
    if (health.requests.length < 10) return 'stable';
    
    const recent = health.requests.slice(-5);
    const previous = health.requests.slice(-10, -5);
    
    const recentSuccessRate = recent.filter(r => r.success).length / recent.length;
    const previousSuccessRate = previous.filter(r => r.success).length / previous.length;
    
    const improvement = recentSuccessRate - previousSuccessRate;
    
    if (improvement > 0.1) return 'improving';
    if (improvement < -0.1) return 'degrading';
    return 'stable';
  }
  
  /**
   * Check for health alerts
   */
  _checkHealthAlerts(providerName, health) {
    const alerts = [];
    
    if (health.currentErrorRate > this.config.alertThresholds.errorRate) {
      alerts.push({
        type: 'HIGH_ERROR_RATE',
        message: `High error rate for ${providerName}: ${(health.currentErrorRate * 100).toFixed(1)}%`,
        severity: 'warning'
      });
    }
    
    if (health.averageResponseTime > this.config.alertThresholds.responseTime) {
      alerts.push({
        type: 'SLOW_RESPONSE_TIME',
        message: `Slow response time for ${providerName}: ${health.averageResponseTime.toFixed(0)}ms`,
        severity: 'warning'
      });
    }
    
    if (health.consecutiveFailures >= this.config.alertThresholds.consecutiveFailures) {
      alerts.push({
        type: 'CONSECUTIVE_FAILURES',
        message: `Multiple consecutive failures for ${providerName}: ${health.consecutiveFailures}`,
        severity: 'error'
      });
    }
    
    if (health.quotaErrors > 0 && health.quotaErrors === health.consecutiveFailures) {
      alerts.push({
        type: 'QUOTA_EXHAUSTED',
        message: `Quota exhausted for ${providerName}`,
        severity: 'critical'
      });
    }
    
    // Log alerts
    alerts.forEach(alert => {
      if (alert.severity === 'critical') {
        logger.error(`[RequestHealthMonitor] CRITICAL: ${alert.message}`);
      } else if (alert.severity === 'error') {
        logger.error(`[RequestHealthMonitor] ERROR: ${alert.message}`);
      } else {
        logger.warn(`[RequestHealthMonitor] WARNING: ${alert.message}`);
      }
    });
    
    return alerts;
  }
  
  /**
   * Get health status for a provider
   */
  getProviderHealth(providerName) {
    const health = this.providerHealth.get(providerName);
    if (!health) {
      return {
        initialized: false,
        providerName: providerName
      };
    }
    
    return {
      initialized: true,
      providerName: providerName,
      totalRequests: health.totalRequests,
      successfulRequests: health.successfulRequests,
      failedRequests: health.failedRequests,
      currentErrorRate: health.currentErrorRate,
      averageResponseTime: health.averageResponseTime,
      healthScore: health.healthScore,
      isHealthy: health.isHealthy,
      consecutiveFailures: health.consecutiveFailures,
      performanceTrend: health.performanceTrend,
      lastRequestTime: health.lastRequestTime,
      lastSuccessTime: health.lastSuccessTime,
      lastFailureTime: health.lastFailureTime,
      errorBreakdown: {
        quota: health.quotaErrors,
        rateLimit: health.rateLimitErrors,
        network: health.networkErrors,
        byType: Object.fromEntries(health.errorTypes)
      }
    };
  }
  
  /**
   * Get health status for all providers
   */
  getAllProvidersHealth() {
    const healthStatus = {};
    
    for (const [providerName] of this.providerHealth) {
      healthStatus[providerName] = this.getProviderHealth(providerName);
    }
    
    return {
      providers: healthStatus,
      global: {
        ...this.globalStats,
        uptime: Date.now() - this.globalStats.startTime,
        globalErrorRate: this.globalStats.totalRequests > 0 
          ? this.globalStats.failedRequests / this.globalStats.totalRequests 
          : 0
      }
    };
  }
  
  /**
   * Get recommended action based on provider health
   */
  getRecommendedAction(providerName) {
    const health = this.getProviderHealth(providerName);
    
    if (!health.initialized) {
      return { action: 'none', reason: 'Provider not initialized' };
    }
    
    if (health.errorBreakdown.quota > 0 && health.consecutiveFailures > 3) {
      return { 
        action: 'switch_provider', 
        reason: 'Quota exhausted - consider switching to alternative provider',
        urgency: 'high'
      };
    }
    
    if (health.currentErrorRate > 0.5) {
      return { 
        action: 'increase_delays', 
        reason: 'High error rate - increase request delays',
        urgency: 'medium'
      };
    }
    
    if (health.averageResponseTime > 15000) {
      return { 
        action: 'reduce_batch_size', 
        reason: 'Slow response times - reduce batch size',
        urgency: 'low'
      };
    }
    
    if (health.healthScore < 0.5) {
      return { 
        action: 'temporary_pause', 
        reason: 'Poor health score - consider temporary pause',
        urgency: 'medium'
      };
    }
    
    return { action: 'continue', reason: 'Provider is healthy' };
  }
  
  /**
   * Reset health data for a provider
   */
  resetProvider(providerName) {
    this.providerHealth.delete(providerName);
    logger.debug(`[RequestHealthMonitor] Reset health data for: ${providerName}`);
  }
  
  /**
   * Reset all health data
   */
  resetAll() {
    this.providerHealth.clear();
    this.globalStats = {
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      averageResponseTime: 0,
      startTime: Date.now()
    };
    logger.debug('[RequestHealthMonitor] Reset all health data');
  }
}

// Export singleton instance
export const requestHealthMonitor = RequestHealthMonitor.getInstance();