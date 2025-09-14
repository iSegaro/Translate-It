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
import DOMPurify from 'dompurify'
import browser from 'webextension-polyfill'
import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';
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
    
    // Configure marked options for better markdown support
    const markedOptions = {
      breaks: true,
      gfm: true,
      smartLists: true,
      smartypants: true,
      tables: true,
      headerIds: false,
      mangle: false,
      sanitize: false,
      // Preserve line breaks and spacing
      smartypants: false // Disable smart quotes to preserve original text
    }
    
    // Pre-process markdown to preserve empty lines
    const processedMarkdown = markdown.replace(/\n\n/g, '\n&nbsp;\n')
    
    const html = marked(processedMarkdown, markedOptions)
    // Sanitize HTML for security
    renderedChangelog.value = DOMPurify.sanitize(html)
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
// Local SCSS variables for this component
$spacing-xs: 4px;
$spacing-sm: 8px;
$spacing-base: 12px;
$spacing-md: 16px;
$spacing-lg: 20px;
$spacing-xl: 24px;
$spacing-xxl: 32px;

$font-size-xs: 11px;
$font-size-sm: 12px;
$font-size-base: 14px;
$font-size-md: 15px;
$font-size-lg: 16px;
$font-size-xl: 18px;

$font-weight-medium: 500;
$font-weight-bold: 700;

$border-radius-sm: 4px;
$border-radius-base: 6px;

$border-width: 1px;
$border-style: solid;

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
  // max-height: 60vh;
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
    // Ensure all text is visible
    color: var(--color-text);
    line-height: 1.6;
    direction: ltr !important; // Force left-to-right for markdown content
    text-align: left !important; // Force left alignment

    :deep(h1), :deep(h2), :deep(h3), :deep(h4), :deep(h5), :deep(h6) {
      color: var(--color-text) !important;
      margin-top: 0 !important;
      margin-bottom: 4px !important; // کاهش فاصله بعد از headers
      padding-bottom: 0 !important;
      font-weight: bold !important;
      line-height: 1.2 !important;
    }

    :deep(h1) { font-size: 1.5rem !important; }
    :deep(h2) { font-size: 1.25rem !important; }
    :deep(h3) { font-size: 1.125rem !important; }
    :deep(h4) { font-size: 1rem !important; }
    :deep(h5) { font-size: 0.875rem !important; }
    :deep(h6) { font-size: 0.75rem !important; }

    :deep(p) {
      margin-bottom: 8px !important; // کاهش فاصله پاراگراف‌ها
      color: var(--color-text) !important;
      line-height: 1.6 !important;
      direction: ltr !important;
      text-align: left !important;
    }

    :deep(ul), :deep(ol) {
      margin-bottom: 8px !important; // کاهش فاصله لیست‌ها
      padding-left: 24px !important; // افزایش padding برای بهتر دیده شدن bullet های سطح اول
      padding-right: 0 !important; // اطمینان از عدم padding سمت راست
      color: var(--color-text) !important;
      list-style-type: disc !important;
      list-style-position: outside !important; // اطمینان از موقعیت bullet
      direction: ltr !important; // Force LTR for lists
    }

    :deep(ol) {
      list-style-type: decimal !important;
    }

    :deep(li) {
      margin-bottom: 2px !important; // کاهش فاصله بین آیتم‌های لیست
      color: var(--color-text) !important;
      line-height: 1.4 !important;
      padding-left: 4px !important; // کمی padding برای بهتر دیده شدن متن
    }

    :deep(ul ul), :deep(ol ol), :deep(ul ol), :deep(ol ul) {
      margin-bottom: 0 !important;
      padding-left: 28px !important; // افزایش padding برای لیست‌های تو در تو
      padding-right: 0 !important;
      direction: ltr !important;
    }

    :deep(ul ul) {
      list-style-type: circle !important;
    }

    :deep(ul ul ul), :deep(ol ol ol) {
      padding-left: 32px !important; // padding بیشتر برای لیست‌های سطح سوم
      padding-right: 0 !important;
      direction: ltr !important;
    }

    :deep(li) {
      margin-bottom: 4px !important;
      color: var(--color-text) !important;
      line-height: 1.4 !important;
    }

    :deep(strong), :deep(b) {
      font-weight: bold !important;
      color: var(--color-text) !important;
    }

    :deep(em), :deep(i) {
      font-style: italic !important;
      color: var(--color-text-secondary) !important;
    }

    :deep(a) {
      color: var(--color-primary) !important;
      text-decoration: none !important;
      &:hover {
        text-decoration: underline !important;
      }
    }

    :deep(code) {
      font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace !important;
      background-color: var(--color-code-inline-bg) !important;
      padding: 2px 4px !important;
      border-radius: 3px !important;
      font-size: 0.9em !important;
      color: var(--color-text) !important;
    }

    :deep(pre) {
      background-color: var(--color-code-block-bg) !important;
      border: 1px solid var(--color-border) !important;
      border-radius: 4px !important;
      padding: 8px !important;
      overflow-x: auto !important;
      margin-bottom: 12px !important;
      font-size: 0.875rem !important;
      color: var(--color-text) !important;
    }

    // Nested code in pre
    :deep(pre code) {
      background: none !important;
      padding: 0 !important;
      border-radius: 0 !important;
      color: inherit !important;
    }

    // Other elements
    :deep(blockquote) {
      border-left: 4px solid var(--color-border) !important;
      padding-left: 8px !important;
      margin: 12px 0 !important;
      color: var(--color-text-secondary) !important;
      font-style: italic !important;
      direction: ltr !important;
      text-align: left !important;
    }

    :deep(table) {
      border-collapse: collapse !important;
      width: 100% !important;
      margin-bottom: 12px !important;
      font-size: 0.875rem !important;
      color: var(--color-text) !important;
      direction: ltr !important;
    }

    :deep(th), :deep(td) {
      border: 1px solid var(--color-border) !important;
      padding: 4px 8px !important;
      text-align: left !important;
      color: var(--color-text) !important;
      direction: ltr !important;
    }

    :deep(th) {
      background-color: var(--color-background-soft) !important;
      font-weight: 600 !important;
    }

    :deep(hr) {
      border: none !important;
      border-top: 1px solid var(--color-border) !important;
      margin: 20px 0 !important;
    }
  }
}
</style>