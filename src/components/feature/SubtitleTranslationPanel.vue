<template>
  <div class="subtitle-panel">
    <!-- Header -->
    <div class="panel-header">
      <div class="header-title">
        <h3>Subtitle Translation</h3>
        <span class="status-indicator" :class="connectionStatus">
          {{ getStatusText() }}
        </span>
      </div>
      
      <div class="header-actions">
        <button
          class="action-btn"
          @click="toggleConnection"
          :disabled="isConnecting"
          :class="{ active: isConnected }"
        >
          <span v-if="isConnecting" class="loading-spinner"></span>
          <span v-else class="btn-icon">{{ isConnected ? '⏸️' : '▶️' }}</span>
          <span class="btn-text">{{ isConnected ? 'Stop' : 'Start' }}</span>
        </button>
        
        <button
          class="action-btn settings-btn"
          @click="showSettings = !showSettings"
          :class="{ active: showSettings }"
        >
          <span class="btn-icon">⚙️</span>
        </button>
      </div>
    </div>

    <!-- Settings Panel -->
    <div v-if="showSettings" class="settings-panel">
      <div class="setting-group">
        <label class="setting-label">Translation Provider:</label>
        <select v-model="settings.provider" class="setting-select">
          <option v-for="provider in availableProviders" :key="provider" :value="provider">
            {{ getProviderName(provider) }}
          </option>
        </select>
      </div>
      
      <div class="setting-group">
        <label class="setting-label">Target Language:</label>
        <select v-model="settings.targetLanguage" class="setting-select">
          <option v-for="lang in supportedLanguages" :key="lang.code" :value="lang.code">
            {{ lang.name }}
          </option>
        </select>
      </div>
      
      <div class="setting-group">
        <label class="checkbox-label">
          <input 
            type="checkbox" 
            v-model="settings.autoTranslate"
            class="checkbox"
          />
          <span class="checkmark"></span>
          Auto-translate subtitles
        </label>
      </div>
      
      <div class="setting-group">
        <label class="checkbox-label">
          <input 
            type="checkbox" 
            v-model="settings.showOriginal"
            class="checkbox"
          />
          <span class="checkmark"></span>
          Show original text
        </label>
      </div>
    </div>

    <!-- Subtitle Display -->
    <div class="subtitle-display">
      <div v-if="!isConnected" class="empty-state">
        <div class="empty-icon">📺</div>
        <h4>Subtitle Translation Ready</h4>
        <p>Click "Start" to begin detecting and translating subtitles</p>
      </div>
      
      <div v-else-if="currentSubtitle" class="subtitle-content">
        <div v-if="settings.showOriginal" class="original-subtitle">
          <div class="subtitle-label">Original:</div>
          <div class="subtitle-text">{{ currentSubtitle.original }}</div>
        </div>
        
        <div class="translated-subtitle">
          <div class="subtitle-label">{{ getLanguageName(settings.targetLanguage) }}:</div>
          <div class="subtitle-text" :class="{ loading: isTranslating }">
            <span v-if="isTranslating" class="loading-spinner small"></span>
            <span v-else>{{ currentSubtitle.translated || 'Translation pending...' }}</span>
          </div>
        </div>
        
        <div class="subtitle-meta">
          <span class="timestamp">{{ formatTimestamp(currentSubtitle.timestamp) }}</span>
          <span class="provider">{{ getProviderName(settings.provider) }}</span>
          <span v-if="currentSubtitle.confidence" class="confidence">
            {{ Math.round(currentSubtitle.confidence * 100) }}%
          </span>
        </div>
      </div>
      
      <div v-else-if="isConnected" class="waiting-state">
        <div class="waiting-animation">
          <div class="pulse-dot"></div>
          <div class="pulse-dot"></div>
          <div class="pulse-dot"></div>
        </div>
        <p>Waiting for subtitles...</p>
      </div>
    </div>

    <!-- Subtitle History -->
    <div v-if="subtitleHistory.length > 0" class="subtitle-history">
      <div class="history-header">
        <h4>Recent Subtitles</h4>
        <button class="clear-history-btn" @click="clearHistory">
          <span class="btn-icon">🗑️</span>
        </button>
      </div>
      
      <div class="history-list">
        <div
          v-for="item in recentSubtitles"
          :key="item.id"
          class="history-item"
          @click="selectHistoryItem(item)"
          :class="{ active: currentSubtitle?.id === item.id }"
        >
          <div class="history-content">
            <div class="history-original">{{ truncateText(item.original, 50) }}</div>
            <div class="history-translated">{{ truncateText(item.translated, 50) }}</div>
          </div>
          
          <div class="history-actions">
            <button class="history-btn copy-btn" @click.stop="copySubtitle(item)">
              📋
            </button>
            <button class="history-btn tts-btn" @click.stop="playSubtitle(item)">
              🔊
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- Error Display -->
    <div v-if="error" class="error-display">
      <div class="error-content">
        <span class="error-icon">⚠️</span>
        <span class="error-text">{{ error }}</span>
      </div>
      <button class="error-close" @click="clearError">✕</button>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useTranslationStore } from '@/store/modules/translation.js'
