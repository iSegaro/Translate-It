import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';

// Lazy logger initialization to avoid TDZ issues
let logger = null;
function getLogger() {
  if (!logger) {
    try {
      logger = getScopedLogger(LOG_COMPONENTS.SETTINGS, 'settings-modules');
      // Ensure logger is not null
      if (!logger) {
        logger = {
          debug: () => {},
          warn: () => {},
          error: () => {},
          info: () => {},
          init: () => {}
        };
      }
    } catch {
      // Fallback to noop logger
      logger = {
        debug: () => {},
        warn: () => {},
        error: () => {},
        info: () => {},
        init: () => {}
      };
    }
  }
  return logger;
}
// Utility for loading settings modules
// Separated from main options.js to avoid circular imports

export const loadSettingsModules = async () => {
  try {
    getLogger().debug("🔧 Loading settings modules...");

    const [providers, importExport, backup] = await Promise.all([
      import("@/store/modules/providers.js").catch((e) => {
        getLogger().warn("Failed to load providers module:", e.message);
        return null;
      }),
      import("@/store/modules/import-export.js").catch((e) => {
        getLogger().warn("Failed to load import-export module:", e.message);
        return null;
      }),
      import("@/store/modules/backup.js").catch((e) => {
        getLogger().warn("Failed to load backup module:", e.message);
        return null;
      }),
    ]);

    getLogger().debug("✅ Settings modules loaded:", {
      providers: !!providers,
      importExport: !!importExport,
      backup: !!backup,
    });

    return { providers, importExport, backup };
  } catch (error) {
    getLogger().error("❌ Failed to load settings modules:", error);
    throw error;
  }
};