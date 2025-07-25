<template>
  <section class="help-tab">
    <h2>{{ $i18n('help_section_title') || 'Help & Documentation' }}</h2>
    
    <div class="accordion">
      <!-- Shortcut Help Section -->
      <div class="accordion-item">
        <button 
          class="accordion-header"
          @click="toggleAccordion('shortcut')"
          :class="{ active: openAccordion === 'shortcut' }"
        >
          <span>{{ $i18n('help_shortcut_title') || 'Keyboard Shortcuts & Usage' }}</span>
          <span class="accordion-icon">{{ openAccordion === 'shortcut' ? '−' : '+' }}</span>
        </button>
        <div 
          class="accordion-content"
          :class="{ open: openAccordion === 'shortcut' }"
        >
          <div class="accordion-inner">
            <p>{{ $i18n('help_shortcut_content_p1') || 'To use this extension, you have several options:' }}</p>
            <ol>
              <li>{{ $i18n('help_shortcut_content_li1') || 'Select text on any webpage and press Ctrl+/ (Cmd+/ on Mac) to translate it instantly.' }}</li>
              <li>{{ $i18n('help_shortcut_content_li2') || 'Right-click on selected text and choose "Translate Selected Text" from the context menu.' }}</li>
              <li>{{ $i18n('help_shortcut_content_li3') || 'Click on the extension icon in the toolbar to open the translation popup.' }}</li>
              <li>{{ $i18n('help_shortcut_content_li4') || 'Use the side panel for continuous translation work (Chrome only).' }}</li>
            </ol>
            
            <hr class="content-divider" />
            
            <p>{{ $i18n('help_shortcut_content_p2') || 'To customize keyboard shortcuts in Chrome:' }}</p>
            <ol>
              <li>{{ $i18n('help_shortcut_content_chrome_li1') || 'Go to chrome://extensions/' }}</li>
              <li>{{ $i18n('help_shortcut_content_chrome_li2') || 'Click on the menu (☰) in the top-left corner' }}</li>
              <li>{{ $i18n('help_shortcut_content_chrome_li3') || 'Select "Keyboard shortcuts" and customize as needed' }}</li>
            </ol>
          </div>
        </div>
      </div>
      
      <!-- API Keys Help Section -->
      <div class="accordion-item">
        <button 
          class="accordion-header"
          @click="toggleAccordion('apiKeys')"
          :class="{ active: openAccordion === 'apiKeys' }"
        >
          <span>{{ $i18n('help_api_keys_title') || 'API Keys & Translation Providers' }}</span>
          <span class="accordion-icon">{{ openAccordion === 'apiKeys' ? '−' : '+' }}</span>
        </button>
        <div 
          class="accordion-content"
          :class="{ open: openAccordion === 'apiKeys' }"
        >
          <div class="accordion-inner">
            <p>{{ $i18n('help_api_keys_content') || 'This extension supports multiple translation providers. Some are free, while others require API keys:' }}</p>
            
            <div class="provider-help-section">
              <h4>{{ $i18n('help_free_providers_title') || 'Free Providers (No API Key Required)' }}</h4>
              <ul>
                <li><strong>Google Translate</strong> - Uses the public Google Translate endpoint</li>
                <li><strong>Microsoft Bing</strong> - Uses the public Bing Translate endpoint</li>
                <li><strong>Yandex Translate</strong> - Uses the public Yandex Translate endpoint</li>
              </ul>
            </div>
            
            <div class="provider-help-section">
              <h4>{{ $i18n('help_api_providers_title') || 'API-Based Providers (Require API Keys)' }}</h4>
              <ul>
                <li><strong>Google Gemini</strong> - Get your free API key from <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noopener noreferrer">Google AI Studio</a></li>
                <li><strong>OpenAI</strong> - Register at <a href="https://platform.openai.com/api-keys" target="_blank" rel="noopener noreferrer">OpenAI Platform</a></li>
                <li><strong>OpenRouter</strong> - Access multiple models via <a href="https://openrouter.ai/keys" target="_blank" rel="noopener noreferrer">OpenRouter</a></li>
                <li><strong>DeepSeek</strong> - Get API access from <a href="https://platform.deepseek.com/api_keys" target="_blank" rel="noopener noreferrer">DeepSeek Platform</a></li>
              </ul>
            </div>
            
            <div class="security-notice">
              <h4>🔒 Security Notice</h4>
              <p>Your API keys are stored locally in your browser and are never shared with third parties. For additional security, you can encrypt your settings when exporting them using the Import/Export feature.</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  </section>
