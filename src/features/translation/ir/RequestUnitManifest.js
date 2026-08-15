/**
 * Internal execution-owned request identity. It never participates in provider
 * payload construction or crosses execution context boundaries.
 */

export const MappingStrategy = Object.freeze({
  IDENTITY_REQUIRED: 'IDENTITY_REQUIRED',
  POSITIONAL_ONLY: 'POSITIONAL_ONLY',
})
const VALID_MAPPING_STRATEGIES = new Set(Object.values(MappingStrategy))

function getLegacyId(unit) {
  return unit?.i ?? unit?.uid ?? unit?.id ?? null
}

function hasValidMappingStrategy(manifestView) {
  return Boolean(manifestView) && VALID_MAPPING_STRATEGIES.has(manifestView.declaredMappingStrategy)
}

function getInputUnits(input) {
  if (Array.isArray(input)) return input
  if (typeof input !== 'string') return input === undefined || input === null ? [] : [input]

  try {
    const parsed = JSON.parse(input)
    if (Array.isArray(parsed)) return parsed
    if (Array.isArray(parsed?.translations)) return parsed.translations
    if (Array.isArray(parsed?.results)) return parsed.results
  } catch { /* plain text is one unit */ }

  return [input]
}

/**
 * Creates one immutable manifest for operation input. Unit IDs are deterministic
 * internal identifiers scoped by this manifest.
 */
export function createRequestUnitManifest(input) {
  const inputUnits = getInputUnits(input)
  const declaredMappingStrategy = inputUnits.some((unit) => (
    unit && typeof unit === 'object' && (unit.i !== undefined || unit.uid !== undefined || unit.id !== undefined)
  ))
    ? MappingStrategy.IDENTITY_REQUIRED
    : MappingStrategy.POSITIONAL_ONLY
  const usedUnitIds = new Set()

  return Object.freeze({
    units: Object.freeze(inputUnits.map((unit, requestIndex) => {
      const legacyId = unit && typeof unit === 'object' ? getLegacyId(unit) : null
      const preferredUnitId = declaredMappingStrategy === MappingStrategy.IDENTITY_REQUIRED && legacyId !== null && legacyId !== undefined
        ? String(legacyId)
        : `unit-${requestIndex}`
      const unitId = usedUnitIds.has(preferredUnitId) ? `unit-${requestIndex}` : preferredUnitId
      usedUnitIds.add(unitId)
      return Object.freeze({ unitId, requestIndex })
    })),
    declaredMappingStrategy,
  })
}

/**
 * Creates an immutable batch view from manifest-owned unit records.
 */
export function createManifestView(manifest, requestIndexes = manifest?.units.map(({ requestIndex }) => requestIndex)) {
  if (!hasValidMappingStrategy(manifest)) return null

  const sourceUnits = Array.isArray(manifest?.units) ? manifest.units : []
  const unitsByRequestIndex = new Map(sourceUnits.map((unit) => [unit.requestIndex, unit]))
  const units = Array.isArray(requestIndexes)
    ? requestIndexes.map((requestIndex) => unitsByRequestIndex.get(requestIndex)).filter(Boolean)
    : []

  return Object.freeze({
    units: Object.freeze(units),
    declaredMappingStrategy: manifest.declaredMappingStrategy,
  })
}

/**
 * Creates an immutable view from execution-carried manifest unit references.
 */
export function createManifestViewFromUnits(manifestView, units) {
  if (!hasValidMappingStrategy(manifestView) || !Array.isArray(units)) return null

  const requestIndexes = new Set()
  if (!units.every((unit) => {
    if (!unit || !Object.isFrozen(unit) || !Number.isInteger(unit.requestIndex)) return false
    if (requestIndexes.has(unit.requestIndex)) return false
    requestIndexes.add(unit.requestIndex)
    return true
  })) return null

  return Object.freeze({
    units: Object.freeze([...units]),
    declaredMappingStrategy: manifestView.declaredMappingStrategy,
  })
}
