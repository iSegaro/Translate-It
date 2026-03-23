import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { MOBILE_CONSTANTS, TRANSLATION_STATUS } from '@/shared/config/constants.js'

export const useMobileStore = defineStore('mobile', () => {
  // State
  const isOpen = ref(false)
  const activeView = ref(MOBILE_CONSTANTS.VIEWS.DASHBOARD)
  const sheetState = ref(MOBILE_CONSTANTS.SHEET_STATE.PEEK)
  const isKeyboardVisible = ref(false)
  const isFullscreen = ref(false)
  
  // Selection Specific State
  const selectionData = ref({
    text: '',
    translation: '',
    sourceLang: 'auto',
    targetLang: 'en',
    isLoading: false,
    error: null
  })

  // Page Translation State
  const pageTranslationData = ref({
    isTranslating: false,
    isTranslated: false,
    isAutoTranslating: false,
    translatedCount: 0,
    totalCount: 0,
    status: TRANSLATION_STATUS.IDLE, // 'idle' | 'translating' | 'completed' | 'error'
    errorMessage: null
  })

  // Select Element State
  const hasElementTranslations = ref(false)

  // Getters
  const isSheetOpen = computed(() => isOpen.value)
  const currentView = computed(() => activeView.value)
  const currentSheetState = computed(() => sheetState.value)
  
  // Actions
  const openSheet = (view = MOBILE_CONSTANTS.VIEWS.DASHBOARD, state = MOBILE_CONSTANTS.SHEET_STATE.PEEK) => {
    activeView.value = view
    sheetState.value = state
    isOpen.value = true
  }

  const closeSheet = () => {
    isOpen.value = false
    sheetState.value = MOBILE_CONSTANTS.SHEET_STATE.CLOSED
  }

  const toggleSheet = () => {
    if (isOpen.value) {
      closeSheet()
    } else {
      openSheet()
    }
  }

  const setView = (view) => {
    activeView.value = view
  }

  const setSheetState = (state) => {
    sheetState.value = state
  }

  const setKeyboardVisibility = (visible) => {
    isKeyboardVisible.value = visible
    // Automatically expand to full when keyboard is visible
    if (visible && isOpen.value) {
      sheetState.value = MOBILE_CONSTANTS.SHEET_STATE.FULL
    }
  }

  const updateSelectionData = (data) => {
    selectionData.value = { ...selectionData.value, ...data }
  }

  const resetSelectionData = () => {
    selectionData.value = {
      text: '',
      translation: '',
      sourceLang: 'auto',
      targetLang: 'en',
      isLoading: false,
      error: null
    }
  }

  const setPageTranslation = (data) => {
    pageTranslationData.value = { ...pageTranslationData.value, ...data }
  }

  const resetPageTranslation = () => {
    pageTranslationData.value = {
      isTranslating: false,
      isTranslated: false,
      isAutoTranslating: false,
      translatedCount: 0,
      totalCount: 0,
      status: TRANSLATION_STATUS.IDLE,
      errorMessage: null
    }
  }

  const setHasElementTranslations = (value) => {
    hasElementTranslations.value = value
  }

  const setFullscreen = (value) => {
    isFullscreen.value = value
  }

  return {
    // State
    isOpen,
    activeView,
    sheetState,
    isKeyboardVisible,
    isFullscreen,
    selectionData,
    pageTranslationData,
    hasElementTranslations,
    
    // Getters
    isSheetOpen,
    currentView,
    currentSheetState,
    
    // Actions
    openSheet,
    closeSheet,
    toggleSheet,
    setView,
    setSheetState,
    setKeyboardVisibility,
    updateSelectionData,
    resetSelectionData,
    setPageTranslation,
    resetPageTranslation,
    setHasElementTranslations,
    setFullscreen
  }
})
