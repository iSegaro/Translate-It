# Text Actions System Documentation

## Overview

The Text Actions system is an integrated solution for managing copy, paste, and TTS (Text-to-Speech) operations across the extension. This system consists of reusable Vue components and powerful composables.

## 🏗️ Architecture


```

src/components/shared/actions/
├── ActionToolbar.vue     # Main toolbar
├── ActionGroup.vue       # Action grouping
├── CopyButton.vue        # Copy button
├── PasteButton.vue       # Paste button
├── TTSButton.vue         # TTS button
└── index.js              # Shared exports

src/composables/actions/
├── useTextActions.js     # Main composable
├── useCopyAction.js      # Copy logic
├── usePasteAction.js     # Paste logic
├── useTTSAction.js       # TTS logic
└── index.js              # Shared exports

```

## 🚀 Quick Start

### 1. Basic usage of ActionToolbar

```vue
<template>
  <div>
    <textarea v-model="text" />
    <ActionToolbar
      :text="text"
      :language="'en'"
      @text-copied="handleCopied"
      @text-pasted="handlePasted"
      @tts-state-change="handleTtsStateChange"
    />
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { ActionToolbar } from '@/components/shared/actions'

const text = ref('')

const handleCopied = (text) => {
  console.log('Copied:', text)
}

const handlePasted = (data) => {
  text.value = data.text
}

const handleTtsStateChange = (event) => {
  console.log('TTS state changed:', event.newState)
}
</script>

```

### 2. Using individual components

```vue
<template>
  <div>
    <ActionGroup layout="horizontal" spacing="normal">
      <CopyButton 
        :text="text" 
        size="medium"
        @copied="handleCopied" 
      />
      <PasteButton 
        size="medium"
        @pasted="handlePasted" 
      />
      <TTSButton 
        :text="text" 
        :language="language"
        size="medium"
        @speaking="handleSpeaking" 
      />
    </ActionGroup>
  </div>
</template>

<script setup>
import { ActionGroup, CopyButton, PasteButton, TTSButton } from '@/components/shared/actions'
</script>

```

### 3. Using the Composable

```vue
<script setup>
import { ref } from 'vue'
import { useTextActions } from '@/composables/actions'

const text = ref('Hello world!')

const {
  copyText,
  pasteText,
  // TTS controls
  play,
  pause,
  resume,
  stop,
  // TTS state
  ttsState,
  isLoading,
  hasError
} = useTextActions()

// Copy text
const copy = async () => {
  const success = await copyText(text.value)
  console.log('Copy success:', success)
}

// Paste text
const paste = async () => {
  const pastedText = await pasteText()
  if (pastedText) {
    text.value = pastedText
  }
}

// Speak text
const speak = async () => {
  if (ttsState.value === 'playing') {
    await pause()
  } else if (ttsState.value === 'paused') {
    await resume()
  } else {
    await play(text.value, 'en')
  }
}
</script>

```

## 📚 Component Reference

### ActionToolbar

A complete toolbar with all operations:

```vue
<ActionToolbar
  :text="string"              :language="string"          :mode="string"              :position="string"          :show-copy="boolean"        :show-paste="boolean"       :show-tts="boolean"         :size="string"              :auto-translate-on-paste="boolean"  @text-copied="function"     @text-pasted="function"     @tts-state-change="function" @action-failed="function"   />

```

### CopyButton

```vue
<CopyButton
  :text="string"              :size="string"              :variant="string"           :title="string"             :disabled="boolean"         @copied="function"          @copy-failed="function"     />

```

### PasteButton

```vue
<PasteButton
  :size="string"              :auto-translate="boolean"   @pasted="function"          @paste-failed="function"    />

```

### TTSButton

A smart TTS button capable of displaying full playback status (Play/Pause/Resume/Stop).

```vue
<TTSButton
  :text="string"              :language="string"          :size="string"              @state-change="function"   />

```

This component features 5 internal states:

* **Idle**: Ready to play.
* **Loading**: Fetching audio file.
* **Playing**: Currently playing (displays Pause icon and progress ring).
* **Paused**: Playback paused (displays Resume icon).
* **Error**: An error occurred (displays red error icon).

## 🔧 Composable Reference

### useTextActions

The primary composable that combines all operations:

