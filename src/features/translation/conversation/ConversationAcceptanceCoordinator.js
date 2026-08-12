export class ConversationAcceptanceCoordinator {
  #handles

  constructor() {
    this.#handles = new Map()
  }

  register(messageId, handle) {
    if (this.#handles.has(messageId)) return false
    this.#handles.set(messageId, handle)
    return true
  }

  lookup(messageId) {
    return this.#handles.get(messageId) || null
  }

  remove(messageId) {
    return this.#handles.delete(messageId)
  }
}
