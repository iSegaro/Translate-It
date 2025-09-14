<template>
  <div class="font-selector">
    <!-- Font Family Selector -->
    <div class="font-group">
      <label for="font-family-search">{{ t('font_family_label') || 'Font Family' }}</label>
      
      <!-- Searchable Font Selector -->
      <div class="font-search-container">
        <div
          class="font-dropdown"
          :class="{ 'is-open': isDropdownOpen }"
        >
          <div class="font-input-wrapper">
            <input
              id="font-family-search"
              ref="fontSearchInput"
              v-model="searchQuery"
              type="text"
              class="font-search-input"
              :placeholder="selectedFontName || t('search_fonts_placeholder', 'Search fonts...')"
              autocomplete="off"
              @focus="openDropdown"
              @blur="closeDropdownDelayed"
              @input="handleSearch"
              @keydown="handleKeydown"
            >
            <div
              class="font-dropdown-arrow"
              @click="toggleDropdown"
            >
              <svg
                width="12"
                height="12"
                viewBox="0 0 12 12"
              >
                <path
                  d="M6 8L2 4h8z"
                  fill="currentColor"
                />
              </svg>
            </div>
          </div>
          
          <!-- Loading state -->
          <div
            v-if="isLoadingFonts"
            class="font-loading"
          >
            <div class="loading-spinner" />
            <span>{{ t('loading_fonts', 'Loading fonts...') }}</span>
          </div>
          
          <!-- Dropdown Options -->
          <div
            v-else-if="isDropdownOpen"
            class="font-options-container"
          >
            <div
              ref="fontOptionsRef"
              class="font-options"
            >
              <div
                v-for="(font, index) in filteredFonts"
                :key="generateFontKey(font, index)"
                :class="[
                  'font-option',
                  { 
                    'is-selected': font.value === localFontFamily,
                    'is-highlighted': index === highlightedIndex,
                    'is-system': font.isSystemFont 
                  }
                ]"
                @click="selectFont(font)"
                @mouseenter="highlightedIndex = index"
              >
                <div class="font-option-content">
                  <span
                    class="font-name"
                    :style="{ fontFamily: getFontPreviewFamily(font) }"
                  >
                    {{ font.name }}
                  </span>
                  <span class="font-category">{{ font.category }}</span>
                </div>
                <div
                  v-if="font.isSystemFont"
                  class="font-system-badge"
                >
                  {{ t('system_font', 'System') }}
                </div>
              </div>
              
              <!-- No results message -->
              <div
                v-if="filteredFonts.length === 0 && searchQuery"
                class="font-no-results"
              >
                {{ t('no_fonts_found', 'No fonts found') }}
              </div>
            </div>
          </div>
        </div>
      </div>
      
      <div class="font-description">
        {{ selectedFontDescription }}
      </div>
    </div>

    <!-- Font Size Selector -->
    <div class="font-group">
      <label for="font-size-select">{{ t('font_size_label') || 'Font Size' }}</label>
      <select 
        id="font-size-select"
        v-model="localFontSize"
        class="font-select"
      >
        <option 
          v-for="size in fontSizeOptions" 
          :key="size.value" 
          :value="size.value"
        >
          {{ size.name }}
        </option>
      </select>
    </div>

    <!-- Font Preview -->
    <div class="font-preview">
      <div class="preview-label">
        {{ t('font_preview_label') || 'Preview' }}
      </div>
      <div 
        class="preview-text"
        :style="previewStyle"
      >
        {{ previewText }}
      </div>
    </div>

    <!-- Validation Error -->
    <div
      v-if="error"
      class="error-message"
    >
      {{ error }}
    </div>
  </div>
</template>

<script setup>
import { computed, ref, watch, onMounted, onUnmounted, nextTick } from 'vue'
import { CONFIG } from '@/shared/config/config.js'
import { useUnifiedI18n } from '@/composables/shared/useUnifiedI18n.js'
import { systemFontDetector } from '@/shared/fonts/SystemFontDetector.js'
import { getScopedLogger } from '@/shared/logging/logger.js'
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js'

const logger = getScopedLogger(LOG_COMPONENTS.UI, 'FontSelector')

const props = defineProps({
  fontFamily: {
    type: String,
    default: 'auto'
  },
  fontSize: {
    type: String,
    default: '14'
  },
  targetLanguage: {
    type: String,
    default: 'English'
  }
})

const emit = defineEmits(['update:font-family', 'update:font-size'])

const { t } = useUnifiedI18n()

// Refs
const fontSearchInput = ref(null)
const fontOptionsRef = ref(null)

