<template>
  <aside class="options-sidebar">
    <div
      v-if="sidebarError"
      class="sidebar-error"
    >
      <h2>Sidebar Error</h2>
      <pre>{{ sidebarError }}</pre>
    </div>
    <div
      v-else
      class="sidebar-content"
    >
      <div class="sidebar-header">
        <a
          :href="REPO_URLS.GITHUB_MAIN"
          target="_blank"
          rel="noopener noreferrer"
          class="header-logo-link"
        >
          <h1>{{ t('name') }}</h1>
          <span>{{ manifestVersion }}</span>
        </a>
        <p>{{ t('description') }}</p>
      </div>
      <div class="sidebar-section theme-controls">
        <ThemeSelector />
      </div>
      <div class="sidebar-section localization-controls">
        <h2>{{ t('localization_section_title') }}</h2>
        
        <!-- Desktop Language List -->
        <ul :class="['language-list', 'desktop-only', { 'rtl': selectedLanguage === 'fa' }]">
          <li
            v-for="lang in interfaceLanguages"
            :key="lang.code"
            class="language-list-item"
            :class="{ selected: selectedLanguage === lang.code }"
            @click="selectedLanguage = lang.code"
          >
            <img
              :src="getFlagUrl(lang.code)"
              class="language-flag-image"
              :alt="lang.name"
            >
            <span>{{ lang.name }}</span>
          </li>
        </ul>

        <!-- Mobile Language Dropdown -->
        <select
          v-model="selectedLanguage"
          class="language-select mobile-only"
        >
          <option
            v-if="!interfaceLanguages || interfaceLanguages.length === 0"
            disabled
            value=""
          >
            ...
          </option>
          <option
            v-for="lang in interfaceLanguages"
            :key="lang.code"
            :value="lang.code"
          >
            {{ lang.name }}
          </option>
        </select>
      </div>
      <div class="sidebar-footer">
        <a
          :href="REPO_URLS.GITHUB_MAIN"
          target="_blank"
          rel="noopener noreferrer"
          :title="t('github_link_title') || 'GitHub'"
        >
          <img
            src="@/icons/ui/github.svg"
            alt="GitHub"
            height="22"
            class="github-icon"
          >
        </a>
        <p>
          by
          <a
            class="about-link"
            href="https://x.com/M_Khani65"
            target="_blank"
            rel="noopener noreferrer"
          >Me</a>
          and
          <a
            class="about-link"
            href="https://x.com/iSegar0"
            target="_blank"
            rel="noopener noreferrer"
          >iSegar0</a>
          <span>&copy; {{ copyrightYear }}</span>
        </p>
      </div>
    </div>
  </aside>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useUnifiedI18n } from '@/composables/shared/useUnifiedI18n.js'
import { useSettingsStore } from '@/features/settings/stores/settings.js'
import ThemeSelector from './components/ThemeSelector.vue'
import { useLanguages } from '@/composables/shared/useLanguages.js'
import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';
import { getLocaleInfo } from '@/shared/config/LocaleManifest.js'
import { REPO_URLS } from '@/shared/config/constants.js'
import browser from 'webextension-polyfill'

const sidebarError = ref('')
const logger = getScopedLogger(LOG_COMPONENTS.UI, 'OptionsSidebar');
const { t, changeLanguage } = useUnifiedI18n()
const settingsStore = useSettingsStore()
const { getInterfaceLanguages } = useLanguages()
const manifestVersion = ref('v0.0.0')

const getFlagUrl = (code) => {
  const locale = getLocaleInfo(code);
  const flag = locale?.flag || code;
  try {
    return browser.runtime.getURL(`icons/flags/${flag}.svg`)
  } catch (error) {
    logger.error(`Failed to load flag for ${code}:`, error);
    return '';
  }
};
const interfaceLanguages = computed(() => getInterfaceLanguages())
// Use reactive reference that stays in sync with settings
const selectedLanguage = computed({
  get: () => settingsStore.settings?.APPLICATION_LOCALIZE || 'en',
  set: async (value) => {
    try {
      await changeLanguage(value)
      browser.runtime.sendMessage({
        action: 'LANGUAGE_CHANGED',
        payload: { lang: value }
      }).catch(error => {
        logger.debug('Could not send LANGUAGE_CHANGED message, probably sidepanel is closed:', error.message);
      });
    } catch (error) {
      logger.error('Failed to change language:', error)
    }
  }
})

