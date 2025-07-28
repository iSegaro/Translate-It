// src/utils/imageProcessing.js

import { logME } from "./helpers.js";
import { ErrorTypes } from "../error-management/ErrorTypes.js";

/**
 * Crop image data using canvas (content script only)
 * @param {string} imageDataUrl - Full screen capture data URL
 * @param {Object} selectionData - Area selection data
 * @returns {Promise<string>} Cropped image data URL
 */
export async function cropImageData(imageDataUrl, selectionData) {
  return new Promise((resolve, reject) => {
    try {
      logME("[ImageProcessing] Starting image crop:", {
        selection: selectionData,
        hasImage: !!imageDataUrl
      });

      // Create canvas for cropping
      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d");
      
      // Set canvas size to selected area
      canvas.width = selectionData.width;
      canvas.height = selectionData.height;

      // Load full screen image
      const img = new window.Image();
      
      img.onload = () => {
        try {
          // Get device pixel ratio for high-DPI displays
          const devicePixelRatio = window.devicePixelRatio || 1;
          
          // Calculate actual coordinates on the captured image
          // browser capture may be at device pixel ratio
          const actualX = selectionData.x * devicePixelRatio;
          const actualY = selectionData.y * devicePixelRatio;
          const actualWidth = selectionData.width * devicePixelRatio;
          const actualHeight = selectionData.height * devicePixelRatio;
          
          // Ensure coordinates are within image bounds
          const maxX = Math.min(actualX, img.naturalWidth - actualWidth);
          const maxY = Math.min(actualY, img.naturalHeight - actualHeight);
          const safeX = Math.max(0, maxX);
          const safeY = Math.max(0, maxY);
          const safeWidth = Math.min(actualWidth, img.naturalWidth - safeX);
          const safeHeight = Math.min(actualHeight, img.naturalHeight - safeY);

          logME("[ImageProcessing] Coordinate calculation:", {
            original: { x: selectionData.x, y: selectionData.y, width: selectionData.width, height: selectionData.height },
            devicePixelRatio: devicePixelRatio,
            calculated: { x: actualX, y: actualY, width: actualWidth, height: actualHeight },
            safe: { x: safeX, y: safeY, width: safeWidth, height: safeHeight },
            imageSize: { width: img.naturalWidth, height: img.naturalHeight },
            coordinateSystem: "viewport-relative (matches browser capture)",
            debug: selectionData.debug || {}
          });

          // Draw cropped area to canvas
          ctx.drawImage(
            img,
            safeX, // source x
            safeY, // source y  
            safeWidth, // source width
            safeHeight, // source height
            0, // dest x
            0, // dest y
            selectionData.width, // dest width (original size for display)
            selectionData.height // dest height (original size for display)
          );

          // Convert to data URL
          const croppedDataUrl = canvas.toDataURL("image/png", 1.0);
          
          logME("[ImageProcessing] Image cropped successfully", {
            originalSize: `${img.naturalWidth}x${img.naturalHeight}`,
            croppedSize: `${selectionData.width}x${selectionData.height}`,
            actualCroppedSize: `${safeWidth}x${safeHeight}`,
            croppedDataLength: croppedDataUrl.length
          });

          resolve(croppedDataUrl);
        } catch (error) {
          logME("[ImageProcessing] Error during canvas drawing:", error);
          const cropError = new Error(`Failed to crop image: ${error.message}`);
          cropError.type = ErrorTypes.IMAGE_PROCESSING_FAILED;
          reject(cropError);
        }
      };

      img.onerror = (error) => {
        logME("[ImageProcessing] Error loading image for cropping:", error);
        const loadError = new Error("Failed to load image for cropping");
        loadError.type = ErrorTypes.IMAGE_PROCESSING_FAILED;
        reject(loadError);
      };

      // Start loading image
      img.src = imageDataUrl;

    } catch (error) {
      logME("[ImageProcessing] Error setting up image crop:", error);
      const setupError = new Error(`Failed to setup image cropping: ${error.message}`);
      setupError.type = ErrorTypes.IMAGE_PROCESSING_FAILED;
      reject(setupError);
    }
  });
}

/**
 * Validate image data URL format
 * @param {string} imageDataUrl - Image data URL to validate
 * @returns {boolean} True if valid
 */
export function isValidImageDataUrl(imageDataUrl) {
  if (!imageDataUrl || typeof imageDataUrl !== 'string') {
    return false;
  }
  
  // Check for data URL format
  return imageDataUrl.startsWith('data:image/') && imageDataUrl.includes('base64,');
}

/**
 * Get image dimensions from data URL
 * @param {string} imageDataUrl - Image data URL
 * @returns {Promise<Object>} Image dimensions {width, height}
 */
export async function getImageDimensions(imageDataUrl) {
  return new Promise((resolve, reject) => {
    const img = new window.Image();
    
    img.onload = () => {
      resolve({
        width: img.naturalWidth,
        height: img.naturalHeight
      });
    };
    
    img.onerror = () => {
      reject(new Error("Failed to load image for dimension calculation"));
    };
    
    img.src = imageDataUrl;
  });
}