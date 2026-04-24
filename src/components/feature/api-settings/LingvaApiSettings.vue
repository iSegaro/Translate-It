<template>
  <div>
    <h3>{{ t('lingva_api_settings_title') || 'Lingva API Settings' }}</h3>
    <div class="setting-group vertical api-key-info">
      <span class="setting-description">
        {{ t('lingva_api_url_info') || 'You can use public Lingva instances or host your own.' }}
      </span>
      <a
        class="api-link"
        href="https://github.com/thedaviddelta/lingva-translate#instances"
        target="_blank"
        rel="noopener noreferrer"
      >
        {{ t('lingva_instances_link') || 'Find public Lingva instances.' }}
      </a>
    </div>
    <div class="setting-group vertical">
      <label>{{ t('lingva_api_url_label') || 'Lingva API URL' }}</label>
      <BaseInput
        id="LINGVA_API_URL"
        v-model="lingvaApiUrl"
        :placeholder="t('lingva_api_url_placeholder') || 'Enter Lingva API URL (e.g., https://lingva.ml)'"
        class="api-url-input"
        dir="ltr"
      />
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import "./LingvaApiSettings.scss"
import { useI18n } from 'vue-i18n'
import { useSettingsStore } from '@/features/settings/stores/settings.js'
import { CONFIG } from '@/shared/config/config.js'
import BaseInput from '@/components/base/BaseInput.vue'

const { t } = useI18n()

const settingsStore = useSettingsStore()

const lingvaApiUrl = computed({
  get: () => settingsStore.settings?.LINGVA_API_URL || CONFIG.LINGVA_API_URL,
  set: (value) => {
    const finalValue = value.trim() === '' ? CONFIG.LINGVA_API_URL : value
    settingsStore.updateSettingLocally('LINGVA_API_URL', finalValue)
  }
})
</script>
