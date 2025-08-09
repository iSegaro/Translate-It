// Background script entry point for Vue build
// Cross-browser service worker for Manifest V3

import { LifecycleManager } from "../managers/core/LifecycleManager.js";
import { registerAllProviders } from "../providers/register-providers.js";

registerAllProviders();

const backgroundService = new LifecycleManager();
globalThis.backgroundService = backgroundService;

backgroundService.initialize().then(() => {
  console.log("✅ [Background] Background service initialization completed!");
}).catch((error) => {
  console.error("❌ [Background] Background service initialization failed:", error);
});

export { backgroundService };