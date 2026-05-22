<template>
  <section class="options-tab-content tts-tab">
    <div class="settings-container">
      <div class="tab-header">
        <h2>{{ t('tts_tab_title') || 'Text-to-Speech' }}</h2>
        <p>{{ t('tts_tab_desc') || 'Configure voice settings and pronunciation engines.' }}</p>
      </div>

      <!-- Engine Selection -->
      <div 
        id="TTS_ENGINE_SECTION"
        class="setting-group"
      >
        <div class="setting-row">
          <div class="setting-info">
            <label class="setting-label">{{ t('tts_engine_label') || 'TTS Engine' }}</label>
            <p class="setting-description">
              {{ t('tts_engine_desc') || 'Choose the default engine for text pronunciation. Edge TTS provides higher quality neural voices.' }}
            </p>
          </div>
          <div class="setting-control">
            <BaseSelect
              id="TTS_ENGINE"
              v-model="ttsEngine"
              :options="engineOptions"
              class="tts-engine-select"
            />
          </div>
        </div>
      </div>

      <div class="section-separator" />

      <!-- Language Specific Voices Trigger Button -->
      <div class="setting-group">
        <div class="setting-row">
          <div class="setting-info">
            <label class="setting-label">{{ t('tts_voices_tuning_label') || 'Language-Specific Voice Tuning' }}</label>
            <p class="setting-description">
              {{ t('tts_voices_tuning_desc') || 'Customize regional accents, genders, and dialects for each supported language, and test them with real-time previews.' }}
            </p>
          </div>
          <div class="setting-control">
            <BaseButton
              id="TTS_MANAGE_VOICES_BTN"
              variant="secondary"
              @click="openVoicesDrawer"
            >
              {{ t('tts_manage_voices_btn') || 'Manage Voices & Accents ⚙️' }}
            </BaseButton>
          </div>
        </div>
      </div>

      <div class="section-separator" />

      <!-- Fallback Toggle -->
      <div 
        id="TTS_SETTINGS_SECTION"
        class="setting-group"
      >
        <div class="setting-row">
          <div class="setting-info">
            <BaseCheckbox
              v-model="ttsFallbackEnabled"
              :label="t('tts_fallback_label') || 'Enable Language Fallback'"
            />
            <p class="setting-description">
              {{ t('tts_fallback_desc') || 'Automatically switch to a similar language (e.g., Arabic for Persian) if the selected TTS engine does not support the original language natively.' }}
            </p>
          </div>
        </div>
      </div>

      <div class="section-separator" />

      <!-- Auto Detect Toggle -->
      <div class="setting-group">
        <div class="setting-row">
          <div class="setting-info">
            <BaseCheckbox
              v-model="ttsAutoDetectEnabled"
              :label="t('tts_autodetect_label') || 'Smart Language Detection'"
            />
            <p class="setting-description">
              {{ t('tts_autodetect_desc') || 'Automatically detect the actual language of the text. If the selected engine fails to pronounce the text, it will attempt to identify the correct language and try again.' }}
            </p>
          </div>
        </div>
      </div>
    </div>

    <!-- Premium Voice Customization Slide-out Drawer -->
    <Transition name="drawer-fade">
      <div 
        v-if="isDrawerOpen" 
        class="drawer-overlay" 
        @click="closeVoicesDrawer" 
      />
    </Transition>
    <Transition name="drawer-slide">
      <div 
        v-if="isDrawerOpen" 
        class="drawer-container"
        :class="{ 'rtl': isRTL }"
      >
        <div class="drawer-header">
          <h3>{{ t('tts_drawer_title') || 'Voice & Accent Tuning' }}</h3>
          <button 
            class="drawer-close-btn" 
            @click="closeVoicesDrawer"
          >
            ✕
          </button>
        </div>
        
        <div class="drawer-search">
          <input
            v-model="searchQuery"
            type="text"
            class="drawer-search-input"
            :placeholder="t('tts_search_placeholder') || 'Search languages...'"
          />
          <button 
            v-if="searchQuery" 
            class="search-clear-btn" 
            @click="searchQuery = ''"
          >
            ✕
          </button>
        </div>

        <div class="drawer-body">
          <div 
            v-if="!isLanguagesLoaded" 
            class="drawer-loading"
          >
            <LoadingSpinner size="md" />
            <span>{{ t('tts_loading_languages') || 'Loading languages...' }}</span>
          </div>
          <div 
            v-else-if="filteredLanguages.length === 0" 
            class="drawer-empty"
          >
            {{ t('tts_no_languages') || 'No languages found.' }}
          </div>
          <div 
            v-else 
            class="drawer-list"
          >
            <div
              v-for="lang in filteredLanguages"
              :key="lang.code"
              class="drawer-item"
            >
              <div class="lang-meta">
                <span class="lang-flag">
                  <img 
                    v-if="lang.code === 'fa'" 
                    :src="getFarsiFlagUrl()" 
                    alt="🇮🇷" 
                    class="farsi-flag-img" 
                  />
                  <template v-else>
                    {{ getFlagEmoji(lang) }}
                  </template>
                </span>
                <span class="lang-name">{{ lang.name }}</span>
                <span class="lang-code-badge">{{ lang.code.toUpperCase() }}</span>
              </div>
              
              <div class="voice-selection-box">
                <label class="control-sublabel">{{ t('tts_preferred_voice_option', { engine: activeEngineName }) || `Preferred ${activeEngineName} Option` }}</label>
                <div class="selection-row">
                  <select
                    :value="getPreferredVoiceValue(lang.code)"
                    class="voice-select-dropdown"
                    @change="savePreferredVoice(lang.code, $event.target.value)"
                  >
                    <option value="default">{{ t('tts_voice_default') || 'Default (System Dynamic)' }}</option>
                    <option
                      v-for="opt in getVoiceOptionsForLang(lang.code)"
                      :key="opt.value"
                      :value="opt.value"
                    >
                      {{ opt.label }}
                    </option>
                  </select>
                  
                  <button
                    class="preview-btn"
                    :class="{ 'playing': playingLangCode === lang.code && isPlaying, 'loading': playingLangCode === lang.code && isLoading }"
                    :disabled="playingLangCode === lang.code && isLoading"
                    @click="previewVoice(lang.code)"
                  >
                    <span v-if="playingLangCode === lang.code && isLoading">⏳</span>
                    <span v-else-if="playingLangCode === lang.code && isPlaying">⏹</span>
                    <span v-else>▶</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div class="drawer-footer">
          <BaseButton 
            variant="danger" 
            size="sm" 
            @click="resetAllVoices"
          >
            {{ t('tts_reset_all') || 'Reset All' }}
          </BaseButton>
          <div class="drawer-footer-actions">
            <BaseButton 
              variant="secondary" 
              size="sm" 
              @click="closeVoicesDrawer"
            >
              {{ t('tts_cancel') || 'Cancel' }}
            </BaseButton>
            <BaseButton 
              variant="primary" 
              size="sm" 
              @click="saveAndCloseVoicesDrawer"
            >
              {{ t('tts_done') || 'Done' }}
            </BaseButton>
          </div>
        </div>
      </div>
    </Transition>
  </section>
