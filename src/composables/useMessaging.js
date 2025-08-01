import { MessagingStandards } from '@/core/MessagingStandards.js'

/**
 * Provides a standardized interface for messaging within Vue components.
 *
 * @param {string} context - The messaging context (e.g., 'popup', 'sidepanel').
 * @returns {object} An object with messenger instances.
 */
export function useMessaging(context) {
  const messenger = MessagingStandards.getMessenger(context)

  return {
    // General purpose sendMessage
    sendMessage: messenger.sendMessage.bind(messenger),

    // Specialized messengers for domain-specific tasks
    tts: messenger.specialized.tts,
    capture: messenger.specialized.capture,
    selection: messenger.specialized.selection,
    translation: messenger.specialized.translation,

    // Direct access to the core messenger if needed
    messenger
  }
}
