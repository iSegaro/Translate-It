<template>
  <div class="tts-control" :class="{ disabled: !isSupported, playing: isPlaying, error: hasError }">
    <!-- Main TTS Button -->
    <div class="tts-main">
      <button
        class="tts-button"
        :class="[
          isPlaying ? 'playing' : isPaused ? 'paused' : 'stopped',
          { disabled: !canPlay }
        ]"
        @click="handleMainAction"
        :disabled="!canPlay"
        :title="buttonTooltip"
      >
        <span class="tts-icon">
          <span v-if="isLoading" class="loading-spinner"></span>
          <span v-else-if="isPlaying">⏸️</span>
          <span v-else-if="isPaused">▶️</span>
          <span v-else>🔊</span>
        </span>
        
        <span class="tts-label">
          {{ buttonLabel }}
        </span>
      </button>
      
      <!-- Quick actions -->
      <div v-if="isActive" class="quick-actions">
        <button 
          class="quick-btn stop-btn"
          @click="stop"
          title="Stop"
        >
          ⏹️
        </button>
        
        <button 
          class="quick-btn settings-btn"
          @click="toggleSettings"
          title="Settings"
        >
          ⚙️
        </button>
      </div>
    </div>
    
    <!-- Error display -->
    <div v-if="hasError" class="error-message">
      <span class="error-icon">⚠️</span>
      <span class="error-text">{{ error }}</span>
      <button class="error-close" @click="clearError">✕</button>
    </div>
    
    <!-- Progress bar -->
    <div v-if="showProgress && isActive" class="progress-container">
      <div class="progress-bar">
        <div class="progress-fill" :style="{ width: `${progress}%` }"></div>
      </div>
      <div class="progress-text">{{ progressText }}</div>
    </div>
    
    <!-- Settings panel -->
    <div v-if="showSettings" class="settings-panel">
      <div class="settings-header">
        <h4>Text-to-Speech Settings</h4>
        <button class="settings-close" @click="showSettings = false">✕</button>
      </div>
      
      <div class="settings-content">
        <!-- Voice selection -->
        <div class="setting-group">
          <label class="setting-label">Voice:</label>
          <select 
            v-model="localSettings.voice" 
            @change="updateVoice"
            class="voice-select"
          >
            <option value="">Default</option>
            <optgroup 
              v-for="(group, lang) in groupedVoices" 
              :key="lang" 
              :label="getLanguageName(lang)"
            >
              <option 
                v-for="voice in group" 
                :key="voice.voiceURI" 
                :value="voice.voiceURI"
              >
                {{ voice.name }} {{ voice.gender ? `(${voice.gender})` : '' }}
              </option>
            </optgroup>
          </select>
          
          <button 
            v-if="localSettings.voice"
            class="test-voice-btn"
            @click="testCurrentVoice"
            :disabled="isLoading"
          >
            Test
          </button>
        </div>
        
        <!-- Speed control -->
        <div class="setting-group">
          <label class="setting-label">
            Speed: {{ localSettings.rate.toFixed(1) }}x
          </label>
          <div class="slider-container">
            <input 
              type="range"
              v-model.number="localSettings.rate"
              @input="updateSetting('rate', $event.target.value)"
              min="0.1"
              max="3.0"
              step="0.1"
              class="range-slider"
            />
            <div class="slider-marks">
              <span>0.1x</span>
              <span>1x</span>
              <span>3x</span>
            </div>
          </div>
        </div>
        
        <!-- Pitch control -->
        <div class="setting-group">
          <label class="setting-label">
            Pitch: {{ localSettings.pitch.toFixed(1) }}
          </label>
          <div class="slider-container">
            <input 
              type="range"
              v-model.number="localSettings.pitch"
              @input="updateSetting('pitch', $event.target.value)"
              min="0.1"
              max="2.0"
              step="0.1"
              class="range-slider"
            />
            <div class="slider-marks">
              <span>Low</span>
              <span>Normal</span>
              <span>High</span>
            </div>
          </div>
        </div>
        
        <!-- Volume control -->
        <div class="setting-group">
          <label class="setting-label">
            Volume: {{ Math.round(localSettings.volume * 100) }}%
          </label>
          <div class="slider-container">
            <input 
              type="range"
              v-model.number="localSettings.volume"
              @input="updateSetting('volume', $event.target.value)"
              min="0"
              max="1"
              step="0.1"
              class="range-slider"
            />
            <div class="slider-marks">
              <span>0%</span>
              <span>50%</span>
              <span>100%</span>
            </div>
          </div>
        </div>
        
        <!-- Language preference -->
        <div class="setting-group">
          <label class="setting-label">Language:</label>
          <select 
            v-model="localSettings.language" 
            @change="updateSetting('language', $event.target.value)"
            class="language-select"
          >
            <option value="auto">Auto-detect</option>
            <option v-for="lang in supportedLanguages" :key="lang.code" :value="lang.code">
              {{ lang.name }}
            </option>
          </select>
        </div>
        
        <!-- Gender preference -->
        <div class="setting-group">
          <label class="setting-label">Preferred Voice Gender:</label>
          <div class="radio-group">
            <label class="radio-option">
              <input 
                type="radio" 
                v-model="localSettings.preferredVoiceGender" 
                value="female"
                @change="updateSetting('preferredVoiceGender', 'female')"
              />
              <span class="radio-label">Female</span>
            </label>
            <label class="radio-option">
              <input 
                type="radio" 
                v-model="localSettings.preferredVoiceGender" 
                value="male"
                @change="updateSetting('preferredVoiceGender', 'male')"
              />
              <span class="radio-label">Male</span>
            </label>
            <label class="radio-option">
              <input 
                type="radio" 
                v-model="localSettings.preferredVoiceGender" 
                value="neutral"
                @change="updateSetting('preferredVoiceGender', 'neutral')"
              />
              <span class="radio-label">No Preference</span>
            </label>
          </div>
        </div>
        
        <!-- Auto-play option -->
        <div class="setting-group">
          <label class="checkbox-label">
            <input 
              type="checkbox" 
              v-model="localSettings.autoPlay"
              @change="updateSetting('autoPlay', $event.target.checked)"
              class="checkbox"
            />
            <span class="checkmark"></span>
            Auto-play translations
          </label>
        </div>
      </div>
      
      <!-- Settings actions -->
      <div class="settings-actions">
        <button class="settings-btn reset-btn" @click="resetToDefaults">
          Reset to Defaults
        </button>
        <button class="settings-btn close-btn" @click="showSettings = false">
          Close
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted } from 'vue'
import { useTTS } from '@/composables/useTTS.js'

