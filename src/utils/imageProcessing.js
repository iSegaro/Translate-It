// src/utils/imageProcessing.js

import { logME } from "./helpers.js";
import { ErrorTypes } from "../services/ErrorTypes.js";

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
          // Draw cropped area to canvas
          ctx.drawImage(
            img,
            selectionData.x, // source x
            selectionData.y, // source y  
            selectionData.width, // source width
            selectionData.height, // source height
            0, // dest x
            0, // dest y
            selectionData.width, // dest width
            selectionData.height // dest height
          );

          // Convert to data URL
          const croppedDataUrl = canvas.toDataURL("image/png", 1.0);
          
          logME("[ImageProcessing] Image cropped successfully", {
            originalSize: `${img.naturalWidth}x${img.naturalHeight}`,
            croppedSize: `${selectionData.width}x${selectionData.height}`,
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