</template>

<script setup>
import { ref } from 'vue'

const openAccordion = ref('')

const toggleAccordion = (section) => {
  openAccordion.value = openAccordion.value === section ? '' : section
}
</script>

<style lang="scss" scoped>
@use '@/assets/styles/variables.scss' as *;

.help-tab {
  max-width: 800px;
}

h2 {
  font-size: $font-size-xl;
  font-weight: $font-weight-medium;
  margin-top: 0;
  margin-bottom: $spacing-lg;
  padding-bottom: $spacing-base;
  border-bottom: $border-width $border-style var(--color-border);
  color: var(--color-text);
}

.accordion {
  .accordion-item {
    border: $border-width $border-style var(--color-border);
    border-radius: $border-radius-base;
    margin-bottom: $spacing-base;
    overflow: hidden;
    
    &:last-child {
      margin-bottom: 0;
    }
  }
  
  .accordion-header {
    width: 100%;
    padding: $spacing-md $spacing-lg;
    background-color: var(--color-surface);
    border: none;
    text-align: left;
    cursor: pointer;
    display: flex;
    justify-content: space-between;
    align-items: center;
    font-size: $font-size-base;
    font-weight: $font-weight-medium;
    color: var(--color-text);
    transition: background-color $transition-base;
    
    &:hover {
      background-color: var(--tab-button-hover-bg, #f1f3f4);
    }
    
    &.active {
      background-color: var(--tab-button-active-bg, #e8f0fe);
      color: var(--tab-button-active-color, #1967d2);
    }
    
    span {
      flex-grow: 1;
    }
    
    .accordion-icon {
      font-size: $font-size-lg;
      font-weight: $font-weight-bold;
      margin-left: $spacing-sm;
      transition: transform $transition-base;
      min-width: 20px;
      text-align: center;
    }
  }
  
  .accordion-content {
    max-height: 0;
    overflow: hidden;
    transition: max-height $transition-slow ease-out;
    background-color: var(--color-background);
    
    &.open {
      max-height: 1000px;
      transition: max-height $transition-slow ease-in;
    }
    
    .accordion-inner {
      padding: $spacing-lg;
      
      p {
        margin: 0 0 $spacing-base 0;
        line-height: 1.6;
        color: var(--color-text);
      }
      
      ol, ul {
        margin: 0 0 $spacing-md 0;
        padding-left: $spacing-xl;
        
        li {
          margin-bottom: $spacing-sm;
          line-height: 1.5;
          color: var(--color-text);
          
          strong {
            color: var(--color-text);
            font-weight: $font-weight-semibold;
          }
        }
      }
      
      .content-divider {
        border: none;
        border-top: $border-width $border-style var(--color-border);
        margin: $spacing-lg 0;
      }
      
      .provider-help-section {
        margin: $spacing-lg 0;
        
        h4 {
          font-size: $font-size-md;
          font-weight: $font-weight-semibold;
          margin: 0 0 $spacing-sm 0;
          color: var(--color-text);
        }
        
        ul {
          margin-top: $spacing-sm;
        }
        
        a {
          color: var(--color-primary);
          text-decoration: none;
          font-weight: $font-weight-medium;
          
          &:hover {
            text-decoration: underline;
          }
        }
      }
      
      .security-notice {
        margin-top: $spacing-xl;
        padding: $spacing-md;
        background-color: var(--tab-button-active-bg, #e8f0fe);
        border-radius: $border-radius-base;
        border-left: 4px solid var(--color-primary);
        
        h4 {
          font-size: $font-size-base;
          font-weight: $font-weight-semibold;
          margin: 0 0 $spacing-sm 0;
          color: var(--color-text);
        }
        
        p {
          margin: 0;
          font-size: $font-size-sm;
          color: var(--color-text-secondary);
        }
      }
    }
  }
}

// Mobile responsive
@media (max-width: #{$breakpoint-md}) {
  .accordion {
    .accordion-header {
      padding: $spacing-sm $spacing-md;
      flex-direction: row;
      
      span {
        font-size: $font-size-sm;
      }
    }
    
    .accordion-content .accordion-inner {
      padding: $spacing-md;
      
      ol, ul {
        padding-left: $spacing-lg;
      }
    }
  }
}
</style>