// Dynamic copyright year logic based on build time
const copyrightYear = computed(() => {
  const startYear = 2025
  const buildYear = __BUILD_YEAR__ || startYear

  // If build year is greater than start year, show range, otherwise just start year
  return buildYear > startYear ? `${startYear}-${buildYear}` : `${startYear}`
})

onMounted(async () => {
  try {
    const manifest = browser.runtime.getManifest()
    manifestVersion.value = `v${manifest.version}`
  } catch (error) {
    logger.warn('Failed to get manifest version:', error)
    sidebarError.value = error && error.message ? error.message : String(error)
  }
});
</script>

<style scoped lang="scss">
@use '@/assets/styles/base/variables' as *;

:root {
  --breakpoint-lg: 1024px;
  --breakpoint-md: 768px;
}

.options-sidebar {
  flex: 0 0 280px;
  padding: var(--spacing-md);
  background: var(--color-surface);
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  border-right: var(--border-width) var(--border-style) var(--color-border);
  position: relative;
  z-index: 1;
  box-sizing: border-box;
  box-shadow: inset -1px 0 0 var(--color-border);
  
  /* Add scroll support for the entire sidebar if content is too tall */
  overflow-y: auto;
  overflow-x: hidden;
}

/* Custom scrollbar for sidebar */
.options-sidebar::-webkit-scrollbar {
  width: 4px;
}
.options-sidebar::-webkit-scrollbar-thumb {
  background: var(--color-border);
  border-radius: 2px;
}

.sidebar-content {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-md);
  flex-grow: 1;
  min-height: min-content; /* Ensure items don't squash */
}

.sidebar-header {
  padding: var(--spacing-xs) var(--spacing-sm);
  text-align: center;
  margin-bottom: var(--spacing-sm);

  .header-logo-link {
    text-decoration: none;
    color: inherit;
    display: block;
    cursor: default;
    pointer-events: none; /* Disabled by default on desktop */
  }

  h1 {
    font-size: var(--font-size-xxl);
    font-weight: var(--font-weight-medium);
    margin: 0 0 4px 0;
    color: var(--color-text);
  }

  span {
    font-size: var(--font-size-xs);
    color: var(--color-text-secondary);
  }

  p {
    font-size: var(--font-size-sm);
    margin-top: var(--spacing-sm);
    color: var(--color-text-secondary);
  }
}

.sidebar-section {
  border: var(--border-width) var(--border-style) var(--color-border);
  border-radius: var(--border-radius-lg);
  padding: var(--spacing-md);
  background: var(--color-background);
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
  transition: border-color var(--transition-base), box-shadow var(--transition-base);
  margin: 10px;

  &:hover {
    border-color: var(--color-primary);
    box-shadow: 0 4px 8px rgba(0, 0, 0, 0.15);
  }

  h2 {
    font-size: var(--font-size-xs);
    font-weight: var(--font-weight-medium);
    text-transform: uppercase;
    letter-spacing: 0.5px;
    margin: 0 0 var(--spacing-base) 0;
    color: var(--color-text-secondary);
  }
}

.sidebar-footer {
  margin-top: auto;
  padding-top: var(--spacing-md);
  border-top: var(--border-width) var(--border-style) var(--color-border);
  font-size: var(--font-size-xs);
  color: var(--color-text-secondary);
  text-align: center;

  .github-icon {
    opacity: 0.7;
    transition: opacity var(--transition-fast);
    filter: var(--github-icon-filter, none);

    &:hover {
      opacity: 1;
    }
  }

  .about-link {
    color: var(--color-primary);
    text-decoration: none;
    font-weight: var(--font-weight-medium);

    &:hover {
      text-decoration: underline;
    }
  }
}

.desktop-only {
  display: block;
}

.mobile-only {
  display: none;
}

/* Custom dropdown style */
.language-select {
  width: 100%;
  padding: var(--spacing-sm);
  border-radius: var(--border-radius-md);
  border: 1px solid var(--color-border);
  background-color: var(--color-background);
  color: var(--color-text);
  font-size: var(--font-size-sm);
  cursor: pointer;
  outline: none;
  transition: border-color var(--transition-base);

  &:hover {
    border-color: var(--color-primary);
  }

  &:focus {
    border-color: var(--color-primary);
    box-shadow: 0 0 0 2px rgba(var(--color-primary-rgb), 0.2);
  }
}

