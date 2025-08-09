<template>
  <div class="provider-bridge">
    <!-- Provider status indicator -->
    <div class="provider-status">
      <span
        class="status-dot"
        :class="providerStatus"
      />
      <span class="provider-name">{{ currentProvider?.name || selectedProvider }}</span>
      <span
        v-if="isAIProvider"
        class="provider-badge"
      >AI</span>
    </div>
    
    <!-- Provider configuration button -->
    <BaseButton
      v-if="needsConfiguration"
      variant="outline"
      size="sm"
      icon="settings"
      @click="showConfigModal = true"
    >
      Configure
    </BaseButton>
    
    <!-- API key configuration modal -->
    <BaseModal
      v-model="showConfigModal"
      title="Configure API Key"
      size="md"
    >
      <div class="api-key-form">
        <div
          v-if="providerInfo"
          class="provider-info"
        >
          <h4>{{ providerInfo.name }}</h4>
          <p>{{ providerInfo.description }}</p>
          <a
            v-if="providerInfo.docsUrl"
            :href="providerInfo.docsUrl"
            target="_blank"
            class="docs-link"
          >
            View Documentation
          </a>
        </div>
        
        <BaseInput
          v-model="apiKey"
          type="password"
          label="API Key"
          placeholder="Enter your API key"
          :error="apiKeyError"
          :hint="providerInfo?.keyHint"
          required
        />
        
        <BaseInput
          v-if="needsCustomUrl"
          v-model="customUrl"
          type="url"
          label="Custom API URL"
          placeholder="https://api.example.com"
          :error="urlError"
          :hint="providerInfo?.urlHint"
        />
        
        <BaseInput
          v-if="needsModel"
          v-model="modelName"
          type="text"
          label="Model Name"
          placeholder="gpt-3.5-turbo"
          :error="modelError"
          :hint="providerInfo?.modelHint"
        />
        
        <div class="test-section">
          <BaseButton 
            variant="outline" 
            :loading="isTesting" 
            :disabled="!canTest"
            @click="testConnection"
          >
            Test Connection
          </BaseButton>
          
          <div
            v-if="testResult"
            class="test-result"
            :class="{ success: testResult.success }"
          >
            <span class="test-icon">{{ testResult.success ? '✅' : '❌' }}</span>
            <span>{{ testResult.message }}</span>
          </div>
        </div>
      </div>
      
      <template #footer>
        <BaseButton
          variant="ghost"
          @click="showConfigModal = false"
        >
          Cancel
        </BaseButton>
        <BaseButton
          variant="primary"
          :loading="isSaving"
          @click="saveConfiguration"
        >
          Save Configuration
        </BaseButton>
      </template>
    </BaseModal>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted } from 'vue'
import { useTranslationStore } from '@/store/modules/translation.js'
import { useExtensionAPI } from '@/composables/useExtensionAPI.js'
import { useErrorHandler } from '@/composables/useErrorHandler.js'
import BaseButton from '@/components/base/BaseButton.vue'
import BaseModal from '@/components/base/BaseModal.vue'
import BaseInput from '@/components/base/BaseInput.vue'

const translationStore = useTranslationStore()
const { sendMessage } = useExtensionAPI()
const { handleError } = useErrorHandler()

// Reactive state
const showConfigModal = ref(false)
const apiKey = ref('')
const customUrl = ref('')
const modelName = ref('')
const apiKeyError = ref('')
const urlError = ref('')
const modelError = ref('')
const isTesting = ref(false)
const isSaving = ref(false)
const testResult = ref(null)

const selectedProvider = computed(() => translationStore.selectedProvider)

// Provider information mapping
const providerDetails = {
  google: {
    name: 'Google Translate',
    description: 'Google Translate API for fast and accurate translations.',
    requiresKey: false,
    requiresUrl: false,
    requiresModel: false
  },
  bing: {
    name: 'Bing Translator',
    description: 'Microsoft Bing Translator API.',
    requiresKey: false,
    requiresUrl: false,
    requiresModel: false
  },
  gemini: {
    name: 'Google Gemini',
    description: 'Google Gemini AI for intelligent translations.',
    requiresKey: true,
    requiresUrl: false,
    requiresModel: false,
    keyHint: 'Get your API key from Google AI Studio',
    docsUrl: 'https://makersuite.google.com/app/apikey'
  },
  openai: {
    name: 'OpenAI',
    description: 'OpenAI GPT models for context-aware translations.',
    requiresKey: true,
    requiresUrl: false,
    requiresModel: true,
    keyHint: 'Get your API key from OpenAI dashboard',
    modelHint: 'e.g., gpt-3.5-turbo, gpt-4',
    docsUrl: 'https://platform.openai.com/api-keys'
  },
  openrouter: {
    name: 'OpenRouter',
    description: 'Access multiple AI models through OpenRouter.',
    requiresKey: true,
    requiresUrl: false,
    requiresModel: true,
    keyHint: 'Get your API key from OpenRouter dashboard',
    modelHint: 'e.g., anthropic/claude-3-sonnet',
    docsUrl: 'https://openrouter.ai/keys'
  },
  deepseek: {
    name: 'DeepSeek',
    description: 'DeepSeek AI models for translation.',
    requiresKey: true,
    requiresUrl: false,
    requiresModel: true,
    keyHint: 'Get your API key from DeepSeek platform',
    modelHint: 'e.g., deepseek-chat',
    docsUrl: 'https://platform.deepseek.com/api_keys'
  },
  webai: {
    name: 'Web AI',
    description: 'browser-based AI translation using local models.',
    requiresKey: false,
    requiresUrl: false,
    requiresModel: false
  },
  custom: {
    name: 'Custom Provider',
    description: 'Configure a custom translation API endpoint.',
    requiresKey: true,
    requiresUrl: true,
    requiresModel: false,
    keyHint: 'API key for your custom endpoint',
    urlHint: 'Full URL to your translation API'
  }
}

