<!-- eslint-disable vue/no-v-html -->
<template>
  <section class="options-tab-content">
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
          <div 
            class="accordion-icon-wrapper"
            :class="{ active: openAccordion === 'shortcut' }"
          >
            <span class="accordion-icon">+</span>
          </div>
        </button>
        <div 
          class="accordion-content"
          :class="{ open: openAccordion === 'shortcut' }"
        >
          <div class="accordion-inner">
            <!-- Safe: Content is sanitized with DOMPurify -->
            <div
              class="markdown-content"
              v-html="sanitizedShortcutHelp"
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
          <div 
            class="accordion-icon-wrapper"
            :class="{ active: openAccordion === 'apiKeys' }"
          >
            <span class="accordion-icon">+</span>
          </div>
        </button>
        <div 
          class="accordion-content"
          :class="{ open: openAccordion === 'apiKeys' }"
        >
          <div class="accordion-inner">
            <!-- Safe: Content is sanitized with DOMPurify -->
            <div
              class="markdown-content"
              v-html="sanitizedApiKeysHelp"
            />
          </div>
        </div>
      </div>
    </div>
  </section>
</template>

<script setup>
import { ref, computed, watch, nextTick, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { SimpleMarkdown } from '@/shared/utils/text/markdown.js'
import DOMPurify from 'dompurify'
import { getScopedLogger } from '@/shared/logging/logger.js'
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js'

const openAccordion = ref('')
const { t } = useI18n()
const logger = getScopedLogger(LOG_COMPONENTS.OPTIONS, 'HelpTab')

// Function to add target="_blank" only to external links
const addTargetBlankToLinks = () => {
  // Find all links in the help tab and add target="_blank" only to external links
  document.querySelectorAll('.help-tab .markdown-content a').forEach(link => {
    const href = link.getAttribute('href')
    // Only add target="_blank" to external links (not starting with #)
    if (href && !href.startsWith('#') && !link.target) {
      link.target = '_blank'
      link.rel = 'noopener noreferrer'
    }
  })
}

const PROVIDER_URLS = {
  gemini: 'https://aistudio.google.com/app/apikey',
  openai: 'https://platform.openai.com/api-keys',
  openrouter: 'https://openrouter.ai/keys',
  deepseek: 'https://platform.deepseek.com/api_keys'
}

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

- ${t('help_free_providers_google') || '**Google Translate** - Uses the public Google Translate endpoint'}
- ${t('help_free_providers_bing') || '**Microsoft Bing** - Uses the public Bing Translate endpoint'}
- ${t('help_free_providers_yandex') || '**Yandex Translate** - Uses the public Yandex Translate endpoint'}

## ${t('help_api_providers_title') || 'API-Based Providers (Require API Keys)'}

- ${t('help_api_providers_gemini', { url: PROVIDER_URLS.gemini }) || `**Google Gemini** - Get your free API key from [Google AI Studio](${PROVIDER_URLS.gemini})`}
- ${t('help_api_providers_openai', { url: PROVIDER_URLS.openai }) || `**OpenAI** - Register at [OpenAI Platform](${PROVIDER_URLS.openai})`}
- ${t('help_api_providers_openrouter', { url: PROVIDER_URLS.openrouter }) || `**OpenRouter** - Access multiple models via [OpenRouter](${PROVIDER_URLS.openrouter})`}
- ${t('help_api_providers_deepseek', { url: PROVIDER_URLS.deepseek }) || `**DeepSeek** - Get API access from [DeepSeek Platform](${PROVIDER_URLS.deepseek})`}

---

### ${t('help_security_notice_title') || '🔒 Security Notice'}

${t('help_security_notice_content') || 'Your API keys are stored locally in your browser and are never shared with third parties. For additional security, you can encrypt your settings when exporting them using the Import/Export feature.'}`

  try {
    const markdownElement = SimpleMarkdown.render(content)
    return markdownElement ? markdownElement.innerHTML : content.replace(/\n/g, '<br>')
  } catch (error) {
    logger.warn('API keys help markdown rendering failed:', error)
    return content.replace(/\n/g, '<br>')
  }
})

// Sanitized computed properties
const sanitizedShortcutHelp = computed(() => {
  return DOMPurify.sanitize(shortcutHelpContent.value)
})

const sanitizedApiKeysHelp = computed(() => {
  return DOMPurify.sanitize(apiKeysHelpContent.value)
})

// Watch for changes and process links
watch([sanitizedShortcutHelp, sanitizedApiKeysHelp], () => {
  nextTick(addTargetBlankToLinks)
})

// Process links when component mounts and when accordions are clicked
onMounted(() => {
  setTimeout(addTargetBlankToLinks, 200)

  // Check if user came from shortcuts menu and auto-open shortcuts section
  try {
    const urlParams = new URLSearchParams(window.location.search);
    const tabParam = urlParams.get('tab');

    if (tabParam === 'shortcuts') {
      logger.debug('Auto-opening shortcuts accordion for Firefox user');
      // Auto-open the shortcuts section
      openAccordion.value = 'shortcut';

      // Scroll to shortcuts section after a brief delay
      setTimeout(() => {
        const shortcutsElement = document.querySelector('.accordion-item');
        if (shortcutsElement) {
          shortcutsElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      }, 300);
    } else if (tabParam === 'help') {
      logger.debug('Firefox user accessing help tab via context menu');
      // No auto-open needed for general help access, just log the navigation
    }
  } catch (e) {
    logger.debug('Failed to check URL parameters for auto-opening accordion:', e);
  }

  // Also process when accordion is clicked
  document.addEventListener('click', (e) => {
    if (e.target.closest('.accordion-header')) {
      setTimeout(addTargetBlankToLinks, 100)
    }
  })
})
</script>