// Local reactive values
const localFontFamily = ref(props.fontFamily)
const localFontSize = ref(props.fontSize)
const error = ref('')
const searchQuery = ref('')
const isDropdownOpen = ref(false)
const isLoadingFonts = ref(false)
const availableFonts = ref([])
const filteredFonts = ref([])
const highlightedIndex = ref(-1)
const closeTimer = ref(null)

// Font size options from config
const fontSizeOptions = computed(() => CONFIG.FONT_SIZE_OPTIONS || [])

// Computed properties
const selectedFont = computed(() => {
  return availableFonts.value.find(f => f.value === localFontFamily.value)
})

const selectedFontName = computed(() => {
  return selectedFont.value?.name || ''
})

const selectedFontDescription = computed(() => {
  const font = selectedFont.value
  if (!font) return ''
  
  let description = font.category || ''
  if (font.isSystemFont) {
    description += description ? ' • System Font' : 'System Font'
  }
  return description
})

// Preview text based on target language
const previewText = computed(() => {
  return [
    'این متن نمونه‌ای برای پیش‌نمایش فونت است', // Farsi
    'This is a sample text for font preview', // English
    '这是一个用于字体预览的示例文本', // Chinese
    'Este es un texto de muestra para la vista previa de la fuente', // Spanish
    'これはフォントプレビュー用のサンプルテキストです', // Japanese
    '이것은 글꼴 미리보기를 위한 샘플 텍스트입니다', // Korean
  ].join('\n\n')
})


// Methods
const loadFonts = async () => {
  if (isLoadingFonts.value || availableFonts.value.length > 0) return
  
  try {
    isLoadingFonts.value = true
    
    const fonts = await systemFontDetector.getAvailableFonts()
    availableFonts.value = fonts
    filteredFonts.value = fonts.slice(0, 20) // Initial limit
    
  } catch (error) {
    logger.error('Failed to load fonts:', error)
    error.value = t('font_loading_error', 'Failed to load fonts')
  } finally {
    isLoadingFonts.value = false
  }
}

const handleSearch = async () => {
  if (!searchQuery.value.trim()) {
    filteredFonts.value = availableFonts.value.slice(0, 20)
    return
  }
  
  try {
    const results = await systemFontDetector.searchFonts(searchQuery.value, 50)
    filteredFonts.value = results
    highlightedIndex.value = -1
  } catch (error) {
    logger.error('Font search failed:', error)
  }
}

const openDropdown = async () => {
  if (isDropdownOpen.value) return
  
  clearTimeout(closeTimer.value)
  isDropdownOpen.value = true
  
  // Load fonts when dropdown opens (lazy loading)
  if (availableFonts.value.length === 0) {
    await loadFonts()
  }
  
  // Focus search input
  await nextTick()
  fontSearchInput.value?.focus()
}

const closeDropdownDelayed = () => {
  closeTimer.value = setTimeout(() => {
    isDropdownOpen.value = false
    searchQuery.value = ''
    highlightedIndex.value = -1
  }, 150)
}

const toggleDropdown = () => {
  if (isDropdownOpen.value) {
    isDropdownOpen.value = false
    searchQuery.value = ''
  } else {
    openDropdown()
  }
}

const selectFont = (font) => {
  localFontFamily.value = font.value
  isDropdownOpen.value = false
  searchQuery.value = ''
  highlightedIndex.value = -1
  clearTimeout(closeTimer.value)
  
}

const handleKeydown = (event) => {
  if (!isDropdownOpen.value) return
  
  switch (event.key) {
    case 'ArrowDown':
      event.preventDefault()
      highlightedIndex.value = Math.min(
        highlightedIndex.value + 1,
        filteredFonts.value.length - 1
      )
      scrollToHighlighted()
      break
      
    case 'ArrowUp':
      event.preventDefault()
      highlightedIndex.value = Math.max(highlightedIndex.value - 1, -1)
      scrollToHighlighted()
      break
      
    case 'Enter':
      event.preventDefault()
      if (highlightedIndex.value >= 0) {
        selectFont(filteredFonts.value[highlightedIndex.value])
      }
      break
      
    case 'Escape':
      event.preventDefault()
      isDropdownOpen.value = false
      searchQuery.value = ''
      fontSearchInput.value?.blur()
      break
  }
}

const scrollToHighlighted = async () => {
  await nextTick()
  const container = fontOptionsRef.value
  const highlighted = container?.querySelector('.font-option.is-highlighted')
  
  if (container && highlighted) {
    const containerRect = container.getBoundingClientRect()
    const highlightedRect = highlighted.getBoundingClientRect()
    
    if (highlightedRect.bottom > containerRect.bottom) {
      container.scrollTop += highlightedRect.bottom - containerRect.bottom + 5
    } else if (highlightedRect.top < containerRect.top) {
      container.scrollTop -= containerRect.top - highlightedRect.top + 5
    }
  }
}

