import { computed } from 'vue'
import { useUnifiedI18n } from '@/composables/shared/useUnifiedI18n.js'

/**
 * Composable for RTL support in select elements
 * Returns inline styles for BaseSelect components in RTL mode
 */
export function useRTLSelect() {
  const { t } = useUnifiedI18n()

  const isRTL = computed(() => {
    try {
      return t('IsRTL') === 'true'
    } catch {
      return false
    }
  })

  const rtlSelectStyle = computed(() => {
    if (!isRTL.value) return {}
    return {
      'background-position': 'left 8px center !important',
      'padding-right': '12px !important',
      'padding-left': '2.5em !important',
      'text-align': 'right !important'
    }
  })

  return {
    isRTL,
    rtlSelectStyle
  }
}