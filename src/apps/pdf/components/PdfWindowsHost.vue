<template>
  <section
    v-if="isVisible"
    ref="hostRef"
    class="pdf-windows-host"
    :style="hostStyle"
    role="dialog"
    :aria-label="t('pdf_windows_host_aria_label')"
    data-testid="pdf-windows-host"
    @click.stop
  >
    <header class="pdf-windows-host__header">
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

      <button
        class="pdf-windows-host__icon-button"
        type="button"
        :title="t('window_close')"
        data-testid="pdf-windows-host-close"
        @click.stop="dismissHost"
      >
        ×
      </button>
    </header>

    <div class="pdf-windows-host__body">
      <div class="pdf-windows-host__source">
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

      <div
        v-else-if="hasTranslatedResult"
        class="pdf-windows-host__translation"
        data-testid="pdf-windows-host-result"
      >
        {{ translatedText }}
      </div>

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
      </div>
    </div>
  </section>
</template>

<script setup>
import { useUnifiedI18n } from '@/composables/shared/useUnifiedI18n.js'
import { usePdfWindowsHost } from '../composables/usePdfWindowsHost.js'
import './PdfWindowsHost.scss'

const { t } = useUnifiedI18n()

const {
  hostRef,
  hostStyle,
  isVisible,
  selectedText,
  translatedText,
  translationError,
  isTranslating,
  isCopying,
  copyStatus,
  canTranslate,
  hasTranslatedResult,
  hasError,
  translateSelection,
  retryTranslation,
  copyTranslation,
  dismissHost
} = usePdfWindowsHost()
</script>
