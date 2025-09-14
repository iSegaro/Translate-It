<template>
  <div class="api-info">
    <h3>{{ t('yandex_translate_settings_title') || 'Yandex Translate' }}</h3>
    <p class="setting-description">
      {{ t('yandex_translate_description') || 'Uses the free, public Yandex Translate endpoint. No API key is required.' }}
    </p>
  </div>
</template>

<script setup>
import { useI18n } from 'vue-i18n'

const { t } = useI18n()
</script>

<style lang="scss" scoped>
@use "@/assets/styles/components/api-settings-common" as *;
</style>