import { useExtensionAPI } from '@/composables/useExtensionAPI.js'

const emit = defineEmits(['subtitleDetected', 'translationComplete', 'error'])

// Stores and APIs
const translationStore = useTranslationStore()
const { sendMessage } = useExtensionAPI()

// State
const isConnected = ref(false)
const isConnecting = ref(false)
const isTranslating = ref(false)
const showSettings = ref(false)
const currentSubtitle = ref(null)
const subtitleHistory = ref([])
const error = ref(null)

// Settings
const settings = ref({
  provider: 'google',
  targetLanguage: 'en',
  autoTranslate: true,
  showOriginal: true,
  detectPlatform: 'auto' // auto, youtube, netflix, etc.
})

// Supported languages
const supportedLanguages = [
  { code: 'en', name: 'English' },
  { code: 'fa', name: 'Persian' },
  { code: 'ar', name: 'Arabic' },
  { code: 'es', name: 'Spanish' },
  { code: 'fr', name: 'French' },
  { code: 'de', name: 'German' },
  { code: 'ja', name: 'Japanese' },
  { code: 'ko', name: 'Korean' },
  { code: 'zh', name: 'Chinese' },
  { code: 'ru', name: 'Russian' }
]

// Computed
const availableProviders = computed(() => translationStore.supportedProviders)

const connectionStatus = computed(() => {
  if (isConnecting.value) return 'connecting'
  if (isConnected.value) return 'connected'
  return 'disconnected'
})

const recentSubtitles = computed(() => {
  return subtitleHistory.value.slice(0, 10)
})

// Methods
const getStatusText = () => {
  switch (connectionStatus.value) {
    case 'connecting':
      return 'Connecting...'
    case 'connected':
      return 'Active'
    case 'disconnected':
    default:
      return 'Inactive'
  }
}

const toggleConnection = async () => {
  if (isConnecting.value) return

  isConnecting.value = true
  error.value = null

  try {
    if (isConnected.value) {
      await stopSubtitleDetection()
    } else {
      await startSubtitleDetection()
    }
  } catch (err) {
    console.error('Connection toggle failed:', err)
    error.value = err.message
    emit('error', err)
  } finally {
    isConnecting.value = false
  }
}

const startSubtitleDetection = async () => {
  try {
    const response = await sendMessage('START_SUBTITLE_DETECTION', {
      platform: settings.value.detectPlatform,
      autoTranslate: settings.value.autoTranslate,
      targetLanguage: settings.value.targetLanguage,
      provider: settings.value.provider
    })

    if (response.success) {
      isConnected.value = true
      startListeningForSubtitles()
    } else {
      throw new Error(response.error || 'Failed to start subtitle detection')
    }
  } catch (err) {
    throw new Error(`Failed to start subtitle detection: ${err.message}`)
  }
}

const stopSubtitleDetection = async () => {
  try {
    await sendMessage('STOP_SUBTITLE_DETECTION')
    isConnected.value = false
    stopListeningForSubtitles()
    currentSubtitle.value = null
  } catch (err) {
    throw new Error(`Failed to stop subtitle detection: ${err.message}`)
  }
}