const props = defineProps({
  text: {
    type: String,
    default: ''
  },
  language: {
    type: String,
    default: 'auto'
  },
  autoDetectLanguage: {
    type: Boolean,
    default: true
  },
  showProgress: {
    type: Boolean,
    default: true
  },
  size: {
    type: String,
    default: 'md',
    validator: value => ['sm', 'md', 'lg'].includes(value)
  }
})

const emit = defineEmits(['play', 'pause', 'stop', 'error', 'settingsChange'])

// TTS composable
const {
  isSupported,
  isPlaying,
  isPaused,
  isLoading,
  isActive,
  availableVoices,
  currentVoice,
  progress,
  error,
  settings,
  speak,
  pause,
  resume,
  stop,
  toggle,
  testVoice,
  updateSetting,
  resetSettings,
  setLanguageFromText
} = useTTS()

// Local state
const showSettings = ref(false)
const localSettings = ref({ ...settings.value })

// Watch settings changes
watch(settings, (newSettings) => {
  localSettings.value = { ...newSettings }
}, { deep: true })

// Computed
const hasError = computed(() => !!error.value)

const canPlay = computed(() => {
  return isSupported.value && props.text?.trim()
})

const buttonLabel = computed(() => {
  if (!isSupported.value) return 'Not Available'
  if (isLoading.value) return 'Loading...'
  if (isPlaying.value) return 'Pause'
  if (isPaused.value) return 'Resume'
  return 'Speak'
})

