<template>
  <div class="about-page">
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
      <div
        v-else
        class="changelog-content"
        v-html="renderedChangelog"
      />
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { marked } from 'marked'
import browser from 'webextension-polyfill'
import { getScopedLogger } from '@/utils/core/logger.js';
import { LOG_COMPONENTS } from '@/utils/core/logConstants.js';
const logger = getScopedLogger(LOG_COMPONENTS.UI, 'About');

import { useI18n } from 'vue-i18n'

const { t } = useI18n()


const isLoadingChangelog = ref(true)
const changelogError = ref(false)
const renderedChangelog = ref('')

const fetchChangelog = async () => {
  try {
    // Use browser extension URL to access the changelog
    const changelogUrl = browser.runtime.getURL('Changelog.md')
    const response = await fetch(changelogUrl)
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`)
    }
    const markdown = await response.text()
    renderedChangelog.value = marked(markdown)
  } catch (error) {
  logger.error('Error fetching changelog:', error)
    changelogError.value = true
  } finally {
    isLoadingChangelog.value = false
  }
}

onMounted(() => {
  fetchChangelog()
})
</script>

<style lang="scss" scoped>
@use '@/assets/styles/variables.scss' as *;

.about-page {
  max-width: 800px;
}

.page-title {
  font-size: $font-size-xl;
  font-weight: $font-weight-medium;
  margin-top: 0;
  margin-bottom: $spacing-lg;
  padding-bottom: $spacing-base;
  border-bottom: $border-width $border-style var(--color-border);
  color: var(--color-text);
}

.changelog-container {
  padding: $spacing-md;
  border: $border-width $border-style var(--color-border);
  border-radius: $border-radius-base;
  background-color: var(--color-background-soft);
  max-height: 60vh;
  overflow-y: auto;
  line-height: 1.6;
  color: var(--color-text);

  .loading-changelog,
  .error-changelog {
    text-align: center;
    padding: $spacing-xl;
    color: var(--color-text-secondary);
  }

  .error-changelog {
    color: var(--color-error);
  }

  .changelog-content {
    // Basic markdown styling for readability
    h1, h2, h3, h4, h5, h6 {
      color: var(--color-text);
      margin-top: $spacing-lg;
      margin-bottom: $spacing-sm;
      padding-bottom: $spacing-xs;
      border-bottom: 1px solid var(--color-border);
    }

    h1 { font-size: $font-size-xl; }
    h2 { font-size: $font-size-lg; }
    h3 { font-size: $font-size-md; }

    p {
      margin-bottom: $spacing-base;
    }

    ul, ol {
      margin-bottom: $spacing-base;
      padding-left: $spacing-lg;
    }

    li {
      margin-bottom: $spacing-xs;
    }

    a {
      color: var(--color-primary);
      text-decoration: none;
      &:hover {
        text-decoration: underline;
      }
    }

    pre {
      background-color: var(--color-code-block-bg);
      border: 1px solid var(--color-border);
      border-radius: $border-radius-sm;
      padding: $spacing-sm;
      overflow-x: auto;
      margin-bottom: $spacing-base;
    }

    code {
      font-family: monospace;
      background-color: var(--color-code-inline-bg);
      padding: 2px 4px;
      border-radius: 3px;
    }
  }
}
</style>