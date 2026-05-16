# Implementation Plan: Auto-Translate on Page Load (Domain Allowlist)

## 1. Overview & Objective
Add an optional setting `WHOLE_PAGE_AUTO_TRANSLATE_ON_LOAD` that automatically triggers the initial whole-page translation when a page finishes loading, gated by a per-domain allowlist (`WHOLE_PAGE_AUTO_TRANSLATE_DOMAINS`). 
- **Default state:** OFF (Preserves current behavior).
- **Architecture:** Uses a lightweight Bootstrapper to prevent architectural bloat and maintain the "Lazy-Load" philosophy for heavy features.

---

## 2. Configuration & State Management

### A. `src/shared/config/config.js`
Add the new configuration keys and their default values to the `CONFIG` object, and export getter functions.
```javascript
// Add to the main CONFIG object
WHOLE_PAGE_AUTO_TRANSLATE_ON_LOAD: false,
WHOLE_PAGE_AUTO_TRANSLATE_DOMAINS: '',

// Add to the async getters section
export const getWholePageAutoTranslateOnLoadAsync = async () => 
  await getSettingAsync("WHOLE_PAGE_AUTO_TRANSLATE_ON_LOAD", CONFIG.WHOLE_PAGE_AUTO_TRANSLATE_ON_LOAD);

export const getWholePageAutoTranslateDomainsAsync = async () => 
  await getSettingAsync("WHOLE_PAGE_AUTO_TRANSLATE_DOMAINS", CONFIG.WHOLE_PAGE_AUTO_TRANSLATE_DOMAINS);
```

### B. `src/shared/managers/SettingsManager.js`
Ensure the defaults are included in `SettingsManager.js` (around line 81):
```javascript
WHOLE_PAGE_AUTO_TRANSLATE_ON_LOAD: false,
WHOLE_PAGE_AUTO_TRANSLATE_DOMAINS: '',
```

### C. `src/features/settings/stores/settings.js`
Add to the store's initial state (around line 136):
```javascript
WHOLE_PAGE_AUTO_TRANSLATE_ON_LOAD: CONFIG.WHOLE_PAGE_AUTO_TRANSLATE_ON_LOAD ?? false,
WHOLE_PAGE_AUTO_TRANSLATE_DOMAINS: CONFIG.WHOLE_PAGE_AUTO_TRANSLATE_DOMAINS ?? '',
```

---

## 3. Localization (i18n)
Add the following keys to `src/_locales/en/messages.json`, `fa/messages.json`, and `ja/messages.json`.

```json
  "whole_page_auto_translate_on_load_label": {
    "message": "Auto-translate on page load",
    "description": "Label for auto-translating the page when it loads"
  },
  "whole_page_auto_translate_on_load_description": {
    "message": "Automatically translate the page when you visit it.",
    "description": "Description for the auto-translate on load setting"
  },
  "whole_page_auto_translate_domains_placeholder": {
    "message": "e.g. *.github.com\nwikipedia.org",
    "description": "Placeholder for the domains allowlist textarea"
  }
```

---

## 4. UI Implementation (`src/apps/options/tabs/ActivationTab.vue`)

**Template:** Place after `WHOLE_PAGE_AUTO_TRANSLATE_ON_DOM_CHANGES`.
```html
<div class="setting-item">
  <v-switch
    v-model="wholePageAutoTranslateOnLoad.value"
    :label="t('whole_page_auto_translate_on_load_label') || 'Auto-translate on page load'"
    color="primary"
    hide-details
  ></v-switch>
  
  <v-expand-transition>
    <div v-if="wholePageAutoTranslateOnLoad.value" class="mt-2 pl-4 border-s-sm">
      <v-textarea
        v-model="wholePageAutoTranslateDomains.value"
        :placeholder="t('whole_page_auto_translate_domains_placeholder') || 'e.g. *.github.com\nwikipedia.org'"
        variant="outlined" density="compact" rows="3" auto-grow hide-details
      ></v-textarea>
    </div>
  </v-expand-transition>
</div>
```

---

## 5. Core Logic: `src/features/page-translation/utils/AutoTranslateBootstrapper.js`

