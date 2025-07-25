<template>
  <div class="side-toolbar">
    <div class="toolbar-group">
      <button
        id="selectElementBtn"
        class="toolbar-button"
        :title="$i18n('SIDEPANEL_SELECT_ELEMENT_TOOLTIP')"
      >
        <img
          src="@/assets/icons/select.png"
          alt="Select Element"
          class="toolbar-icon"
        />
      </button>
      <button
        id="revertActionBtn"
        class="toolbar-button"
        :title="$i18n('SIDEPANEL_REVERT_TOOLTIP')"
      >
        <img src="@/assets/icons/revert.png" alt="Revert" class="toolbar-icon" />
      </button>
      <button
        id="clearFieldsBtn"
        class="toolbar-button"
        :title="$i18n('SIDEPANEL_CLEAR_STORAGE_TITLE_ICON')"
      >
        <img
          src="@/assets/icons/clear.png"
          alt="Clear Fields"
          class="toolbar-icon"
        />
      </button>

      <div class="toolbar-separator"></div>

      <button
        id="apiProviderBtn"
        class="toolbar-button"
        :title="$i18n('SIDEPANEL_API_PROVIDER_TOOLTIP')"
      >
        <img
          id="apiProviderIcon"
          src="@/assets/icons/api-providers/google.svg"
          alt="API Provider"
          class="toolbar-icon"
        />
      </button>
      <button
        id="historyBtn"
        class="toolbar-button"
        :title="$i18n('SIDEPANEL_HISTORY_TOOLTIP')"
      >
        <img
          src="@assets/icons/history.svg"
          alt="History"
          class="toolbar-icon"
        />
      </button>
    </div>
    <div class="toolbar-group-bottom">
      <button
        id="settingsBtn"
        class="toolbar-button"
        :title="$i18n('SIDEPANEL_SETTINGS_TITLE_ICON')"
      >
        <img
          src="@assets/icons/settings.png"
          alt="Settings"
          class="toolbar-icon"
        />
      </button>
    </div>
  </div>
</template>

<script setup>
// Add script logic here later
</script>

<style lang="scss" scoped>
@use "@/assets/styles/variables.scss" as *;

.side-toolbar {
  width: 50px;
  background-color: var(--color-surface-alt);
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  align-items: center;
  padding: $spacing-sm 0;
  border-right: $border-width $border-style var(--color-border);
}

.toolbar-group {
  display: flex;
  flex-direction: column;
  gap: $spacing-xs;
}

.toolbar-group-bottom {
  margin-top: auto;
  display: flex;
  flex-direction: column;
  gap: $spacing-xs;
}

.toolbar-button {
  background: none;
  border: none;
  padding: $spacing-xs;
  cursor: pointer;
  display: flex;
  justify-content: center;
  align-items: center;
  width: 40px;
  height: 40px;
  border-radius: $border-radius-sm;
  transition: background-color $transition-fast;

  &:hover {
    background-color: var(--color-background);
  }
}

.toolbar-icon {
  width: 24px;
  height: 24px;
  filter: var(--icon-filter);
}

.toolbar-separator {
  width: 80%;
  height: 1px;
  background-color: var(--color-border);
  margin: $spacing-xs 0;
}
</style>
