<template>
  <div class="provider-settings">
    <h2 class="page-title">
      Translation Providers
    </h2>
    <p class="page-description">
      Configure your translation providers and API keys
    </p>
    
    <div class="providers-list">
      <div 
        v-for="provider in providers" 
        :key="provider.id"
        class="provider-card"
      >
        <div class="provider-header">
          <h3 class="provider-name">
            {{ provider.name }}
          </h3>
          <span class="provider-type">{{ provider.type }}</span>
        </div>
        <p class="provider-description">
          {{ provider.description }}
        </p>
        
        <div
          v-if="provider.requiresApiKey"
          class="api-key-section"
        >
          <label class="api-key-label">API Key</label>
          <input 
            type="password" 
            class="api-key-input"
            placeholder="Enter your API key"
          >
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'

const providers = ref([
  {
    id: 'google',
    name: 'Google Translate',
    type: 'Free',
    description: 'Free translation service by Google',
    requiresApiKey: false
  },
  {
    id: 'openai',
    name: 'OpenAI GPT',
    type: 'AI',
    description: 'Advanced AI-powered translation',
    requiresApiKey: true
  },
  {
    id: 'gemini',
    name: 'Google Gemini',
    type: 'AI',
    description: 'Google\'s advanced AI model',
    requiresApiKey: true
  }
])
</script>

<style scoped>
.provider-settings {
  max-width: 800px;
}

.page-title {
  font-size: var(--font-size-xxl);
  font-weight: var(--font-weight-bold);
  color: var(--color-text);
  margin: 0 0 8px 0;
}

.page-description {
  font-size: var(--font-size-base);
  color: var(--color-text-secondary);
  margin: 0 0 24px 0;
}

.providers-list {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.provider-card {
  padding: 20px;
  border: 1px solid var(--color-border);
  border-radius: var(--border-radius-md);
  background-color: var(--color-background);
}

.provider-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
}

.provider-name {
  font-size: var(--font-size-lg);
  font-weight: var(--font-weight-semibold);
  color: var(--color-text);
  margin: 0;
}

.provider-type {
  font-size: var(--font-size-sm);
  padding: 4px 8px;
  border-radius: var(--border-radius-sm);
  background-color: var(--color-primary);
  color: white;
}

.provider-description {
  font-size: var(--font-size-base);
  color: var(--color-text-secondary);
  margin: 0 0 16px 0;
}

.api-key-section {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.api-key-label {
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-medium);
  color: var(--color-text);
}

.api-key-input {
  padding: 8px 12px;
  border: 1px solid var(--color-border);
  border-radius: var(--border-radius-base);
  font-size: var(--font-size-base);
  background-color: var(--color-background);
  color: var(--color-text);
  max-width: 400px;
  
  &:focus {
    outline: none;
    border-color: var(--color-primary);
  }
}
</style>