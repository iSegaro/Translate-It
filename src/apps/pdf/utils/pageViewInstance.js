import { unref } from 'vue'

export function getPdfPageRootElement(instance) {
  if (!instance) return null

  if (typeof instance.getRootEl === 'function') {
    return instance.getRootEl()
  }

  return unref(instance.rootEl) || instance.rootEl || null
}
