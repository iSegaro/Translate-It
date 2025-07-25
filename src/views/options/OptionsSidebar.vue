<template>
  <aside class="options-sidebar">
    <div class="sidebar-header">
      <h1>{{ $i18n('name') }}</h1>
      <span>{{ manifestVersion }}</span>
      <p>{{ $i18n('description') }}</p>
    </div>

    <div class="sidebar-section theme-controls">
      <h2>{{ $i18n('theme_section_title') }}</h2>
      <ThemeSelector />
    </div>

    <div class="sidebar-section localization-controls">
      <h2>{{ $i18n('localization_section_title') }}</h2>
      <LanguageSelector v-model="selectedLanguage" :languages="interfaceLanguages" />
    </div>

    <div class="sidebar-footer">
      <a
        href="https://github.com/iSegaro/Translate-It"
        target="_blank"
        rel="noopener noreferrer"
        :title="$i18n('github_link_title') || 'GitHub'"
      >
        <img
          src="@/assets/icons/github.svg"
          alt="GitHub"
          height="22"
          class="github-icon"
        />
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
  </aside>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useSettingsStore } from '@/store/core/settings'
import ThemeSelector from './components/ThemeSelector.vue'
import LanguageSelector from '@/components/feature/LanguageSelector.vue'
import { getBrowserAPI } from '@/utils/browser-unified.js'

const settingsStore = useSettingsStore()

// Manifest version
const manifestVersion = ref('v0.0.0')

// Interface languages (available UI languages)
const interfaceLanguages = ref([
  { code: 'en', name: 'English' },
  { code: 'fa', name: 'فارسی' }
])

// Selected language
const selectedLanguage = computed({
  get: () => settingsStore.settings?.APPLICATION_LOCALIZE || 'English',
  set: (value) => settingsStore.updateSettingAndPersist('APPLICATION_LOCALIZE', value)
})

// Get manifest version
onMounted(async () => {
  try {
    const browser = await getBrowserAPI()
    const manifest = browser.runtime.getManifest()
    manifestVersion.value = `v${manifest.version}`
  } catch (error) {
    console.warn('Failed to get manifest version:', error)
  }
})
</script>

<style lang="scss" scoped>
@use '@/assets/styles/variables.scss' as *;

.options-sidebar {
  flex: 0 0 280px;
  padding: $spacing-md;
  border-right: $border-width $border-style var(--color-border);
  display: flex;
  flex-direction: column;
  background-color: var(--color-surface);
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