const buttonTooltip = computed(() => {
  if (!isSupported.value) return 'Text-to-speech not supported'
  if (!props.text?.trim()) return 'No text to speak'
  if (isPlaying.value) return 'Pause speech'
  if (isPaused.value) return 'Resume speech'
  return 'Start text-to-speech'
})

const progressText = computed(() => {
  if (isLoading.value) return 'Loading...'
  if (isPlaying.value) return 'Speaking...'
  if (isPaused.value) return 'Paused'
  return 'Ready'
})

const groupedVoices = computed(() => {
  const groups = {}
  availableVoices.value.forEach(voice => {
    const lang = voice.lang.split('-')[0]
    if (!groups[lang]) groups[lang] = []
    groups[lang].push(voice)
  })
  return groups
})

const supportedLanguages = [
  { code: 'en-US', name: 'English (US)' },
  { code: 'en-GB', name: 'English (UK)' },
  { code: 'fa-IR', name: 'Persian' },
  { code: 'ar-SA', name: 'Arabic' },
  { code: 'es-ES', name: 'Spanish' },
  { code: 'fr-FR', name: 'French' },
  { code: 'de-DE', name: 'German' },
  { code: 'ja-JP', name: 'Japanese' },
  { code: 'ko-KR', name: 'Korean' },
  { code: 'zh-CN', name: 'Chinese (Simplified)' },
  { code: 'ru-RU', name: 'Russian' }
]

// Methods
const handleMainAction = async () => {
  if (!canPlay.value) return

  try {
    if (isPlaying.value) {
      pause()
      emit('pause')
    } else if (isPaused.value) {
      resume()
      emit('play')
    } else {
      await startSpeaking()
    }
  } catch (err) {
    emit('error', err)
  }
}

const startSpeaking = async () => {
  if (!props.text?.trim()) return

  try {
    let speechOptions = { ...localSettings.value }

    // Auto-detect language if enabled
    if (props.autoDetectLanguage && props.text) {
      const detected = setLanguageFromText(props.text)
      if (detected.language && detected.language !== 'en-US') {
        speechOptions.language = detected.language
        if (detected.voice) {
          speechOptions.voice = detected.voice
        }
      }
    }

    // Override with prop language if provided
    if (props.language && props.language !== 'auto') {
      speechOptions.language = props.language
    }

    await speak(props.text, speechOptions)
    emit('play', props.text)
  } catch (err) {
    console.error('TTS Error:', err)
    emit('error', err)
  }
}

const toggleSettings = () => {
  showSettings.value = !showSettings.value
}

const updateVoice = (event) => {
  const voiceURI = event.target.value
  updateSetting('voice', voiceURI)
  emit('settingsChange', { voice: voiceURI })
}

const testCurrentVoice = async () => {
  if (!localSettings.value.voice) return

  try {
    const testText = getTestText()
    await testVoice(localSettings.value.voice, testText)
  } catch (err) {
    console.error('Voice test failed:', err)
  }
}

const getTestText = () => {
  const testTexts = {
    'en': 'Hello, this is a test of the text to speech system.',
    'fa': 'سلام، این یک تست سیستم تبدیل متن به گفتار است.',
    'ar': 'مرحبا، هذا اختبار لنظام تحويل النص إلى كلام.',
    'es': 'Hola, esta es una prueba del sistema de texto a voz.',
    'fr': 'Bonjour, ceci est un test du système de synthèse vocale.',
    'de': 'Hallo, das ist ein Test des Text-zu-Sprache-Systems.',
    'ja': 'こんにちは、これは音声合成システムのテストです。',
    'ko': '안녕하세요, 이것은 텍스트 음성 변환 시스템의 테스트입니다.',
    'zh': '你好，这是文本转语音系统的测试。',
    'ru': 'Привет, это тест системы преобразования текста в речь.'
  }

  const lang = localSettings.value.language?.split('-')[0] || 'en'
  return testTexts[lang] || testTexts['en']
}

