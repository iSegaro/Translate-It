<template>
  <BaseModal
    v-model="isVisible"
    size="lg"
    title="Capture Preview"
    :closable="!isTranslating"
  >
    <div class="capture-preview">
      <!-- Image preview section -->
      <div class="preview-section">
        <div class="preview-header">
          <h4>Captured Image</h4>
          <div class="preview-info">
            <span class="info-item">
              <span class="info-label">Size:</span>
              <span class="info-value">{{ imageInfo.width }}×{{ imageInfo.height }}</span>
            </span>
            <span class="info-item">
              <span class="info-label">Format:</span>
              <span class="info-value">{{ imageInfo.format }}</span>
            </span>
          </div>
        </div>
        
        <div class="preview-image-container">
          <img 
            ref="previewImage"
            :src="imageData" 
            alt="Captured screen area" 
            class="preview-image"
            @load="handleImageLoad"
          >
          
          <!-- Image overlay for text detection -->
          <div
            v-if="detectedTextRegions.length > 0"
            class="text-overlay"
          >
            <div 
              v-for="(region, index) in detectedTextRegions"
              :key="index"
              class="text-region"
              :style="getRegionStyle(region)"
              :class="{ active: selectedRegion === region }"
              @click="selectTextRegion(region)"
            />
          </div>
          
          <!-- Loading overlay -->
          <div
            v-if="isAnalyzing"
            class="analysis-overlay"
          >
            <div class="analysis-spinner" />
            <p>Analyzing image...</p>
          </div>
        </div>
      </div>
      
      <!-- Translation controls -->
      <div class="translation-controls">
        <div class="controls-header">
          <h4>Translation Settings</h4>
        </div>
        
        <div class="controls-content">
          <!-- Language selection -->
          <div class="language-controls">
            <div class="language-group">
              <label>From:</label>
              <select
                v-model="fromLanguage"
                class="language-select"
              >
                <option value="auto">
                  Auto Detect
                </option>
                <option
                  v-for="lang in availableLanguages"
                  :key="lang.code"
                  :value="lang.code"
                >
                  {{ lang.name }}
                </option>
              </select>
            </div>
            
            <button
              class="swap-languages"
              title="Swap languages"
              @click="swapLanguages"
            >
              ⇄
            </button>
            
            <div class="language-group">
              <label>To:</label>
              <select
                v-model="toLanguage"
                class="language-select"
              >
                <option
                  v-for="lang in availableLanguages"
                  :key="lang.code"
                  :value="lang.code"
                >
                  {{ lang.name }}
                </option>
              </select>
            </div>
          </div>
          
          <!-- Provider selection -->
          <div class="provider-controls">
            <label>Translation Provider:</label>
            <select
              v-model="selectedProvider"
              class="provider-select"
            >
              <option
                v-for="provider in imageCapableProviders"
                :key="provider"
                :value="provider"
              >
                {{ getProviderName(provider) }}
              </option>
            </select>
          </div>
          
          <!-- OCR Options -->
          <div class="ocr-options">
            <label class="checkbox-label">
              <input 
                v-model="ocrOptions.preprocessImage" 
                type="checkbox"
                class="checkbox"
              >
              <span class="checkmark" />
              Enhance image quality
            </label>
            
            <label class="checkbox-label">
              <input 
                v-model="ocrOptions.detectRegions" 
                type="checkbox"
                class="checkbox"
              >
              <span class="checkmark" />
              Detect text regions
            </label>
          </div>
        </div>
      </div>
      
      <!-- Action buttons -->
      <div class="preview-actions">
        <button 
          class="action-btn secondary-btn" 
          :disabled="isTranslating"
          @click="retake"
        >
          <span class="btn-icon">📸</span>
          <span class="btn-text">Retake</span>
        </button>
        
        <button 
          v-if="ocrOptions.detectRegions" 
          class="action-btn analyze-btn"
          :disabled="isAnalyzing || isTranslating"
          @click="analyzeImage"
        >
          <span class="btn-icon">🔍</span>
          <span class="btn-text">Analyze</span>
        </button>
        
        <button 
          class="action-btn primary-btn" 
          :disabled="isTranslating || isAnalyzing"
          @click="translateImage"
        >
          <span
            v-if="isTranslating"
            class="loading-spinner small"
          />
          <span
            v-else
            class="btn-icon"
          >🌐</span>
          <span class="btn-text">{{ isTranslating ? 'Translating...' : 'Translate' }}</span>
        </button>
      </div>
      
      <!-- Translation result -->
      <div
        v-if="translationResult"
        class="translation-result"
      >
        <div class="result-header">
          <h4>Translation Result</h4>
          <div class="result-meta">
            <span class="meta-item">Provider: {{ translationResult.provider }}</span>
            <span class="meta-item">Confidence: {{ Math.round(translationResult.confidence * 100) }}%</span>
          </div>
        </div>
        
        <div class="result-content">
          <!-- Detected text (if available) -->
          <div
            v-if="translationResult.detectedText"
            class="detected-text"
          >
            <h5>Detected Text:</h5>
            <div class="text-content">
              {{ translationResult.detectedText }}
            </div>
          </div>
          
          <!-- Translated text -->
          <div class="translated-text">
            <h5>Translation:</h5>
            <div class="text-content primary">
              {{ translationResult.text }}
            </div>
          </div>
        </div>
        
        <div class="result-actions">
          <button
            class="result-btn copy-btn"
            title="Copy translation"
            @click="copyResult"
          >
            <span class="btn-icon">📋</span>
            Copy
          </button>
          
          <button
            class="result-btn tts-btn"
            title="Play audio"
            :disabled="isPlayingTTS"
            @click="playTTS"
          >
            <span class="btn-icon">{{ isPlayingTTS ? '⏸️' : '🔊' }}</span>
            {{ isPlayingTTS ? 'Stop' : 'Speak' }}
          </button>
          
          <button
            class="result-btn save-btn"
            title="Save to history"
            @click="saveToHistory"
          >
            <span class="btn-icon">💾</span>
            Save
          </button>
        </div>
      </div>
      
      <!-- Error display -->
      <div
        v-if="error"
        class="error-display"
      >
        <div class="error-content">
          <span class="error-icon">⚠️</span>
          <div class="error-details">
            <div class="error-message">
              {{ error.message }}
            </div>
            <div
              v-if="error.details"
              class="error-meta"
            >
              {{ error.details }}
            </div>
          </div>
        </div>
        
        <button
          class="error-close"
          @click="clearError"
        >
          ✕
        </button>
      </div>
    </div>
  </BaseModal>
