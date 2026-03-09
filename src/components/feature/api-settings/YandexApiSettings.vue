<template>
  <div class="api-info">
    <h3>{{ t('provider_yandex_title') || 'Yandex Translate' }}</h3>
    <p class="setting-description">
      {{ t('provider_yandex_description') || 'Uses the free, public Yandex Translate endpoint. No API key is required.' }}
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
