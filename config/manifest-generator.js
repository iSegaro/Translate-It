// config/manifest-generator.js
// Dynamic manifest generation for cross-browser compatibility

import pkg from '../package.json' with { type: 'json' };

/**
 * Generate browser-specific manifest
 * @param {string} browser - Target browser ('chrome' or 'firefox')
 * @returns {Object} Generated manifest object
 */
export function generateManifest(browser = 'chrome') {
  console.log(`📋 Generating manifest for ${browser}`);

  // Base manifest shared across browsers
  const baseManifest = {
    name: browser === 'firefox' ? '__MSG_nameFirefox__' : '__MSG_nameChrome__',
    version: pkg.version,
    description: '__MSG_description__',
    default_locale: 'en',
    
    // Core permissions (common to both browsers)
    permissions: [
      'storage',
      'scripting',
      'tabs',
      'clipboardWrite',
      'clipboardRead',
      'notifications',
      'contextMenus'
    ],

    host_permissions: ['<all_urls>', 'file://*/*'],
    
    // Content scripts
    content_scripts: [
      {
        js: ['src/core/content-scripts/index.js'],
        // CSS files will be manually copied and injected via JS
        matches: ['<all_urls>', 'file://*/*'],
        run_at: 'document_idle',
        all_frames: true
      }
    ],
    
    // Web accessible resources
    web_accessible_resources: [
      {
        resources: [
          'browser-polyfill.js',
          'html/offscreen.html',
          'offscreen.js',
          'icons/flags/*.svg',
          'icons/ui/*.gif',
          'icons/ui/*.png',
          'icons/ui/*.svg',
          'icons/extension/*.png',
          'icons/extension/*.svg',
          'icons/providers/*.png',
          'icons/providers/*.svg',
          'css/*.css',
          'styles/*.css',
          'src/styles/*.css',
          'js/*.js',
          '_locales/*',
          'Changelog.md'
        ],
        matches: ['<all_urls>', 'file://*/*'],
        use_dynamic_url: true
      }
    ],
    
    // Icons
    icons: {
      16: 'icons/extension/extension_icon_16.png',
      32: 'icons/extension/extension_icon_32.png',
      48: 'icons/extension/extension_icon_48.png',
      128: 'icons/extension/extension_icon_128.png'
    },
    
    // Commands
    commands: {
      'SELECT-ELEMENT-COMMAND': {
        suggested_key: {
          default: 'Alt+A',
          mac: 'Alt+Shift+S'  // Option+Shift+S to avoid conflict with Cmd+A (Select All)
        },
        description: 'Activate the \'Select Element\' mode for translation.'
      }
    }
  };

  // browser-specific configurations
  if (browser === 'firefox') {
    return generateFirefoxManifest(baseManifest);
  } else {
    return generateChromeManifest(baseManifest);
  }
}

/**
 * Generate Chrome-specific manifest (MV3)
 * @private
 */
function generateChromeManifest(baseManifest) {
  return {
    ...baseManifest,
    manifest_version: 3,
    
    // Chrome MV3 background service worker
    background: {
      service_worker: 'src/core/background/index.js',
      type: 'module'
    },
    
    // Chrome-specific permissions
    permissions: [
      ...baseManifest.permissions,
      'sidePanel',
      'tts',
      'offscreen',
      'proxy'
    ],
    
    // Chrome action (popup)
    action: {
      default_popup: 'html/popup.html',
      default_title: 'Translate It',
      default_icon: {
        16: 'icons/extension/extension_icon_16.png',
        32: 'icons/extension/extension_icon_32.png',
        48: 'icons/extension/extension_icon_48.png',
        128: 'icons/extension/extension_icon_128.png'
      }
    },
    
    // Chrome side panel
    side_panel: {
      default_path: 'html/sidepanel.html'
    },
    
    // Options page
    options_page: 'html/options.html',
    
    // Content Security Policy for Chrome MV3 (with Vue 3 compatibility)
    content_security_policy: {
      extension_pages: "script-src 'self' 'wasm-unsafe-eval'; object-src 'self'; trusted-types default vue dompurify;"
    }
  };
}

/**
 * Generate Firefox-specific manifest (MV3 with compatibility layer)
 * @private
 */
