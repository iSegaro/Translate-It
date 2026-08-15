function requireString(value, field) {
  if (typeof value !== 'string' || value.length === 0) {
    throw new TypeError(`ConversationAcceptanceHandoff requires ${field}`)
  }
  return value
}

function normalizeParent(parent, index) {
  const parentId = requireString(parent?.parentId, `parents[${index}].parentId`)
  if (!Number.isInteger(parent?.sourceOrder) || parent.sourceOrder < 0) {
    throw new TypeError(`ConversationAcceptanceHandoff requires parents[${index}].sourceOrder`)
  }
  const cleanSource = requireString(parent.cleanSource, `parents[${index}].cleanSource`)
  return Object.freeze({ parentId, sourceOrder: parent.sourceOrder, cleanSource })
}

export class ConversationAcceptanceHandoff {
  constructor({ messageId, sessionId, provider, mode, parents } = {}) {
    this.messageId = requireString(messageId, 'messageId')
    this.sessionId = requireString(sessionId, 'sessionId')
    this.provider = requireString(provider, 'provider')
    this.mode = requireString(mode, 'mode')
    if (!Array.isArray(parents)) throw new TypeError('ConversationAcceptanceHandoff requires parents')

    const normalizedParents = parents.map(normalizeParent)
    const parentIds = new Set()
    const sourceOrders = new Set()
    for (const parent of normalizedParents) {
      if (parentIds.has(parent.parentId)) throw new TypeError(`Duplicate parentId: ${parent.parentId}`)
      if (sourceOrders.has(parent.sourceOrder)) throw new TypeError(`Duplicate sourceOrder: ${parent.sourceOrder}`)
      parentIds.add(parent.parentId)
      sourceOrders.add(parent.sourceOrder)
    }

    this.parents = Object.freeze(normalizedParents)
    Object.freeze(this)
  }
}

export function createConversationAcceptanceHandoff(data) {
  return new ConversationAcceptanceHandoff(data)
}
