/**
 * PdfStatus Banner Controller — resolves banner state from presentation data.
 *
 * Sole responsibility: receive the latest notification from the banner adapter
 * and return a renderable banner descriptor. No priority chain, no error/loading
 * bypass — those flows are now handled by Vue-Sonner toast via the presentation
 * layer.
 *
 * @returns {{ build: (options: object) => object | null }}
 */
export function createPdfStatusBannerController() {
  function build({ notification = null } = {}) {
    if (!notification?.id) return null

    return {
      id: notification.id,
      variant: notification.variant || 'info',
      title: notification.title || '',
      message: notification.message || '',
      body: notification.body || null,
      dismissible: true
    }
  }

  return { build }
}
