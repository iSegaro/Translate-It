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
    // Import provider registry from central index
    const { ProviderRegistry } = await import("../providers/index.js");
    const providers = [];
    for (const [id, ProviderClass] of ProviderRegistry.providers) {
      providers.push({
        id,
        name: ProviderClass.displayName || id,
        description: ProviderClass.description || "",
        type: ProviderClass.type || "unknown",
        available: true,
      });
    }
    logger.debug("[ProviderHandler] Available providers:", providers.length);
    return providers;
  } catch (error) {
    logger.error("[ProviderHandler] Error getting providers:", error);
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