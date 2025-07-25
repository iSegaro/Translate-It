<template>
  <div id="historyPanel" class="history-panel">
    <div class="history-header">
      <h3 :data-i18n="$i18n('SIDEPANEL_HISTORY_TITLE')">Translation History</h3>
      <button id="closeHistoryBtn" class="close-btn">✕</button>
    </div>
    <div id="historyList" class="history-list"></div>
    <!-- Footer with clear all button -->
    <div class="history-footer">
      <button
        id="clearAllHistoryBtn"
        class="clear-all-btn"
        :title="$i18n('SIDEPANEL_CLEAR_ALL_HISTORY_TOOLTIP')"
      >
        <img
          src="@assets/icons/trash.svg"
          alt="Clear All"
          class="clear-all-icon"
        />
        <span :data-i18n="$i18n('SIDEPANEL_CLEAR_ALL_HISTORY')"
          >Clear All History</span
        >
      </button>
    </div>
  </div>
</template>

<script setup>
// Add script logic here later
</script>

<style lang="scss" scoped>
@use "@/assets/styles/variables.scss" as *;

.history-panel {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background-color: var(--color-background);
  display: flex;
  flex-direction: column;
  transform: translateX(100%);
  transition: transform $transition-slow;
  z-index: 100;
}

.history-panel.active {
  transform: translateX(0);
}

.history-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: $spacing-base;
  border-bottom: $border-width $border-style var(--color-border);

  h3 {
    margin: 0;
    font-size: $font-size-lg;
    color: var(--color-text);
  }

  .close-btn {
    background: none;
    border: none;
    font-size: $font-size-xl;
    cursor: pointer;
    color: var(--color-text-secondary);
    transition: color $transition-fast;

    &:hover {
      color: var(--color-text);
    }
  }
}

.history-list {
  flex-grow: 1;
  overflow-y: auto;
  padding: $spacing-base;
}

.history-footer {
  padding: $spacing-base;
  border-top: $border-width $border-style var(--color-border);
  text-align: center;
}

.clear-all-btn {
  background-color: $color-error-sass;
  color: white;
  border: none;
  border-radius: $border-radius-sm;
  padding: $spacing-xs $spacing-base;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: $spacing-xs;
  font-size: $font-size-base;
  font-weight: $font-weight-medium;
  transition: background-color $transition-fast;

  &:hover {
    background-color: #d32f2f; /* Darker red for hover */
  }

  .clear-all-icon {
    width: 18px;
    height: 18px;
    filter: invert(1);
  }
}
</style>
