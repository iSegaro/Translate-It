<!-- eslint-disable vue/no-v-html -->
<template>
  <div class="options-tab-content about-page">
    <div class="settings-container">
      <h2 class="page-title">
        {{ t('about_section_title') || 'What\'s New' }}
      </h2>
      
      <div class="changelog-container">
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
          ref="changelogContent"
          class="changelog-content"
          v-html="sanitizedChangelog"
        />
      </div>
    </div>
  </div>
</template>

<script setup>
import './About.scss'
import { ref, computed, onMounted, watch, nextTick } from 'vue'
import { marked } from 'marked'
import DOMPurify from 'dompurify'
import browser from 'webextension-polyfill'
import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';
const logger = getScopedLogger(LOG_COMPONENTS.UI, 'About');

import { useI18n } from 'vue-i18n'

const { t } = useI18n()


const isLoadingChangelog = ref(true)
const changelogError = ref(false)
const rawChangelog = ref('')

// Computed property for sanitized HTML
const sanitizedChangelog = computed(() => {
  return DOMPurify.sanitize(rawChangelog.value)
})

const fetchChangelog = async () => {
  try {
    // Use browser extension URL to access the changelog
    const changelogUrl = browser.runtime.getURL('Changelog.md')
    const response = await fetch(changelogUrl)
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`)
    }
    const markdown = await response.text()
    
    // Configure marked options for better markdown support
    const markedOptions = {
      breaks: false, // Don't convert single line breaks to <br>
      gfm: true,
      smartLists: true,
      smartypants: false,
      tables: true,
      headerIds: false,
      mangle: false,
      sanitize: false
    }

    let html = marked(markdown, markedOptions)

    // Post-process to add spacing between sections without breaking markdown
    html = html.replace(/(<h[1-6][^>]*>.*?<\/h[1-6]>)\s*(?=<h[1-6]|$)/g, '$1<br>')

    // Sanitize HTML for security
    rawChangelog.value = html
  } catch (error) {
  logger.error('Error fetching changelog:', error)
    changelogError.value = true
  } finally {
    isLoadingChangelog.value = false
  }
}

// Function to add target="_blank" only to external links
const addTargetBlankToLinks = () => {
  // Use a simple selector to find all links in the changelog
  const changelogElements = document.querySelectorAll('.changelog-content')
  changelogElements.forEach(element => {
    const links = element.querySelectorAll('a')
    links.forEach(link => {
      const href = link.getAttribute('href')
      // Only add target="_blank" to external links (not starting with #)
      if (href && !href.startsWith('#') && !link.getAttribute('target')) {
        link.setAttribute('target', '_blank')
        link.setAttribute('rel', 'noopener noreferrer')
      }
    })
  })
}

// Watch for changes and process links
watch(sanitizedChangelog, () => {
  nextTick(() => {
    addTargetBlankToLinks()
  })
})

onMounted(() => {
  fetchChangelog()
  // Process links after a short delay to ensure DOM is ready
  setTimeout(addTargetBlankToLinks, 500)
})
</script>
