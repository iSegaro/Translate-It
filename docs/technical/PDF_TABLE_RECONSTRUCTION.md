# PDF Table Reconstruction

## Overview

The PDF Table Reconstruction system provides diagnostic table metadata for improved table translation and rendering. It detects table structure (columns, rows, cells) and identifies span candidates for merged cells.

**Architecture Status**: Diagnostic-only (L5a-L5i complete)

**Key Metrics**: ~450 lines of core logic, 70+ tests, pure functions with no side effects.

---

## Table of Contents

- [Pipeline Overview](#pipeline-overview)
- [Column Detection](#column-detection)
- [Row Detection](#row-detection)
- [Cell Mapping](#cell-mapping)
- [Span Candidate Detection](#span-candidate-detection)
- [translatedCells Metadata](#translatedcells-metadata)
- [Span-aware Overlay Width](#span-aware-overlay-width)
- [Known Limitations](#known-limitations)
- [Validation Checklist](#validation-checklist)
- [Pass/Fail Criteria](#passfail-criteria)

---

## Pipeline Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                     PdfPageSession.hydrate()                    │
│  Lines → Blocks → Regions → Classify → Analyze Table → Layout   │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    PageLayoutModel                              │
│  regions[].metadata.table = {                                   │
│    columns, rows, cells,                                        │
│    hasSpanCandidates, hasMergedCells                            │
│  }                                                              │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│              PdfTranslationCoordinator                          │
│  enrichBlocksWithTableMetadata(blocks, pageLayout)              │
│  → blocks with item-level table metadata                        │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│              PdfTranslationAdapter                              │
│  toProviderItems() → preserves cellId, rowIndex, columnIndex    │
│  mapBatchResponse() → translatedCells with metadata arrays      │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│              PdfBlockOverlayItem.vue                             │
│  cellOverlayData → resolvePdfCellOverlayWidth()                 │
│  → span-aware cell width calculation                            │
└─────────────────────────────────────────────────────────────────┘
```

---

## Column Detection

**Module**: `TableRegionAnalyzer.detectTableColumns()`

**Algorithm**:
1. Collect all item x-positions from region lines
2. Cluster x-positions with tolerance (`medianFontSize × 0.75, 6`)
3. Each cluster becomes a column candidate
4. Compute column metadata: `x`, `width`, `align`, `itemCount`, `averageWidth`

**Column schema**:
```js
{
  index: number,        // 0-based visual order
  x: number,            // average x-position
  width: number,        // max item width in column
  align: 'left'|'right', // dominant text alignment
  itemCount: number,    // number of items in column
  averageWidth: number  // average item width
}
```

**Fallback**: Empty columns when <2 clusters, <2 lines, or insufficient x-spread.

---

## Row Detection

**Module**: `TableRegionAnalyzer.detectTableRows()`

**Algorithm**:
1. Filter lines belonging to region (by `regionId` or bounding box)
2. Sort lines by y-position
3. Each line becomes one row (conservative: no grouping)
4. Compute row metadata: `y`, `height`, `lineIndices`, `lineCount`

**Row schema**:
```js
{
  index: number,        // 0-based visual order
  y: number,            // top y-position
  height: number,       // row height
  lineIndices: number[],// original line indices
  lineCount: number     // number of lines in row
}
```

**Fallback**: Empty rows when <2 lines or all same y-position.

---

## Cell Mapping

**Module**: `TableRegionAnalyzer.detectTableCells()`

**Algorithm**:
1. Get region lines with original indices
2. For each row, iterate through line items
3. Map each item to nearest column by x-position
4. Skip items beyond tolerance
5. Mark wide items as span candidates

**Cell schema**:
```js
{
  cellId: string,           // e.g., "p1-r0-r0-c0-i0"
  rowIndex: number,         // row position
  columnIndex: number,      // column position
  text: string,             // cell text
  boundingBox: {x,y,w,h},  // item geometry
  sourceLineIndex: number,  // original line index
  sourceItemIndex: number,  // item index in line
  spanCandidate: boolean,   // width > 1.5× column average
  colSpanCandidate: boolean,// crosses column boundary + missing neighbor
  estimatedColSpan: number  // estimated columns spanned
}
```

**Fallback**: Empty cells when <2 columns or <2 rows.

---

## Span Candidate Detection

**Module**: `TableRegionAnalyzer.detectTableCells()` (enrichment phase)

**Algorithm**:
1. For each cell with `spanCandidate=true`
2. Check if cell right edge crosses next column boundary
3. Check if neighbor cell is missing in crossed columns
4. If both conditions met → `colSpanCandidate=true`
5. Estimate `colSpan` = `ceil(cell width / column width)`

**Activation conditions**:
- `spanCandidate === true` (width > 1.5× column average)
- Cell right edge > next column x
- Missing neighbor in crossed columns

---

## translatedCells Metadata

**Extended format** (backward-compatible):
```js
{
  lineIndex: number,
  cells: string[],

  // optional additive metadata
  cellIds?: string[],
  columnIndices?: number[],
  rowIndices?: number[],
  colSpanCandidates?: boolean[],
  estimatedColSpans?: number[]
}
```

**Rules**:
- Existing consumers continue working
- `cells[index]` aligns with all metadata arrays at same index
- If metadata unavailable, omit arrays

---

## Span-aware Overlay Width

**Module**: `PdfCellSpanLayout.resolvePdfCellOverlayWidth()`

**Algorithm**:
1. Start with existing fallback width
2. Check if `colSpanCandidate=true` AND `estimatedColSpan > 1`
3. Compute `spanWidth = min(fallbackWidth × estimatedColSpan, lineRight - item.x)`
4. Return `max(fallbackWidth, spanWidth)`

**Fallback rules**:
- No metadata → fallback width
- `colSpanCandidate=false` → fallback width
- `estimatedColSpan <= 1` → fallback width
- Invalid geometry → fallback width

---

## Known Limitations

1. **No rowSpan detection** — deferred to future phase
2. **No multi-level header support** — headers treated as separate regions
3. **No visual border/background analysis** — purely positional
4. **Column detection is conservative** — may miss columns in irregular layouts
5. **Row detection is simple** — one line = one row, no grouping
6. **Span detection is heuristic** — may have false positives/negatives

---

## Validation Checklist

### Simple Tables
- [ ] 2×2 table renders unchanged
- [ ] 3×3 table renders unchanged
- [ ] Numeric columns align correctly

### Complex Tables
- [ ] Merged header spans 2+ columns
- [ ] Irregular rows with missing cells
- [ ] Multi-level headers

### Edge Cases
- [ ] RTL tables render correctly
- [ ] Very wide cells don't overflow
- [ ] Very narrow cells display text

### Metadata Fallback
- [ ] Tables without metadata render unchanged
- [ ] Missing metadata arrays don't break rendering
- [ ] Partial metadata handled gracefully

---

## Pass/Fail Criteria

### Pass
- All existing tests pass
- No visual regression on simple tables
- Span rendering works correctly for span candidates
- No performance degradation
- No memory leaks

### Fail
- Any existing test fails
- Visual regression on simple tables
- Span rendering broken for span candidates
- Performance degradation > 10%
- Memory leak detected

---

## Dev-only Diagnostics

Span diagnostics are exposed through the overlay render plan in `pdfOverlayDiagnostics.js`.

When span candidates exist, the render plan includes a `spanDiagnostics` array:

```js
spanDiagnostics?: [
  {
    lineIndex: number,
    cellIndex: number,
    estimatedColSpan: number,
    cellId: string | null
  }
]
```

**Gating rules**:
- Only present when span candidates exist
- Only in development mode (`import.meta.env.DEV`)
- Production rendering behavior is unaffected
- Diagnostics are additive metadata only
