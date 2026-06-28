<template>
  <section
    v-if="isIconVisible"
    ref="iconHostRef"
    class="pdf-windows-host__icon-stage"
    :style="iconStyle"
    data-testid="pdf-windows-host-icon-stage"
    @click.stop
  >
    <PdfTranslationIcon
      :title="t('translateSelectedText')"
      :aria-label="t('translateSelectedText')"
      @pointerdown="handleIconPointerDown"
      @click="openWindowFromIcon"
    />
  </section>

  <section
    v-if="isVisible"
    ref="hostRef"
    class="pdf-windows-host"
    :class="{
      'pdf-windows-host--docked': isDocked,
      'pdf-windows-host--dock-left': dockMode === 'left',
      'pdf-windows-host--dock-right': dockMode === 'right',
      'pdf-windows-host--pinned': isPinned,
      'pdf-windows-host--dragging': isDragging,
      'pdf-windows-host--resizing': isResizing
    }"
    :style="hostStyle"
    role="dialog"
    :aria-label="t('pdf_windows_host_aria_label')"
    data-testid="pdf-windows-host"
    @click.stop
    @pointerdown.capture="handleHostPointerDown"
    @pointerup.capture="handleHostPointerUp"
    @pointercancel.capture="handleHostPointerCancel"
    @mousedown.capture="handleHostPointerDown"
    @mouseup.capture="handleHostPointerUp"
    @mouseleave.capture="handleHostPointerCancel"
  >
    <header
      class="pdf-windows-host__header"
      @pointerdown.stop="startDrag"
    >
      <div class="pdf-windows-host__title-group">
        <span
          v-if="copyStatus"
          class="pdf-windows-host__status"
          :class="`pdf-windows-host__status--${copyStatus}`"
        >
          {{ copyStatus === 'copied' ? t('pdf_windows_host_copied') : t('pdf_windows_host_copy_failed') }}
        </span>
      </div>

      <TranslationWindowToolbar
        class="pdf-windows-host__toolbar"
        :provider="selectedProvider"
        theme="dark"
        :is-pinned="isPinned"
        :show-original="showOriginal"
        :is-dictionary="isDictionaryResult"
        :tts-text="speakableText"
        tts-language="auto"
        :detected-language-label="detectedLanguageName"
        :pin-title="isPinned ? t('window_unpin') : t('window_pin')"
        :copy-title="t('window_copy_translation')"
        :original-title="showOriginal ? t('window_hide_original') : t('window_show_original')"
        :close-title="t('window_close')"
        provider-selector-mode="icon-only"
        :provider-selector-is-global="false"
        :provider-selector-allow-default="false"
        :provider-selector-allow-set-default="false"
        :provider-selector-only-configured="true"
        provider-selector-required-feature="translation"
        :show-provider-selector="isProviderReady"
        :show-pin-button="true"
        :show-copy-button="hasTranslatedResult"
        :show-tts-button="hasSpeakableText"
        :show-original-button="true"
        :show-close-button="true"
        @pointerdown.stop="handleHostPointerDown"
        @pointerup.stop="handleHostPointerUp"
        @pointercancel.stop="handleHostPointerCancel"
        @mousedown.stop="handleHostPointerDown"
        @mouseup.stop="handleHostPointerUp"
        @touchstart.stop="handleHostPointerDown"
        @provider-change="handleProviderChange"
        @toggle-pin="handlePinToggle"
        @copy="copyTranslation"
        @toggle-original="toggleShowOriginal"
        @close="dismissHost"
      />
    </header>

    <div
      class="pdf-windows-host__body"
      @pointerdown="handleHostPointerDown"
      @pointerup="handleHostPointerUp"
      @pointercancel="handleHostPointerCancel"
      @mousedown="handleHostPointerDown"
      @mouseup="handleHostPointerUp"
    >
      <div
        v-if="showOriginal"
        class="pdf-windows-host__source"
      >
        <div class="pdf-windows-host__label">
          {{ t('pdf_windows_host_selected_text') }}
        </div>
        <div class="pdf-windows-host__text pdf-windows-host__text--source">
          {{ selectedText }}
        </div>
      </div>

      <div
        v-if="isTranslating"
        class="pdf-windows-host__state pdf-windows-host__state--loading"
        data-testid="pdf-windows-host-loading"
      >
        <TranslationDisplay
          class="pdf-windows-host__translation"
          :class="{
            'pdf-windows-host__translation--dictionary': isDictionaryResult,
            'pdf-windows-host__translation--markdown': !isDictionaryResult
          }"
          :content="translatedText"
          :language="translationTargetLanguage"
          :is-loading="true"
          :error="''"
          :error-type="''"
          :mode="'compact'"
          :placeholder="''"
          :enable-markdown="true"
          :show-toolbar="false"
          :show-copy-button="false"
          :show-tts-button="false"
          :show-fade-in-animation="false"
          :last-translation="translatedDisplayMetadata"
        />
      </div>

      <div
        v-else-if="hasError"
        class="pdf-windows-host__state pdf-windows-host__state--error"
        data-testid="pdf-windows-host-error"
      >
        <TranslationDisplay
          class="pdf-windows-host__translation"
          :class="{
            'pdf-windows-host__translation--dictionary': isDictionaryResult,
            'pdf-windows-host__translation--markdown': !isDictionaryResult
          }"
          :content="translatedText"
          :language="translationTargetLanguage"
          :is-loading="false"
          :error="translationError"
          :error-type="''"
          :mode="'compact'"
          :placeholder="''"
          :enable-markdown="true"
          :show-toolbar="false"
          :show-copy-button="false"
          :show-tts-button="false"
          :show-fade-in-animation="false"
          :last-translation="translatedDisplayMetadata"
        />
      </div>

      <TranslationDisplay
        v-else-if="hasTranslatedResult"
        class="pdf-windows-host__translation"
        :class="{
          'pdf-windows-host__translation--dictionary': isDictionaryResult,
          'pdf-windows-host__translation--markdown': !isDictionaryResult
        }"
        :content="translatedText"
        :language="translationTargetLanguage"
        :is-loading="false"
        :error="''"
        :error-type="''"
        :mode="'compact'"
        :placeholder="''"
        :enable-markdown="true"
        :show-toolbar="false"
        :show-copy-button="false"
        :show-tts-button="false"
        :show-fade-in-animation="false"
        :last-translation="translatedDisplayMetadata"
        data-testid="pdf-windows-host-result"
      />
    </div>

    <TranslationWindowFooter
      class="pdf-windows-host__footer"
      :target-language-label="targetLanguageName"
      :show-target-language="!!targetLanguageName"
      :show-retry="hasTranslatedResult || hasError"
      :retry-disabled="isTranslating || !selectedText"
      :retry-title="t('action_retry')"
      :retry-aria-label="t('action_retry')"
      theme="dark"
      @retry="retryTranslation"
    />

    <div
      v-if="isDocked"
      class="pdf-windows-host__dock-resize-handle"
      data-testid="pdf-windows-host-resize-handle"
      @pointerdown.stop="handleDockResize"
    />
  </section>
