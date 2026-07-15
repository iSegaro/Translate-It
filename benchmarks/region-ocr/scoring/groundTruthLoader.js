function error(code, path, message, details) {
  return details === undefined
    ? { code, path, message }
    : { code, path, message, details }
}

function sortErrors(errors) {
  return errors.sort((left, right) => (
    left.path.localeCompare(right.path) ||
    left.code.localeCompare(right.code) ||
    left.message.localeCompare(right.message)
  ))
}

function deepFreeze(value, seen = new WeakSet()) {
  if (!value || typeof value !== 'object' || seen.has(value)) return value
  seen.add(value)
  Object.values(value).forEach((child) => deepFreeze(child, seen))
  return Object.freeze(value)
}

function keyFor(documentId, regionId) {
  return `${documentId}\u0000${regionId}`
}

function stableCause(cause) {
  if (cause && typeof cause === 'object') {
    return {
      name: typeof cause.name === 'string' ? cause.name : 'Error',
      message: typeof cause.message === 'string' ? cause.message : String(cause)
    }
  }
  return { name: 'Error', message: String(cause) }
}

export class GroundTruthValidationError extends Error {
  constructor(errors) {
    super('Ground truth validation failed')
    this.name = 'GroundTruthValidationError'
    this.errors = errors
  }
}

export async function loadGroundTruthCases({ corpus, loadText }) {
  if (typeof loadText !== 'function') throw new TypeError('loadGroundTruthCases requires loadText callback')
  const manifest = corpus?.manifest || corpus
  const errors = []
  const cases = []

  for (const [documentIndex, document] of (manifest?.documents || []).entries()) {
    for (const [regionIndex, region] of (document.regions || []).entries()) {
      const path = `$.documents[${documentIndex}].regions[${regionIndex}].groundTruth`
      if (!region.groundTruth?.path) {
        errors.push(error('missing_ground_truth', path, 'Region requires a ground-truth reference'))
        continue
      }

      let text
      try {
        text = await loadText({ document, region, groundTruth: region.groundTruth })
      } catch (cause) {
        errors.push(error('ground_truth_load_failed', path, 'Ground-truth text could not be loaded', {
          documentId: document.id,
          regionId: region.id,
          cause: stableCause(cause)
        }))
        continue
      }
      if (typeof text !== 'string') {
        errors.push(error('invalid_ground_truth_text', path, 'Ground-truth loader must return text'))
        continue
      }

      const { regions, ...documentMetadata } = document
      void regions

      cases.push({
        documentId: document.id,
        regionId: region.id,
        text,
        language: region.language || null,
        direction: region.direction || null,
        metadata: {
          document: documentMetadata,
          region: { ...region, groundTruth: { ...region.groundTruth } }
        }
      })
    }
  }

  if (errors.length > 0) throw new GroundTruthValidationError(sortErrors(errors))
  return deepFreeze(cases)
}

export function createGroundTruthLookup(cases) {
  if (!Array.isArray(cases)) throw new TypeError('createGroundTruthLookup requires an array')
  const errors = []
  const byKey = new Map()

  cases.forEach((item, index) => {
    if (!item?.documentId || !item?.regionId) {
      errors.push(error('invalid_ground_truth_identity', `$[${index}]`, 'Ground-truth case requires documentId and regionId'))
      return
    }
    const key = keyFor(item.documentId, item.regionId)
    if (byKey.has(key)) {
      errors.push(error('duplicate_ground_truth_key', `$[${index}]`, 'Ground-truth lookup key must be unique', {
        firstPath: byKey.get(key).path
      }))
      return
    }
    byKey.set(key, { value: item, path: `$[${index}]` })
  })

  if (errors.length > 0) throw new GroundTruthValidationError(sortErrors(errors))

  return Object.freeze({
    get(documentId, regionId) {
      return byKey.get(keyFor(documentId, regionId))?.value || null
    },
    require(documentId, regionId) {
      const value = byKey.get(keyFor(documentId, regionId))?.value || null
      if (!value) {
        throw new GroundTruthValidationError([error('missing_ground_truth', '$.caseRef', 'Ground truth is missing', {
          documentId,
          regionId
        })])
      }
      return value
    },
    entries: deepFreeze([...byKey.values()].map(({ value }) => value))
  })
}
