<template>
  <div class="ocr-tab">
    <div class="tab-header">
      <h2>{{ t('ocr_tab_title') }}</h2>
      <p class="tab-description">{{ t('ocr_tab_desc') }}</p>
    </div>

    <div class="settings-section">
      <div class="setting-item">
        <div class="setting-info">
          <label>{{ t('ocr_auto_download_label') }}</label>
          <p>{{ t('ocr_auto_download_desc') }}</p>
        </div>
        <div class="setting-control">
          <label class="switch">
            <input 
              type="checkbox" 
              v-model="ocrStore.autoDownload"
              @change="saveOCRSettings"
            >
            <span class="slider round"></span>
          </label>
        </div>
      </div>
    </div>

    <div class="settings-section">
      <h3>{{ t('ocr_languages_label') }}</h3>
      
      <div class="language-grid">
        <div 
          v-for="lang in supportedLanguages" 
          :key="lang.code"
          class="language-card"
          :class="{ 'installed': ocrStore.isDownloaded(lang.code) }"
        >
          <div class="lang-info">
            <span class="lang-name">{{ lang.name }}</span>
            <span class="lang-status">
              {{ ocrStore.isDownloaded(lang.code) ? t('ocr_status_installed') : t('ocr_status_not_installed') }}
            </span>
          </div>
          
          <div class="lang-actions">
            <button 
              v-if="!ocrStore.isDownloaded(lang.code)"
              class="btn-download"
              :disabled="ocrStore.isDownloading"
              @click="ocrStore.downloadLanguage(lang.code)"
            >
              <template v-if="ocrStore.isDownloading && ocrStore.currentDownloadingLang === lang.code">
                {{ ocrStore.downloadProgress }}%
              </template>
              <template v-else>
                {{ t('ocr_download_button') }}
              </template>
            </button>
            <button 
              v-else
              class="btn-delete"
              @click="ocrStore.deleteLanguage(lang.code)"
            >
              {{ t('ocr_delete_button') }}
            </button>
          </div>
        </div>
      </div>
    </div>

    <div class="settings-section danger-zone">
      <h3>{{ t('ocr_cache_clear_button') }}</h3>
      <p>{{ t('ocr_cache_clear_desc') }}</p>
      <button 
        class="btn-danger"
        @click="confirmClearCache"
      >
        {{ t('ocr_cache_clear_button') }}
      </button>
    </div>
  </div>
</template>

<script setup>
import './OCRTab.scss'
import { onMounted, computed } from 'vue'
import { useOCRStore } from '@/features/screen-capture/stores/ocrStore.js'
import { useUnifiedI18n } from '@/composables/shared/useUnifiedI18n'
import { useSettingsStore } from '@/features/settings/stores/settings'
import { SUPPORTED_OCR_LANGUAGES } from '@/features/screen-capture/utils/ocrLanguageMap.js'

const { t } = useUnifiedI18n()
const ocrStore = useOCRStore()
const settingsStore = useSettingsStore()

// Get language names for supported OCR languages
const supportedLanguages = computed(() => {
  return ocrStore.supportedLanguages.map(code => {
    const lang = SUPPORTED_OCR_LANGUAGES.find(l => l.code === code)
    return {
      code,
      name: lang ? lang.name : code
    }
  })
})


onMounted(async () => {
  await ocrStore.init()
  
  // Load settings from settingsStore if they exist
  if (settingsStore.settings.OCR_AUTO_DOWNLOAD !== undefined) {
    ocrStore.autoDownload = settingsStore.settings.OCR_AUTO_DOWNLOAD
  }
})

const saveOCRSettings = async () => {
  settingsStore.updateSettingLocally('OCR_AUTO_DOWNLOAD', ocrStore.autoDownload)
}

const confirmClearCache = async () => {
  if (confirm(t('history_clear_confirm_message'))) {
    await ocrStore.clearAllLanguages()
  }
}
</script>
