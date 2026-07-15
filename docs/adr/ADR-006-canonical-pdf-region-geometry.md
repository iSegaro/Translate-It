# ADR-006: Canonical PDF Region Geometry

## Status

Proposed

---

## Context

The custom PDF Viewer treats document geometry as domain state and rendered geometry as presentation state. Existing PDF-backed navigation already uses pdf.js viewport transforms to move between viewport coordinates and PDF points.

Pointer interaction over a rendered page naturally produces a rectangle in page-local CSS coordinates. That rectangle depends on the current viewport, zoom, rotation, rendered dimensions, and page layout. It is valid for the interaction that produced it, but it is not stable document geometry.

Several PDF features may need to identify a document region independently of its current presentation. A common PDF-domain contract prevents those features from retaining CSS coordinates or defining incompatible coordinate conversions.

This ADR establishes only the canonical region geometry and its ownership boundary. It does not define behavior for any feature that consumes a region.

---

## Problem

Without a canonical region contract, page regions can leak presentation-dependent coordinates into feature logic. That creates several risks:

- A saved or reused region changes meaning when zoom, rotation, or layout changes.
- Each feature may implement its own scale, rotation, or Y-axis conversion.
- Feature-specific names can make general document geometry appear owned by one feature.
- Coordinate conversion can become mixed with pointer state or feature behavior.
- Existing and future region consumers can disagree about rectangle orientation and normalization.

The architecture needs one narrow boundary between temporary interaction geometry and stable PDF-domain geometry.

---

## Decision

PDF user space is the canonical coordinate space for `PdfRegion`.

`PdfRegionSelectionController` owns pointer interaction only. It emits a page number and a page-local CSS rectangle. CSS geometry ends at this interaction boundary.

A single dedicated mapping component owns conversion from a page-local CSS rectangle and the current pdf.js viewport into a canonical `PdfRegion`. The concrete type name is an implementation detail.

The dedicated mapping component uses pdf.js viewport transforms. It maps all four CSS rectangle corners into PDF points, then normalizes those points into an axis-aligned PDF bounding region.

Feature consumers accept `PdfRegion`. They do not accept the originating CSS rectangle as domain input.

`PdfRegion` is a general PDF-domain concept. It must not be named or modeled for one feature.

---

## Canonical Contract

```ts
interface PdfRegion {
  pageNumber: number
  left: number
  top: number
  right: number
  bottom: number
}
```

The contract represents an axis-aligned region in PDF user space for one page.

- `pageNumber` is the one-based document page number.
- `left` is the minimum mapped PDF x-coordinate.
- `right` is the maximum mapped PDF x-coordinate.
- `top` is the maximum mapped PDF y-coordinate.
- `bottom` is the minimum mapped PDF y-coordinate.

This naming preserves physical edge meaning in PDF user space, whose y-axis normally increases upward. Therefore `bottom <= top`; consumers must not reinterpret these values as top-left DOM coordinates.

The contract contains no viewport, zoom, rotation, render scale, DOM position, canvas coordinate, or feature-specific metadata.

---

## Ownership

```text
PdfRegionSelectionController
owns pointer interaction
    ↓

Dedicated region mapping component
owns page-local CSS to PDF mapping
    ↓

PdfRegion
canonical PDF-domain contract
    ↓

Feature consumers
own feature-specific behavior
```

### PdfRegionSelectionController

Owns pointer state and the temporary page-local CSS rectangle. It emits:

- `pageNumber`
- page-local CSS rectangle

It does not own document geometry conversion or feature-specific policy.

### Dedicated Mapping Component

Owns mapping and normalization only. It does not own:

- pointer state
- rendering
- persistence
- annotation state
- UI state
- any feature-specific behavior

### Feature Consumers

Own behavior associated with a canonical region. They must not repeat CSS-to-PDF conversion or treat CSS geometry as reusable document state.

---

## Coordinate Conversion Rules

1. Input CSS geometry is page-local, not viewer-global or document-global.
2. Input is paired with the pdf.js viewport that produced the rendered page geometry.
3. All four CSS rectangle corners are converted with the viewport's PDF-point conversion.
4. Conversion does not reproduce pdf.js zoom, rotation, scale, or Y-axis formulas manually.
5. The four mapped points are normalized into one axis-aligned PDF region.
6. `left` and `right` are the minimum and maximum mapped x-coordinates.
7. `bottom` and `top` are the minimum and maximum mapped y-coordinates.
8. The mapped region contains no reference to the source viewport after conversion.

