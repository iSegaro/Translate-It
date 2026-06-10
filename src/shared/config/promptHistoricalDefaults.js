/**
 * Historical Prompt Defaults Registry
 * 
 * ============================================================================
 * WHY HISTORICAL DEFAULTS EXIST:
 * When editable prompt templates are updated in Translate-It, we need a way
 * to upgrade users who are using the default templates to the latest version,
 * while strictly preserving user-customized prompts.
 * 
 * HOW SAFE PROMPT MIGRATION WORKS:
 * 1. Missing Prompt: If a prompt key is missing in user settings, we add the current CONFIG default.
 * 2. Empty Prompt: If a prompt is empty or blank, we restore the current CONFIG default.
 * 3. Exact Current Default Match: If the stored prompt exactly matches the current CONFIG default,
 *    we leave it unchanged.
 * 4. Historical Default Match: If the stored prompt matches any of the legacy defaults registered
 *    in this file, it means the user never customized it. We safely upgrade it to the latest CONFIG default.
 * 5. Customized Prompt: If it does not match current or legacy defaults, we preserve the user's edits.
 * 
 * WHEN DEVELOPERS MUST ADD ENTRIES:
 * Whenever you modify a default prompt in `src/shared/config/config.js` (e.g., changing CONFIG.PROMPT_TEMPLATE):
 * 1. Copy the EXACT previous multi-line default string.
 * 2. Add it to this registry under the corresponding prompt key as a new object:
 *    {
 *      version: 'vX.Y.Z',      // The version range in which this default was active
 *      reason: 'Description',  // Why the default was changed (e.g. 'Added formatting support')
 *      value: `...`            // The exact legacy default template string
 *    }
 * 3. Users may upgrade across multiple versions. Keep old legacy defaults in this file
 *    indefinitely to ensure all updating users can be safely migrated.
 * ============================================================================
 */

export const HISTORICAL_PROMPT_DEFAULTS = {
  PROMPT_TEMPLATE: [
    // Example:
    // {
    //   version: 'v1.17.0',
    //   reason: 'Initial general prompt template',
    //   value: '...'
    // }
  ],
  PROMPT_TEMPLATE_AUTO: [],
  PROMPT_BASE_FIELD: [],
  PROMPT_BASE_FIELD_AUTO: [],
  PROMPT_BASE_POPUP_TRANSLATE: [],
  PROMPT_BASE_DICTIONARY: [],
  PROMPT_SUBTITLE_USER: []
};
