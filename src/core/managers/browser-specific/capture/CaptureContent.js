import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';

const logger = getScopedLogger(LOG_COMPONENTS.CORE, 'CaptureContent');
class CaptureContent {
  constructor() {
    logger.debug("CaptureContent initialized");
  }

  async captureScreen() {
    logger.warn("Screen capture not fully supported in content scripts for all browsers. Implement content script specific capture logic here.");
    // Placeholder for content script based screen capture logic
    return null;
  }
}

export { CaptureContent };