</template>

<script setup>
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import { useTranslationStore } from '@/store/modules/translation.js'
import { useExtensionAPI } from '@/composables/useExtensionAPI.js'
import BaseModal from '@/components/base/BaseModal.vue'

const props = defineProps({
  imageData: {
    type: String,
    required: true
  },
  coordinates: {
    type: Object,
    default: null
  },
  onClose: {
    type: Function,
    default: () => {}
  },
  onRetake: {
    type: Function,
    default: () => {}
  }
})

const emit = defineEmits(['close', 'retake', 'translate', 'save'])

// Stores and APIs
const translationStore = useTranslationStore()
const { translateImage: translateImageAPI } = useExtensionAPI()

// Reactive state
const isVisible = ref(true)
const isTranslating = ref(false)
const isAnalyzing = ref(false)
const isPlayingTTS = ref(false)
const previewImage = ref(null)
const translationResult = ref(null)
const error = ref(null)
const detectedTextRegions = ref([])
const selectedRegion = ref(null)

// Form data
const fromLanguage = ref('auto')
const toLanguage = ref('en')
const selectedProvider = ref('gemini')
const ocrOptions = ref({
  preprocessImage: true,
  detectRegions: false
})

// Image info
const imageInfo = ref({
  width: 0,
  height: 0,
  format: 'PNG'
})