const startListeningForSubtitles = () => {
  // Set up message listener for subtitle events
  browser.runtime.onMessage.addListener.call(browser.runtime.onMessage, handleSubtitleMessage)
}

const stopListeningForSubtitles = () => {
  browser.runtime.onMessage.removeListener(handleSubtitleMessage)
}

const handleSubtitleMessage = async (message, sender, sendResponse) => {
  if (message.source !== 'subtitle-detector') return

  const { action, data } = message

  switch (action) {
    case 'SUBTITLE_DETECTED':
      await handleSubtitleDetected(data)
      break
    case 'SUBTITLE_TRANSLATED':
      handleSubtitleTranslated(data)
      break
    case 'SUBTITLE_ERROR':
      handleSubtitleError(data)
      break
  }
}

const handleSubtitleDetected = async (data) => {
  const subtitle = {
    id: `subtitle_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    original: data.text,
    translated: null,
    timestamp: Date.now(),
    platform: data.platform,
    confidence: data.confidence
  }

  currentSubtitle.value = subtitle
  emit('subtitleDetected', subtitle)

  // Auto-translate if enabled
  if (settings.value.autoTranslate) {
    await translateSubtitle(subtitle)
  }
}

const translateSubtitle = async (subtitle) => {
  if (!subtitle?.original) return

  isTranslating.value = true

  try {
    const result = await translationStore.translateText(subtitle.original, {
      from: 'auto',
      to: settings.value.targetLanguage,
      provider: settings.value.provider
    })

    subtitle.translated = result.text
    subtitle.confidence = result.confidence

    // Update current subtitle if it's still the active one
    if (currentSubtitle.value?.id === subtitle.id) {
      currentSubtitle.value = { ...subtitle }
    }

    // Add to history
    addToHistory(subtitle)
    emit('translationComplete', subtitle)
  } catch (err) {
    console.error('Subtitle translation failed:', err)
    subtitle.translated = `[Translation failed: ${err.message}]`
    error.value = `Translation failed: ${err.message}`
  } finally {
    isTranslating.value = false
  }
}

const handleSubtitleTranslated = (data) => {
  if (currentSubtitle.value?.id === data.id) {
    currentSubtitle.value.translated = data.translated
    currentSubtitle.value.confidence = data.confidence
  }
}

const handleSubtitleError = (data) => {
  error.value = data.error
  emit('error', new Error(data.error))
}

const addToHistory = (subtitle) => {
  if (!subtitle.translated) return

  // Avoid duplicates
  const exists = subtitleHistory.value.find(item => 
    item.original === subtitle.original && 
    item.translated === subtitle.translated
  )

  if (!exists) {
    subtitleHistory.value.unshift(subtitle)
    
    // Keep only recent 50 items
    if (subtitleHistory.value.length > 50) {
      subtitleHistory.value = subtitleHistory.value.slice(0, 50)
    }
  }
}

const selectHistoryItem = (item) => {
  currentSubtitle.value = { ...item }
}

const copySubtitle = async (subtitle) => {
  try {
    const text = settings.value.showOriginal 
      ? `${subtitle.original}\n${subtitle.translated}`
      : subtitle.translated

    await navigator.clipboard.writeText(text)
    showFeedback('Copied to clipboard!')
  } catch (err) {
    console.error('Copy failed:', err)
    showFeedback('Copy failed', 'error')
  }
}

const playSubtitle = (subtitle) => {
  if (!subtitle.translated || !window.speechSynthesis) return

  try {
    const utterance = new SpeechSynthesisUtterance(subtitle.translated)
    utterance.lang = settings.value.targetLanguage
    utterance.rate = 0.9
    utterance.pitch = 1
    
    speechSynthesis.speak(utterance)
  } catch (err) {
    console.error('TTS failed:', err)
    showFeedback('Text-to-speech failed', 'error')
  }
}

const clearHistory = () => {
  if (confirm('Clear all subtitle history?')) {
    subtitleHistory.value = []
  }
}

const clearError = () => {
  error.value = null
}

const getProviderName = (provider) => {
  const names = {
    google: 'Google Translate',
    bing: 'Bing Translator', 
    gemini: 'Google Gemini',
    openai: 'OpenAI'
  }
  return names[provider] || provider
}

const getLanguageName = (code) => {
  const lang = supportedLanguages.find(l => l.code === code)
  return lang ? lang.name : code
}

const formatTimestamp = (timestamp) => {
  return new Date(timestamp).toLocaleTimeString()
}

const truncateText = (text, maxLength) => {
  if (!text) return ''
  if (text.length <= maxLength) return text
  return text.substring(0, maxLength) + '...'
}

const showFeedback = (message, type = 'success') => {
  // Create temporary feedback element
  const feedback = document.createElement('div')
  feedback.textContent = message
  feedback.className = `subtitle-feedback ${type}`
  feedback.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    background: ${type === 'error' ? '#f44336' : '#4caf50'};
    color: white;
    padding: 12px 16px;
    border-radius: 6px;
    font-size: 14px;
    z-index: 2147483648;
    animation: slideInRight 0.3s ease, fadeOut 0.3s ease 2.7s;
  `
  
  document.body.appendChild(feedback)
  
  setTimeout(() => {
    feedback.remove()
  }, 3000)
}

// Lifecycle
onMounted(() => {
  // Load settings from storage if needed
})

onUnmounted(() => {
  if (isConnected.value) {
    stopSubtitleDetection()
  }
})
</script>

<style scoped>
.subtitle-panel {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--color-background);
  border-radius: 8px;
  overflow: hidden;
}

