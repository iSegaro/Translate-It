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
        <div class="desktop-only">
          <InterfaceLocaleSelector mode="list" />
        </div>

        <!-- Mobile Language Dropdown -->
        <div class="mobile-only">
          <InterfaceLocaleSelector mode="dropdown" />
        </div>
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
import ThemeSelector from './components/ThemeSelector.vue'
import InterfaceLocaleSelector from './components/InterfaceLocaleSelector.vue'
import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';
import { REPO_URLS } from '@/shared/config/constants.js'
import browser from 'webextension-polyfill'

const sidebarError = ref('')
const logger = getScopedLogger(LOG_COMPONENTS.UI, 'OptionsSidebar');
const { t } = useUnifiedI18n()
const manifestVersion = ref('v0.0.0')

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