// Available languages (simplified list)
const availableLanguages = [
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
const imageCapableProviders = computed(() => {
  return translationStore.supportedProviders.filter(provider => 
    ['gemini', 'openai', 'openrouter', 'deepseek'].includes(provider)
  )
})

// Methods
const handleImageLoad = () => {
  if (previewImage.value) {
    imageInfo.value.width = previewImage.value.naturalWidth
    imageInfo.value.height = previewImage.value.naturalHeight
  }
}

const translateImage = async () => {
  if (!props.imageData || isTranslating.value) return

  isTranslating.value = true
  error.value = null

  try {
    const options = {
      from: fromLanguage.value,
      to: toLanguage.value,
      provider: selectedProvider.value,
      mode: 'image'
    }

    const result = await translationStore.translateImage(props.imageData, options)
    
    translationResult.value = {
      ...result,
      detectedText: null, // Will be populated if OCR is performed separately
      confidence: result.confidence || 0.85
    }

    emit('translate', result)
  } catch (err) {
    console.error('Image translation error:', err)
    error.value = {
      message: err.message || 'Translation failed',
      details: err.type || 'Unknown error'
    }
  } finally {
    isTranslating.value = false
  }
}

const analyzeImage = async () => {
  if (!props.imageData || isAnalyzing.value) return

  isAnalyzing.value = true
  error.value = null

  try {
    // This would call an OCR service to detect text regions
    // For now, we'll simulate this functionality
    await new Promise(resolve => setTimeout(resolve, 2000))
    
    // Mock detected regions
    detectedTextRegions.value = [
      { x: 10, y: 20, width: 200, height: 30, confidence: 0.95 },
      { x: 50, y: 80, width: 150, height: 25, confidence: 0.88 }
    ]
  } catch (err) {
    console.error('Image analysis error:', err)
    error.value = {
      message: 'Failed to analyze image',
      details: err.message
    }
  } finally {
    isAnalyzing.value = false
  }
}

const getRegionStyle = (region) => {
  const imgElement = previewImage.value
  if (!imgElement) return {}

  const scaleX = imgElement.clientWidth / imgElement.naturalWidth
  const scaleY = imgElement.clientHeight / imgElement.naturalHeight

  return {
    left: `${region.x * scaleX}px`,
    top: `${region.y * scaleY}px`,
    width: `${region.width * scaleX}px`,
    height: `${region.height * scaleY}px`
  }
}

const selectTextRegion = (region) => {
  selectedRegion.value = region
}

const swapLanguages = () => {
  if (fromLanguage.value !== 'auto') {
    const temp = fromLanguage.value
    fromLanguage.value = toLanguage.value
    toLanguage.value = temp
  }
}

const getProviderName = (provider) => {
  const names = {
    gemini: 'Google Gemini',
    openai: 'OpenAI',
    openrouter: 'OpenRouter',
    deepseek: 'DeepSeek'
  }
  return names[provider] || provider
}

const copyResult = async () => {
  if (!translationResult.value) return

  try {
    await navigator.clipboard.writeText(translationResult.value.text)
    showFeedback('Copied to clipboard!')
  } catch (err) {
    console.error('Copy failed:', err)
    showFeedback('Copy failed', 'error')
  }
}

const playTTS = async () => {
  if (!translationResult.value || !window.speechSynthesis) return

  if (isPlayingTTS.value) {
    speechSynthesis.cancel()
    isPlayingTTS.value = false
    return
  }

  try {
    isPlayingTTS.value = true
    
    const utterance = new SpeechSynthesisUtterance(translationResult.value.text)
    utterance.lang = toLanguage.value
    utterance.rate = 0.9
    utterance.pitch = 1
    
    utterance.onend = () => {
      isPlayingTTS.value = false
    }
    
    utterance.onerror = () => {
      isPlayingTTS.value = false
      showFeedback('Speech synthesis failed', 'error')
    }
    
    speechSynthesis.speak(utterance)
  } catch (err) {
    console.error('TTS error:', err)
    isPlayingTTS.value = false
    showFeedback('Speech synthesis failed', 'error')
  }
}

const saveToHistory = () => {
  if (!translationResult.value) return

  translationStore.addToHistory({
    ...translationResult.value,
    isImageTranslation: true,
    timestamp: Date.now()
  })

  showFeedback('Saved to history!')
  emit('save', translationResult.value)
}

const retake = () => {
  isVisible.value = false
  emit('retake')
  props.onRetake()
}

const closeModal = () => {
  isVisible.value = false
  emit('close')
  props.onClose()
}

const clearError = () => {
  error.value = null
}

const showFeedback = (message, type = 'success') => {
  // Create temporary feedback element
  const feedback = document.createElement('div')
  feedback.textContent = message
  feedback.className = `capture-feedback ${type}`
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

// Watch for modal close
watch(isVisible, (newValue) => {
  if (!newValue) {
    closeModal()
  }
})

// Lifecycle
onMounted(() => {
  // Set default provider to first available image-capable provider
  if (imageCapableProviders.value.length > 0) {
    selectedProvider.value = imageCapableProviders.value[0]
  }
})

onUnmounted(() => {
  if (isPlayingTTS.value) {
    speechSynthesis.cancel()
  }
})
</script>

<style scoped>
.capture-preview {
  display: flex;
  flex-direction: column;
  gap: 24px;
  max-height: 70vh;
  overflow-y: auto;
}

/* Preview section */
.preview-section {
  flex: 1;
}

.preview-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}

.preview-header h4 {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  color: var(--color-text);
}

.preview-info {
  display: flex;
  gap: 16px;
  font-size: 12px;
  color: var(--color-text-muted);
}

.info-item {
  display: flex;
  gap: 4px;
}

.info-label {
  font-weight: 500;
}

.preview-image-container {
  position: relative;
  border: 1px solid var(--color-border);
  border-radius: 8px;
  overflow: hidden;
  background: #f8f9fa;
}

.preview-image {
  width: 100%;
  height: auto;
  max-height: 400px;
  object-fit: contain;
  display: block;
}

.text-overlay {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  pointer-events: none;
}

.text-region {
  position: absolute;
  border: 2px solid rgba(33, 150, 243, 0.6);
  background: rgba(33, 150, 243, 0.1);
  cursor: pointer;
  pointer-events: auto;
  transition: all 0.2s ease;
}

.text-region:hover,
.text-region.active {
  border-color: #2196f3;
  background: rgba(33, 150, 243, 0.2);
}

.analysis-overlay {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(255, 255, 255, 0.9);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
}

.analysis-spinner {
  width: 32px;
  height: 32px;
  border: 3px solid #f3f3f3;
  border-radius: 50%;
  border-top: 3px solid #2196f3;
  animation: spin 1s linear infinite;
}

/* Translation controls */
.translation-controls {
  background: var(--color-surface);
  border-radius: 8px;
  padding: 16px;
}

.controls-header h4 {
  margin: 0 0 16px 0;
  font-size: 16px;
  font-weight: 600;
  color: var(--color-text);
}

.controls-content {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.language-controls {
  display: flex;
  align-items: center;
  gap: 12px;
}

.language-group {
  display: flex;
  flex-direction: column;
  gap: 4px;
  flex: 1;
}

.language-group label {
  font-size: 12px;
  font-weight: 500;
  color: var(--color-text-muted);
}

.language-select,
.provider-select {
  padding: 8px 12px;
  border: 1px solid var(--color-border);
  border-radius: 6px;
  background: var(--color-background);
  color: var(--color-text);
  font-size: 14px;
}

.swap-languages {
  background: none;
  border: 1px solid var(--color-border);
  border-radius: 6px;
  padding: 8px;
  cursor: pointer;
  color: var(--color-text-muted);
  font-size: 16px;
  margin-top: 16px;
  
  &:hover {
    background: var(--color-surface);
    border-color: var(--color-primary);
    color: var(--color-primary);
  }
}

.provider-controls {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.provider-controls label {
  font-size: 12px;
  font-weight: 500;
  color: var(--color-text-muted);
}

.ocr-options {
  display: flex;
  gap: 16px;
}

.checkbox-label {
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  font-size: 14px;
  color: var(--color-text);
}

.checkbox {
  width: 16px;
  height: 16px;
}

/* Actions */
.preview-actions {
  display: flex;
  gap: 12px;
  padding-top: 16px;
  border-top: 1px solid var(--color-border);
}

.action-btn {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 16px;
  border: 1px solid var(--color-border);
  border-radius: 6px;
  background: var(--color-background);
  color: var(--color-text);
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s ease;
  
  &:hover:not(:disabled) {
    background: var(--color-surface);
    border-color: var(--color-primary);
  }
  
  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
}

.primary-btn {
  background: var(--color-primary);
  border-color: var(--color-primary);
  color: white;
  
  &:hover:not(:disabled) {
    background: var(--color-primary-dark);
    border-color: var(--color-primary-dark);
  }
}

.secondary-btn:hover:not(:disabled) {
  border-color: var(--color-secondary);
  color: var(--color-secondary);
}

.analyze-btn:hover:not(:disabled) {
  border-color: #ff9800;
  color: #ff9800;
}

/* Translation result */
.translation-result {
  background: var(--color-surface);
  border-radius: 8px;
  padding: 16px;
  border-left: 4px solid var(--color-primary);
}

.result-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
}

.result-header h4 {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  color: var(--color-text);
}

.result-meta {
  display: flex;
  gap: 16px;
  font-size: 12px;
  color: var(--color-text-muted);
}

.result-content {
  display: flex;
  flex-direction: column;
  gap: 16px;
  margin-bottom: 16px;
}

.detected-text h5,
.translated-text h5 {
  margin: 0 0 8px 0;
  font-size: 14px;
  font-weight: 600;
  color: var(--color-text-muted);
}

.text-content {
  padding: 12px;
  background: var(--color-background);
  border: 1px solid var(--color-border);
  border-radius: 6px;
  font-size: 14px;
  line-height: 1.5;
  color: var(--color-text);
  
  &.primary {
    border-color: var(--color-primary);
    background: rgba(33, 150, 243, 0.05);
  }
}

.result-actions {
  display: flex;
  gap: 8px;
}

.result-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  border: 1px solid var(--color-border);
  border-radius: 4px;
  background: var(--color-background);
  color: var(--color-text);
  font-size: 12px;
  cursor: pointer;
  transition: all 0.2s ease;
  
  &:hover:not(:disabled) {
    background: var(--color-surface);
  }
  
  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
}

.copy-btn:hover:not(:disabled) {
  border-color: #4caf50;
  color: #4caf50;
}

.tts-btn:hover:not(:disabled) {
  border-color: #2196f3;
  color: #2196f3;
}

.save-btn:hover:not(:disabled) {
  border-color: #ff9800;
  color: #ff9800;
}

/* Error display */
.error-display {
  background: rgba(244, 67, 54, 0.1);
  border: 1px solid #f44336;
  border-radius: 8px;
  padding: 12px;
  display: flex;
  align-items: flex-start;
  gap: 12px;
}

.error-content {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  flex: 1;
}

.error-icon {
  font-size: 16px;
  color: #f44336;
  flex-shrink: 0;
}

.error-details {
  flex: 1;
}

.error-message {
  font-size: 14px;
  font-weight: 500;
  color: #f44336;
  margin-bottom: 4px;
}

.error-meta {
  font-size: 12px;
  color: #d32f2f;
}

.error-close {
  background: none;
  border: none;
  color: #f44336;
  cursor: pointer;
  font-size: 16px;
  padding: 0;
  
  &:hover {
    color: #d32f2f;
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
    width: 14px;
    height: 14px;
  }
}

@keyframes spin {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
}

@keyframes slideInRight {
  from {
    transform: translateX(100%);
    opacity: 0;
  }
  to {
    transform: translateX(0);
    opacity: 1;
  }
}

@keyframes fadeOut {
  from {
    opacity: 1;
  }
  to {
    opacity: 0;
  }
}

/* Responsive design */
@media (max-width: 768px) {
  .language-controls {
    flex-direction: column;
    gap: 8px;
  }
  
  .swap-languages {
    margin-top: 0;
    align-self: center;
    transform: rotate(90deg);
  }
  
  .preview-actions {
    flex-direction: column;
  }
  
  .result-actions {
    flex-wrap: wrap;
  }
  
  .result-header {
    flex-direction: column;
    align-items: flex-start;
    gap: 8px;
  }
}
</style>