/* Header */
.panel-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px;
  border-bottom: 1px solid var(--color-border);
  background: var(--color-surface);
}

.header-title {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.header-title h3 {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
  color: var(--color-text);
}

.status-indicator {
  font-size: 12px;
  font-weight: 500;
  
  &.connected {
    color: #4caf50;
  }
  
  &.connecting {
    color: #ff9800;
  }
  
  &.disconnected {
    color: var(--color-text-muted);
  }
}

.header-actions {
  display: flex;
  gap: 8px;
}

.action-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 12px;
  border: 1px solid var(--color-border);
  border-radius: 6px;
  background: var(--color-background);
  color: var(--color-text);
  cursor: pointer;
  font-size: 14px;
  transition: all 0.2s ease;
  
  &:hover:not(:disabled) {
    background: var(--color-surface);
    border-color: var(--color-primary);
  }
  
  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
  
  &.active {
    background: var(--color-primary);
    border-color: var(--color-primary);
    color: white;
  }
}

.settings-btn.active {
  background: rgba(96, 125, 139, 0.1);
  border-color: #607d8b;
  color: #607d8b;
}

/* Settings Panel */
.settings-panel {
  padding: 16px;
  background: var(--color-surface);
  border-bottom: 1px solid var(--color-border);
  display: flex;
  flex-direction: column;
  gap: 12px;
  animation: slideDown 0.3s ease;
}

@keyframes slideDown {
  from {
    max-height: 0;
    opacity: 0;
  }
  to {
    max-height: 200px;
    opacity: 1;
  }
}

.setting-group {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.setting-label {
  font-size: 13px;
  font-weight: 500;
  color: var(--color-text);
}

.setting-select {
  padding: 6px 8px;
  border: 1px solid var(--color-border);
  border-radius: 4px;
  background: var(--color-background);
  color: var(--color-text);
  font-size: 13px;
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

/* Subtitle Display */
.subtitle-display {
  flex: 1;
  display: flex;
  flex-direction: column;
  justify-content: center;
  padding: 24px;
  min-height: 200px;
}

.empty-state,
.waiting-state {
  text-align: center;
  color: var(--color-text-muted);
}

.empty-icon {
  font-size: 48px;
  opacity: 0.5;
  margin-bottom: 16px;
}

.empty-state h4 {
  margin: 0 0 8px 0;
  color: var(--color-text);
}

.waiting-animation {
  display: flex;
  justify-content: center;
  gap: 8px;
  margin-bottom: 16px;
}

.pulse-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--color-primary);
  animation: pulse 1.5s infinite;
}

.pulse-dot:nth-child(2) {
  animation-delay: 0.5s;
}

