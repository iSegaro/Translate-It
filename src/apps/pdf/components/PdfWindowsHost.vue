<template>
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
  >
    <header
      class="pdf-windows-host__header"
      @pointerdown.stop="startDrag"
    >
      <div class="pdf-windows-host__title-group">
        <span class="pdf-windows-host__title">
          {{ t('translateSelectedText') }}
        </span>
        <span
          v-if="copyStatus"
          class="pdf-windows-host__status"
          :class="`pdf-windows-host__status--${copyStatus}`"
        >
          {{ copyStatus === 'copied' ? t('pdf_windows_host_copied') : t('pdf_windows_host_copy_failed') }}
        </span>
      </div>

      <div class="pdf-windows-host__header-actions">
        <button
          class="pdf-windows-host__action-button pdf-windows-host__action-button--pin"
          type="button"
          :class="{ 'is-active': isPinned }"
          :title="isPinned ? t('window_unpin') : t('window_pin')"
          :aria-label="isPinned ? t('window_unpin') : t('window_pin')"
          data-testid="pdf-windows-host-pin"
          @click.stop="handlePinToggle"
          @pointerdown.stop
        >
          {{ isPinned ? t('window_unpin') : t('window_pin') }}
        </button>

        <div
          v-if="isProviderReady"
          class="pdf-windows-host__provider-switcher"
          data-testid="pdf-windows-host-provider-switcher"
        >
          <ProviderSelector
            mode="compact"
            :model-value="selectedProvider"
            :is-global="false"
            :allow-default="false"
            :allow-set-default="false"
            :only-configured="true"
            required-feature="translation"
            @update:model-value="handleProviderChange"
            @provider-change="handleProviderChange"
          />
        </div>

        <span
          v-if="detectedLanguageName"
          class="pdf-windows-host__detected-language"
          data-testid="pdf-windows-host-detected-language"
        >
          {{ detectedLanguageName }}
        </span>

        <button
          class="pdf-windows-host__action-button pdf-windows-host__action-button--original"
          type="button"
          :class="{ 'is-active': showOriginal }"
          :title="showOriginal ? t('window_hide_original') : t('window_show_original')"
          :aria-label="showOriginal ? t('window_hide_original') : t('window_show_original')"
          data-testid="pdf-windows-host-toggle-original"
          @click.stop="toggleShowOriginal"
          @pointerdown.stop
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <path
              fill="currentColor"
              d="M11.99 2C6.47 2 2 6.48 2 12s4.47 10 9.99 10C17.52 22 22 17.52 22 12S17.52 2 11.99 2zM12 20c-4.42 0-8-3.58-8-8s3.58-8 8-8s8 3.58 8 8s-3.58 8-8 8zm-2-9.41V12h2.59L15 14.41V16h-4v-1.59L8.59 12H7v-2h3.59L13 7.59V6h4v1.59L14.41 10H12v.59z"
            />
          </svg>
        </button>

        <button
          class="pdf-windows-host__action-button pdf-windows-host__action-button--dock"
          type="button"
          :class="{ 'is-active': dockMode === 'left' }"
          :title="dockMode === 'left' ? t('pdf_windows_host_undock') : t('pdf_windows_host_dock_left')"
          :aria-label="dockMode === 'left' ? t('pdf_windows_host_undock') : t('pdf_windows_host_dock_left')"
          data-testid="pdf-windows-host-dock-left"
          @click.stop="handleDockLeft"
          @pointerdown.stop
        >
          {{ t('pdf_windows_host_dock_left') }}
        </button>

        <button
          class="pdf-windows-host__action-button pdf-windows-host__action-button--dock"
          type="button"
          :class="{ 'is-active': dockMode === 'right' }"
          :title="dockMode === 'right' ? t('pdf_windows_host_undock') : t('pdf_windows_host_dock_right')"
          :aria-label="dockMode === 'right' ? t('pdf_windows_host_undock') : t('pdf_windows_host_dock_right')"
          data-testid="pdf-windows-host-dock-right"
          @click.stop="handleDockRight"
          @pointerdown.stop
        >
          {{ t('pdf_windows_host_dock_right') }}
        </button>

        <button
          class="pdf-windows-host__icon-button"
          type="button"
          :title="t('window_close')"
          :aria-label="t('window_close')"
          data-testid="pdf-windows-host-close"
          @click.stop="dismissHost"
          @pointerdown.stop
        >
          ×
        </button>
      </div>
    </header>

    <div class="pdf-windows-host__body">
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
        <span class="pdf-windows-host__spinner" />
        <span>{{ t('window_loading_alt') }}</span>
      </div>

      <div
        v-else-if="hasError"
        class="pdf-windows-host__state pdf-windows-host__state--error"
        data-testid="pdf-windows-host-error"
      >
        {{ translationError }}
      </div>

      <SafeMarkdownPreview
        v-else-if="hasTranslatedResult"
        class="pdf-windows-host__translation"
        :class="{
          'pdf-windows-host__translation--dictionary': isDictionaryResult,
          'pdf-windows-host__translation--markdown': !isDictionaryResult
        }"
        :html="translatedDisplayHtml"
        data-testid="pdf-windows-host-result"
      />

      <div class="pdf-windows-host__actions">
        <button
          v-if="!hasTranslatedResult && !hasError"
          class="pdf-windows-host__primary-button"
          type="button"
          data-testid="pdf-windows-host-translate"
          :disabled="!canTranslate"
          @click.stop="translateSelection()"
        >
          <span
            v-if="isTranslating"
            class="pdf-windows-host__spinner pdf-windows-host__spinner--button"
          />
          <span>{{ t('translateSelectedText') }}</span>
        </button>

        <button
          v-if="hasTranslatedResult"
          class="pdf-windows-host__secondary-button"
          type="button"
          data-testid="pdf-windows-host-copy"
          :disabled="isCopying"
          @click.stop="copyTranslation()"
        >
          {{ t('window_copy_translation') }}
        </button>

        <button
          v-if="hasTranslatedResult || hasError"
          class="pdf-windows-host__secondary-button"
          type="button"
          data-testid="pdf-windows-host-retry"
          :disabled="isTranslating || !selectedText"
          @click.stop="retryTranslation()"
        >
          {{ t('action_retry') }}
        </button>

        <TTSButton
          v-if="hasSpeakableText"
          class="pdf-windows-host__tts-button"
          :text="speakableText"
          language="auto"
          size="sm"
          variant="secondary"
          :disabled="isTranslating"
          :is-dictionary="isDictionaryResult"
        />
      </div>
    </div>

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
import ProviderSelector from '@/components/shared/ProviderSelector.vue'
import TTSButton from '@/components/shared/TTSButton.vue'
import SafeMarkdownPreview from '@/components/shared/SafeMarkdownPreview.vue'
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
  hostRef,
  hostStyle,
  isVisible,
  selectedText,
  selectedProvider,
  isProviderReady,
  showOriginal,
  detectedLanguageName,
  translationError,
  isTranslating,
  isCopying,
  copyStatus,
  canTranslate,
  hasTranslatedResult,
  hasError,
  speakableText,
  hasSpeakableText,
  isDictionaryResult,
  translatedDisplayHtml,
  isPinned,
  dockMode,
  isDocked,
  isResizing,
  isDragging,
  translateSelection,
  retryTranslation,
  copyTranslation,
  dismissHost,
  toggleShowOriginal,
  handleProviderChange,
  handlePinToggle,
  handleDockLeft,
  handleDockRight,
  handleDockResize,
  startDrag
} = usePdfWindowsHost({
  pdfFingerprint
})
</script>