</template>

<script setup>
import './TTSTab.scss'
import { ref, computed, onMounted, onUnmounted } from 'vue'
import browser from 'webextension-polyfill'
import { useSettingsStore } from '@/features/settings/stores/settings.js'
import { useUnifiedI18n } from '@/composables/shared/useUnifiedI18n.js'
import { useTabSettings } from '../composables/useTabSettings.js'
import { getScopedLogger } from '@/shared/logging/logger.js'
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js'
import { TTS_ENGINES } from '@/shared/constants/tts.js'
import { PROVIDER_CONFIGS } from '@/features/tts/constants/ttsProviders.js'
import { ttsVoiceService } from '@/features/tts/services/TTSVoiceService.js'
import { TTSLanguageService } from '@/features/tts/services/TTSLanguageService.js'
import { useLanguages } from '@/composables/shared/useLanguages.js'
import { useTTSSmart } from '@/features/tts/composables/useTTSSmart.js'
import BaseCheckbox from '@/components/base/BaseCheckbox.vue'
import BaseSelect from '@/components/base/BaseSelect.vue'
import BaseButton from '@/components/base/BaseButton.vue'
import LoadingSpinner from '@/components/base/LoadingSpinner.vue'

const logger = getScopedLogger(LOG_COMPONENTS.UI, 'TTSTab')
const { t } = useUnifiedI18n()
const settingsStore = useSettingsStore()
const { createSetting } = useTabSettings(settingsStore, logger)

