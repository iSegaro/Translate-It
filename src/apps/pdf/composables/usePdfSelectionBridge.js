import { onBeforeUnmount, onMounted } from 'vue'
import { PdfSelectionBridge } from '@/features/pdf-translation/core/PdfSelectionBridge.js'

export function usePdfSelectionBridge(viewerRootRef) {
  const bridge = new PdfSelectionBridge(viewerRootRef)

  onMounted(() => {
    bridge.start()
  })

  onBeforeUnmount(() => {
    bridge.destroy()
  })

  return bridge
}

export default usePdfSelectionBridge
