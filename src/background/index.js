// Background script entry point for Vue build
// Cross-browser service worker for Manifest V3

import { LifecycleManager } from "../managers/core/LifecycleManager.js";

const backgroundService = new LifecycleManager();
globalThis.backgroundService = backgroundService;
backgroundService.initialize();

export { backgroundService };