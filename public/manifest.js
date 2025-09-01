import pkg from '../package.json'

const manifest = {
  "manifest_version": 3,
  "name": "__MSG_nameChrome__",
  "version": pkg.version,
  "description": "__MSG_description__",
  "default_locale": "en",
  "permissions": [
    "sidePanel",
    "scripting",
    "storage",
    "tts",
    "offscreen",
    "tabs",
    "clipboardWrite",
    "clipboardRead",
    "notifications",
    "contextMenus"
  ],
  "host_permissions": ["<all_urls>"],
  "background": {
    "service_worker": "src/background/index.js",
    "type": "module"
  },
  "content_scripts": [
    {
      "js": [
        "src/content-scripts/index.js"
      ],
      "matches": [
        "<all_urls>"
      ]
    }
  ],
  "action": {
    "default_popup": "popup.html",
    "default_title": "Translate It",
    "default_icon": {
      "16": "src/assets/icons/extension/extension_icon_16.png",
      "32": "src/assets/icons/extension/extension_icon_32.png",
      "48": "src/assets/icons/extension/extension_icon_48.png",
      "128": "src/assets/icons/extension/extension_icon_128.png"
    }
  },
  "side_panel": {
    "default_path": "sidepanel.html"
  },
  "options_page": "options.html",
  "icons": {
    "16": "src/assets/icons/extension/extension_icon_16.png",
    "32": "src/assets/icons/extension/extension_icon_32.png",
    "48": "src/assets/icons/extension/extension_icon_48.png",
    "128": "src/assets/icons/extension/extension_icon_128.png"
  },
  "web_accessible_resources": [
    {
      "resources": [
        "browser-polyfill.js",
        "src/assets/icons/flags/*.svg",
        "src/assets/icons/ui/*.png",
        "src/assets/icons/ui/*.svg",
        "src/assets/icons/extension/*.png",
        "src/assets/icons/extension/*.svg",
        "src/assets/icons/providers/*.png",
        "src/assets/icons/providers/*.svg",
        "css/*.css",
        "js/*.js",
        "_locales/*"
      ],
      "matches": ["<all_urls>"],
      "use_dynamic_url": true
    }
  ],
  "content_security_policy": {
    "extension_pages": "script-src 'self' http://localhost:*; object-src 'self'; connect-src 'self' ws://localhost:*;"
  },
  "commands": {
    "SELECT-ELEMENT-COMMAND": {
      "suggested_key": {
        "default": "Alt+A",
        "mac": "Command+A"
      },
      "description": "Activate the 'Select Element' mode for translation."
    }
  }
}

export default manifest