<template>
  <div class="progress-panel">
    <div class="header">
      <div class="title">
        <h3>{{ status === 'completed' ? t('subtitle_complete', 'Translation Complete') : t('subtitle_translating', 'Translating...') }}</h3>
        <span class="filename">{{ filename }}</span>
      </div>
      <div class="percentage">
        {{ progress.percent }}%
      </div>
    </div>

    <div class="progress-bar-container">
      <div 
        class="progress-bar" 
        :style="{ width: progress.percent + '%' }"
        :class="{ 'is-complete': status === 'completed' }"
      >
        <div class="progress-shine" />
      </div>
    </div>

    <div 
      v-if="progress.terminalError"
      class="terminal-error-alert fade-in"
    >
      <v-icon icon="mdi:alert-circle" class="error-icon" />
      <div class="error-content">
        <span class="error-title">{{ t('subtitle_terminal_error', 'Stopped due to error') }}</span>
        <span class="error-msg">{{ progress.terminalError }}</span>
      </div>
    </div>

    <div class="stats-grid">
      <div class="stat-item">
        <div class="stat-value">
          {{ progress.translated }}
        </div>
        <div class="stat-label">
          {{ t('subtitle_translated', 'Translated') }}
        </div>
      </div>
      <div class="stat-item">
        <div class="stat-value">
          {{ progress.failed }}
        </div>
        <div class="stat-label">
          {{ t('subtitle_failed', 'Failed') }}
        </div>
      </div>
      <div class="stat-item">
        <div class="stat-value">
          {{ formatTime(progress.etaMs) }}
        </div>
        <div class="stat-label">
          {{ t('subtitle_remaining', 'Remaining') }}
        </div>
      </div>
      <div class="stat-item">
        <div class="stat-value">
          {{ progress.translated }} / {{ progress.total }}
        </div>
        <div class="stat-label">
          {{ t('subtitle_total', 'Total Cues') }}
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { Icon as VIcon } from '@iconify/vue';
import { useUnifiedI18n } from '@/composables/shared/useUnifiedI18n.js';
const { t } = useUnifiedI18n();

defineProps({
  progress: { type: Object, required: true },
  status: { type: String, required: true },
  filename: { type: String, default: '' }
});

const formatTime = (ms) => {
  if (!ms || ms < 0) return '--:--';
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
};
</script>

<style lang="scss" scoped>
.progress-panel {
  padding: 1.5rem;
  background: var(--bg-card, rgba(255, 255, 255, 0.05));
  border-radius: 16px;
  border: 1px solid var(--border-color, rgba(255, 255, 255, 0.1));
  margin-bottom: 2rem;

  .header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    margin-bottom: 1rem;

    .title {
      h3 {
        margin: 0 0 0.25rem 0;
        font-size: 1.1rem;
        font-weight: 600;
      }
      .filename {
        font-size: 0.85rem;
        color: var(--text-secondary, rgba(255, 255, 255, 0.6));
      }
    }

    .percentage {
      font-size: 1.5rem;
      font-weight: 700;
      color: var(--primary-color, #6366f1);
    }
  }

  .terminal-error-alert {
    display: flex;
    align-items: flex-start;
    gap: 0.75rem;
    padding: 1rem;
    background: rgba(239, 68, 68, 0.08);
    border: 1px solid rgba(239, 68, 68, 0.2);
    border-radius: 12px;
    margin-bottom: 1.5rem;

    .error-icon {
      font-size: 1.25rem;
      color: var(--error-color, #ef4444);
      margin-top: 0.1rem;
    }

    .error-content {
      display: flex;
      flex-direction: column;
      gap: 0.25rem;

      .error-title {
        font-size: 0.85rem;
        font-weight: 700;
        color: var(--error-color, #ef4444);
        text-transform: uppercase;
      }

      .error-msg {
        font-size: 0.9rem;
        color: var(--text-primary);
        line-height: 1.4;
      }
    }
  }

  .progress-bar-container {
    width: 100%;
    height: 12px;
    background: var(--progress-track-bg, rgba(255, 255, 255, 0.1));
    border-radius: 6px;
    overflow: hidden;
    margin-bottom: 1.5rem;

    .progress-bar {
      height: 100%;
      background: linear-gradient(90deg, #6366f1, #a855f7);
      border-radius: 6px;
      transition: width 0.4s cubic-bezier(0.4, 0, 0.2, 1);
      position: relative;

      &.is-complete {
        background: var(--success-color, #10b981);
      }

      .progress-shine {
        position: absolute;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: linear-gradient(
          90deg,
          transparent,
          rgba(255, 255, 255, 0.2),
          transparent
        );
        animation: shine 2s infinite linear;
      }
    }
  }

  .stats-grid {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 1rem;

    .stat-item {
      text-align: center;
      
      .stat-value {
        font-size: 1.1rem;
        font-weight: 600;
        margin-bottom: 0.25rem;
      }
      .stat-label {
        font-size: 0.75rem;
        color: var(--text-secondary, rgba(255, 255, 255, 0.6));
        text-transform: uppercase;
        letter-spacing: 0.05em;
      }
    }
  }
}

@keyframes shine {
  0% { transform: translateX(-100%); }
  100% { transform: translateX(100%); }
}
</style>