// TTS Engine Options
const engineOptions = computed(() => [
  { value: TTS_ENGINES.GOOGLE, label: t('tts_engine_google') || 'Google TTS (Standard)' },
  { value: TTS_ENGINES.EDGE, label: t('tts_engine_edge') || 'Microsoft Edge TTS (Neural)' }
])

// Settings using the new unified composable
const ttsEngine = createSetting('TTS_ENGINE', TTS_ENGINES.GOOGLE)
const ttsFallbackEnabled = createSetting('TTS_FALLBACK_ENABLED', true)
const ttsAutoDetectEnabled = createSetting('TTS_AUTO_DETECT_ENABLED', true)

// RTL check
const isRTL = computed(() => {
  try {
    return t('IsRTL') === 'true'
  } catch {
    return false
  }
})

// Drawer State
const isDrawerOpen = ref(false)
const searchQuery = ref('')
const edgeVoices = ref([])
const playingLangCode = ref(null)
const tempPreferredVoices = ref({})

// Composable for dynamic languages
const { isLoaded: isLanguagesLoaded, translationLanguages, loadLanguages } = useLanguages()

// TTS Player preview composable
const { speak, stop, isPlaying, isLoading, ttsState } = useTTSSmart()

const handleKeyDown = (e) => {
  if (e.key === 'Escape' && isDrawerOpen.value) {
    closeVoicesDrawer()
  }
}

// Load languages and voices on mount
onMounted(async () => {
  try {
    await loadLanguages()
    edgeVoices.value = await ttsVoiceService.getVoices()
    window.addEventListener('keydown', handleKeyDown)
  } catch (err) {
    logger.warn('Failed to load voices lists in options view:', err)
  }
})

onUnmounted(() => {
  if (isPlaying.value) {
    stop()
  }
  window.removeEventListener('keydown', handleKeyDown)
})

const activeEngineName = computed(() => {
  const currentEngine = settingsStore.settings?.TTS_ENGINE || TTS_ENGINES.EDGE
  return currentEngine === TTS_ENGINES.EDGE ? 'Edge Neural' : 'Google'
})

const openVoicesDrawer = async () => {
  searchQuery.value = ''
  tempPreferredVoices.value = JSON.parse(JSON.stringify(settingsStore.settings?.TTS_PREFERRED_VOICES || {}))
  isDrawerOpen.value = true
  if (edgeVoices.value.length === 0) {
    edgeVoices.value = await ttsVoiceService.getVoices()
  }
}

const saveAndCloseVoicesDrawer = async () => {
  if (isPlaying.value) {
    stop()
  }
  await settingsStore.updateSettingAndPersist('TTS_PREFERRED_VOICES', tempPreferredVoices.value)
  isDrawerOpen.value = false
}

const closeVoicesDrawer = () => {
  if (isPlaying.value) {
    stop()
  }
  isDrawerOpen.value = false
  // Revert any unsaved changes to avoid leaking local changes
  tempPreferredVoices.value = JSON.parse(JSON.stringify(settingsStore.settings?.TTS_PREFERRED_VOICES || {}))
}

// Get Farsi SVG flag URL from extension assets
const getFarsiFlagUrl = () => {
  try {
    return browser.runtime.getURL('icons/flags/ir.svg')
  } catch {
    return ''
  }
}

