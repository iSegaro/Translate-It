/**
 * Site Handlers Index - Central export point for all site handlers
 * Provides easy access to all available handlers
 */

export { BaseSiteHandler } from './base/BaseSiteHandler.js';
export { GoogleSuiteHandler } from './base/GoogleSuiteHandler.js';
export { MicrosoftOfficeHandler } from './base/MicrosoftOfficeHandler.js';
export { ZohoWriterHandler } from './ZohoWriterHandler.js';

// Export handler registry
export { siteHandlerRegistry, SiteHandlerRegistry } from '../registry/SiteHandlerRegistry.js';

// Export types
export * from '../core/types.js';