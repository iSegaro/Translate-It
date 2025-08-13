# Text Actions System Documentation

## Overview

سیستم Text Actions یک راهکار یکپارچه برای مدیریت عملیات copy، paste و TTS در سراسر افزونه است. این سیستم شامل کامپوننت‌های Vue قابل استفاده مجدد و composable های قدرتمند است.

## 🏗️ Architecture

```
src/components/shared/actions/
├── ActionToolbar.vue     # تولبار اصلی
├── ActionGroup.vue       # گروه‌بندی اکشن‌ها
├── CopyButton.vue        # دکمه کپی
├── PasteButton.vue       # دکمه چسباندن
├── TTSButton.vue         # دکمه تلفظ
└── index.js              # Export های مشترک

src/composables/actions/
├── useTextActions.js     # کامپوزیبل اصلی
├── useCopyAction.js      # عملکرد کپی
├── usePasteAction.js     # عملکرد پیست
├── useTTSAction.js       # عملکرد تلفظ
└── index.js              # Export های مشترک
```

## 🚀 Quick Start

### 1. استفاده ساده از ActionToolbar

```vue
<template>
  <div>
    <textarea v-model="text" />
    <ActionToolbar
      :text="text"
      :language="'en'"
      @text-copied="handleCopied"
      @text-pasted="handlePasted"
      @tts-speaking="handleSpeaking"
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

const handleSpeaking = (data) => {
  console.log('Speaking:', data.text)
}
</script>
```

### 2. استفاده از کامپوننت‌های جداگانه

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

### 3. استفاده از Composable

```vue
<script setup>
import { ref } from 'vue'
import { useTextActions } from '@/composables/actions'

const text = ref('Hello world!')

const {
  copyText,
  pasteText,
  speakText,
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
  await speakText(text.value, 'en')
}
</script>
```

## 📚 Component Reference

### ActionToolbar

تولبار کامل با تمام عملیات:

```vue
<ActionToolbar
  :text="string"              <!-- متن برای copy/TTS -->
  :language="string"          <!-- کد زبان -->
  :mode="string"              <!-- 'input' | 'output' | 'inline' | 'floating' -->
  :position="string"          <!-- 'top-right' | 'top-left' | etc. -->
  :show-copy="boolean"        <!-- نمایش دکمه کپی -->
  :show-paste="boolean"       <!-- نمایش دکمه پیست -->
  :show-tts="boolean"         <!-- نمایش دکمه تلفظ -->
  :size="string"              <!-- 'small' | 'medium' | 'large' -->
  :auto-translate-on-paste="boolean"  <!-- ترجمه خودکار بعد پیست -->
  @text-copied="function"     <!-- رویداد کپی -->
  @text-pasted="function"     <!-- رویداد پیست -->
  @tts-speaking="function"    <!-- شروع تلفظ -->
  @tts-stopped="function"     <!-- توقف تلفظ -->
  @action-failed="function"   <!-- خطا در عملیات -->
/>
```

### CopyButton

```vue
<CopyButton
  :text="string"              <!-- متن برای کپی -->
  :size="string"              <!-- اندازه دکمه -->
  :variant="string"           <!-- 'inline' | 'standalone' | 'toolbar' -->
  :title="string"             <!-- عنوان tooltip -->
  :disabled="boolean"         <!-- غیرفعال -->
  @copied="function"          <!-- رویداد کپی موفق -->
  @copy-failed="function"     <!-- رویداد خطا -->
/>
```

### PasteButton

```vue
<PasteButton
  :size="string"              <!-- اندازه دکمه -->
  :auto-translate="boolean"   <!-- ترجمه خودکار -->
  @pasted="function"          <!-- رویداد پیست موفق -->
  @paste-failed="function"    <!-- رویداد خطا -->
/>
```

### TTSButton

```vue
<TTSButton
  :text="string"              <!-- متن برای تلفظ -->
  :language="string"          <!-- کد زبان -->
  :size="string"              <!-- اندازه دکمه -->
  @speaking="function"        <!-- شروع تلفظ -->
  @stopped="function"         <!-- توقف تلفظ -->
  @tts-failed="function"      <!-- خطا در تلفظ -->
/>
```

## 🔧 Composable Reference

### useTextActions

کامپوزیبل اصلی که همه عملیات را ترکیب می‌کند:

```javascript
const {
  // State
  isLoading,           // در حال انجام عملیات
  hasError,            // وجود خطا
  lastError,           // آخرین خطا
  
  // Copy
  copyText,            // (text) => Promise<boolean>
  copyWithNotification, // (text, callback) => Promise<boolean>
  
  // Paste
  pasteText,           // () => Promise<string>
  pasteWithNotification, // (callback) => Promise<string>
  
  // TTS
  speakText,           // (text, lang) => Promise<boolean>
  stopSpeaking,        // () => Promise<boolean>
  
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
  enableCopy: true,          // فعال‌سازی کپی
  enablePaste: true,         // فعال‌سازی پیست
  enableTTS: true,           // فعال‌سازی تلفظ
  showNotifications: true    // نمایش نوتیفیکیشن‌ها
}
```

## 🎨 Styling

### CSS Classes

کامپوننت‌ها از CSS classes زیر استفاده می‌کنند:

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

برای تغییر استایل‌ها:

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

### از TranslationInputField به ActionToolbar

**قبل:**
```vue
<TranslationInputField
  v-model="text"
  :copy-title="'Copy'"
  :paste-title="'Paste'"
  :tts-title="'Speak'"
  @copy="handleCopy"
/>
```

**بعد:**
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

### از TranslationDisplay به ActionToolbar

**قبل:**
```vue
<TranslationDisplay
  :content="result"
  :show-copy-button="true"
  :show-tts-button="true"
  @copy="handleCopy"
/>
```

**بعد:**
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

1. **Lazy Loading**: Composable ها فقط در صورت نیاز بارگذاری می‌شوند
2. **Event Debouncing**: رویدادهای تکراری محدود می‌شوند
3. **Memory Management**: وضعیت‌ها به درستی پاک می‌شوند
4. **Async Operations**: همه عملیات async هستند

### Best Practices

```javascript
// ✅ خوب: استفاده انتخابی از ویژگی‌ها
const { copyText, speakText } = useTextActions({
  enablePaste: false  // پیست غیرفعال
})

// ✅ خوب: پاک کردن وضعیت
onUnmounted(() => {
  clearAllStates()
})

// ❌ بد: استفاده از همه ویژگی‌ها بدون نیاز
const allActions = useTextActions() // همه ویژگی‌ها فعال
```

## 🐛 Troubleshooting

### مشکلات رایج

1. **Clipboard API کار نمی‌کند**
   - بررسی HTTPS
   - بررسی permissions
   - استفاده از fallback method

2. **TTS صدا ندارد**
   - بررسی تنظیمات صدای سیستم
   - بررسی language code
   - تست با متن ساده

3. **Icons نمایش داده نمی‌شوند**
   - بررسی مسیر assets
   - بررسی import ها
   - تست در حالت dev

### Debug Mode

```javascript
const actions = useTextActions({
  enableCopy: true,
  enablePaste: true,
  enableTTS: true,
  debug: true  // فعال‌سازی لاگ‌ها
})
```

## 📈 Future Enhancements

- [ ] پشتیبانی از drag & drop
- [ ] ذخیره history عملیات
- [ ] تنظیمات صدای TTS
- [ ] تم‌های بیشتر
- [ ] اتصال به Cloud TTS services
