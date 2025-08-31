<template>
  <aside class="options-sidebar">
    <div v-if="sidebarError" class="sidebar-error">
      <h2>Sidebar Error</h2>
      <pre>{{ sidebarError }}</pre>
    </div>
    <div v-else class="sidebar-content">
      <div class="sidebar-header">
        <h1>{{ t('name') }}</h1>
        <span>{{ manifestVersion }}</span>
        <p>{{ t('description') }}</p>
      </div>
      <div class="sidebar-section theme-controls">
        <ThemeSelector />
      </div>
      <div class="sidebar-section localization-controls">
        <h2>{{ t('localization_section_title') }}</h2>
        <ul class="language-list">
          <li
            v-for="lang in interfaceLanguages"
            :key="lang.code"
            class="language-list-item"
            :class="{ selected: selectedLanguage === lang.code }"
            @click="selectedLanguage = lang.code"
          >
            <img :src="getFlagUrl(lang.code)" class="language-flag-image" :alt="lang.name" />
            <span>{{ lang.name }}</span>
          </li>
        </ul>
      </div>
      <div class="sidebar-footer">
        <a
          href="https://github.com/iSegaro/Translate-It"
          target="_blank"
          rel="noopener noreferrer"
          :title="t('github_link_title') || 'GitHub'"
        >
          <img
            src="@/assets/icons/github.svg"
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
          <span>&copy; 2025</span>
        </p>
      </div>
    </div>
  </aside>
</template>

<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import { useUnifiedI18n } from '@/composables/useUnifiedI18n.js'
import { useSettingsStore } from '@/store/core/settings'
import ThemeSelector from './components/ThemeSelector.vue'
import { useLanguages } from '@/composables/useLanguages.js'
import { getScopedLogger } from '@/utils/core/logger.js';
import { LOG_COMPONENTS } from '@/utils/core/logConstants.js';
import browser from 'webextension-polyfill'

const sidebarError = ref('')
const logger = getScopedLogger(LOG_COMPONENTS.UI, 'OptionsSidebar');
const { t, changeLanguage, locale } = useUnifiedI18n()
const settingsStore = useSettingsStore()
const { findLanguageByCode, getInterfaceLanguages } = useLanguages()
const manifestVersion = ref('v0.0.0')

const getFlagUrl = (code) => {
  const flagMap = {
    en: 'gb',
    fa: 'ir'
  };
  const flag = flagMap[code] || code;
  try {
    return new URL(`../../assets/icons/flags/${flag}.svg`, import.meta.url).href
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

<style lang="scss" scoped>
@use '@/assets/styles/variables.scss' as *;

.options-sidebar {
  flex: 0 0 280px;
  padding: $spacing-md;
  background: var(--color-surface);
  display: flex;
  flex-direction: column;
  border-right: $border-width $border-style var(--color-border);
  position: relative;
  z-index: 1;
  box-sizing: border-box;
  
  // Better visual hierarchy
  box-shadow: inset -1px 0 0 var(--color-border);
}

.sidebar-content {
  display: flex;
  flex-direction: column;
  flex-grow: 1;
}

.sidebar-header {
  padding: $spacing-sm;
  text-align: center;
  margin-bottom: $spacing-md;
  
  h1 {
    font-size: $font-size-xxl;
    font-weight: $font-weight-medium;
    margin: 0 0 4px 0;
    color: var(--color-text);
  }
  
  span {
    font-size: $font-size-xs;
    color: var(--color-text-secondary);
  }
  
  p {
    font-size: $font-size-sm;
    margin-top: $spacing-sm;
    color: var(--color-text-secondary);
  }
}

// RTL specific styles for sidebar header
:global(.options-layout.rtl) .sidebar-header {
  text-align: center; // Keep header centered for both directions
}

.sidebar-section {
  border: $border-width $border-style var(--color-border);
  border-radius: $border-radius-md;
  padding: $spacing-md;
  margin-bottom: $spacing-md;
  background: var(--color-background);
  transition: border-color $transition-base, box-shadow $transition-base;
  
  &:hover {
    border-color: var(--color-primary);
    box-shadow: 0 2px 8px rgba(var(--color-primary-rgb, 59, 130, 246), 0.1);
  }
  
  h2 {
    font-size: $font-size-xs;
    font-weight: $font-weight-medium;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    margin: 0 0 $spacing-base 0;
    color: var(--color-text-secondary);
  }
}

.sidebar-footer {
  margin-top: auto;
  padding-top: $spacing-md;
  border-top: $border-width $border-style var(--color-border);
  font-size: $font-size-xs;
  color: var(--color-text-secondary);
  text-align: center;
  
  .github-icon {
    opacity: 0.7;
    transition: opacity $transition-fast;
    filter: var(--github-icon-filter, none);
    
    &:hover {
      opacity: 1;
    }
  }
  
  .about-link {
    color: var(--color-primary);
    text-decoration: none;
    font-weight: $font-weight-medium;
    
    &:hover {
      text-decoration: underline;
    }
  }
}

// Tablet responsive
@media (max-width: #{$breakpoint-lg}) {
  .options-sidebar {
    flex: none;
    border-right: none;
    border-bottom: $border-width $border-style var(--color-border);
  }
}

// Mobile responsive
@media (max-width: #{$breakpoint-md}) {
  .options-sidebar {
    flex: none;
    padding: $spacing-base;
    border-right: none;
    border-bottom: $border-width $border-style var(--color-border);
    
    .sidebar-header {
      text-align: left;
      
      h1 {
        font-size: $font-size-lg;
      }
    }
    
    .sidebar-section {
      padding: $spacing-base;
    }
  }
}

.language-select {
  width: 100%;
  padding: $spacing-sm;
  border-radius: $border-radius-md;
  border: 1px solid var(--color-border);
  background-color: var(--color-background);
  color: var(--color-text);
  font-size: $font-size-sm;
}

.localization-controls {
  .language-list {
    list-style: none;
    padding: 0;
    margin: 0;
    max-height: 200px;
    overflow-y: auto;
  }
  .language-list-item {
    cursor: pointer;
    padding: 8px 12px;
    border-radius: $border-radius-md;
    display: flex;
    align-items: center;
    font-size: $font-size-sm;
    transition: background-color $transition-fast;

    &:hover {
      background-color: var(--color-background-hover, #f0f0f0);
    }

    &.selected {
      background-color: var(--color-active-background, #e8f0fe);
      color: var(--color-active-text, #1967d2);
      font-weight: $font-weight-medium;
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
}

// RTL specific styles for language list
:global(.options-layout.rtl) {
  .language-flag-image {
    margin-right: 0;
    margin-left: 12px;
  }
  
  .sidebar-section h2 {
    text-align: right;
  }
  
  .language-list-item {
    text-align: right;
  }
}
</style>