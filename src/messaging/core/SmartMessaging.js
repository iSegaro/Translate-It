import browser from 'webextension-polyfill'
import { MessageActions } from '@/messaging/core/MessageActions.js'
import { getScopedLogger } from '@/utils/core/logger.js'
import { LOG_COMPONENTS } from '@/utils/core/logConstants.js'
import { isContextError } from '@/utils/core/extensionContext.js'

const logger = getScopedLogger(LOG_COMPONENTS.MESSAGING, 'SmartMessaging')

const FAST_ACTIONS = new Set([
  MessageActions.PING,
  MessageActions.GET_INFO,
  MessageActions.GET_SETTINGS,
  MessageActions.SET_SETTINGS,
  MessageActions.SYNC_SETTINGS,
  MessageActions.GET_SELECT_ELEMENT_STATE,
  MessageActions.SET_SELECT_ELEMENT_STATE,
  MessageActions.SELECT_ELEMENT_STATE_CHANGED,
  MessageActions.IS_Current_Page_Excluded,
  MessageActions.Set_Exclude_Current_Page,
  MessageActions.GET_HISTORY,
  MessageActions.CLEAR_HISTORY,
  MessageActions.ADD_TO_HISTORY,
  MessageActions.SHOW_NOTIFICATION,
  MessageActions.DISMISS_NOTIFICATION,
  MessageActions.REFRESH_CONTEXT_MENUS,
  MessageActions.GET_PROVIDER_STATUS,
  MessageActions.SET_ACTIVE_PROVIDER,
  MessageActions.GET_SERVICE_STATUS,
  MessageActions.GET_BACKGROUND_STATUS,
  MessageActions.OPEN_SIDE_PANEL,
  MessageActions.ACTIVATE_SELECT_ELEMENT_MODE,
  MessageActions.DEACTIVATE_SELECT_ELEMENT_MODE,
  MessageActions.GET_SELECTED_TEXT,
  MessageActions.CANCEL_TRANSLATION,
  MessageActions.SCREEN_CAPTURE_CANCELLED
])

const SLOW_ACTIONS = new Set([
  MessageActions.TRANSLATE,
  MessageActions.TRANSLATE_SELECTION,
  MessageActions.TRANSLATE_PAGE,
  MessageActions.FETCH_TRANSLATION,
  MessageActions.BATCH_TRANSLATE,
  MessageActions.TRANSLATE_TEXT,
  MessageActions.TRANSLATE_IMAGE,
  MessageActions.PROCESS_SELECTED_ELEMENT,
  MessageActions.GOOGLE_TTS_SPEAK,
  MessageActions.GOOGLE_TTS_STOP_ALL,
  MessageActions.PLAY_OFFSCREEN_AUDIO,
  MessageActions.SCREEN_CAPTURE,
  MessageActions.START_SCREEN_CAPTURE,
  MessageActions.CAPTURE_FULL_SCREEN,
  MessageActions.START_CAPTURE_SELECTION,
  MessageActions.PROCESS_IMAGE_OCR,
  MessageActions.CAPTURE_TRANSLATE_IMAGE_DIRECT,
  MessageActions.PROCESS_SCREEN_CAPTURE,
  MessageActions.START_AREA_CAPTURE,
  MessageActions.OCR_PROCESS,
  MessageActions.START_SCREEN_AREA_SELECTION,
  MessageActions.TEST_PROVIDER,
  MessageActions.TEST_PROVIDER_CONNECTION,
  MessageActions.VALIDATE_API_KEY
])

function isSlowAction(action) {
  return SLOW_ACTIONS.has(action)
}

function isFastAction(action) {
  return FAST_ACTIONS.has(action)
}

function promiseTimeout(promise, ms) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('timeout')), ms)
    promise.then((res) => {
      clearTimeout(timeout)
      resolve(res)
    }).catch((err) => {
      clearTimeout(timeout)
      reject(err)
    })
  })
}

export async function sendSmart(message, options = {}) {
  const {
    timeout = isFastAction(message.action) ? 3000 : 15000,
    usePortForAll = false
  } = options

  logger.debug('sendSmart:', {
    messageId: message.messageId,
    action: message.action,
    isFast: isFastAction(message.action),
    isSlow: isSlowAction(message.action),
    usePortForAll
  })

  if (usePortForAll || isSlowAction(message.action)) {
    logger.debug(`Using port-based messaging for ${message.action}`)
    return sendViaPort(message, timeout)
  }

  try {
    logger.debug(`Using direct runtime.sendMessage for ${message.action}`)
    const response = await promiseTimeout(browser.runtime.sendMessage(message), timeout)
    
    if (!response) {
      throw new Error('No response received')
    }
    
    if (response.ack && !response.success && !response.translatedText && !response.error) {
      logger.warn(`Received ACK-only response for fast action ${message.action}, this should not happen`)
      throw new Error('Received ACK-only response for fast action')
    }
    
    logger.debug('Direct sendMessage response:', response)
    return response
  } catch (error) {
    if (isContextError(error)) {
      logger.debug('Extension context invalidated, re-throwing immediately')
      throw error
    }
    
    logger.warn(`Direct messaging failed for ${message.action}, falling back to port:`, error.message)
    return sendViaPort(message, timeout)
  }
}

async function sendViaPort(message, timeout) {
  const port = browser.runtime.connect({ name: 'smart-messaging' })
  
  return new Promise((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      cleanup()
      reject(new Error(`Port messaging timeout after ${timeout}ms`))
    }, timeout)

    let isResolved = false
    let ackReceived = false

    const cleanup = () => {
      if (isResolved) return
      isResolved = true
      clearTimeout(timeoutId)
      try { port.onMessage.removeListener(onMessage) } catch {}
      try { port.onDisconnect.removeListener(onDisconnect) } catch {}
      try { port.disconnect() } catch {}
    }

    const onMessage = (response) => {
      try {
        if (!response || (response.messageId && response.messageId !== message.messageId)) {
          return
        }

        if (response.type === 'ACK' || response.ack) {
          logger.debug('Port ACK received for:', message.messageId)
          ackReceived = true
          return
        }

        if (response.type === 'RESULT' || response.result !== undefined) {
          cleanup()
          logger.debug('Port RESULT received for:', message.messageId)
          resolve(response.result || response)
          return
        }

        if (response.success !== undefined || response.error !== undefined || response.translatedText !== undefined) {
          cleanup()
          logger.debug('Port direct response received for:', message.messageId)
          resolve(response)
          return
        }
      } catch (err) {
        logger.error('Port message handler error:', err)
      }
    }

    const onDisconnect = () => {
      logger.debug('Port disconnected for:', message.messageId, { ackReceived })
      if (!isResolved) {
        cleanup()
        reject(new Error('Port disconnected before receiving response'))
      }
    }

    try {
      port.onMessage.addListener(onMessage)
      port.onDisconnect.addListener(onDisconnect)
      port.postMessage(message)
      logger.debug('Message sent via port:', message.messageId)
    } catch (error) {
      cleanup()
      reject(error)
    }
  })
}

export function getSmartMessagingStats() {
  return {
    fastActions: Array.from(FAST_ACTIONS),
    slowActions: Array.from(SLOW_ACTIONS),
    totalFastActions: FAST_ACTIONS.size,
    totalSlowActions: SLOW_ACTIONS.size,
    timestamp: Date.now()
  }
}

export default { sendSmart, getSmartMessagingStats }