const resetToDefaults = () => {
  resetSettings()
  localSettings.value = { ...settings.value }
  emit('settingsChange', settings.value)
}

const clearError = () => {
  error.value = null
}

const getLanguageName = (langCode) => {
  const lang = supportedLanguages.find(l => l.code.startsWith(langCode))
  return lang ? lang.name : langCode.toUpperCase()
}

// Stop TTS when component unmounts or text changes
watch(() => props.text, (newText, oldText) => {
  if (newText !== oldText && (isPlaying.value || isPaused.value)) {
    stop()
  }
})

watch(() => localSettings.value, (newSettings) => {
  emit('settingsChange', newSettings)
}, { deep: true })

onMounted(() => {
  // Auto-play if enabled and text is provided
  if (settings.value.autoPlay && props.text?.trim() && canPlay.value) {
    startSpeaking()
  }
})
</script>

<style scoped>
.tts-control {
  display: flex;
  flex-direction: column;
  gap: 8px;
  font-family: inherit;
}

.tts-control.disabled {
  opacity: 0.6;
  pointer-events: none;
}

/* Main TTS controls */
.tts-main {
  display: flex;
  align-items: center;
  gap: 8px;
}

.tts-button {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 12px;
  border: 1px solid var(--color-border);
  border-radius: 6px;
  background: var(--color-background);
  color: var(--color-text);
  font-size: 14px;
  cursor: pointer;
  transition: all 0.2s ease;
  
  &:hover:not(.disabled) {
    background: var(--color-surface);
    border-color: var(--color-primary);
  }
  
  &:disabled,
  &.disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
  
  &.playing {
    background: rgba(33, 150, 243, 0.1);
    border-color: var(--color-primary);
    color: var(--color-primary);
  }
  
  &.paused {
    background: rgba(255, 152, 0, 0.1);
    border-color: #ff9800;
    color: #ff9800;
  }
}

.tts-icon {
  display: flex;
  align-items: center;
  font-size: 16px;
  min-width: 16px;
}

.loading-spinner {
  width: 14px;
  height: 14px;
  border: 2px solid transparent;
  border-radius: 50%;
  border-top: 2px solid currentColor;
  animation: spin 1s linear infinite;
}

@keyframes spin {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
}

.tts-label {
  font-weight: 500;
}

.quick-actions {
  display: flex;
  gap: 4px;
}

.quick-btn {
  padding: 6px;
  border: 1px solid var(--color-border);
  border-radius: 4px;
  background: var(--color-background);
  cursor: pointer;
  font-size: 12px;
  transition: all 0.2s ease;
  
  &:hover {
    background: var(--color-surface);
  }
}

.stop-btn:hover {
  border-color: #f44336;
  color: #f44336;
}

.settings-btn:hover {
  border-color: #607d8b;
  color: #607d8b;
}

/* Error message */
.error-message {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  background: rgba(244, 67, 54, 0.1);
  border: 1px solid #f44336;
  border-radius: 4px;
  font-size: 13px;
  color: #f44336;
}

.error-icon {
  font-size: 14px;
}

.error-text {
  flex: 1;
}

.error-close {
  background: none;
  border: none;
  color: inherit;
  cursor: pointer;
  font-size: 14px;
  
  &:hover {
    opacity: 0.7;
  }
}

