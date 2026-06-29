<template>
  <SelectionActionPill
    :title="title"
    :aria-label="ariaLabel"
    :show-translate="showTranslate"
    :show-tts="showTTS"
    :tts-state="effectiveTTSState"
    :tts-title="ttsTitle"
    :tts-aria-label="ttsTitle"
    :theme="isDarkTheme ? 'dark' : 'light'"
    data-testid="pdf-translation-icon"
    @translate-pointerdown="emit('pointerdown', $event)"
    @translate="handleTranslateClick"
    @tts="handleTTSClick"
  />
</template>

<script setup>
import { computed, onUnmounted, ref } from 'vue'
import SelectionActionPill from '@/components/shared/SelectionActionPill.vue'
import { useUnifiedI18n } from '@/composables/shared/useUnifiedI18n.js'
import { useTTSSmart } from '@/features/tts/composables/useTTSSmart.js'
import { useSettingsStore } from '@/features/settings/stores/settings.js'
import { getLanguageNameFromCode } from '@/shared/config/languageConstants.js'

const props = defineProps({
  title: {
    type: String,
    default: ''
  },
  ariaLabel: {
    type: String,
    default: ''
  },
  text: {
    type: String,
    default: ''
  },
  disabled: {
    type: Boolean,
    default: false
  }
})

const emit = defineEmits(['click', 'pointerdown'])

const settingsStore = useSettingsStore()
const tts = useTTSSmart()
const { t } = useUnifiedI18n()
const localTTSId = ref(null)

const showTranslate = computed(() => settingsStore.settings.SHOW_TRANSLATE_ICON_IN_TOOLBAR !== false)
const showTTS = computed(() => settingsStore.settings.SHOW_TTS_ICON_IN_TOOLBAR !== false)
const isDarkTheme = computed(() => settingsStore.isDarkTheme)

const isThisTTSActive = computed(() => {
  if (tts.ttsState.value === 'error' && tts.lastText.value === props.text) {
    return true
  }

  return !!(localTTSId.value && tts.currentTTSId.value === localTTSId.value)
})

const effectiveTTSState = computed(() => {
  if (tts.ttsState.value === 'loading' && localTTSId.value?.startsWith('pending_')) {
    return 'loading'
  }

  if (isThisTTSActive.value) {
    return tts.ttsState.value
  }

  return 'idle'
})

const ttsTitle = computed(() => {
  const displayLang = tts.detectedLanguage.value
    ? getLanguageNameFromCode(tts.detectedLanguage.value)
    : ''
  const langName = displayLang
    ? displayLang.charAt(0).toUpperCase() + displayLang.slice(1)
    : ''
  const langSuffix = langName ? ` (${langName})` : ''

  switch (effectiveTTSState.value) {
    case 'idle':
      return `${t('action_speak_text') || 'Speak text'}${langSuffix}`
    case 'loading':
      return t('window_loading_alt') || 'Loading...'
    case 'playing':
      return `${t('action_stop_speaking') || 'Stop speaking'}${langSuffix}`
    case 'error':
      return tts.errorMessage.value || 'TTS error'
    default:
      return 'Text to speech'
  }
})

const handleTranslateClick = () => {
  if (props.disabled) return

  emit('click')
}

const handleTTSClick = async () => {
  if (props.disabled || !props.text?.trim()) {
    return
  }

  try {
    let result = false

    switch (effectiveTTSState.value) {
      case 'idle':
        localTTSId.value = `pending_${Date.now()}`
        result = await tts.speak(props.text, 'auto')
        if (result) {
          localTTSId.value = tts.currentTTSId.value
        } else {
          localTTSId.value = null
        }
        break
      case 'loading':
      case 'playing':
        result = await tts.stop()
        if (result) {
          localTTSId.value = null
        }
        break
      case 'error':
        localTTSId.value = `pending_retry_${Date.now()}`
        result = await tts.speak(props.text, 'auto')
        if (result) {
          localTTSId.value = tts.currentTTSId.value
        } else {
          localTTSId.value = null
        }
        break
      default:
        localTTSId.value = null
        await tts.stop()
    }
  } catch (error) {
    console.warn('[PdfTranslationIcon] TTS toggle error:', error)
    localTTSId.value = null
  }
}

onUnmounted(() => {
  if (isThisTTSActive.value) {
    void tts.stop()
  }
})
</script>
