// src/managers/content/windows/utils/DismissAll.js

import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';
import { WindowsConfig } from "../core/WindowsConfig.js";

/**
 * Utility function to dismiss all selection windows across all documents
 */
export function dismissAllSelectionWindows() {
  const logger = getScopedLogger(LOG_COMPONENTS.CONTENT, 'DismissAll');
  logger.debug("Dismissing all selection windows");
  
  try {
    // Function to clean up from a specific document
    const cleanupDocument = (doc) => {
      // Remove popup hosts
      const hosts = doc.querySelectorAll(`.${WindowsConfig.CSS_CLASSES.POPUP_HOST}`);
      hosts.forEach((host) => {
        try {
          host.remove();
        } catch (innerErr) {
          logger.warn("Failed to remove a host", innerErr);
        }
      });
      
      // Remove icons
      const icons = doc.querySelectorAll(`#${WindowsConfig.IDS.ICON}`);
      icons.forEach((icon) => icon.remove());
      
      // Remove icon hosts
      const iconHosts = doc.querySelectorAll(`#${WindowsConfig.IDS.ICON_HOST}`);
      iconHosts.forEach((host) => host.remove());
    };

    // Clean current document
    cleanupDocument(document);

    // Also clean top document if different (for iframe cases)
    try {
      let currentWindow = window;
      let topDocument = document;

      while (currentWindow.parent !== currentWindow) {
        try {
          const parentDoc = currentWindow.parent.document;
          if (parentDoc) {
            topDocument = parentDoc;
            currentWindow = currentWindow.parent;
          } else {
            break;
          }
        } catch {
          break;
        }
      }

      if (topDocument !== document) {
        cleanupDocument(topDocument);
      }
    } catch (err) {
      logger.warn("Could not clean top document", err);
    }
    
    logger.debug("All selection windows dismissed successfully");
  } catch (err) {
    logger.error("Unknown error in dismissAllSelectionWindows", err);
  }
}