.pulse-dot:nth-child(3) {
  animation-delay: 1s;
}

@keyframes pulse {
  0%, 80%, 100% {
    opacity: 0.3;
    transform: scale(1);
  }
  40% {
    opacity: 1;
    transform: scale(1.2);
  }
}

.subtitle-content {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.original-subtitle,
.translated-subtitle {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.subtitle-label {
  font-size: 12px;
  font-weight: 600;
  color: var(--color-text-muted);
  text-transform: uppercase;
}

.subtitle-text {
  font-size: 16px;
  line-height: 1.4;
  color: var(--color-text);
  
  &.loading {
    display: flex;
    align-items: center;
    gap: 8px;
    color: var(--color-text-muted);
  }
}

.original-subtitle .subtitle-text {
  font-size: 14px;
  color: var(--color-text-muted);
}

.subtitle-meta {
  display: flex;
  gap: 16px;
  font-size: 11px;
  color: var(--color-text-muted);
  margin-top: 8px;
}

/* Subtitle History */
.subtitle-history {
  border-top: 1px solid var(--color-border);
  background: var(--color-surface);
}

.history-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 16px;
  border-bottom: 1px solid var(--color-border);
}

.history-header h4 {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
  color: var(--color-text);
}

.clear-history-btn {
  padding: 4px 6px;
  border: 1px solid var(--color-border);
  border-radius: 4px;
  background: var(--color-background);
  cursor: pointer;
  font-size: 12px;
  
  &:hover {
    background: var(--color-surface);
    border-color: #f44336;
    color: #f44336;
  }
}

.history-list {
  max-height: 200px;
  overflow-y: auto;
}

.history-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 16px;
  border-bottom: 1px solid var(--color-border);
  cursor: pointer;
  transition: background 0.2s ease;
  
  &:hover {
    background: var(--color-background);
  }
  
  &.active {
    background: rgba(33, 150, 243, 0.1);
    border-color: var(--color-primary);
  }
  
  &:last-child {
    border-bottom: none;
  }
}

.history-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.history-original {
  font-size: 12px;
  color: var(--color-text-muted);
}

.history-translated {
  font-size: 13px;
  color: var(--color-text);
}

.history-actions {
  display: flex;
  gap: 4px;
}

.history-btn {
  padding: 4px;
  border: 1px solid var(--color-border);
  border-radius: 3px;
  background: var(--color-background);
  cursor: pointer;
  font-size: 10px;
  transition: all 0.2s ease;
  
  &:hover {
    background: var(--color-surface);
  }
}

.copy-btn:hover {
  border-color: #4caf50;
  color: #4caf50;
}

.tts-btn:hover {
  border-color: #2196f3;
  color: #2196f3;
}

/* Error Display */
.error-display {
  background: rgba(244, 67, 54, 0.1);
  border: 1px solid #f44336;
  border-radius: 6px;
  padding: 12px 16px;
  margin: 16px;
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.error-content {
  display: flex;
  align-items: center;
  gap: 8px;
  color: #f44336;
  font-size: 14px;
}

.error-close {
  background: none;
  border: none;
  color: #f44336;
  cursor: pointer;
  font-size: 16px;
  
  &:hover {
    opacity: 0.7;
  }
}

/* Loading spinner */
.loading-spinner {
  width: 16px;
  height: 16px;
  border: 2px solid transparent;
  border-radius: 50%;
  border-top: 2px solid currentColor;
  animation: spin 1s linear infinite;
  
  &.small {
    width: 12px;
    height: 12px;
  }
}

@keyframes spin {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
}

/* Responsive design */
@media (max-width: 480px) {
  .panel-header {
    flex-direction: column;
    gap: 12px;
  }
  
  .header-actions {
    width: 100%;
    justify-content: center;
  }
  
  .settings-panel {
    gap: 8px;
  }
  
  .subtitle-meta {
    flex-direction: column;
    gap: 4px;
  }
  
  .history-item {
    flex-direction: column;
    align-items: flex-start;
    gap: 8px;
  }
  
  .history-actions {
    width: 100%;
    justify-content: flex-end;
  }
}
</style>