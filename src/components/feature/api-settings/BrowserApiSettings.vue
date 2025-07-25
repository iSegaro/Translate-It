<template>
  <div class="api-info">
    <h3>{{ $i18n('browser_api_settings_title') || 'Browser Translation' }}</h3>
    <p class="setting-description">
      {{ $i18n('browser_api_description') || 'Built-in Chrome translation API. Requires Chrome 138+ and works offline.' }}
    </p>
    <div class="browser-api-requirements">
      <p><strong>{{ $i18n('browser_api_requirements') || 'Requirements:' }}</strong></p>
      <ul>
        <li>{{ $i18n('browser_api_requirements_chrome') || 'Chrome 138+ (Desktop only)' }}</li>
        <li>{{ $i18n('browser_api_requirements_gpu') || 'GPU with 4GB+ VRAM' }}</li>
        <li>{{ $i18n('browser_api_requirements_storage') || 'Large free storage space (At least 22 GB)' }}</li>
        <li>{{ $i18n('browser_api_requirements_internet') || 'Unmetered network connection for initial download' }}</li>
      </ul>
    </div>
  </div>
</template>

<script setup>
// No specific script logic needed for Browser API as it has no configurable settings
</script>

<style lang="scss" scoped>
@import '@/assets/styles/_api-settings-common.scss';

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
