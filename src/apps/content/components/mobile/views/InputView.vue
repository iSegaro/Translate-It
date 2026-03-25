<template>
  <div class="input-view" style="display: flex !important; flex-direction: column !important; height: 100% !important; font-family: sans-serif !important; gap: 15px !important;">
    
    <!-- Header -->
    <div class="view-header" :style="`display: flex !important; align-items: center !important; padding-bottom: 10px !important; border-bottom: ${settingsStore.isDarkTheme ? '1px solid #333' : '1px solid #eee'} !important;`" >
      <button @click="goBack" class="back-btn" :style="`background: none !important; border: none !important; display: flex !important; align-items: center !important; gap: 8px !important; cursor: pointer !important; padding: 0 !important; height: 44px !important; min-width: 44px !important; -webkit-tap-highlight-color: transparent !important; color: ${settingsStore.isDarkTheme ? '#adb5bd' : '#333'} !important;`" >
        <img src="@/icons/ui/dropdown-arrow.svg" :alt="t('mobile_back_button_alt') || 'Back'" :style="`width: 20px !important; height: 20px !important; transform: rotate(90deg) !important; opacity: 0.6 !important; ${settingsStore.isDarkTheme ? 'filter: brightness(0) invert(1) !important;' : ''}`" />
        <span class="header-title" :style="`font-weight: bold !important; font-size: 17px !important; color: ${settingsStore.isDarkTheme ? '#adb5bd' : '#333'} !important;`" >{{ t('mobile_input_header_title') || 'Manual Input' }}</span>
      </button>
    </div>

    <!-- Input Card -->
    <div class="input-card" :style="{ border: settingsStore.isDarkTheme ? '1px solid #3d3d3d !important' : '1px solid #e9ecef !important', background: settingsStore.isDarkTheme ? '#2d2d2d !important' : '#f8f9fa !important', borderRadius: '12px !important', padding: '12px !important', display: 'flex !important', flexDirection: 'column !important', gap: '10px !important' }">
      <div style="display: flex !important; justify-content: space-between !important; align-items: center !important;">
        <div style="font-size: 11px !important; font-weight: 800 !important; color: #adb5bd !important; text-transform: uppercase !important;">{{ t('mobile_input_source_text_label') || 'Source Text' }}</div>
        
        <div style="display: flex !important; gap: 8px !important;">
           <button 
            class="input-action-btn paste-btn" 
            @click="handlePaste" 
            :style="`padding: 6px 12px !important; border-radius: 8px !important; font-size: 12px !important; cursor: pointer !important; display: flex !important; align-items: center !important; gap: 5px !important; font-weight: 600 !important; background: ${settingsStore.isDarkTheme ? 'rgba(28, 126, 214, 0.2)' : '#e7f5ff'} !important; border: 1px solid ${settingsStore.isDarkTheme ? 'rgba(28, 126, 214, 0.3)' : '#d0ebff'} !important; color: ${settingsStore.isDarkTheme ? '#74c0fc' : '#1c7ed6'} !important;`"
          >
            <img src="@/icons/ui/paste.png" :style="`width: 14px !important; height: 14px !important; ${settingsStore.isDarkTheme ? 'filter: brightness(0) invert(1) !important;' : 'filter: brightness(0.8) !important;'}`" />
            {{ t('action_paste_from_clipboard') || 'Paste' }}
          </button>
          
          <button 
            v-if="inputText"
            class="input-action-btn clear-btn" 
            @click="inputText = ''" 
            :style="`padding: 6px 12px !important; border-radius: 8px !important; font-size: 12px !important; cursor: pointer !important; font-weight: 600 !important; background: ${settingsStore.isDarkTheme ? 'rgba(250, 82, 82, 0.2)' : '#fff5f5'} !important; border: 1px solid ${settingsStore.isDarkTheme ? 'rgba(250, 82, 82, 0.3)' : '#ffe3e3'} !important; color: ${settingsStore.isDarkTheme ? '#ff8787' : '#fa5252'} !important;`"
          >
            {{ t('mobile_input_clear_btn') || 'Clear' }}
          </button>
        </div>
      </div>
      
      <textarea
        v-model="inputText"
        :placeholder="t('mobile_input_placeholder') || 'Type here...'"
        :dir="inputDir"
        :style="{ width: '100% !important', minHeight: '100px !important', border: 'none !important', background: 'transparent !important', fontSize: '16px !important', color: settingsStore.isDarkTheme ? '#dee2e6 !important' : '#495057 !important', resize: 'none !important', outline: 'none !important', padding: '4px 0 !important', textAlign: 'start !important', lineHeight: '1.5 !important' }"
        @focus="onFocus"
      ></textarea>
    </div>

    <!-- Controls -->
    <div class="input-controls" style="display: flex !important; flex-direction: column !important; gap: 12px !important; position: relative !important;">
      <!-- Languages -->
      <div class="language-controls-card" :style="{ border: settingsStore.isDarkTheme ? '1px solid #444 !important' : '1px solid #ced4da !important', borderRadius: '12px !important', background: settingsStore.isDarkTheme ? '#2d2d2d !important' : 'white !important', overflow: 'hidden !important', boxShadow: '0 2px 4px rgba(0,0,0,0.02) !important', marginTop: '5px !important' }">
        <LanguageSelector
          v-model:source-language="sourceLang"
          v-model:target-language="targetLang"
          compact
          :source-title="t('popup_source_language_title') || 'Source'"
          :target-title="t('popup_target_language_title') || 'Target'"
          :swap-title="t('popup_swap_languages_title') || 'Swap'"
          :auto-detect-label="t('auto_detect') || 'Auto-Detect'"
        />
      </div>
      
      <!-- Provider and Translate -->
      <div class="actions-row" style="display: flex !important; justify-content: space-between !important; align-items: center !important; gap: 10px !important;">
        <div class="provider-wrapper" style="flex: 1 !important; max-width: 48% !important; position: relative !important;">
          <ProviderSelector
            v-model="currentProvider"
            mode="compact"
            :is-global="false"
            :show-sync="false"
            class="mobile-native-provider"
          />
        </div>
        
        <button 
          @click="handleTranslate"
          :disabled="!inputText || isLoading"
          class="translate-main-btn"
          :style="{
            backgroundColor: (isLoading || !inputText) ? (settingsStore.isDarkTheme ? '#1a1a1a' : '#f1f3f5') : (settingsStore.isDarkTheme ? '#8ab4f8' : '#339af0'),
            color: (isLoading || !inputText) ? '#444' : (settingsStore.isDarkTheme ? '#202124' : 'white'),
            border: 'none !important',
            padding: '0 20px !important',
            borderRadius: '12px !important',
            fontWeight: '600 !important',
            fontSize: '15px !important',
            height: '46px !important',
            display: 'flex !important',
            alignItems: 'center !important',
            justifyContent: 'center !important',
            cursor: (isLoading || !inputText) ? 'not-allowed' : 'pointer',
            boxShadow: (isLoading || !inputText) ? 'none !important' : '0 4px 12px rgba(51, 154, 240, 0.25) !important',
            flex: '1.2 !important',
            transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1) !important',
            letterSpacing: '0.3px !important'
          }"
        >
          {{ t('mobile_input_translate_btn') || 'Translate' }}
        </button>
      </div>
    </div>

    <!-- Result Area -->
    <div class="result-container" style="min-height: 120px !important; position: relative !important; margin-top: 5px !important;">
      <div v-if="resultText || isLoading || isError" style="animation: slideIn 0.3s ease;">
        <TranslationDisplay
          mode="mobile"
          :content="resultText"
          :target-language="targetLang"
          :is-loading="isLoading"
          :tts-status="tts.ttsState.value"
          :error="isError ? resultText : ''"
          :copy-title="t('mobile_selection_copy_tooltip') || 'Copy'"
          :tts-title="t('mobile_selection_speak_tooltip') || 'Speak'"
          @text-copied="onTextCopied"
          @tts-started="onSpeak"
          @tts-stopped="tts.stop()"
          @history-requested="onHistory"
        />
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch } from 'vue'
import { useI18n } from '@/composables/shared/useI18n.js'
import { useMobileStore } from '@/store/modules/mobile.js'
import { useSettingsStore } from '@/features/settings/stores/settings.js'
import { pageEventBus } from '@/core/PageEventBus.js'
import { useMessaging } from '@/shared/messaging/composables/useMessaging.js'
import { MessageActions, MessageContexts } from '@/shared/messaging/core/MessagingCore.js'
import { shouldApplyRtl } from "@/shared/utils/text/textAnalysis.js";
import { MOBILE_CONSTANTS } from '@/shared/config/constants.js'
import { TranslationMode } from '@/shared/config/config.js'
import { useErrorHandler } from '@/composables/shared/useErrorHandler.js'
import { useTTSSmart } from '@/features/tts/composables/useTTSSmart.js'
import TranslationDisplay from '@/components/shared/TranslationDisplay.vue'
import LanguageSelector from '@/components/shared/LanguageSelector.vue'
import ProviderSelector from '@/components/shared/ProviderSelector.vue'

