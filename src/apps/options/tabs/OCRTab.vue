<template>
  <div class="ocr-tab">
    <div class="tab-header">
      <h2>{{ t('ocr_tab_title') }}</h2>
      <p class="tab-description">
        {{ t('ocr_tab_desc') }}
      </p>
    </div>

    <!-- OCR Toggle Section -->
    <BaseFieldset
      id="ocr_toggle_section"
      :legend="t('ocr_toggle_section_title') || t('ocr_tab_title')"
    >
      <template #header>
        <div 
          id="OCR_PROVIDER_SELECTOR"
          class="legend-actions-wrapper"
        >
          <span 
            class="legend-action-label"
            :class="{ 'is-disabled': !enableScreenCapture }"
          >{{ t('provider_label') }}:</span>
          <ProviderSelector
            v-model="ocrProvider"
            allow-default
            mode="button"
            only-configured
            :is-global="false"
            :disabled="!enableScreenCapture"
          />
        </div>
      </template>

      <div class="setting-group">
        <BaseCheckbox
          id="ENABLE_SCREEN_CAPTURE"
          v-model="enableScreenCapture"
          :label="t('ocr_enabled_label')"
        />
        <p class="setting-description">
          {{ t('ocr_enabled_desc') }}
        </p>
      </div>

      <div
        class="setting-group"
        :class="{ 'is-disabled': !enableScreenCapture }"
      >
        <BaseCheckbox
          id="PAGE_CONTEXT_SCREEN_CAPTURE"
          v-model="showInContextMenu"
          :label="t('ocr_context_menu_label')"
          :disabled="!enableScreenCapture"
        />
        <p class="setting-description">
          {{ t('ocr_context_menu_desc') }}
        </p>
      </div>
    </BaseFieldset>

    <BaseFieldset
      id="ocr_languages_section"
      :legend="t('ocr_languages_label')"
      :disabled="!enableScreenCapture"
    >
      <template #header>
        <div class="legend-actions-wrapper">
          <div class="search-box">
            <input 
              v-model="searchQuery" 
              type="text" 
              :placeholder="t('search_placeholder')"
              class="search-input"
              :disabled="!enableScreenCapture"
            >
          </div>
        </div>
      </template>
      
      <div class="language-list">
        <div 
          v-for="lang in supportedLanguages" 
          :key="lang.code"
          class="language-item"
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
              :disabled="ocrStore.isDownloading(lang.code)"
              @click="ocrStore.downloadLanguage(lang.code)"
            >
              <template v-if="ocrStore.isDownloading(lang.code)">
                {{ ocrStore.getDownloadProgress(lang.code) }}%
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
    </BaseFieldset>

    <BaseFieldset
      id="ocr_danger_zone"
      :legend="t('ocr_cache_clear_button')"
      class="danger-zone-fieldset"
    >
      <p>{{ t('ocr_cache_clear_desc') }}</p>
      <button 
        class="btn-danger"
        @click="confirmClearCache"
      >
        {{ t('ocr_cache_clear_button') }}
      </button>
    </BaseFieldset>
  </div>
</template>

<script setup>
import './OCRTab.scss'
import { onMounted, computed, ref } from 'vue'
import { useOCRStore } from '@/features/screen-capture/stores/ocrStore.js'
import { useUnifiedI18n } from '@/composables/shared/useUnifiedI18n'
import { useSettingsStore } from '@/features/settings/stores/settings'
import { SUPPORTED_OCR_LANGUAGES } from '@/features/screen-capture/utils/ocrLanguageMap.js'
import { useTabSettings } from '../composables/useTabSettings.js'
import { getScopedLogger } from '@/shared/logging/logger.js'
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js'
import ProviderSelector from '@/components/shared/ProviderSelector.vue'
import { TranslationMode } from '@/shared/config/config.js'

// Components
import BaseCheckbox from '@/components/base/BaseCheckbox.vue'
import BaseFieldset from '@/components/base/BaseFieldset.vue'

const logger = getScopedLogger(LOG_COMPONENTS.UI, 'OCRTab')
const { t } = useUnifiedI18n()
const ocrStore = useOCRStore()
const settingsStore = useSettingsStore()
const { createSetting, createProviderSetting } = useTabSettings(settingsStore, logger)

const searchQuery = ref('')

// Settings
const enableScreenCapture = createSetting('ENABLE_SCREEN_CAPTURE', true)
const ocrProvider = createProviderSetting(TranslationMode.ScreenCapture)
const showInContextMenu = createSetting('CONTEXT_MENU_VISIBILITY', {}, {
  transformGet: (visibility) => visibility.PAGE_CONTEXT_SCREEN_CAPTURE !== false,
  transformSet: (value) => {
    const current = settingsStore.settings?.CONTEXT_MENU_VISIBILITY || {}
    return { ...current, PAGE_CONTEXT_SCREEN_CAPTURE: value }
  }
})

// Priority languages to show at the top
const PRIORITY_LANGS = ['fas', 'eng', 'ara', 'deu', 'fra', 'spa', 'rus', 'chi_sim', 'chi_tra', 'jpn', 'kor', 'tur']

// Get language names and sort them: Installed > Priority > Alphabetical
const supportedLanguages = computed(() => {
  let languages = ocrStore.supportedLanguages.map(code => {
    const lang = SUPPORTED_OCR_LANGUAGES.find(l => l.code === code)
    return {
      code,
      name: lang ? lang.name : code
    }
  })

  // Filter by search query
  if (searchQuery.value.trim()) {
    const query = searchQuery.value.toLowerCase().trim()
    languages = languages.filter(lang => 
      lang.name.toLowerCase().includes(query) || 
      lang.code.toLowerCase().includes(query)
    )
  }

  return languages.sort((a, b) => {
    const isAInstalled = ocrStore.isDownloaded(a.code)
    const isBInstalled = ocrStore.isDownloaded(b.code)

    // 1. Installed status
    if (isAInstalled && !isBInstalled) return -1
    if (!isAInstalled && isBInstalled) return 1

    // 2. Priority list
    const aPriority = PRIORITY_LANGS.indexOf(a.code)
    const bPriority = PRIORITY_LANGS.indexOf(b.code)

    if (aPriority !== -1 && bPriority !== -1) return aPriority - bPriority
    if (aPriority !== -1) return -1
    if (bPriority !== -1) return 1

    // 3. Alphabetical
    return a.name.localeCompare(b.name)
  })
})


onMounted(async () => {
  await ocrStore.init()
})

const confirmClearCache = async () => {
  if (confirm(t('history_clear_confirm_message'))) {
    await ocrStore.clearAllLanguages()
  }
}
</script>
