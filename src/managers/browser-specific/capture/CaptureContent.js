import { createLogger } from '@/utils/core/logger.js';

const logger = createLogger('Core', 'CaptureContent');
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