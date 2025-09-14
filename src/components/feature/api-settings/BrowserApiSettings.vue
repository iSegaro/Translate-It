<template>
  <div class="api-info">
    <h3>{{ t('browser_api_settings_title') || 'browser Translation' }}</h3>
    <p class="setting-description">
      {{ t('browser_api_description') || 'Built-in Chrome translation API. Requires Chrome 138+ and works offline.' }}
    </p>
    <div class="browser-api-requirements">
      <p><strong>{{ t('browser_api_requirements') || 'Requirements:' }}</strong></p>
      <ul>
        <li>{{ t('browser_api_requirements_chrome') || 'Chrome 138+ (Desktop only)' }}</li>
        <li>{{ t('browser_api_requirements_gpu') || 'GPU with 4GB+ VRAM' }}</li>
        <li>{{ t('browser_api_requirements_storage') || 'Large free storage space (At least 22 GB)' }}</li>
        <li>{{ t('browser_api_requirements_internet') || 'Unmetered network connection for initial download' }}</li>
      </ul>
    </div>
  </div>
</template>

<script setup>
import { useI18n } from 'vue-i18n'

const { t } = useI18n()
</script>

<style lang="scss" scoped>
@use "@/assets/styles/components/api-settings-common" as *;

.browser-api-requirements {
  margin-top: $spacing-md;
  padding-left: $spacing-md;
  border-left: 2px solid var(--color-border);
  
  p {
    margin-bottom: $spacing-xs;
    font-size: $font-size-sm;
    color: var(--color-text);
  }
  
  ul {
    list-style: disc;
    padding-left: $spacing-lg;
    margin: 0;
    
    li {
      font-size: $font-size-xs;
      color: var(--color-text-secondary);
      margin-bottom: $spacing-xs;
    }
  }
}
</style>
