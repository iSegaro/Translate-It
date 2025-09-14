<template>
  <section class="help-tab">
    <h2>{{ t('help_section_title') || 'Help & Documentation' }}</h2>
    
    <div class="accordion">
      <!-- Shortcut Help Section -->
      <div class="accordion-item">
        <button 
          class="accordion-header"
          :class="{ active: openAccordion === 'shortcut' }"
          @click="toggleAccordion('shortcut')"
        >
          <span>{{ t('help_shortcut_title') || 'Keyboard Shortcuts & Usage' }}</span>
          <span class="accordion-icon">{{ openAccordion === 'shortcut' ? '−' : '+' }}</span>
        </button>
        <div 
          class="accordion-content"
          :class="{ open: openAccordion === 'shortcut' }"
        >
          <div class="accordion-inner">
            <div 
              class="markdown-content" 
              v-html="shortcutHelpContent"
            />
          </div>
        </div>
      </div>
      
      <!-- API Keys Help Section -->
      <div class="accordion-item">
        <button 
          class="accordion-header"
          :class="{ active: openAccordion === 'apiKeys' }"
          @click="toggleAccordion('apiKeys')"
        >
          <span>{{ t('help_api_keys_title') || 'API Keys & Translation Providers' }}</span>
          <span class="accordion-icon">{{ openAccordion === 'apiKeys' ? '−' : '+' }}</span>
        </button>
        <div 
          class="accordion-content"
          :class="{ open: openAccordion === 'apiKeys' }"
        >
          <div class="accordion-inner">
            <div 
              class="markdown-content" 
              v-html="apiKeysHelpContent"
            />
          </div>
        </div>
      </div>
    </div>
  </section>
</template>

<script setup>
import { ref, computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { SimpleMarkdown } from '@/utils/text/markdown.js'
import { getScopedLogger } from '@/shared/logging/logger.js'
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js'

const openAccordion = ref('')
const { t } = useI18n()
const logger = getScopedLogger(LOG_COMPONENTS.OPTIONS, 'HelpTab')

const toggleAccordion = (section) => {
  openAccordion.value = openAccordion.value === section ? '' : section
}

const shortcutHelpContent = computed(() => {
  const content = `${t('help_shortcut_content_p1') || 'To use this extension, you have several options:'}

1. ${t('help_shortcut_content_li1') || 'Select text on any webpage and press **Ctrl+/** (**Cmd+/** on Mac) to translate it instantly.'}
2. ${t('help_shortcut_content_li2') || 'Right-click on selected text and choose **"Translate Selected Text"** from the context menu.'}
3. ${t('help_shortcut_content_li3') || 'Click on the extension icon in the toolbar to open the translation popup.'}
4. ${t('help_shortcut_content_li4') || 'Use the side panel for continuous translation work (**Chrome only**).'}

---

${t('help_shortcut_content_p2') || 'To customize keyboard shortcuts in Chrome:'}

1. ${t('help_shortcut_content_chrome_li1') || 'Go to **chrome://extensions/**'}
2. ${t('help_shortcut_content_chrome_li2') || 'Click on the menu **(☰)** in the top-left corner'}
3. ${t('help_shortcut_content_chrome_li3') || 'Select **"Keyboard shortcuts"** and customize as needed'}`

  try {
    const markdownElement = SimpleMarkdown.render(content)
    return markdownElement ? markdownElement.innerHTML : content.replace(/\n/g, '<br>')
  } catch (error) {
    logger.warn('Shortcut help markdown rendering failed:', error)
    return content.replace(/\n/g, '<br>')
  }
})

const apiKeysHelpContent = computed(() => {
  const content = `${t('help_api_keys_content') || 'This extension supports multiple translation providers. Some are free, while others require API keys:'}

## ${t('help_free_providers_title') || 'Free Providers (No API Key Required)'}

- **Google Translate** - Uses the public Google Translate endpoint
- **Microsoft Bing** - Uses the public Bing Translate endpoint  
- **Yandex Translate** - Uses the public Yandex Translate endpoint

## ${t('help_api_providers_title') || 'API-Based Providers (Require API Keys)'}

- **Google Gemini** - Get your free API key from [Google AI Studio](https://aistudio.google.com/app/apikey)
- **OpenAI** - Register at [OpenAI Platform](https://platform.openai.com/api-keys)
- **OpenRouter** - Access multiple models via [OpenRouter](https://openrouter.ai/keys)
- **DeepSeek** - Get API access from [DeepSeek Platform](https://platform.deepseek.com/api_keys)

---

### 🔒 Security Notice

Your API keys are stored locally in your browser and are never shared with third parties. For additional security, you can encrypt your settings when exporting them using the Import/Export feature.`

  try {
    const markdownElement = SimpleMarkdown.render(content)
    return markdownElement ? markdownElement.innerHTML : content.replace(/\n/g, '<br>')
  } catch (error) {
    logger.warn('API keys help markdown rendering failed:', error)
    return content.replace(/\n/g, '<br>')
  }
})
</script>

<style lang="scss" scoped>
@use "@/assets/styles/base/variables" as *;

.help-tab {
  max-width: 100%;
  width: 100%;
  display: flex;
  flex-direction: column;
  box-sizing: border-box;
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
      color: var(--tab-button-active-color, var(--color-primary));
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

      .markdown-content {
        :deep(p) {
          margin: 0 0 $spacing-base 0;
          line-height: 1.6;
          color: var(--color-text);
        }

        :deep(ol), :deep(ul) {
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

        :deep(hr) {
          border: none;
          border-top: $border-width $border-style var(--color-border);
          margin: $spacing-lg 0;
        }

        :deep(h2), :deep(h3), :deep(h4) {
          font-size: $font-size-md;
          font-weight: $font-weight-semibold;
          margin: $spacing-lg 0 $spacing-sm 0;
          color: var(--color-text);

          &:first-child {
            margin-top: 0;
          }
        }

        :deep(a) {
          color: var(--color-primary);
          text-decoration: none;
          font-weight: $font-weight-medium;

          &:hover {
            text-decoration: underline;
          }
        }

        :deep(strong) {
          color: var(--color-text);
          font-weight: $font-weight-semibold;
        }

        :deep(code) {
          background-color: var(--color-surface);
          padding: 2px 4px;
          border-radius: 3px;
          font-family: 'Courier New', Courier, monospace;
          font-size: 0.9em;
          color: var(--color-text);
        }
      }
    }
  }
}

:global(.options-layout.rtl) {
  .accordion-header {
    display: flex !important;
    flex-direction: row-reverse !important; /* Reverse the order of elements */
    justify-content: space-between !important; /* Ensure proper spacing */
    text-align: right !important; /* Align text to the right */
  }
}
</style>