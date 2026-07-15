import { IDENTIFIER_PATTERN } from '../schemas/index.js'

export const RegionExecutionStatus = Object.freeze({
  RECOGNIZED: 'recognized',
  FAILED: 'failed',
  CANCELLED: 'cancelled',
  SKIPPED: 'skipped'
})

export const REGION_EXECUTION_STATUSES = Object.freeze(Object.values(RegionExecutionStatus))

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

function isIdentifier(value) {
  return typeof value === 'string' && new RegExp(IDENTIFIER_PATTERN).test(value)
}

function validateRequiredString(value, field, errors) {
  if (!Object.hasOwn(value, field)) {
    errors.push(error('missing_required_field', `$.${field}`, 'Required field is missing'))
    return
  }
  if (!isIdentifier(value[field])) {
    errors.push(error('invalid_identifier', `$.${field}`, 'Value must be a valid benchmark identifier'))
  }
}

function deepFreeze(value, seen = new WeakSet()) {
  if (!value || typeof value !== 'object' || seen.has(value)) return value
  seen.add(value)
  Object.values(value).forEach((child) => deepFreeze(child, seen))
  return Object.freeze(value)
}

export class RegionExecutionResultValidationError extends Error {
  constructor(errors) {
    super('Region execution result validation failed')
    this.name = 'RegionExecutionResultValidationError'
    this.errors = errors
  }
}

export function validateRegionExecutionResult(result) {
  const errors = []
  if (!result || typeof result !== 'object' || Array.isArray(result)) {
    errors.push(error('invalid_execution_result', '$', 'Execution result must be an object'))
    return { valid: false, errors, value: result }
  }

  validateRequiredString(result, 'documentId', errors)
  validateRequiredString(result, 'regionId', errors)

  if (!Object.hasOwn(result, 'status')) {
    errors.push(error('missing_required_field', '$.status', 'Required field is missing'))
  } else if (!REGION_EXECUTION_STATUSES.includes(result.status)) {
    errors.push(error('invalid_status', '$.status', 'Status is not supported', {
      allowed: [...REGION_EXECUTION_STATUSES]
    }))
  }

  if (!Object.hasOwn(result, 'payload')) {
    errors.push(error('missing_required_field', '$.payload', 'Required field is missing'))
  }

  return { valid: errors.length === 0, errors: sortErrors(errors), value: result }
}

export function createRegionExecutionResult(input = {}) {
  return { ...input }
}

export function finalizeRegionExecutionResult(input) {
  const result = createRegionExecutionResult(input)
  const validation = validateRegionExecutionResult(result)
  if (!validation.valid) throw new RegionExecutionResultValidationError(validation.errors)
  return deepFreeze(result)
}
