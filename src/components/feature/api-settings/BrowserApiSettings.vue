<template>
  <div class="api-info">
    <h3>{{ t('browser_api_settings_title') || 'Browser Settings' }}</h3>
    <p class="setting-description">
      {{ t('browser_api_description') || 'Private translations using the built-in browser engine.' }}
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
import "./BrowserApiSettings.scss"
import { useI18n } from 'vue-i18n'

const { t } = useI18n()
</script>
