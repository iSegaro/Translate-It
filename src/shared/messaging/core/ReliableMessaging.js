import browser from 'webextension-polyfill'
import { MessageActions } from './MessageActions.js'
import { getScopedLogger } from '@/shared/logging/logger.js'
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js'
import { isContextError } from '@/core/extensionContext.js' // Add this import

const logger = getScopedLogger(LOG_COMPONENTS.MESSAGING, 'ReliableMessaging')

// Circuit breaker for preventing excessive retry attempts
class CircuitBreaker {
  constructor(options = {}) {
    this.failureThreshold = options.failureThreshold || 5
    this.resetTimeout = options.resetTimeout || 60000 // 1 minute
    this.state = 'CLOSED' // CLOSED, OPEN, HALF_OPEN
    this.failureCount = 0
    this.lastFailureTime = null
    this.successCount = 0
  }

  canExecute() {
    if (this.state === 'CLOSED') return true
    if (this.state === 'OPEN') {
      const timeSinceLastFailure = Date.now() - this.lastFailureTime
      if (timeSinceLastFailure >= this.resetTimeout) {
        this.state = 'HALF_OPEN'
        this.successCount = 0
        logger.debug('Circuit breaker: transitioning to HALF_OPEN state')
        return true
      }
      return false
    }
    if (this.state === 'HALF_OPEN') return true
    return false
  }

  onSuccess() {
    this.failureCount = 0
    if (this.state === 'HALF_OPEN') {
      this.successCount++
      if (this.successCount >= 2) { // Require 2 successes to close
        this.state = 'CLOSED'
        logger.debug('Circuit breaker: transitioning to CLOSED state after successful requests')
      }
    }
  }

  onFailure() {
    this.failureCount++
    this.lastFailureTime = Date.now()
    
    if (this.failureCount >= this.failureThreshold) {
      this.state = 'OPEN'
      logger.warn(`Circuit breaker: OPENED due to ${this.failureCount} consecutive failures`)
    }
  }

  getState() {
    return {
      state: this.state,
      failureCount: this.failureCount,
      lastFailureTime: this.lastFailureTime,
      successCount: this.successCount
    }
  }
}

// Global circuit breaker instance
const circuitBreaker = new CircuitBreaker({
  failureThreshold: 3, // More aggressive for translation failures
  resetTimeout: 30000  // 30 seconds
})

function promiseTimeout(promise, ms) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('timeout')), ms)
    promise.then((res) => {
      clearTimeout(t)
      resolve(res)
    }).catch((err) => {
      clearTimeout(t)
      reject(err)
    })
  })
}

