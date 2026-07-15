import { TIMESTAMP_PATTERN } from './artifactModels.js'

function error(code, path, message, details) {
  return details === undefined
    ? { code, path, message }
    : { code, path, message, details }
}

function valueType(value) {
  if (value === null) return 'null'
  if (Array.isArray(value)) return 'array'
  if (Number.isInteger(value)) return 'integer'
  return typeof value
}

function acceptsType(schemaType, actualType) {
  const allowed = Array.isArray(schemaType) ? schemaType : [schemaType]
  return allowed.some((expected) => (
    expected === actualType || (expected === 'number' && actualType === 'integer')
  ))
}

function getPathValue(value, path) {
  return path.split('.').reduce((current, key) => current?.[key], value)
}

function uniqueKey(value, uniqueBy) {
  const paths = Array.isArray(uniqueBy) ? uniqueBy : [uniqueBy]
  return JSON.stringify(paths.map((path) => getPathValue(value, path)))
}

function isValidTimestamp(value) {
  const match = new RegExp(TIMESTAMP_PATTERN).exec(value)
  if (!match || !Number.isFinite(Date.parse(value))) return false

  const [date, time] = value.split('T')
  const [year, month, day] = date.split('-').map(Number)
  const [hour, minute, second] = time.slice(0, 8).split(':').map(Number)
  if (month < 1 || month > 12 || hour > 23 || minute > 59 || second > 59) return false

  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate()
  return day >= 1 && day <= daysInMonth
}

function isSafeRelativePath(value) {
  if (!value || value.startsWith('/') || value.startsWith('\\')) return false
  if (/^[a-zA-Z]:[\\/]/.test(value) || value.includes('\\')) return false
  return !value.split('/').some((segment) => segment === '..' || segment === '')
}

export function validateSchemaValue(value, schema, path, errors) {
  const actualType = valueType(value)
  if (schema.type && !acceptsType(schema.type, actualType)) {
    errors.push(error('invalid_type', path, `Expected ${[].concat(schema.type).join(' or ')}`, {
      actual: actualType
    }))
    return
  }

  if ('const' in schema && value !== schema.const) {
    errors.push(error('invalid_const', path, `Expected ${JSON.stringify(schema.const)}`))
  }

  if (schema.enum && !schema.enum.includes(value)) {
    errors.push(error('invalid_enum', path, 'Value is not in the allowed enum', {
      allowed: [...schema.enum]
    }))
  }

  if (typeof value === 'string') {
    if (schema.minLength !== undefined && value.length < schema.minLength) {
      errors.push(error('string_too_short', path, `Minimum length is ${schema.minLength}`))
    }
    if (schema.pattern && !new RegExp(schema.pattern).test(value)) {
      errors.push(error('invalid_pattern', path, 'Value does not match required pattern'))
    }
    if (schema.format === 'timestamp' && !isValidTimestamp(value)) {
      errors.push(error('invalid_timestamp', path, 'Value must be a valid UTC RFC 3339 timestamp'))
    }
    if (schema.format === 'relative-path' && !isSafeRelativePath(value)) {
      errors.push(error('invalid_relative_path', path, 'Value must be a safe relative path'))
    }
  }

  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      errors.push(error('non_finite_number', path, 'Value must be finite'))
    } else if (schema.minimum !== undefined && value < schema.minimum) {
      errors.push(error('number_below_minimum', path, `Minimum value is ${schema.minimum}`))
    }
  }

  if (Array.isArray(value)) {
    if (schema.minItems !== undefined && value.length < schema.minItems) {
      errors.push(error('array_too_short', path, `Minimum item count is ${schema.minItems}`))
    }
    if (schema.uniqueItems) {
      const seen = new Set()
      value.forEach((item, index) => {
        const key = JSON.stringify(item)
        if (seen.has(key)) {
          errors.push(error('duplicate_value', `${path}[${index}]`, 'Array values must be unique'))
        }
        seen.add(key)
      })
    }
    if (schema.uniqueBy) {
      const seen = new Set()
      value.forEach((item, index) => {
        const key = uniqueKey(item, schema.uniqueBy)
        if (seen.has(key)) {
          errors.push(error('duplicate_identifier', `${path}[${index}]`, 'Identifier must be unique', {
            fields: [].concat(schema.uniqueBy)
          }))
        }
        seen.add(key)
      })
    }
    if (schema.items) {
      value.forEach((item, index) => validateSchemaValue(item, schema.items, `${path}[${index}]`, errors))
    }
  }

  if (value && actualType === 'object') {
    const keys = Object.keys(value)
    if (schema.minProperties !== undefined && keys.length < schema.minProperties) {
      errors.push(error('object_too_small', path, `Minimum property count is ${schema.minProperties}`))
    }
    for (const required of schema.required || []) {
      if (!Object.hasOwn(value, required)) {
        errors.push(error('missing_required_field', `${path}.${required}`, 'Required field is missing'))
      }
    }
    for (const [key, child] of Object.entries(schema.properties || {})) {
      if (Object.hasOwn(value, key)) {
        validateSchemaValue(value[key], child, `${path}.${key}`, errors)
      }
    }
    if (schema.additionalProperties && typeof schema.additionalProperties === 'object') {
      for (const key of keys) {
        if (!Object.hasOwn(schema.properties || {}, key)) {
          validateSchemaValue(value[key], schema.additionalProperties, `${path}.${key}`, errors)
        }
      }
    }
  }
}