// Generate Flag emoji dynamically with comprehensive fallback resolution
const getFlagEmoji = (lang) => {
  if (!lang) return '🌐'
  
  // Use explicit flagCode from language metadata JSON if populated
  let code = lang.flagCode
  
  // Dynamic fallback mapping for languages missing flagCode in JSON
  if (!code && lang.code) {
    const cleanCode = lang.code.toLowerCase().trim()
    const baseLang = cleanCode.split('-')[0]
    
    const fallbackFlags = {
      'en': 'gb',
      'fa': 'ir',
      'ja': 'jp',
      'ko': 'kr',
      'zh': 'cn',
      'zh-cn': 'cn',
      'zh-tw': 'tw',
      'yue': 'hk',
      'lzh': 'tw',
      'ar': 'sa',
      'he': 'il',
      'hi': 'in',
      'el': 'gr',
      'da': 'dk',
      'sv': 'se',
      'uk': 'ua',
      'cs': 'cz',
      'et': 'ee',
      'sl': 'si',
      'sq': 'al',
      'be': 'by',
      'ka': 'ge',
      'hy': 'am',
      'ne': 'np',
      'si': 'lk',
      'my': 'mm',
      'km': 'kh',
      'lo': 'la',
      'gu': 'in',
      'ta': 'in',
      'te': 'in',
      'kn': 'in',
      'ml': 'in',
      'pa': 'in',
      'bn': 'bd',
      'ur': 'pk',
      'am': 'et',
      'om': 'et',
      'sw': 'ke',
      'ny': 'mw',
      'st': 'za',
      'zu': 'za',
      'xh': 'za',
      'af': 'za',
      'eu': 'es',
      'ca': 'es',
      'co': 'fr',
      'fy': 'nl',
      'gl': 'es',
      'haw': 'us',
      'hmn': 'la',
      'ig': 'ng',
      'jw': 'id',
      'kk': 'kz',
      'ky': 'kg',
      'lb': 'lu',
      'mi': 'nz',
      'sm': 'ws',
      'gd': 'gb',
      'sn': 'zw',
      'su': 'id',
      'tg': 'tj',
      'tt': 'ru',
      'uz': 'uz',
      'yi': 'il',
      'yo': 'ng'
    }
    
    code = fallbackFlags[cleanCode] || fallbackFlags[baseLang] || baseLang
  }
  
  if (!code) return '🌐'
  
  const codePoints = code
    .toUpperCase()
    .split('')
    .map(char => 127397 + char.charCodeAt(0))
  try {
    return String.fromCodePoint(...codePoints)
  } catch {
    return '🌐'
  }
}

// Filter languages based on search query and active TTS engine support
const filteredLanguages = computed(() => {
  const list = translationLanguages.value || []
  const engine = ttsEngine.value || TTS_ENGINES.EDGE
  
  // Filter list to only include languages supported by the active TTS engine
  const supportedList = list.filter(l => TTSLanguageService.supportsLanguage(engine, l.code))
  
  if (!searchQuery.value.trim()) return supportedList
  const query = searchQuery.value.toLowerCase().trim()
  return supportedList.filter(l => 
    l.name.toLowerCase().includes(query) || 
    l.code.toLowerCase().includes(query)
  )
})

// Get available voice options dynamically for the selected engine and language
const getVoiceOptionsForLang = (langCode) => {
  const currentEngine = settingsStore.settings?.TTS_ENGINE || TTS_ENGINES.EDGE
  const baseLang = langCode.toLowerCase().split('-')[0]
  
  if (currentEngine === TTS_ENGINES.EDGE) {
    if (!edgeVoices.value || edgeVoices.value.length === 0) {
      // Fallback to PROVIDER_CONFIGS static voices list
      const staticVoice = PROVIDER_CONFIGS[TTS_ENGINES.EDGE].voices[langCode] || 
                          PROVIDER_CONFIGS[TTS_ENGINES.EDGE].voices[baseLang]
      if (staticVoice) {
        return [{ value: staticVoice, label: `${staticVoice} ${t('tts_static_fallback') || '(Static Fallback)'}` }]
      }
      return []
    }
    
    return edgeVoices.value
      .filter(v => {
        const locale = v.Locale.toLowerCase()
        return locale === langCode.toLowerCase() || locale.startsWith(`${baseLang}-`)
      })
      .map(v => {
        const genderEmoji = v.Gender === 'Female' ? '👩' : '👨'
        const shortName = v.ShortName
        const friendlyName = v.FriendlyName || v.LocalName || shortName
        
        // Trim standard prefix to keep label compact and sleek
        const cleanName = friendlyName.replace(/Microsoft | Online \(Natural\)/gi, '')
        return {
          value: shortName,
          label: `${genderEmoji} ${cleanName}`
        }
      })
  } else {
    // Google TTS Dialects
    const googleDialects = {
      'en': [
        { value: 'en-us', label: '🇺🇸 English (United States)' },
        { value: 'en-gb', label: '🇬🇧 English (United Kingdom)' },
        { value: 'en-au', label: '🇦🇺 English (Australia)' },
        { value: 'en-in', label: '🇮🇳 English (India)' },
        { value: 'en-ca', label: '🇨🇦 English (Canada)' }
      ],
      'es': [
        { value: 'es-es', label: '🇪🇸 Spanish (Spain)' },
        { value: 'es-mx', label: '🇲🇽 Spanish (Mexico)' },
        { value: 'es-us', label: '🇺🇸 Spanish (United States)' }
      ],
      'pt': [
        { value: 'pt-br', label: '🇧🇷 Portuguese (Brazil)' },
        { value: 'pt-pt', label: '🇵🇹 Portuguese (Portugal)' }
      ],
      'zh': [
        { value: 'zh-cn', label: '🇨🇳 Chinese (Simplified)' },
        { value: 'zh-tw', label: '🇹🇼 Chinese (Traditional)' },
        { value: 'yue', label: '🇭🇰 Cantonese (Hong Kong)' }
      ],
      'fr': [
        { value: 'fr-fr', label: '🇫🇷 French (France)' },
        { value: 'fr-ca', label: '🇨🇦 French (Canada)' }
      ],
      'de': [
        { value: 'de-de', label: '🇩🇪 German (Germany)' }
      ],
      'ar': [
        { value: 'ar-sa', label: '🇸🇦 Arabic (Saudi Arabia)' },
        { value: 'ar-eg', label: '🇪🇬 Arabic (Egypt)' }
      ]
    }
    
    return googleDialects[baseLang] || [
      { value: langCode, label: `🌐 Default ${langCode.toUpperCase()}` }
    ]
  }
}

