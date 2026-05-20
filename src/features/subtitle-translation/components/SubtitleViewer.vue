<template>
  <div 
    v-bind="containerProps" 
    class="subtitle-viewer" 
  >
    <div v-bind="wrapperProps">
      <div
        v-for="item in list"
        :key="item.data.id"
        class="cue-row"
        :class="[`status-${item.data.status}`]"
        :style="{ height: `${itemHeight}px` }"
      >
        <div class="cue-index">
          {{ item.data.index }}
        </div>
        
        <div class="cue-content-wrapper">
          <div class="cue-column original">
            <div class="cue-time">
              {{ item.data.startTime }}
            </div>
            <div class="cue-text">
              {{ item.data.text }}
            </div>
          </div>
          
          <div class="cue-column translated">
            <template v-if="item.data.status === 'translated'">
              <div class="cue-text">
                {{ item.data.translatedText }}
              </div>
            </template>
            <template v-else-if="item.data.status === 'translating'">
              <div class="cue-loading">
                <v-icon
                  icon="mdi:loading"
                  class="spin"
                />
                <span>{{ t('subtitle_translating', 'Translating...') }}</span>
              </div>
            </template>
            <template v-else-if="item.data.status === 'failed'">
              <div class="cue-error">
                <v-icon icon="mdi:alert-circle-outline" />
                <span>{{ item.data.warnings?.[0] || t('subtitle_error', 'Error') }}</span>
              </div>
            </template>
            <template v-else>
              <div class="cue-placeholder">
                ...
              </div>
            </template>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue';
import { useVirtualList } from '@vueuse/core';
import { Icon as VIcon } from '@iconify/vue';
import { useUnifiedI18n } from '@/composables/shared/useUnifiedI18n.js';

const { t } = useUnifiedI18n();

const props = defineProps({
  cues: { type: Array, required: true },
  itemHeight: { type: Number, default: 80 }
});

const { list, containerProps, wrapperProps } = useVirtualList(
  computed(() => props.cues),
  {
    itemHeight: props.itemHeight,
    overscan: 10
  }
);
</script>

<style lang="scss" scoped>
.subtitle-viewer {
  width: 100%;
  height: 400px;
  border: 1px solid var(--border-color);
  border-radius: 12px;
  background: var(--bg-card);
  overflow-y: auto;
  margin: 1.5rem 0;
  position: relative;

  .cue-row {
    display: flex;
    border-bottom: 1px solid var(--border-color);
    transition: background-color 0.2s ease;
    overflow: hidden;

    &:hover {
      background: var(--bg-glass-hover);
    }

    &.status-translating {
      background: rgba(99, 102, 241, 0.05);
    }

    &.status-translated {
      border-left: 4px solid var(--success-color);
    }

    &.status-failed {
      border-left: 4px solid var(--error-color);
      background: rgba(239, 68, 68, 0.05);
    }

    .cue-index {
      width: 45px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 0.75rem;
      font-weight: 600;
      color: var(--text-secondary);
      border-right: 1px solid var(--border-color);
      flex-shrink: 0;
      background: var(--bg-glass);
    }

    .cue-content-wrapper {
      flex: 1;
      display: grid;
      grid-template-columns: 1fr 1fr;
      min-width: 0;
    }

    .cue-column {
      padding: 0.75rem 1rem;
      display: flex;
      flex-direction: column;
      gap: 0.25rem;
      min-width: 0;
      justify-content: center;

      &.original {
        border-right: 1px solid var(--border-color);
      }

      .cue-time {
        font-size: 0.7rem;
        font-family: monospace;
        color: var(--text-secondary);
        margin-bottom: 2px;
      }

      .cue-text {
        font-size: 0.9rem;
        line-height: 1.4;
        white-space: pre-wrap;
        word-break: break-word;
        color: var(--text-primary);
      }

      .cue-placeholder {
        color: var(--text-secondary);
        opacity: 0.3;
        font-size: 1.2rem;
        letter-spacing: 2px;
      }

      .cue-loading {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        color: var(--primary-color);
        font-size: 0.85rem;

        .spin {
          animation: spin 1s linear infinite;
        }
      }

      .cue-error {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        color: var(--error-color);
        font-size: 0.8rem;
      }
    }
  }
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

/* RTL Support */
[dir="rtl"] .subtitle-viewer, .is-rtl .subtitle-viewer {
  .cue-row {
    &.status-translated, &.status-failed {
      border-left: none;
      border-right: 4px solid;
    }
    
    &.status-translated { border-right-color: var(--success-color); }
    &.status-failed { border-right-color: var(--error-color); }

    .cue-index {
      border-right: none;
      border-left: 1px solid var(--border-color);
    }

    .cue-column.original {
      border-right: none;
      border-left: 1px solid var(--border-color);
    }
  }
}
</style>