const mobileStore = useMobileStore()
const settingsStore = useSettingsStore()
const { t } = useI18n()
const { sendMessage, createMessage } = useMessaging(MessageContexts.MOBILE_TRANSLATE)
const { getErrorForDisplay } = useErrorHandler()
const tts = useTTSSmart()

const inputText = ref(mobileStore.selectionData.text || '')
const sourceLang = ref(mobileStore.selectionData.sourceLang || settingsStore.settings.SOURCE_LANGUAGE || 'auto')
const targetLang = ref(mobileStore.selectionData.targetLang || settingsStore.settings.TARGET_LANGUAGE || 'fa')
const currentProvider = ref(settingsStore.settings.TRANSLATION_API || 'google')
const isLoading = ref(false)
const resultText = ref(mobileStore.selectionData.error || mobileStore.selectionData.translation || '')
const isError = ref(!!mobileStore.selectionData.error)

watch(() => settingsStore.isInitialized, (initialized) => {
  if (initialized) {
    if (!mobileStore.selectionData.text) {
      sourceLang.value = settingsStore.settings.SOURCE_LANGUAGE || 'auto'
      targetLang.value = settingsStore.settings.TARGET_LANGUAGE || 'fa'
      currentProvider.value = settingsStore.settings.TRANSLATION_API || 'google'
    }
  }
}, { immediate: true })