function generateFirefoxManifest(baseManifest) {
  const manifest = {
    ...baseManifest,
    manifest_version: 3,
    name: '__MSG_nameFirefox__',
    
    // Firefox MV3 background configuration
    background: {
      scripts: ['src/core/background/index.js'],
      type: 'module'
    },
    
    // Firefox-specific browser settings
    browser_specific_settings: {
      gecko: {
        id: 'ai-writing-companion@amm1rr.com',
        strict_min_version: '142.0', // Firefox 142+ for data_collection_permissions support (Android requires 142)
        data_collection_permissions: {
          required: ['none'] // Extension processes translations locally/externally without storing data
        }
      }
    },

    // Content Security Policy for Firefox with DOMPurify support
    content_security_policy: {
      extension_pages: "script-src 'self'; object-src 'self'; trusted-types default vue dompurify;"
    },
    
    // Firefox uses sidebar_action instead of side_panel
    sidebar_action: {
      default_panel: 'html/sidepanel.html',
      default_title: '__MSG_name__'
    },
    
    // Firefox action (popup) - similar to Chrome but with Firefox naming
    action: {
      default_popup: 'html/popup.html',
      default_title: '__MSG_name__',
      default_icon: {
        16: 'icons/extension/extension_icon_16.png',
        32: 'icons/extension/extension_icon_32.png',
        48: 'icons/extension/extension_icon_48.png',
        64: 'icons/extension/extension_icon_64.png',
        128: 'icons/extension/extension_icon_128.png',
        256: 'icons/extension/extension_icon_256.png',
        512: 'icons/extension/extension_icon_512.png'
      }
    },
    
    // Options UI
    options_ui: {
      page: 'html/options.html',
      open_in_tab: true
    },
    
    // Firefox extended icons
    icons: {
      ...baseManifest.icons,
      64: 'icons/extension/extension_icon_64.png',
      256: 'icons/extension/extension_icon_256.png',
      512: 'icons/extension/extension_icon_512.png'
    },
    
    // Firefox doesn't support offscreen API yet, so remove from permissions
    permissions: baseManifest.permissions,
    
    // Firefox-specific web accessible resources format
    web_accessible_resources: [
      {
        resources: [
          'browser-polyfill.js',
          'icons/flags/*.svg',
          'icons/ui/*.gif',
          'icons/ui/*.png',
          'icons/ui/*.svg',
          'icons/extension/*.png',
          'icons/extension/*.svg',
          'icons/providers/*.png',
          'icons/providers/*.svg',
          'css/*.css',
          'styles/*.css',
          'src/styles/*.css',
          'js/*.js',
          '_locales/*',
          'Changelog.md'
        ],
        matches: ['<all_urls>', 'file://*/*']
        // Note: use_dynamic_url not supported in Firefox yet
      }
    ]
  };

  // Ensure no persistent key is present for Firefox MV3
  if (manifest.background && manifest.background.persistent) {
    delete manifest.background.persistent;
  }

  return manifest;
}

/**
 * Get browser-specific manifest fields
 * @param {string} browser - Target browser
 * @returns {Object} browser-specific fields
 */
export function getbrowserSpecificFields(browser) {
  if (browser === 'firefox') {
    return {
      panelKey: 'sidebar_action',
      backgroundType: 'service-worker', // Firefox MV3 with service worker
      hasOffscreen: false,
      hasSidePanel: false,
      hasTTS: false, // Limited TTS support
      manifestVersion: 3
    };
  } else {
    return {
      panelKey: 'side_panel',
      backgroundType: 'service-worker',
      hasOffscreen: true,
      hasSidePanel: true, 
      hasTTS: true,
      manifestVersion: 3
    };
  }
}

/**
 * Validate generated manifest
 * @param {Object} manifest - Manifest to validate
 * @param {string} browser - Target browser
 * @returns {Object} Validation result
 */
export function validateManifest(manifest, browser) {
  const errors = [];
  const warnings = [];

  // Check required fields
  const requiredFields = ['manifest_version', 'name', 'version'];
  requiredFields.forEach(field => {
    if (!manifest[field]) {
      errors.push(`Missing required field: ${field}`);
    }
  });

  // Check manifest version
  if (manifest.manifest_version !== 3) {
    errors.push(`Expected manifest_version 3, got ${manifest.manifest_version}`);
  }

  // browser-specific validations
  if (browser === 'firefox') {
    if (!manifest.browser_specific_settings?.gecko?.id) {
      errors.push('Firefox manifest missing browser_specific_settings.gecko.id');
    }
    
    if (manifest.permissions?.includes('offscreen')) {
      warnings.push('Firefox does not support offscreen API yet');
    }
    
    if (manifest.side_panel) {
      warnings.push('Firefox uses sidebar_action instead of side_panel');
    }
  }

  if (browser === 'chrome') {
    if (!manifest.background?.service_worker) {
      errors.push('Chrome MV3 manifest missing background.service_worker');
    }
  }

  // Check icon files exist (warning only)
  if (manifest.icons) {
    Object.values(manifest.icons).forEach(iconPath => {
      if (!iconPath.includes('extension_icon_')) {
        warnings.push(`Unusual icon path: ${iconPath}`);
      }
    });
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings
  };
}

/**
 * Generate manifest with validation
 * @param {string} browser - Target browser
 * @returns {Object} Generated and validated manifest
 */
export function generateValidatedManifest(browser) {
  const manifest = generateManifest(browser);
  const validation = validateManifest(manifest, browser);
  
  if (!validation.valid) {
    throw new Error(`Invalid manifest for ${browser}: ${validation.errors.join(', ')}`);
  }
  
  if (validation.warnings.length > 0) {
    console.warn(`Manifest warnings for ${browser}:`, validation.warnings);
  }
  
  console.log(`✅ Generated valid ${browser} manifest`);
  return manifest;
}

export default generateManifest;