const getFontPreviewFamily = (font) => {
  return systemFontDetector.getFontCSSFamily(font.value)
}

const generateFontKey = (font, index) => {
  return systemFontDetector.generateFontKey(font, index)
}

// Generate CSS for font family (updated to use system fonts)
const getFontFamilyCSS = (fontValue) => {
  return systemFontDetector.getFontCSSFamily(fontValue)
}

// Preview style
const previewStyle = computed(() => ({
  fontFamily: getFontFamilyCSS(localFontFamily.value),
  fontSize: `${localFontSize.value}px`,
  lineHeight: '1.5',
  direction: isRTL(props.targetLanguage) ? 'rtl' : 'ltr',
  textAlign: 'center'
}))

// Helper function to detect RTL languages
const isRTL = (language) => {
  const rtlLanguages = ['farsi', 'persian', 'fa', 'arabic', 'ar', 'hebrew', 'he']
  return rtlLanguages.includes(language?.toLowerCase())
}

// Watch for prop changes and update local values
watch(() => props.fontFamily, (newVal) => {
  localFontFamily.value = newVal
})

watch(() => props.fontSize, (newVal) => {
  localFontSize.value = newVal
})

// Emit changes
watch(localFontFamily, (newVal) => {
  emit('update:font-family', newVal)
})

watch(localFontSize, (newVal) => {
  emit('update:font-size', newVal)
})

// Validation
const validate = () => {
  error.value = ''
  
  if (!localFontFamily.value) {
    error.value = t('font_family_required') || 'Font family is required'
    return false
  }
  
  if (!localFontSize.value || isNaN(parseInt(localFontSize.value))) {
    error.value = t('font_size_invalid') || 'Font size must be a valid number'
    return false
  }
  
  const sizeNum = parseInt(localFontSize.value)
  if (sizeNum < 10 || sizeNum > 30) {
    error.value = t('font_size_range_error') || 'Font size must be between 10 and 30 pixels'
    return false
  }
  
  return true
}

// Debounced search (optimized for better UX)
let searchTimeout = null
watch(searchQuery, () => {
  clearTimeout(searchTimeout)
  searchTimeout = setTimeout(handleSearch, 150) // Reduced debounce for faster response
})

// Click outside to close dropdown
const handleClickOutside = (event) => {
  const container = document.querySelector('.font-dropdown')
  if (container && !container.contains(event.target)) {
    isDropdownOpen.value = false
    searchQuery.value = ''
  }
}

// Lifecycle hooks
onMounted(() => {
  validate()
  document.addEventListener('click', handleClickOutside)
})

onUnmounted(() => {
  clearTimeout(closeTimer.value)
  clearTimeout(searchTimeout)
  document.removeEventListener('click', handleClickOutside)
})

// Expose validation method
defineExpose({
  validate,
  loadFonts
})
</script>

<style lang="scss" scoped>
@use "@/assets/styles/base/variables" as *;

.font-selector {
  display: flex;
  flex-direction: column;
  gap: $spacing-lg;
}

.font-group {
  display: flex;
  flex-direction: column;
  gap: $spacing-sm;
  
  label {
    font-size: $font-size-sm;
    font-weight: $font-weight-medium;
    color: var(--color-text);
  }
  
  .font-description {
    font-size: $font-size-xs;
    color: var(--color-text-secondary);
    font-style: italic;
    margin-top: 2px;
    min-height: 18px;
  }
}

// Searchable font dropdown styles
.font-search-container {
  position: relative;
  width: 100%;
}

.font-dropdown {
  position: relative;
  width: 100%;
  
  &.is-open {
    .font-dropdown-arrow svg {
      transform: rotate(180deg);
    }
  }
}

.font-input-wrapper {
  position: relative;
  display: flex;
  align-items: center;
}

.font-search-input {
  width: 100%;
  padding: $spacing-base;
  padding-right: 32px;
  border: $border-width $border-style var(--color-border);
  border-radius: $border-radius-base;
  background-color: var(--color-background);
  color: var(--color-text);
  font-size: $font-size-base;
  transition: border-color 0.2s ease;
  
  &:focus {
    outline: none;
    border-color: var(--color-primary);
    box-shadow: 0 0 0 2px var(--color-primary-alpha);
  }
  
  &::placeholder {
    color: var(--color-text-secondary);
  }
}

