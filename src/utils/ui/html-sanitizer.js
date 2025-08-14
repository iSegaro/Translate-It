// src/utils/safeHtml.js
// Utility for safe HTML insertion with XSS protection

import { filterXSS } from "xss";
import { getScopedLogger } from '@/utils/core/logger.js';
import { LOG_COMPONENTS } from '@/utils/core/logConstants.js';
const logger = getScopedLogger(LOG_COMPONENTS.CORE, 'html-sanitizer');

/**
 * XSS configuration that matches the project's security requirements
 * Based on CLAUDE.md documentation
 */
const XSS_CONFIG = {
  whiteList: { br: [] }, // Only <br> tags allowed
  stripIgnoreTag: true, // Remove unknown tags
  stripIgnoreTagBody: ["script", "style"], // Block dangerous content
  onIgnoreTagAttr: function (tag, name, value) {
    // Block javascript:, data:, vbscript: URLs
    if (name === "href" || name === "src") {
      if (value.match(/^(javascript|data|vbscript):/i)) {
        return "";
      }
    }
    return false;
  },
};

/**
 * Safely set HTML content using filterXSS and DOMParser
 * @param {Element} element - Target element
 * @param {string} htmlContent - HTML content to set
 */
export function safeSetHTML(element, htmlContent) {
  if (!element || !htmlContent) {
    return;
  }

  try {
    // Sanitize HTML content using filterXSS with project configuration
    const sanitizedHtml = filterXSS(htmlContent, XSS_CONFIG);

    // Use DOMParser for safe HTML insertion (Firefox compatible)
    const parser = new DOMParser();
    const doc = parser.parseFromString(sanitizedHtml, "text/html");

    // Clear existing content
    element.textContent = "";

    // Append sanitized content
    Array.from(doc.body.childNodes).forEach((node) => {
      element.appendChild(node.cloneNode(true));
    });
  } catch (error) {
    // Fallback to safe text content on error
    logger.warn("safeSetHTML failed, falling back to textContent:", error);
    element.textContent = htmlContent.replace(/<[^>]*>/g, ""); // Strip HTML tags
  }
}

/**
 * Safely set text content only (no HTML)
 * @param {Element} element - Target element
 * @param {string} textContent - Text content to set
 */
export function safeSetText(element, textContent) {
  if (!element) {
    return;
  }

  element.textContent = textContent || "";
}

/**
 * Create a safe HTML element with sanitized content
 * @param {string} tagName - HTML tag name
 * @param {string} htmlContent - HTML content
 * @param {Object} attributes - Element attributes (optional)
 * @returns {Element} Created element with safe content
 */
export function createSafeElement(tagName, htmlContent = "", attributes = {}) {
  const element = document.createElement(tagName);

  // Set attributes
  Object.entries(attributes).forEach(([key, value]) => {
    element.setAttribute(key, value);
  });

  // Set content safely
  if (htmlContent) {
    safeSetHTML(element, htmlContent);
  }

  return element;
}