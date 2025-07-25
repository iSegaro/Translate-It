<template>
  <div class="main-content">
    <form id="translationForm">
      <div class="language-controls">
        <select
          id="sourceLanguageInput"
          class="language-select"
          :title="$i18n('SIDEPANEL_SOURCE_LANGUAGE_TITLE')"
        ></select>
        <button
          type="button"
          id="swapLanguagesBtn"
          class="swap-button"
          :title="$i18n('SIDEPANEL_SWAP_LANGUAGES_TITLE')"
        >
          <img src="@assets/icons/swap.png" alt="Swap" />
        </button>

        <select
          id="targetLanguageInput"
          class="language-select"
          :title="$i18n('SIDEPANEL_TARGET_LANGUAGE_TITLE')"
        ></select>
      </div>

      <!-- Source Text Area with Toolbar -->
      <div class="textarea-container source-container">
        <div class="inline-toolbar source-toolbar">
          <img
            src="@assets/icons/copy.png"
            id="copySourceBtn"
            class="inline-icon"
            :title="$i18n('SIDEPANEL_COPY_SOURCE_TITLE_ICON')"
          />
          <img
            src="@assets/icons/speaker.png"
            id="voiceSourceIcon"
            class="inline-icon"
            :title="$i18n('SIDEPANEL_VOICE_SOURCE_TITLE_ICON')"
          />
        </div>
        <img
          src="@assets/icons/paste.png"
          id="pasteSourceBtn"
          class="inline-icon paste-icon-separate"
          :title="$i18n('SIDEPANEL_PASTE_SOURCE_TITLE_ICON')"
        />
        <textarea
          id="sourceText"
          rows="6"
          :placeholder="$i18n('SIDEPANEL_SOURCE_TEXT_PLACEHOLDER')"
        ></textarea>
      </div>

      <!-- Action Bar -->
      <div class="action-bar">
        <button
          type="submit"
          id="translateBtn"
          class="translate-button-main"
        >
          <span :data-i18n="$i18n('SIDEPANEL_TRANSLATE_BUTTON_TEXT')"
            >Translate</span
          >
          <img src="@assets/icons/translate.png" alt="Translate" />
        </button>
      </div>

      <!-- Result Area with Toolbar -->
      <div class="textarea-container result-container">
        <div class="inline-toolbar target-toolbar">
          <img
            src="@assets/icons/copy.png"
            id="copyTargetBtn"
            class="inline-icon"
            :title="$i18n('SIDEPANEL_COPY_TARGET_TITLE_ICON')"
          />
          <img
            src="@assets/icons/speaker.png"
            id="voiceTargetIcon"
            class="inline-icon"
            :title="$i18n('SIDEPANEL_VOICE_TARGET_TITLE_ICON')"
          />
        </div>
        <div id="translationResult" class="result"></div>
      </div>
    </form>
  </div>
</template>

<script setup>
// Add script logic here later
</script>

<style lang="scss" scoped>
@use "@/assets/styles/variables.scss" as *;

.main-content {
  flex-grow: 1;
  padding: $spacing-base;
  overflow-y: auto;
}

#translationForm {
  display: flex;
  flex-direction: column;
  gap: $spacing-base;
}

.language-controls {
  display: flex;
  gap: $spacing-xs;
  align-items: center;
}

.language-select {
  flex: 1;
  padding: 6px 8px;
  border: 1px solid var(--color-border);
  border-radius: $border-radius-sm;
  background-color: var(--color-background);
  color: var(--color-text);
  font-size: $font-size-sm;
}

.swap-button {
  background: none;
  border: none;
  cursor: pointer;
  padding: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;

  img {
    width: 18px;
    height: 18px;
    filter: var(--icon-filter);
  }
}

.textarea-container {
  position: relative;
  border: 1px solid var(--color-border);
  border-radius: $border-radius-sm;
  background-color: var(--color-surface);
  padding: $spacing-xs;
}

textarea {
  width: 100%;
  border: none;
  background: none;
  resize: vertical;
  min-height: 80px;
  font-size: $font-size-base;
  color: var(--color-text);
  padding: $spacing-xs;
  padding-top: $spacing-lg; /* Make space for inline toolbar */

  &:focus {
    outline: none;
  }
}

.result {
  min-height: 80px;
  padding: $spacing-xs;
  padding-top: $spacing-lg; /* Make space for inline toolbar */
  font-size: $font-size-base;
  color: var(--color-text);
  white-space: pre-wrap;
  word-wrap: break-word;
}

.inline-toolbar {
  position: absolute;
  top: $spacing-xs;
  right: $spacing-xs;
  display: flex;
  gap: $spacing-xs;
}

.inline-icon {
  width: 20px;
  height: 20px;
  cursor: pointer;
  filter: var(--icon-filter);
  transition: opacity $transition-fast;

  &:hover {
    opacity: 0.7;
  }
}

.paste-icon-separate {
  position: absolute;
  top: $spacing-xs;
  left: $spacing-xs;
}

.action-bar {
  display: flex;
  justify-content: center;
}

.translate-button-main {
  background-color: var(--color-primary);
  color: white;
  border: none;
  border-radius: $border-radius-sm;
  padding: $spacing-xs $spacing-base;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: $spacing-xs;
  font-size: $font-size-base;
  font-weight: $font-weight-medium;
  transition: background-color $transition-fast;

  &:hover {
    background-color: var(--color-primary-dark);
  }

  img {
    width: 18px;
    height: 18px;
    filter: invert(1);
  }
}
</style>