.font-dropdown-arrow {
  position: absolute;
  right: 8px;
  top: 50%;
  transform: translateY(-50%);
  cursor: pointer;
  padding: 4px;
  border-radius: 2px;
  transition: all 0.2s ease;
  
  &:hover {
    background-color: var(--color-background-secondary);
  }
  
  svg {
    transition: transform 0.2s ease;
    color: var(--color-text-secondary);
  }
}

// Loading state
.font-loading {
  display: flex;
  align-items: center;
  gap: $spacing-sm;
  padding: $spacing-lg;
  color: var(--color-text-secondary);
  font-size: $font-size-sm;
  
  .loading-spinner {
    width: 16px;
    height: 16px;
    border: 2px solid var(--color-border);
    border-top: 2px solid var(--color-primary);
    border-radius: 50%;
    animation: spin 1s linear infinite;
  }
}

@keyframes spin {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
}

// Options container
.font-options-container {
  position: absolute;
  top: 100%;
  left: 0;
  right: 0;
  z-index: 1000;
  margin-top: 2px;
  background-color: var(--color-background);
  border: $border-width $border-style var(--color-border);
  border-radius: $border-radius-base;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  overflow: hidden;
}

.font-options {
  max-height: 250px;
  overflow-y: auto;
  padding: 4px 0;
  
  // Custom scrollbar
  &::-webkit-scrollbar {
    width: 6px;
  }
  
  &::-webkit-scrollbar-track {
    background: var(--color-background-secondary);
  }
  
  &::-webkit-scrollbar-thumb {
    background: var(--color-border);
    border-radius: 3px;
    
    &:hover {
      background: var(--color-text-secondary);
    }
  }
}

.font-option {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 12px;
  cursor: pointer;
  transition: background-color 0.15s ease;
  border-left: 3px solid transparent;
  
  &:hover,
  &.is-highlighted {
    background-color: var(--color-background-secondary);
  }
  
  &.is-selected {
    background-color: var(--color-primary-alpha);
    border-left-color: var(--color-primary);
    
    .font-name {
      color: var(--color-primary);
      font-weight: $font-weight-medium;
    }
  }
  
  &.is-system {
    position: relative;
    
    &::before {
      content: '';
      position: absolute;
      left: 0;
      top: 0;
      bottom: 0;
      width: 2px;
      background: linear-gradient(to bottom, var(--color-success), var(--color-info));
    }
  }
}

.font-option-content {
  display: flex;
  flex-direction: column;
  gap: 2px;
  flex: 1;
  min-width: 0;
}

.font-name {
  font-size: $font-size-base;
  font-weight: $font-weight-normal;
  color: var(--color-text);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  line-height: 1.2;
}

.font-category {
  font-size: $font-size-xs;
  color: var(--color-text-secondary);
  text-transform: capitalize;
  line-height: 1;
}

.font-system-badge {
  background-color: var(--color-success-alpha);
  color: var(--color-success);
  font-size: $font-size-xs;
  padding: 2px 6px;
  border-radius: 12px;
  font-weight: $font-weight-medium;
  white-space: nowrap;
}

.font-no-results {
  padding: $spacing-lg;
  text-align: center;
  color: var(--color-text-secondary);
  font-size: $font-size-sm;
  font-style: italic;
}

// Legacy select for font size
.font-select {
  padding: $spacing-base;
  border: $border-width $border-style var(--color-border);
  border-radius: $border-radius-base;
  background-color: var(--color-background);
  color: var(--color-text);
  font-size: $font-size-base;
  
  &:focus {
    outline: none;
    border-color: var(--color-primary);
    box-shadow: 0 0 0 2px var(--color-primary-alpha);
  }
}

.font-preview {
  border: $border-width $border-style var(--color-border);
  border-radius: $border-radius-base;
  padding: $spacing-lg;
  background-color: var(--color-background-secondary);
  
  .preview-label {
    font-size: $font-size-sm;
    font-weight: $font-weight-medium;
    color: var(--color-text-secondary);
    margin-bottom: $spacing-sm;
  }
  
  .preview-text {
    min-height: 40px;
    padding: $spacing-base;
    border-radius: $border-radius-sm;
    background-color: var(--color-background);
    border: 1px solid var(--color-border-light);
    word-wrap: break-word;
    white-space: pre-wrap;
  }
}

.error-message {
  background-color: var(--color-error);
  color: white;
  padding: $spacing-base;
  border-radius: $border-radius-base;
  font-size: $font-size-sm;
}

// Mobile responsive
@media (max-width: #{$breakpoint-md}) {
  .font-selector {
    gap: $spacing-base;
  }
  
  .font-group {
    gap: $spacing-xs;
  }
  
  .font-preview {
    padding: $spacing-base;
  }
}
</style>