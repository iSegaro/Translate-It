import { ref, computed } from 'vue'

export function useMobileGestures(options = {}) {
  const {
    onClose = () => {},
    onExpand = () => {},
    onPeek = () => {},
    initialState = 'peek'
  } = options

  const dragY = ref(0)
  const isDragging = ref(false)
  const startY = ref(0)
  const currentSheetState = ref(initialState) // 'peek' | 'full' | 'closed'

  // Snap points (as percentage of viewport height)
  const SNAP_POINTS = {
    peek: 35,
    full: 90,
    closed: 0
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
    if (currentSheetState.value === 'full' && deltaY < 0) {
      dragY.value = deltaY * 0.2 // Resistance
    } else {
      dragY.value = deltaY
    }
  }

  const onDragEnd = () => {
    if (!isDragging.value) return
    isDragging.value = false

    const threshold = 100 // Pixel threshold to trigger state change
    
    if (dragY.value > threshold) {
      // Dragged down
      if (currentSheetState.value === 'full') {
        currentSheetState.value = 'peek'
        onPeek()
      } else {
        currentSheetState.value = 'closed'
        onClose()
      }
    } else if (dragY.value < -threshold) {
      // Dragged up
      if (currentSheetState.value === 'peek') {
        currentSheetState.value = 'full'
        onExpand()
      }
    }
    
    dragY.value = 0
  }

  return {
    dragY,
    isDragging,
    sheetTranslation,
    onDragStart,
    onDragMove,
    onDragEnd,
    currentSheetState
  }
}
