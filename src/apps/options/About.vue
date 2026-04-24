<!-- eslint-disable vue/no-v-html -->
<template>
  <div class="options-tab-content about-page">
    <div class="settings-container">
      <h2 class="page-title">
        {{ t('about_section_title') || "What's New" }}
      </h2>
      
      <div
        class="changelog-container"
        dir="ltr"
      >
        <div
          v-if="isLoadingChangelog"
          class="loading-changelog"
        >
          {{ t('options_changelog_loading') || 'Loading changelog...' }}
        </div>
        <div
          v-else-if="changelogError"
          class="error-changelog"
        >
          {{ t('options_changelog_error') || 'Failed to load changelog.' }}
        </div>
        <!-- Safe: Content is sanitized with DOMPurify -->
        <div
          v-else
          ref="changelogContentRef"
          class="changelog-content"
          @click="handleLinkClick"
          v-html="sanitizedChangelog"
        />
      </div>
    </div>
  </div>
</template>

<script setup>
import './About.scss'
import { ref, computed, onMounted, watch, nextTick } from 'vue'
import { useRouter } from 'vue-router'
import { marked } from 'marked'
import DOMPurify from 'dompurify'
import browser from 'webextension-polyfill'
import { useUnifiedI18n } from '@/composables/shared/useUnifiedI18n.js'
import { useHighlightManager } from './composables/useHighlightManager.js'
import { getScopedLogger } from '@/shared/logging/logger.js'
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js'

// Logger
const logger = getScopedLogger(LOG_COMPONENTS.UI, 'About')

// Composables
const { t } = useUnifiedI18n()
const router = useRouter()
const { checkAndHighlight } = useHighlightManager()

// State
const isLoadingChangelog = ref(true)
const changelogError = ref(false)
const rawChangelog = ref('')
const changelogContentRef = ref(null)

// --- Computed Properties ---

// Computed property for sanitized HTML
const sanitizedChangelog = computed(() => {
  return DOMPurify.sanitize(rawChangelog.value)
})

// --- Logic ---

const fetchChangelog = async () => {
  try {
    // Use browser extension URL to access the changelog
    const changelogUrl = browser.runtime.getURL('Changelog.md')
    const response = await fetch(changelogUrl)
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`)
    }
    const markdown = await response.text()
    
    // Configure marked options
    const markedOptions = {
      breaks: false,
      gfm: true,
      smartLists: true,
      smartypants: false,
      tables: true,
      headerIds: false,
      mangle: false,
      sanitize: false
    }

    let html = marked(markdown, markedOptions)

    // Update raw changelog
    rawChangelog.value = html
  } catch (error) {
    logger.error('Error fetching changelog:', error)
    changelogError.value = true
  } finally {
    isLoadingChangelog.value = false
  }
}

/**
 * Adds target="_blank" and rel="noopener noreferrer" to external links
 */
const addTargetBlankToLinks = () => {
  if (!changelogContentRef.value) return

  const links = changelogContentRef.value.querySelectorAll('a')
  links.forEach(link => {
    const href = link.getAttribute('href')
    // Only add target="_blank" to external links (not starting with #)
    if (href && !href.startsWith('#') && !link.getAttribute('target')) {
      link.setAttribute('target', '_blank')
      link.setAttribute('rel', 'noopener noreferrer')
    }
  })
}

/**
 * Handle clicks on internal links to use Vue Router instead of full page reloads
 */
const handleLinkClick = (event) => {
  const link = event.target.closest('a')
  if (!link) return

  const href = link.getAttribute('href')
  if (href && href.startsWith('#/')) {
    event.preventDefault()
    const path = href.substring(1) // Remove the #
    logger.debug(`🚀 Intercepted internal link click: ${path}`)
    router.push(path)
  }
}

// Watch for content changes and process links after DOM update
watch(sanitizedChangelog, () => {
  nextTick(() => {
    addTargetBlankToLinks()
  })
})

// --- Lifecycle ---

onMounted(() => {
  fetchChangelog()
  checkAndHighlight()
})
</script>
