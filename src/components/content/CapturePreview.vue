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
              :class="{ 'ti-active': selectedRegion === region }"
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
          @click="callTranslateImage"
        >
          <span
            v-if="isTranslating"
            class="loading-spinner small"
          />
          <span
            v-else
            class="btn-icon"
          >🌐</span>
          <span class="btn-text">{{ isTranslating ? translatingText : translateText }}</span>
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
import { ref, watch, onMounted, onUnmounted } from 'vue'
import { useTranslationStore } from '@/features/translation/stores/translation.js'
import { useExtensionAPI } from '@/composables/core/useExtensionAPI.js'
import { useErrorHandler } from '@/composables/shared/useErrorHandler.js'
import { useResourceTracker } from '@/composables/core/useResourceTracker.js'
import BaseModal from '@/components/base/BaseModal.vue'
import { computed } from 'vue'
import { utilsFactory } from '@/utils/UtilsFactory.js'

const { handleError } = useErrorHandler()

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
const { translateImage } = useExtensionAPI()

// Resource tracker for automatic cleanup
const tracker = useResourceTracker('capture-preview')

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

// Localized messages
const translatingText = ref('Translating...')
const translateText = ref('Translate')

// Initialize localized messages
onMounted(async () => {
  // Inject Screen Capture specific styles lazily
  try {
    const { screenCaptureUiStyles } = await import('@/core/content-scripts/chunks/lazy-styles.js');
    const { injectStylesToShadowRoot } = await import('@/utils/ui/styleInjector.js');
    
    if (screenCaptureUiStyles && injectStylesToShadowRoot) {
      injectStylesToShadowRoot(screenCaptureUiStyles, 'vue-screen-capture-specific-styles');
    }
  } catch (error) {
    console.warn('[CapturePreview] Failed to load lazy styles:', error);
  }

  const { getTranslationString } = await utilsFactory.getI18nUtils()
  translatingText.value = await getTranslationString('SELECT_ELEMENT_TRANSLATING') || 'Translating...'
  translateText.value = await getTranslationString('TRANSLATE') || 'Translate'
})

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

const callTranslateImage = async () => {
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

    const result = await translateImage(props.imageData, options)
    
    translationResult.value = {
      ...result,
      detectedText: null, // Will be populated if OCR is performed separately
      confidence: result.confidence || 0.85
    }

    emit('translate', result)
  } catch (err) {
    await handleError(err, 'capture-preview-image-translation')
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
    await handleError(err, 'capture-preview-image-analysis')
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
    await handleError(err, 'capture-preview-copy')
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
      // Remove TTS resource when finished
      tracker.clearTimer('tts-playback')
    }
    
    utterance.onerror = () => {
      isPlayingTTS.value = false
      showFeedback('Speech synthesis failed', 'error')
      // Remove TTS resource on error
      tracker.clearTimer('tts-playback')
    }
    
    // Track TTS resource for automatic cleanup
    tracker.trackResource('tts-playback', () => {
      if (isPlayingTTS.value) {
        speechSynthesis.cancel()
        isPlayingTTS.value = false
      }
    })
    
    speechSynthesis.speak(utterance)
  } catch (err) {
    await handleError(err, 'capture-preview-tts')
    isPlayingTTS.value = false
    showFeedback('Speech synthesis failed', 'error')
    // Remove TTS resource on error
    tracker.clearTimer('tts-playback')
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
  // TTS cleanup is now handled automatically by useResourceTracker
  // No manual cleanup needed!
})
</script>