const getPreferredVoiceValue = (langCode) => {
  const preferred = tempPreferredVoices.value?.[langCode]
  const currentEngine = settingsStore.settings?.TTS_ENGINE || TTS_ENGINES.EDGE
  
  if (preferred) {
    if (typeof preferred === 'object') {
      return preferred[currentEngine] || 'default'
    }
    // Backward compatibility: treat string value as Edge preferred voice
    if (currentEngine === TTS_ENGINES.EDGE) {
      return preferred
    }
  }
  return 'default'
}

const savePreferredVoice = (langCode, voiceValue) => {
  const current = { ...tempPreferredVoices.value }
  const currentEngine = settingsStore.settings?.TTS_ENGINE || TTS_ENGINES.EDGE
  
  if (!current[langCode] || typeof current[langCode] !== 'object') {
    current[langCode] = { edge: 'default', google: 'default' }
  }
  
  current[langCode][currentEngine] = voiceValue
  
  // Clean up if both keys are back to default to minimize storage footprint
  if (current[langCode].edge === 'default' && current[langCode].google === 'default') {
    delete current[langCode]
  }
  
  tempPreferredVoices.value = current
}

const resetAllVoices = () => {
  if (confirm(t('tts_confirm_reset') || 'Are you sure you want to reset all customized voices to defaults?')) {
    tempPreferredVoices.value = {}
  }
}

const previewVoice = async (langCode) => {
  if (playingLangCode.value === langCode && isPlaying.value) {
    await stop()
    playingLangCode.value = null
    return
  }
  
  playingLangCode.value = langCode
  
  const previewTexts = {
    'fa': 'سلام! این نمونه صدای انتخابی شما است.',
    'en': 'Hello! This is a preview of your selected voice.',
    'de': 'Hallo! Dies ist eine Vorschau Ihrer ausgewählten Stimme.',
    'fr': 'Bonjour! Ceci est un aperçu de la voix sélectionnée.',
    'es': '¡Hola! Esta es una vista previa de la voz seleccionada.',
    'pt': 'Olá! Esta é uma prévia da sua voz selecionada.',
    'zh': '您好！这是您选择的语音预览。',
    'ja': 'こんにちは！これは選択された音声のプレビューです。',
    'ko': '안녕하세요! 선택하신 목소리 미리듣기입니다.'
  }
  
  const baseLang = langCode.toLowerCase().split('-')[0]
  const text = previewTexts[baseLang] || previewTexts['en']
  
  try {
    const success = await speak(text, langCode, { preferredVoices: tempPreferredVoices.value })
    if (!success) {
      playingLangCode.value = null
    }
  } catch (err) {
    logger.warn('Failed to speak preview:', err)
    playingLangCode.value = null
  }
}
</script>
