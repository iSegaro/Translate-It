# ADR-010: Defer Per-Application Stylesheet Architecture

- **Status:** Accepted
- **Date:** 2026-07-23

## Context

The project currently uses a single stylesheet entry point:

```
main.scss
```

All standalone applications import it:

- Options
- Popup
- Sidepanel
- PDF Viewer
- Subtitle

Recent architecture audits found that `main.scss` has gradually evolved into a global stylesheet registry containing:

- shared foundation styles
- application-specific styles
- feature-specific styles
- Shadow DOM-specific styles

This violates stylesheet ownership boundaries and allows application-specific CSS to leak into unrelated applications.

One confirmed production issue was traced to this architecture:

- `_options.scss`
- `input[type="text"] { width: 100%; }`

This unintentionally affected the PDF Viewer page-number input and required a component-specific specificity workaround.

Multiple architecture audits concluded that the ideal long-term direction is a per-application stylesheet architecture:

```
shared/foundation
        │
        ├── options.scss
        ├── popup.scss
        ├── sidepanel.scss
        ├── pdf.scss
        └── subtitle.scss
```

However, an additional ROI audit was performed before proceeding.

The ROI audit concluded:

- Only one production bug has been confirmed.
- The highest engineering value comes from eliminating the `_options.scss` leakage.
- A complete stylesheet ownership refactor has significantly lower short-term ROI.
- Current project priorities are focused on PDF Viewer and OCR development.

## Decision

Proceed with only the smallest high-value architectural correction.

Approved work:

- Scope `_options.scss` using:

```scss
:where(body.options-context) {
    ...
}
```

This:

- preserves selector specificity
- eliminates the proven cross-application leak
- carries negligible implementation and regression risk

The following work is intentionally deferred:

- shared.scss
- per-application stylesheets
- removal of `main.scss`
- stylesheet ownership migration
- `_helpers.scss` redesign

These remain valid long-term architectural directions but are not scheduled.

## Rationale

This decision optimizes engineering ROI rather than architectural completeness.

Reasons:

- Proven production issue eliminated.
- Zero specificity increase.
- Negligible implementation cost.
- Negligible regression risk.
- Minimal disruption to active PDF Viewer development.
- Long-term architecture remains documented.

## Consequences

### Positive

- Removes the only confirmed cross-application CSS bug source.
- Prevents future leaks from `_options.scss`.
- Preserves current build pipeline.
- Keeps future architectural direction documented.

### Negative

- `main.scss` remains a mixed-responsibility stylesheet registry.
- Remaining ownership issues continue to exist.
- Future architectural migration may still be desirable.

## Future Direction

Per-application stylesheet ownership remains the preferred long-term architecture.

It should be reconsidered when one or more of the following occurs:

- Additional cross-application CSS bugs appear.
- A new standalone application is introduced.
- Significant stylesheet restructuring is already planned.
- Build architecture is revisited for other reasons.

Until then, no further stylesheet architecture work is planned.