/* Tablet responsive */
@media (max-width: #{$breakpoint-lg}) {
  .desktop-only {
    display: none;
  }

  .mobile-only {
    display: block;
    width: auto;
    min-width: 140px;
  }

  .options-sidebar {
    flex: none;
    width: 100%;
    border-right: none;
    border-bottom: var(--border-width) var(--border-style) var(--color-border);
    flex-direction: row;
    align-items: center;
    padding: 6px var(--spacing-md);
    min-height: 50px;
    
    /* Force LTR for the header on mobile/tablet to keep it consistent */
    direction: ltr !important;
    text-align: left !important;
  }

  .sidebar-content {
    flex-direction: row;
    align-items: center;
    width: 100%;
    gap: var(--spacing-sm);
    justify-content: space-between; /* Spread items across the header */
  }

  .sidebar-header {
    margin-bottom: 0;
    text-align: left;
    flex: 0 1 auto;
    display: flex; /* Align H1 and Span in a row */
    align-items: baseline;
    gap: 8px;

    .header-logo-link {
      pointer-events: auto; /* Enable link only in header mode */
      cursor: pointer;
      display: flex;
      align-items: baseline;
      gap: 8px;
      transition: transform var(--transition-base);

      &:hover {
        transform: scale(1.02);
        h1 { color: var(--color-primary); }
      }
    }

    p { display: none; } /* Still hide description */
    span { 
      display: inline-block; /* Show version now */
      font-size: var(--font-size-xs);
      opacity: 0.7;
    }

    h1 { 
      font-size: var(--font-size-xl); 
      margin: 0;
      white-space: nowrap;
    }
  }

  .sidebar-section {
    margin: 0;
    padding: var(--spacing-sm);
    box-shadow: none !important;
    border: none !important;
    background: transparent !important;
    h2 { display: none; }
    flex: 0 0 auto; /* Keep controls at their natural size */
    
    /* Limit list height even more in horizontal header mode */
    .language-list {
      max-height: 100px !important;
    }
    
    /* Remove click/tap highlight effects on mobile header */
    -webkit-tap-highlight-color: transparent !important;
    outline: none !important;
    
    &:hover {
      box-shadow: none !important;
      border: none !important;
    }

    // Target the specific control groups within sections
    :deep(*) {
      outline: none !important;
      -webkit-tap-highlight-color: transparent !important;
    }
  }

  .sidebar-footer {
    display: none;
  }
}

/* Mobile responsive */
@media (max-width: 768px) {
  .options-sidebar {
    padding: 4px var(--spacing-sm);
    min-height: 44px;
  }

  .sidebar-content {
    gap: var(--spacing-sm);
    justify-content: space-between;
  }

  .sidebar-header {
    h1 {
      font-size: var(--font-size-lg);
    }
  }
  
  .sidebar-section {
    padding: 0;
  }
}

/* Small mobile responsive */
@media (max-width: 480px) {
  .sidebar-header {
    h1 {
      font-size: var(--font-size-base);
    }
  }
}

.localization-controls {
  .language-list {
    list-style: none;
    padding: 0;
    margin: 0;
    max-height: 160px; /* Slightly smaller to save space */
    overflow-y: auto;
    
    /* Better scrollbar for the list */
    &::-webkit-scrollbar { width: 3px; }
    &::-webkit-scrollbar-thumb { background: var(--color-border); border-radius: 2px; }
  }
  .language-list-item {
    cursor: pointer;
    padding: 8px 12px;
    border-radius: var(--border-radius-md);
    display: flex;
    align-items: center;
    font-size: var(--font-size-sm);
    transition: background-color var(--transition-fast);

    &:hover {
      background-color: var(--color-background-hover, #f0f0f0);
    }

    &.selected {
      background-color: var(--color-active-background, #e8f0fe);
      color: var(--color-active-text, #1967d2);
      font-weight: var(--font-weight-medium);
    }

    /* Dark mode styling for selected item */
    :root.theme-dark &.selected {
      background-color: #1a365d; /* Dark navy blue */
      color: white;
    }
  }

  .language-flag-image {
    width: 18px;
    height: 14px;
    margin-right: 12px;
    border: 1px solid var(--color-border);
    object-fit: cover;
    vertical-align: middle;
    border-radius: 2px;
  }

  /* RTL support using local class */
  .language-list.rtl .language-flag-image {
    margin-right: 0;
    margin-left: 16px;
  }
}

.sidebar-section.theme-controls {
  display: flex;
  flex-direction: column; /* Stack items vertically */
  gap: var(--spacing-sm); /* Add spacing between rows */
}

:global(.options-layout.rtl) {
  .sidebar-section h2 {
    text-align: right;
  }

  .language-list-item {
    text-align: right;
  }
}
</style>