const inputDir = computed(() => {
  if (!inputText.value) return 'ltr'
  return shouldApplyRtl(inputText.value) ? 'rtl' : 'ltr'
})

const goBack = () => { mobileStore.navigate(MOBILE_CONSTANTS.VIEWS.DASHBOARD) }
const onFocus = () => { mobileStore.setSheetState(MOBILE_CONSTANTS.SHEET_STATE.FULL) }

const handlePaste = async () => {
  try {
    const text = await navigator.clipboard.readText();
    if (text) {
      inputText.value = text;
      pageEventBus.emit(MessageActions.SHOW_NOTIFICATION_SIMPLE, { message: t('mobile_input_pasted_message'), type: 'success' });
    }
  } catch (error) {
    pageEventBus.emit(MessageActions.SHOW_NOTIFICATION_SIMPLE, { message: t('mobile_input_paste_failed'), type: 'error' });
  }
}

const handleTranslate = async () => {
  if (!inputText.value || isLoading.value) return
  isLoading.value = true
  isError.value = false
  try {
    const payload = { text: inputText.value, sourceLanguage: sourceLang.value, targetLanguage: targetLang.value, provider: currentProvider.value, mode: TranslationMode.Mobile_Translate };
    const message = createMessage(MessageActions.TRANSLATE, payload);
    const response = await sendMessage(message);
    if (response && response.success) {
      const translated = response.translatedText || (response.data && response.data.translatedText) || (response.result && response.result.translatedText);
      if (translated) resultText.value = translated;
      else resultText.value = t('mobile_input_no_result_error') || "No translation found.";
    } else {
      isError.value = true;
      const errorInfo = await getErrorForDisplay(response?.error || "Translation failed.", 'mobile-input');
      resultText.value = errorInfo.message;
    }
  } catch (error) {
    isError.value = true;
    const errorInfo = await getErrorForDisplay(error, 'mobile-input');
    resultText.value = errorInfo.message;
  } finally { isLoading.value = false; }
}

const onTextCopied = () => { pageEventBus.emit(MessageActions.SHOW_NOTIFICATION_SIMPLE, { message: t('mobile_input_copied_message') || 'Copied', type: 'success' }) }
const onSpeak = async (data) => { const text = data?.text || resultText.value; const lang = data?.language || targetLang.value; if (text) await tts.speak(text, lang); }
const onHistory = () => { mobileStore.setView(MOBILE_CONSTANTS.VIEWS.HISTORY); mobileStore.setSheetState(MOBILE_CONSTANTS.SHEET_STATE.FULL); }
</script>

<style scoped>
@keyframes slideIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }

/* Deep selectors for language dropdowns in dark mode */
.is-dark :deep(.ti-language-selector-title) { color: #adb5bd !important; }
.is-dark :deep(.ti-language-name) { color: #dee2e6 !important; }
.is-dark :deep(.ti-language-dropdown) { background-color: #2d2d2d !important; border-color: #444 !important; }
.is-dark :deep(.ti-language-item) { color: #dee2e6 !important; }
.is-dark :deep(.ti-language-item:hover) { background-color: #3d3d3d !important; }

/* Provider dropdown override */
.is-dark :deep(.ti-provider-select) {
  background-color: #2d2d2d !important;
  border-color: #444 !important;
  color: #dee2e6 !important;
  background-image: url("data:image/svg+xml;charset=US-ASCII,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2224%22%20height%3D%2224%22%20viewBox%3D%220%200%2024%2024%22%20fill%3D%22none%22%20stroke%3D%22%23adb5bd%22%20stroke-width%3D%222.5%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%3E%3Cpolyline%20points%3D%226%209%2012%2015%2018%209%22%3E%3C%2Fpolyline%3E%3C%2Fsvg%3E") !important;
}

.input-view .translate-main-btn:active:not(:disabled) {
  transform: scale(0.96) !important;
  filter: brightness(0.9) !important;
}
</style>