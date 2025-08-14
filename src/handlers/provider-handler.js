import { getScopedLogger } from '@/utils/core/logger.js';
import { LOG_COMPONENTS } from '@/utils/core/logConstants.js';
const logger = getScopedLogger(LOG_COMPONENTS.CORE, 'provider-handler');
/**
 * Provider Handler - Handle provider-related requests
 * Based on OLD implementation pattern for reliability
 */

export async function getAvailableProviders() {
  logger.debug("[ProviderHandler] Getting available providers");

  try {
    // Import provider registry dynamically
    const { ProviderRegistry } = await import("../providers/index.js");

    // Get available providers based on browser compatibility
    const providers = ProviderRegistry.getAvailableProviders();

    logger.debug("[ProviderHandler] Available providers:", providers.length);

    return providers;
  } catch (error) {
    logger.error("[ProviderHandler] Error getting providers:", error);

    // Return default fallback providers
    return [
      {
        id: "google",
        name: "Google Translate",
        description: "Free Google Translate service",
        type: "free",
        available: true,
      },
    ];
  }
}