Mapping all four corners is mandatory. Two-corner conversion relies on orientation assumptions that do not remain valid across all viewport rotations.

---

## Architectural Invariants

1. CSS geometry never crosses the mapping boundary into feature-domain logic.
2. `PdfRegion` never contains viewport scale, zoom, DOM coordinates, canvas pixels, render scale, or feature-specific scale.
3. Exactly one dedicated mapping component owns page-local CSS-to-PDF region conversion.
4. Mapping uses pdf.js viewport transforms.
5. All four CSS rectangle corners are mapped before normalization.
6. Feature-specific executors and services consume `PdfRegion`, not CSS rectangles.
7. `PdfRegion` remains independent from any single feature.
8. Canonical PDF geometry is never persisted using presentation-dependent coordinates.
9. The dedicated mapping component performs mapping only and has no feature state or side effects.
10. Consumers do not infer DOM edge semantics from PDF user-space values.
11. Canonical `PdfRegion` instances are immutable value objects. Consumers derive new `PdfRegion` instances rather than mutating existing ones.

---

## Consequences

### Positive

- Regions remain stable across zoom, viewport, layout, and render-scale changes.
- Rotation and Y-axis handling remain delegated to pdf.js.
- Features share one small document-domain contract.
- Pointer interaction stays isolated from document geometry.
- Conversion behavior can be tested independently from feature behavior.
- Feature names and lifecycles do not contaminate canonical geometry.

### Negative

- Region-producing interactions require an explicit mapping step before feature use.
- Consumers that need presentation coordinates must convert from PDF user space through an appropriate viewport.
- PDF user-space y-axis semantics differ from DOM top-left conventions and require clear documentation.

### Trade-offs

An axis-aligned bounding region is smaller and easier to consume than a four-corner polygon, but it does not preserve an arbitrary quadrilateral. This is acceptable because the source interaction is a rectangle and current viewport rotations preserve a rectangular page region when mapped back to PDF user space.

The contract intentionally stores physical edges rather than origin plus dimensions. This makes normalization explicit and avoids ambiguity about negative width or height.

---

## Alternatives Considered

### Keep CSS Rectangle as Canonical

**Rejected.** CSS geometry changes with zoom, rotation, viewport, layout, and rendered dimensions. It is presentation state, not stable document geometry.

### Let Each Feature Convert CSS Coordinates Independently

**Rejected.** This duplicates conversion ownership and permits inconsistent rotation, scale, and Y-axis handling.

### Put CSS-to-PDF Conversion Inside a Feature Executor

**Rejected.** Conversion is general PDF geometry, not feature behavior. This would force other consumers either to depend on that feature or duplicate its conversion.

### Store Four PDF Corners as the Canonical Contract

**Rejected for the current contract.** Four points preserve more geometry but enlarge every consumer contract without a current need for arbitrary polygons. All four corners are still used during mapping to ensure correct normalization.

### Store a Normalized PDF Bounding Box

**Accepted.** It is the smallest stable contract that identifies a rectangular page region independently of presentation.

### Name the Concept PdfOcrRegion

**Rejected.** The geometry is not owned by one feature. Feature-specific naming would create false ownership and discourage reuse by other legitimate PDF-domain consumers.

---

## Future Compatibility

The canonical contract can be consumed by future PDF features that need stable rectangular regions, including annotations, highlights, comments, redactions, search regions, and contextual analysis.

If a future requirement needs non-axis-aligned polygons, that requirement should introduce a distinct geometry contract. `PdfRegion` should not grow speculative point arrays or presentation metadata.

---

## Relationship to Existing Architecture

- **ADR-003:** Preserves the distinction between viewer-owned presentation state and document-domain state. Page-local CSS geometry belongs to the viewer interaction boundary; `PdfRegion` belongs to the PDF domain.
- **PDF-backed anchors:** Existing anchor utilities already use pdf.js viewport conversion methods rather than reproducing transform formulas. This ADR applies the same ownership principle to rectangular regions.
- **Existing block geometry:** Current logical block bounding boxes use a top-left, natural-page representation derived for layout analysis. `PdfRegion` uses PDF user space and must not be silently treated as that representation. Any legitimate interoperability must cross an explicit geometry conversion boundary rather than relying on matching field names.
- **Feature architecture:** Features consume canonical regions and retain ownership of their own behavior. This ADR introduces no shared feature workflow and no general geometry framework beyond one region contract and one dedicated mapping component.
