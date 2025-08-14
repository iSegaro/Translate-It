import { getScopedLogger } from '@/utils/core/logger.js';
import { LOG_COMPONENTS } from '@/utils/core/logConstants.js';
const logger = getScopedLogger(LOG_COMPONENTS.CORE, 'settings-modules');
// Utility for loading settings modules
// Separated from main options.js to avoid circular imports

export const loadSettingsModules = async () => {
  try {
    logger.debug("🔧 Loading settings modules...");

    const [providers, importExport, backup] = await Promise.all([
      import("@/store/modules/providers.js").catch((e) => {
        logger.warn("Failed to load providers module:", e.message);
        return null;
      }),
      import("@/store/modules/import-export.js").catch((e) => {
        logger.warn("Failed to load import-export module:", e.message);
        return null;
      }),
      import("@/store/modules/backup.js").catch((e) => {
        logger.warn("Failed to load backup module:", e.message);
        return null;
      }),
    ]);

    logger.debug("✅ Settings modules loaded:", {
      providers: !!providers,
      importExport: !!importExport,
      backup: !!backup,
    });

    return { providers, importExport, backup };
  } catch (error) {
    logger.error("❌ Failed to load settings modules:", error);
    throw error;
  }
};