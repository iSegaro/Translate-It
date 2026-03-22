import { ref, computed } from 'vue'
import { MOBILE_CONSTANTS } from '@/shared/config/constants.js'

export function useMobileGestures(options = {}) {
  const {
    onClose = () => {},
    onExpand = () => {},
    onPeek = () => {},
    initialState = MOBILE_CONSTANTS.SHEET_STATE.PEEK
  } = options

  const dragY = ref(0)
  const isDragging = ref(false)
  const startY = ref(0)
  const currentSheetState = ref(initialState)

  // Snap points (as percentage of viewport height)
  const SNAP_POINTS = {
    [MOBILE_CONSTANTS.SHEET_STATE.PEEK]: 35,
    [MOBILE_CONSTANTS.SHEET_STATE.FULL]: 90,
    [MOBILE_CONSTANTS.SHEET_STATE.CLOSED]: 0
  }

  const sheetTranslation = computed(() => {
    if (isDragging.value) {
      return dragY.value
    }
    return 0
  })

  const onDragStart = (event) => {
    startY.value = event.touches[0].clientY
    isDragging.value = true
    dragY.value = 0
  }

  const onDragMove = (event) => {
    if (!isDragging.value) return
    const currentY = event.touches[0].clientY
    const deltaY = currentY - startY.value
    
    // Limit upward drag if already in full
    if (currentSheetState.value === MOBILE_CONSTANTS.SHEET_STATE.FULL && deltaY < 0) {
      dragY.value = deltaY * 0.2 // Resistance
    } else {
      dragY.value = deltaY
    }
  }

  const onDragEnd = () => {
    if (!isDragging.value) return
    isDragging.value = false;

    const threshold = 60; // Pixel threshold to trigger state change (reduced from 100)
    
    if (dragY.value > threshold) {
      // Dragged down
      if (currentSheetState.value === MOBILE_CONSTANTS.SHEET_STATE.FULL) {
        currentSheetState.value = MOBILE_CONSTANTS.SHEET_STATE.PEEK
        onPeek()
      } else {
        // Already in PEEK or other, so close
        currentSheetState.value = MOBILE_CONSTANTS.SHEET_STATE.CLOSED
        onClose()
      }
    } else if (dragY.value < -threshold) {
      // Dragged up
      if (currentSheetState.value !== MOBILE_CONSTANTS.SHEET_STATE.FULL) {
        currentSheetState.value = MOBILE_CONSTANTS.SHEET_STATE.FULL
        onExpand()
      }
    }
    
    dragY.value = 0
  }

  const syncState = (newState) => {
    currentSheetState.value = newState
  }

  return {
    dragY,
    isDragging,
    sheetTranslation,
    onDragStart,
    onDragMove,
    onDragEnd,
    currentSheetState,
    syncState
  }
}