```javascript
const {
  // State
  isLoading,           // Operation in progress
  hasError,            // Error exists
  lastError,           // Most recent error
  
  // Copy
  copyText,            // (text) => Promise<boolean>
  copyWithNotification, // (text, callback) => Promise<boolean>
  
  // Paste
  pasteText,           // () => Promise<string>
  pasteWithNotification, // (callback) => Promise<string>
  
  // TTS State & Controls (powered by useTTSSmart)
  ttsState,            // Current state: ref<'idle' | 'loading' | 'playing' | 'paused' | 'error'>
  play,                // (text, lang) => Promise<void>
  pause,               // () => Promise<void>
  resume,              // () => Promise<void>
  stop,                // () => Promise<void>
  
  // Combined
  copyAndSpeak,        // (text, lang, callback) => Promise<boolean>
  pasteAndSpeak,       // (lang, callback) => Promise<string>
  
  // Utilities
  clearAllStates,      // () => void
  checkSupport,        // () => {copy, paste, tts}
  createActionHandlers // (config) => {onCopy, onPaste, onTTS}
} = useTextActions(options)

```

### Options

```javascript
const options = {
  enableCopy: true,          // Enable copy functionality
  enablePaste: true,         // Enable paste functionality
  enableTTS: true,           // Enable TTS functionality
  showNotifications: true    // Display notifications
}

```

## 🎨 Styling

### CSS Classes

Components utilize the following CSS classes:

```css
/* ActionToolbar */
.action-toolbar
.mode-input, .mode-output, .mode-inline, .mode-floating
.position-top-right, .position-top-left, etc.

/* Buttons */
.action-button
.size-small, .size-medium, .size-large
.variant-inline, .variant-standalone, .variant-toolbar

/* States */
.disabled, .copying, .pasting, .playing

```

### Customization

To override styles:

```vue
<style>
.action-toolbar.mode-input {
  background: your-custom-color;
}

.action-button.size-large {
  padding: 12px;
}
</style>

```

## 🔄 Migration Guide

### From TranslationInputField to ActionToolbar

**Before:**

```vue
<TranslationInputField
  v-model="text"
  :copy-title="'Copy'"
  :paste-title="'Paste'"
  :tts-title="'Speak'"
  @copy="handleCopy"
/>

```

**After:**

```vue
<div class="input-container">
  <textarea v-model="text" />
  <ActionToolbar
    :text="text"
    :copy-title="'Copy'"
    :paste-title="'Paste'"
    :tts-title="'Speak'"
    @text-copied="handleCopy"
  />
</div>

```

### From TranslationDisplay to ActionToolbar

**Before:**

```vue
<TranslationDisplay
  :content="result"
  :show-copy-button="true"
  :show-tts-button="true"
  @copy="handleCopy"
/>

```

**After:**

```vue
<div class="output-container">
  <div class="content" v-html="result" />
  <ActionToolbar
    :text="result"
    :mode="'output'"
    :show-paste="false"
    @text-copied="handleCopy"
  />
</div>

```

## 🧪 Testing

### Unit Tests

```javascript
import { mount } from '@vue/test-utils'
import { ActionToolbar } from '@/components/shared/actions'

test('ActionToolbar renders correctly', () => {
  const wrapper = mount(ActionToolbar, {
    props: {
      text: 'Hello world',
      showCopy: true,
      showPaste: true,
      showTTS: true
    }
  })
  
  expect(wrapper.find('.copy-button').exists()).toBe(true)
  expect(wrapper.find('.paste-button').exists()).toBe(true)
  expect(wrapper.find('.tts-button').exists()).toBe(true)
})

```

## 🚀 Performance

### Optimizations

1. **Lazy Loading**: Composables are only loaded when required.
2. **Event Debouncing**: Redundant events are throttled/debounced.
3. **Memory Management**: States are properly cleared to prevent leaks.
4. **Async Operations**: All operations are non-blocking (async).

### Best Practices

```javascript
// ✅ Good: Selective use of features
const { copyText, speakText } = useTextActions({
  enablePaste: false  // Paste disabled
})

// ✅ Good: Clearing state
onUnmounted(() => {
  clearAllStates()
})

// ❌ Bad: Enabling all features unnecessarily
const allActions = useTextActions() // All features enabled

```

## 🐛 Troubleshooting

### Common Issues

1. **Clipboard API not working**
* Verify HTTPS environment.
* Check browser permissions.
* Use the fallback method.


2. **TTS has no sound**
* Check system volume settings.
* Verify the language code.
* Test with simple text.


3. **Icons not appearing**
* Verify asset paths.
* Check imports.
* Test in development mode.



### Debug Mode

```javascript
const actions = useTextActions({
  enableCopy: true,
  enablePaste: true,
  enableTTS: true,
  debug: true  // Enable logging
})

```

## 📈 Future Enhancements

* [ ] Drag & drop support
* [ ] Operation history storage
* [ ] Custom TTS voice settings
* [ ] Additional themes
* [ ] Integration with Cloud TTS services
