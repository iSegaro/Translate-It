<template>
  <div class="api-info">
    <h3>{{ $i18n('yandex_translate_settings_title') || 'Yandex Translate' }}</h3>
    <p class="setting-description">
      {{ $i18n('yandex_translate_description') || 'Uses the free, public Yandex Translate endpoint. No API key is required.' }}
    </p>
  </div>
</template>

<script setup>
// No specific script logic needed for Yandex as it has no configurable settings
</script>

<style lang="scss" scoped>
@import '@/assets/styles/_api-settings-common.scss';
</style>