export async function sendReliable(message, opts = {}) {
  // Special handling for translation requests to prevent duplicate processing
  const isTranslateMessage = message.action === 'TRANSLATE'
  
  const {
    ackTimeout = 1000,
    retries = isTranslateMessage ? 0 : 2, // No retries for translation requests
    backoff = [300, 1000, 2000], // Enhanced backoff strategy
    totalTimeout = isTranslateMessage ? 8000 : 12000, // Shorter timeout for translations
  } = opts

  // Check circuit breaker before attempting
  if (!circuitBreaker.canExecute()) {
    const state = circuitBreaker.getState()
    logger.warn('Circuit breaker is OPEN, rejecting request', { 
      messageId: message.messageId,
      failureCount: state.failureCount,
      timeSinceLastFailure: Date.now() - state.lastFailureTime
    })
    throw new Error('Circuit breaker is open - too many recent failures')
  }

  let lastError = null
  let allAttemptsFailed = true

  // Try runtime.sendMessage with retries, expect immediate response as ACK
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      logger.debug('sendReliable: attempt', attempt + 1, 'messageId', message.messageId)
      const res = await promiseTimeout(browser.runtime.sendMessage(message), ackTimeout)
      logger.debug('sendReliable: runtime.sendMessage response', res)
      
      // For ACK-only responses, we need to wait for the actual result
      if (res && res.ack && !res.success && !res.translatedText) {
        logger.debug('sendReliable: received ACK via sendMessage, continue to port fallback for result')
        allAttemptsFailed = false
        break; // break from retry loop to go to port fallback
      }
      // For complete responses (with actual data), return immediately
      if (res && (res.success || res.translatedText || res.error)) {
        circuitBreaker.onSuccess()
        return res
      }
      // if no actionable response, continue to retry
    } catch (err) {
      lastError = err
      // Check if it's an extension context invalidated error
      if (isContextError(err)) {
        logger.debug('sendReliable: Extension context invalidated, skipping circuit breaker failure and retries.')
        throw err; // Re-throw immediately, do not count as a circuit breaker failure
      }
      const logLevel = attempt === retries ? 'warn' : 'debug'
      logger[logLevel]('sendReliable: sendMessage attempt failed', attempt + 1, err && err.message)
    }

    // Enhanced exponential backoff if more attempts remain
    if (attempt < retries) {
      const baseWait = backoff[Math.min(attempt, backoff.length - 1)] || 500
      const jitter = Math.random() * 200 // Add jitter to prevent thundering herd
      const wait = baseWait + jitter
      logger.debug(`sendReliable: waiting ${Math.round(wait)}ms before next attempt`)
      await new Promise(r => setTimeout(r, wait))
    }
  }

  // Fallback to port-based messaging
  try {
    if (allAttemptsFailed) {
      logger.info('sendReliable: all runtime.sendMessage attempts failed, falling back to port', {
        messageId: message.messageId,
        lastError: lastError?.message
      })
    } else {
      logger.debug('sendReliable: falling back to port', message.messageId)
    }
    
    const port = browser.runtime.connect({ name: 'reliable-messaging' })

    return await new Promise((resolve, reject) => {
      const to = setTimeout(() => {
        logger.warn('sendReliable: timeout waiting for RESULT', {
          messageId: message.messageId,
          ackReceived,
          totalTimeout
        })
        cleanup()
        // Don't call circuitBreaker.onFailure() for TRANSLATE timeouts to allow background processing
        if (message.action !== 'TRANSLATE') {
          circuitBreaker.onFailure()
        }
        reject(new Error('no-response'))
      }, totalTimeout)

      let ackReceived = false
      let isResolved = false

      const cleanup = () => {
        if (isResolved) return
        isResolved = true
        clearTimeout(to)
        try { port.onMessage.removeListener(onMsg) } catch {}
        try { port.onDisconnect.removeListener(onDisconnect) } catch {}
        // Don't disconnect port on timeout to allow background processing to continue
        // try { port.disconnect() } catch {}
      }

      const onMsg = (m) => {
        try {
          if (!m) return
          if (m.messageId && m.messageId !== message.messageId) return

          // ACK handling: mark and keep waiting for final RESULT
          if (m.type === 'ACK' || m.ack) {
            logger.debug('sendReliable: received ACK via port', m)
            ackReceived = true
            return
          }

          // RESULT handling: resolve with final payload
          if (m.type === 'RESULT' || m.result) {
            cleanup()
            circuitBreaker.onSuccess()
            // Return the actual result data, not the wrapper message
            resolve(m.result || m)
            return
          }
        } catch (err) {
          logger.error('sendReliable port onMessage handler error', err)
        }
      }

      const onDisconnect = () => {
        logger.debug('sendReliable: port disconnected', {
          messageId: message.messageId,
          ackReceived,
          isResolved,
          action: message.action
        })
        if (!isResolved) {
          cleanup()
          circuitBreaker.onFailure()
          reject(new Error('port-disconnected'))
        }
      }

      try {
        port.onMessage.addListener(onMsg)
        port.onDisconnect.addListener(onDisconnect)
        port.postMessage(message)
      } catch (err) {
        cleanup()
        circuitBreaker.onFailure()
        reject(err)
      }
    })
  } catch (err) {
    logger.error('sendReliable: port fallback failed', err)
    // Check if it's an extension context invalidated error
    if (isContextError(err)) {
      logger.debug('sendReliable: Extension context invalidated during port fallback, skipping circuit breaker failure.')
      throw err; // Re-throw immediately, do not count as a circuit breaker failure
    }
    circuitBreaker.onFailure() // Only call onFailure if it's not a context error
    
    // Add debugging information to the error
    const enhancedError = new Error(`ReliableMessaging failed: ${err.message}`)
    enhancedError.originalError = err
    enhancedError.circuitBreakerState = circuitBreaker.getState()
    enhancedError.messageId = message.messageId
    
    throw enhancedError
  }
}

// Export circuit breaker state for debugging
export function getMessagingStats() {
  return {
    circuitBreaker: circuitBreaker.getState(),
    timestamp: Date.now()
  }
}

export default { sendReliable, getMessagingStats }
