import { MessagingCore } from '../core/MessagingCore.js'

/**
 * Provides a standardized interface for messaging within Vue components.
 *
 * @param {string} context - The messaging context (e.g., 'popup', 'sidepanel').
 * @returns {object} An object with messenger instances and specialized messengers.
 * 
 * @example
 * ```javascript
 * const { translation, tts, provider, service, background } = useMessaging('popup');
 * 
 * // Translation operations
 * await translation.translate('Hello', { from: 'en', to: 'fa' });
 * 
 * // TTS operations  
 * await tts.speak('Hello world', 'en-US');
 * 
 * // Provider management
 * const providers = await provider.getProviders();
 * await provider.testConnection('google-translate');
 * 
 * // Service operations
 * const status = await service.getServiceStatus();
 * await service.clearCache();
 * 
 * // Background operations
 * await background.warmupServices();
 * const metrics = await background.getPerformanceMetrics();
 * ```
 */
export function useMessaging(context) {
  const messenger = MessagingCore.getMessenger(context)

  return {
    // General purpose sendMessage
    sendMessage: messenger.sendMessage.bind(messenger),

    // Specialized messengers for domain-specific tasks
    tts: messenger.specialized.tts,
    capture: messenger.specialized.capture,
    selection: messenger.specialized.selection,
    translation: messenger.specialized.translation,
    provider: messenger.specialized.provider,
    service: messenger.specialized.service,
    background: messenger.specialized.background,

    // Direct access to the core messenger if needed
    messenger
  }
}
