<template>
  <aside class="options-sidebar">
    <div v-if="sidebarError" class="sidebar-error">
      <h2>Sidebar Error</h2>
      <pre>{{ sidebarError }}</pre>
    </div>
    <div v-else>
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
        <select
          v-model="selectedLanguage"
          class="language-select"
        >
          <option v-for="lang in interfaceLanguages" :key="lang.code" :value="lang.code">
            {{ lang.name }}
          </option>
        </select>
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
const interfaceLanguages = computed(() => getInterfaceLanguages())
// Use reactive reference that stays in sync with settings
const selectedLanguage = computed({
  get: () => settingsStore.settings?.APPLICATION_LOCALIZE || 'en',
  set: async (value) => {
    try {
      await changeLanguage(value)
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
  /* border-right: 4px solid red !important; */
  background: #fffbe6 !important;
  display: flex;
  flex-direction: column;
  z-index: 9999;
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

.sidebar-section {
  border: $border-width $border-style var(--color-border);
  border-radius: $border-radius-md;
  padding: $spacing-md;
  margin-bottom: $spacing-md;
  
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

// Mobile responsive
@media (max-width: #{$breakpoint-md}) {
  .options-sidebar {
    flex: none;
    padding: $spacing-base;
    
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
</style>