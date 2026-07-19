import PdfRegionComparisonNotificationBody from './PdfRegionComparisonNotificationBody.vue'
import { PDF_NOTIFICATION_BODY_TYPE } from '../../notifications/PdfNotificationBodyType.js'

export function resolvePdfNotificationBody(type) {
  if (type === PDF_NOTIFICATION_BODY_TYPE.REGION_COMPARISON_RESULTS) {
    return PdfRegionComparisonNotificationBody
  }

  return null
}
