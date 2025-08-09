// Background script entry point for Vue build
// Cross-browser service worker for Manifest V3

import { LifecycleManager } from "../managers/core/LifecycleManager.js";
import { registerAllProviders } from "../providers/register-providers.js";
import { createLogger } from '@/utils/core/logger.js';

const logger = createLogger('Core', 'index');

registerAllProviders();

const backgroundService = new LifecycleManager();
globalThis.backgroundService = backgroundService;

backgroundService.initialize().then(() => {
  logger.debug("✅ [Background] Background service initialization completed!");
}).catch((error) => {
  logger.error("❌ [Background] Background service initialization failed:", error);
});

export { backgroundService };