```javascript
import { settingsManager } from '@/shared/managers/SettingsManager.js';
import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';

const logger = getScopedLogger(LOG_COMPONENTS.PAGE_TRANSLATION, 'AutoBootstrapper');

export class AutoTranslateBootstrapper {
  static async checkAndTrigger() {
    try {
      if (!settingsManager.get('WHOLE_PAGE_AUTO_TRANSLATE_ON_LOAD', false)) return;

      const rawDomains = settingsManager.get('WHOLE_PAGE_AUTO_TRANSLATE_DOMAINS', '');
      if (!this._isDomainAllowed(rawDomains, window.location.hostname)) return;

      const { loadFeature } = await import('@/core/content-scripts/chunks/lazy-features.js');
      const pageTranslationManager = await loadFeature('pageTranslation');
      if (!pageTranslationManager) return;

      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => this._executeTranslation(pageTranslationManager), { once: true });
      } else {
        this._executeTranslation(pageTranslationManager);
      }
    } catch (error) {
      logger.error('Failed in AutoTranslateBootstrapper:', error);
    }
  }

  static async _executeTranslation(manager) {
    try {
      await manager.translatePage({ isAuto: true });
    } catch (error) {
      logger.error('Auto translation execution failed:', error);
    }
  }

  static _isDomainAllowed(rawDomains, currentHost) {
    if (!rawDomains || !rawDomains.trim()) return true;
    const domains = rawDomains.split('\n').map(d => d.trim()).filter(Boolean);
    return domains.some(domain => {
      if (domain.startsWith('*.')) {
        const baseDomain = domain.slice(2);
        return currentHost === baseDomain || currentHost.endsWith('.' + baseDomain);
      }
      return currentHost === domain;
    });
  }
}
```

---

## 6. Hooking into `src/core/content-scripts/index-main.js`

```javascript
        try {
          const { AutoTranslateBootstrapper } = await import('@/features/page-translation/utils/AutoTranslateBootstrapper.js');
          AutoTranslateBootstrapper.checkAndTrigger();
        } catch (e) { /* ignore */ }
```

---

## 7. Testing Strategy (`src/features/page-translation/utils/AutoTranslateBootstrapper.test.js`)

Consistent with `TESTING_STRATEGY.md`, implement these tests:

```javascript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AutoTranslateBootstrapper } from './AutoTranslateBootstrapper.js';
import { settingsManager } from '@/shared/managers/SettingsManager.js';

vi.mock('@/shared/managers/SettingsManager.js', () => ({
  settingsManager: { get: vi.fn() }
}));

vi.mock('@/core/content-scripts/chunks/lazy-features.js', () => ({
  loadFeature: vi.fn().mockResolvedValue({ translatePage: vi.fn() })
}));

describe('AutoTranslateBootstrapper', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('location', { hostname: 'example.com' });
  });

  describe('_isDomainAllowed', () => {
    it('should allow all domains if list is empty', () => {
      expect(AutoTranslateBootstrapper._isDomainAllowed('', 'any.com')).toBe(true);
    });

    it('should match exact domains', () => {
      expect(AutoTranslateBootstrapper._isDomainAllowed('example.com', 'example.com')).toBe(true);
      expect(AutoTranslateBootstrapper._isDomainAllowed('example.com', 'google.com')).toBe(false);
    });

    it('should support wildcards', () => {
      const list = '*.wikipedia.org';
      expect(AutoTranslateBootstrapper._isDomainAllowed(list, 'en.wikipedia.org')).toBe(true);
      expect(AutoTranslateBootstrapper._isDomainAllowed(list, 'wikipedia.org')).toBe(true);
      expect(AutoTranslateBootstrapper._isDomainAllowed(list, 'wikibooks.org')).toBe(false);
    });
  });

  describe('checkAndTrigger', () => {
    it('should abort if setting is disabled', async () => {
      settingsManager.get.mockReturnValue(false);
      await AutoTranslateBootstrapper.checkAndTrigger();
      // Verify loadFeature was not called
    });
  });
});
```

---

## 8. Verification Steps
1. **Manual**: Test domain matching with `*.` and exact matches.
2. **Automated**: Run `pnpm test src/features/page-translation/utils/AutoTranslateBootstrapper.test.js`.
3. **Quota**: Confirm token-warning still appears for AI providers (Integrated check).