const providerInfo = computed(() => providerDetails[selectedProvider.value])
const isAIProvider = computed(() => ['gemini', 'openai', 'openrouter', 'deepseek', 'custom'].includes(selectedProvider.value))
const needsConfiguration = computed(() => providerInfo.value?.requiresKey || providerInfo.value?.requiresUrl)
const needsCustomUrl = computed(() => providerInfo.value?.requiresUrl)
const needsModel = computed(() => providerInfo.value?.requiresModel)

const canTest = computed(() => {
  if (!providerInfo.value?.requiresKey) return true
  if (!apiKey.value.trim()) return false
  if (needsCustomUrl.value && !customUrl.value.trim()) return false
  if (needsModel.value && !modelName.value.trim()) return false
  return true
})

const providerStatus = computed(() => {
  if (translationStore.isLoading) return 'loading'
  if (translationStore.error) return 'error'
  if (!needsConfiguration.value) return 'ready'
  
  // Check if provider is configured
  if (providerInfo.value?.requiresKey && !apiKey.value) return 'unconfigured'
  return 'ready'
})

const validateInputs = () => {
  apiKeyError.value = ''
  urlError.value = ''
  modelError.value = ''
  
  if (providerInfo.value?.requiresKey && !apiKey.value.trim()) {
    apiKeyError.value = 'API key is required'
    return false
  }
  
  if (needsCustomUrl.value && !customUrl.value.trim()) {
    urlError.value = 'Custom URL is required'
    return false
  }
  
  if (needsCustomUrl.value && customUrl.value && !isValidUrl(customUrl.value)) {
    urlError.value = 'Please enter a valid URL'
    return false
  }
  
  if (needsModel.value && !modelName.value.trim()) {
    modelError.value = 'Model name is required'
    return false
  }
  
  return true
}

const isValidUrl = (string) => {
  try {
    new URL(string)
    return true
  } catch {
    return false
  }
}

const testConnection = async () => {
  if (!validateInputs()) return
  
  isTesting.value = true
  testResult.value = null
  
  try {
    const config = {
      apiKey: apiKey.value,
      customUrl: customUrl.value,
      model: modelName.value
    }
    
    const response = await sendMessage('TEST_PROVIDER_CONNECTION', {
      provider: selectedProvider.value,
      config
    })
    
    testResult.value = {
      success: response.success,
      message: response.success ? 'Connection successful!' : response.error || 'Connection failed'
    }
  } catch (error) {
    testResult.value = {
      success: false,
      message: error.message || 'Failed to test connection'
    }
  } finally {
    isTesting.value = false
  }
}

const saveConfiguration = async () => {
  if (!validateInputs()) return
  
  isSaving.value = true
  
  try {
    const config = {
      provider: selectedProvider.value,
      apiKey: apiKey.value,
      customUrl: customUrl.value,
      model: modelName.value
    }
    
    await sendMessage('SAVE_PROVIDER_CONFIG', config)
    
    showConfigModal.value = false
    testResult.value = null
  } catch (error) {
    await handleError(error, 'provider-bridge-save-config')
  } finally {
    isSaving.value = false
  }
}

const loadConfiguration = async () => {
  try {
    const response = await sendMessage('GET_PROVIDER_CONFIG', {
      provider: selectedProvider.value
    })
    
    if (response.config) {
      apiKey.value = response.config.apiKey || ''
      customUrl.value = response.config.customUrl || ''
      modelName.value = response.config.model || ''
    }
  } catch (error) {
    await handleError(error, 'provider-bridge-load-config')
  }
}

// Watch for provider changes
watch(selectedProvider, () => {
  loadConfiguration()
  testResult.value = null
}, { immediate: true })

onMounted(() => {
  loadConfiguration()
})
</script>

<style scoped>
.provider-bridge {
  display: flex;
  align-items: center;
  gap: 12px;
}

.provider-status {
  display: flex;
  align-items: center;
  gap: 8px;
}

.status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  
  &.ready {
    background-color: #4caf50;
  }
  
  &.loading {
    background-color: #ff9800;
    animation: pulse 1.5s infinite;
  }
  
  &.error {
    background-color: #f44336;
  }
  
  &.unconfigured {
    background-color: #9e9e9e;
  }
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}

.provider-name {
  font-weight: var(--font-weight-medium);
  color: var(--color-text);
}

.provider-badge {
  background-color: var(--color-primary);
  color: white;
  font-size: var(--font-size-xs);
  padding: 2px 6px;
  border-radius: var(--border-radius-sm);
  font-weight: var(--font-weight-medium);
}

.api-key-form {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.provider-info {
  padding: 16px;
  background-color: var(--color-surface);
  border-radius: var(--border-radius-base);
  border-left: 4px solid var(--color-primary);
}

.provider-info h4 {
  margin: 0 0 8px 0;
  color: var(--color-text);
  font-size: var(--font-size-md);
}

.provider-info p {
  margin: 0 0 12px 0;
  color: var(--color-text-muted);
  font-size: var(--font-size-sm);
}

.docs-link {
  color: var(--color-primary);
  text-decoration: none;
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-medium);
  
  &:hover {
    text-decoration: underline;
  }
}

.test-section {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 16px;
  background-color: var(--color-surface);
  border-radius: var(--border-radius-base);
}

.test-result {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: var(--font-size-sm);
  color: var(--color-error);
  
  &.success {
    color: var(--color-success);
  }
}

.test-icon {
  font-size: var(--font-size-md);
}
</style>