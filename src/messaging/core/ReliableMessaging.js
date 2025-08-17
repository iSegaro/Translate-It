import browser from 'webextension-polyfill'
import { MessageActions } from '@/messaging/core/MessageActions.js'
import { getScopedLogger } from '@/utils/core/logger.js'
import { LOG_COMPONENTS } from '@/utils/core/logConstants.js'

const logger = getScopedLogger(LOG_COMPONENTS.MESSAGING, 'ReliableMessaging')

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
  const {
    ackTimeout = 1000,
    retries = 2,
    backoff = [300, 1000],
    totalTimeout = 12000,
  } = opts

  // Try runtime.sendMessage with retries, expect immediate response as ACK
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      logger.debug('sendReliable: attempt', attempt + 1, 'messageId', message.messageId)
      const res = await promiseTimeout(browser.runtime.sendMessage(message), ackTimeout)
      logger.debug('sendReliable: runtime.sendMessage response', res)
      // Consider any response a form of ACK; optionally check messageId
      if (res && (res.ack || res.success || res.messageId)) {
        return res
      }
      // if no actionable response, continue to retry
    } catch (err) {
      logger.warn('sendReliable: sendMessage attempt failed', attempt + 1, err && err.message)
      // fallthrough to retry/backoff
    }

    // backoff if more attempts remain
    if (attempt < retries) {
      const wait = backoff[Math.min(attempt, backoff.length - 1)] || 500
      await new Promise(r => setTimeout(r, wait))
    }
  }

  // Fallback to port-based messaging
  try {
    logger.debug('sendReliable: falling back to port', message.messageId)
    const port = browser.runtime.connect({ name: 'reliable-messaging' })

    return await new Promise((resolve, reject) => {
      const to = setTimeout(() => {
        try { port.disconnect() } catch {}
        reject(new Error('no-response'))
      }, totalTimeout)

    let ackReceived = false
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
          clearTimeout(to)
          try { port.onMessage.removeListener(onMsg) } catch {}
          try { port.disconnect() } catch {}
          resolve(m)
          return
        }
      } catch (err) {
        logger.error('sendReliable port onMessage handler error', err)
      }
    }

      try {
        port.onMessage.addListener(onMsg)
        port.postMessage(message)
      } catch (err) {
        clearTimeout(to)
        try { port.disconnect() } catch {}
        reject(err)
      }
    })
  } catch (err) {
    logger.error('sendReliable: port fallback failed', err)
    throw err
  }
}

export default { sendReliable }
