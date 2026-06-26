/**
 * TableRegionAnalyzer — diagnostic-only table metadata enrichment.
 *
 * Phase L5a: Adds minimal table metadata structure to regions classified as
 * 'table'. This is infrastructure only — no column/row detection, no behavior
 * changes. Future phases will populate columns, rows, and cells using
 * the lines and blocks parameters.
 *
 * Pipeline position: after classifyLayoutRegions, before buildMetadata.
 */

const REGION_TYPE_TABLE = 'table'

function createEmptyTableMetadata() {
  return Object.freeze({
    columnCount: 0,
    rowCount: 0,
    hasMergedCells: false,
    hasMultiLevelHeaders: false,
    columns: Object.freeze([]),
    rows: Object.freeze([]),
    cells: Object.freeze([])
  })
}

/**
 * Enrich table regions with minimal table metadata.
 *
 * Returns a new frozen array of regions. For regions with type === 'table',
 * adds a `table` field to metadata. Non-table regions are unchanged.
 * Does NOT mutate input regions.
 *
 * @param {Object[]} regions — classified regions from classifyLayoutRegions
 * @param {Object[]} lines — text lines from the page (reserved for L5b+ column detection)
 * @param {Object[]} blocks — logical blocks from the page (reserved for L5b+ cell mapping)
 * @returns {Object[]} frozen array of regions with table metadata
 */
// lines and blocks reserved for L5b+ column/row detection
export function analyzeTableRegions(regions = [], lines = [], blocks = []) { // eslint-disable-line no-unused-vars
  if (!regions.length) return Object.freeze([])

  const enrichedRegions = regions.map((region) => {
    if (region.type !== REGION_TYPE_TABLE) {
      return Object.freeze({
        ...region,
        childRegionIds: Object.freeze([...region.childRegionIds]),
        blockIds: Object.freeze([...region.blockIds]),
        metadata: Object.freeze({ ...region.metadata })
      })
    }

    return Object.freeze({
      ...region,
      childRegionIds: Object.freeze([...region.childRegionIds]),
      blockIds: Object.freeze([...region.blockIds]),
      metadata: Object.freeze({
        ...region.metadata,
        table: createEmptyTableMetadata()
      })
    })
  })

  return Object.freeze(enrichedRegions)
}
