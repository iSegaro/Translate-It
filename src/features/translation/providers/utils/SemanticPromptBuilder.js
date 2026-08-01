/**
 * Semantic Prompt Builder - Generates conservative translation instructions
 * from structured semantic hint metadata.
 *
 * Pure utility: no state, no side effects, no async, no framework dependencies.
 * Consumes the generic semanticHint object produced by any feature layer.
 */

const RECOGNIZED_FINANCIAL_SUBTYPES = new Set([
  'metric-with-delta',
  'summary-row',
  'total-row',
  'negative-value'
])

const FINANCIAL_SUBTYPES = {
  METRIC_WITH_DELTA: 'metric-with-delta'
}

/**
 * Rule definition: evaluates semanticHint, optionally returns an instruction string.
 * @typedef {{ test: (hint: object) => boolean, instruction: string }} SemanticRule
 */

const RULES = [
  {
    test: (hint) => Array.isArray(hint.financialSubtypes) &&
      hint.financialSubtypes.some((s) => RECOGNIZED_FINANCIAL_SUBTYPES.has(s)),
    instruction: [
      'Preserve all numeric values exactly.',
      'Preserve currency symbols.',
      'Preserve percentage signs.',
      'Preserve plus/minus signs.',
      'Preserve parenthesized negative values.'
    ].join(' ')
  },
  {
    test: (hint) => Array.isArray(hint.financialSubtypes) &&
      hint.financialSubtypes.includes(FINANCIAL_SUBTYPES.METRIC_WITH_DELTA),
    instruction: [
      'Preserve change indicators exactly.',
      'Translate only surrounding descriptive text.'
    ].join(' ')
  },
  {
    test: (hint) => hint.hasStatementFragment === true,
    instruction: [
      'This content contains structured financial information.',
      'Translate labels naturally while preserving financial values and structure.'
    ].join(' ')
  },
  {
    test: (hint) => hint.hasDashboardGroup === true,
    instruction: 'Maintain concise and parallel wording across related metrics.'
  }
]

const HEADER = 'Additional translation context:'

/**
 * Builds conservative translation instructions from a semantic hint object.
 *
 * @param {object|null} semanticHint - Structured hint from the translation adapter.
 * @returns {string} Concatenated instructions, or empty string when no rules apply.
 */
export function buildSemanticInstructions(semanticHint) {
  if (!semanticHint || typeof semanticHint !== 'object') {
    return ''
  }

  if (semanticHint.hasSemanticContext !== true) {
    return ''
  }

  const enabledInstructions = []

  for (const rule of RULES) {
    try {
      if (rule.test(semanticHint)) {
        enabledInstructions.push(rule.instruction)
      }
    } catch {
      // Skip malformed rule silently
    }
  }

  if (enabledInstructions.length === 0) {
    return ''
  }

  return HEADER + '\n' + enabledInstructions.join('\n')
}