</template>

<script setup>
import { toRef } from 'vue'
import { useUnifiedI18n } from '@/composables/shared/useUnifiedI18n.js'
import { usePdfWindowsHost } from '../composables/usePdfWindowsHost.js'
import TranslationWindowToolbar from '@/components/shared/TranslationWindowToolbar.vue'
import TranslationWindowFooter from '@/components/shared/TranslationWindowFooter.vue'
import TranslationDisplay from '@/components/shared/TranslationDisplay.vue'
import PdfTranslationIcon from './PdfTranslationIcon.vue'
import './PdfWindowsHost.scss'

const props = defineProps({
  pdfFingerprint: {
    type: String,
    default: ''
  }
})

const { t } = useUnifiedI18n()
const pdfFingerprint = toRef(props, 'pdfFingerprint')

const {
  iconHostRef,
  isIconVisible,
  iconStyle,
  hostRef,
  hostStyle,
  isVisible,
  selectedText,
  selectedProvider,
  isProviderReady,
  showOriginal,
  detectedLanguageName,
  targetLanguageName,
  translationError,
  isTranslating,
  copyStatus,
  hasTranslatedResult,
  hasError,
  speakableText,
  hasSpeakableText,
  isDictionaryResult,
  translatedText,
  translationTargetLanguage,
  translatedDisplayMetadata,
  isPinned,
  dockMode,
  isDocked,
  isResizing,
  isDragging,
  retryTranslation,
  copyTranslation,
  dismissHost,
  openWindowFromIcon,
  toggleShowOriginal,
  handleIconPointerDown,
  handleHostPointerDown,
  handleHostPointerUp,
  handleHostPointerCancel,
  handleProviderChange,
  handlePinToggle,
  handleDockResize,
  startDrag
} = usePdfWindowsHost({
  pdfFingerprint
})
</script>