/* Progress bar */
.progress-container {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.progress-bar {
  height: 4px;
  background: var(--color-surface);
  border-radius: 2px;
  overflow: hidden;
}

.progress-fill {
  height: 100%;
  background: var(--color-primary);
  transition: width 0.3s ease;
}

.progress-text {
  font-size: 12px;
  color: var(--color-text-muted);
  text-align: center;
}

/* Settings panel */
.settings-panel {
  background: var(--color-background);
  border: 1px solid var(--color-border);
  border-radius: 8px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
  margin-top: 8px;
  overflow: hidden;
  animation: slideDown 0.3s ease;
}

@keyframes slideDown {
  from {
    opacity: 0;
    transform: translateY(-10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.settings-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px;
  border-bottom: 1px solid var(--color-border);
  background: var(--color-surface);
}

.settings-header h4 {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  color: var(--color-text);
}

.settings-close {
  background: none;
  border: none;
  font-size: 18px;
  cursor: pointer;
  color: var(--color-text-muted);
  
  &:hover {
    color: var(--color-text);
  }
}

.settings-content {
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 16px;
  max-height: 400px;
  overflow-y: auto;
}

.setting-group {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.setting-label {
  font-size: 13px;
  font-weight: 500;
  color: var(--color-text);
}

.voice-select,
.language-select {
  padding: 6px 8px;
  border: 1px solid var(--color-border);
  border-radius: 4px;
  background: var(--color-background);
  color: var(--color-text);
  font-size: 13px;
}

.test-voice-btn {
  padding: 4px 8px;
  border: 1px solid var(--color-border);
  border-radius: 4px;
  background: var(--color-background);
  color: var(--color-text);
  font-size: 12px;
  cursor: pointer;
  margin-top: 4px;
  align-self: flex-start;
  
  &:hover:not(:disabled) {
    background: var(--color-surface);
    border-color: var(--color-primary);
  }
  
  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
}

.slider-container {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.range-slider {
  width: 100%;
  height: 6px;
  border-radius: 3px;
  background: var(--color-surface);
  outline: none;
  -webkit-appearance: none;
  
  &::-webkit-slider-thumb {
    -webkit-appearance: none;
    appearance: none;
    width: 16px;
    height: 16px;
    border-radius: 50%;
    background: var(--color-primary);
    cursor: pointer;
  }
  
  &::-moz-range-thumb {
    width: 16px;
    height: 16px;
    border-radius: 50%;
    background: var(--color-primary);
    cursor: pointer;
    border: none;
  }
}

.slider-marks {
  display: flex;
  justify-content: space-between;
  font-size: 11px;
  color: var(--color-text-muted);
}

.radio-group {
  display: flex;
  gap: 12px;
}

.radio-option {
  display: flex;
  align-items: center;
  gap: 4px;
  cursor: pointer;
  font-size: 13px;
}

.radio-label {
  color: var(--color-text);
}

.checkbox-label {
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  font-size: 13px;
  color: var(--color-text);
}

.checkbox {
  width: 16px;
  height: 16px;
}

.settings-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding: 12px 16px;
  border-top: 1px solid var(--color-border);
  background: var(--color-surface);
}

.settings-actions .settings-btn {
  padding: 6px 12px;
  border: 1px solid var(--color-border);
  border-radius: 4px;
  background: var(--color-background);
  color: var(--color-text);
  font-size: 12px;
  cursor: pointer;
  transition: all 0.2s ease;
  
  &:hover {
    background: var(--color-surface);
  }
}

.reset-btn:hover {
  border-color: #ff9800;
  color: #ff9800;
}

.close-btn:hover {
  border-color: var(--color-primary);
  color: var(--color-primary);
}

/* Size variants */
.tts-control.size-sm .tts-button {
  padding: 6px 8px;
  font-size: 12px;
}

.tts-control.size-lg .tts-button {
  padding: 12px 16px;
  font-size: 16px;
}

/* Responsive design */
@media (max-width: 480px) {
  .settings-panel {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    z-index: 1000;
    border-radius: 0;
    margin: 0;
  }
  
  .settings-content {
    max-height: none;
    flex: 1;
  }
  
  .radio-group {
    flex-direction: column;
    gap: 8px;
  }
}
</style>