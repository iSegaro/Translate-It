## ADDED Requirements

### Requirement: Fourth viewer mode "Translated PDF View"

The system SHALL support a fourth viewer mode called `translated-pdf` in addition to the existing `original`, `bilingual`, and `translated` modes. The mode SHALL be selectable via the toolbar mode button group.

#### Scenario: Mode appears in toolbar

- **WHEN** a PDF document is loaded
- **THEN** the toolbar SHALL display four mode buttons: "Original", "Bilingual", "Translated", "Translated PDF View"

#### Scenario: Mode is selectable

- **WHEN** the user clicks the "Translated PDF View" button
- **THEN** the viewer mode SHALL switch to `translated-pdf` and the overlay rendering SHALL activate

### Requirement: Overlay mode shows single pane with canvas + overlay

The system SHALL render the "Translated PDF View" mode as a single pane containing the original PDF canvas with the overlay layer on top. No separate translated text panel SHALL be displayed.

#### Scenario: Overlay mode layout

- **WHEN** the viewer mode is `translated-pdf`
- **THEN** the layout SHALL show one pane (not two) containing the original PDF viewer with overlay layer

#### Scenario: Overlay mode does not show translated pane

- **WHEN** the viewer mode is `translated-pdf`
- **THEN** the `PdfTranslatedPane` component SHALL NOT be rendered

### Requirement: Existing modes remain unchanged

The system SHALL preserve the existing `original`, `bilingual`, and `translated` modes with their current behavior. The new `translated-pdf` mode SHALL NOT affect rendering in any existing mode.

#### Scenario: Bilingual mode unchanged

- **WHEN** the viewer mode is `bilingual`
- **THEN** the layout SHALL show two panes: original PDF viewer and translated text panel (existing behavior)

#### Scenario: Translated mode unchanged

- **WHEN** the viewer mode is `translated`
- **THEN** the layout SHALL show one pane containing only the translated text panel, no PDF canvas (existing behavior)

#### Scenario: Original mode unchanged

- **WHEN** the viewer mode is `original`
- **THEN** the layout SHALL show one pane containing only the PDF viewer, no translation overlay (existing behavior)

### Requirement: Mode persists across translation triggers

The system SHALL maintain the selected viewer mode across translation operations. Switching modes SHALL NOT reset translation state or trigger re-translation.

#### Scenario: Translate in overlay mode

- **WHEN** the user is in `translated-pdf` mode and clicks "Translate Visible Pages"
- **THEN** translations SHALL be performed and overlay SHALL render translated blocks

#### Scenario: Switch mode after translation

- **WHEN** the user switches from `translated-pdf` to `bilingual` after translations are complete
- **THEN** the bilingual mode SHALL display the same translated content in the side panel

### Requirement: Mode switching preserves translation state

The system SHALL preserve all translation state when switching between modes. Translated blocks, loading states, and errors SHALL persist across mode changes.

#### Scenario: Switch back to overlay mode

- **WHEN** the user switches from `translated-pdf` to `bilingual` and back to `translated-pdf`
- **THEN** all previously translated blocks SHALL still be visible in the overlay

### Requirement: Export buttons available in all modes with translations

The system SHALL display export buttons (TXT, Markdown, HTML) in the toolbar regardless of viewer mode, when translations exist.

#### Scenario: Export in bilingual mode

- **WHEN** the viewer mode is `bilingual` and translations exist
- **THEN** export buttons SHALL be visible and functional
