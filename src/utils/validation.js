// Validation utilities for options page

export class OptionsValidator {
  constructor() {
    this.errors = {}
  }

  // Clear all errors
  clearErrors() {
    this.errors = {}
  }

  // Add error for a field
  addError(field, message) {
    if (!this.errors[field]) {
      this.errors[field] = []
    }
    this.errors[field].push(message)
  }

  // Check if there are any errors
  hasErrors() {
    return Object.keys(this.errors).length > 0
  }

  // Get errors for a specific field
  getFieldErrors(field) {
    return this.errors[field] || []
  }

  // Get first error for a field
  getFirstError(field) {
    const fieldErrors = this.getFieldErrors(field)
    return fieldErrors.length > 0 ? fieldErrors[0] : null
  }

  // Get all errors as flat array
  getAllErrors() {
    const allErrors = []
    Object.values(this.errors).forEach(fieldErrors => {
      allErrors.push(...fieldErrors)
    })
    return allErrors
  }

  // Validate language settings
  async validateLanguages(sourceLanguage, targetLanguage) {
    this.clearErrors()

    // Check for empty languages
    if (!sourceLanguage || !sourceLanguage.trim()) {
      this.addError('sourceLanguage', 'Source language cannot be empty.')
    }

    if (!targetLanguage || !targetLanguage.trim()) {
      this.addError('targetLanguage', 'Target language cannot be empty.')
    }

    // Check if languages are the same (only if both are provided)
    if (sourceLanguage && targetLanguage && 
        sourceLanguage.trim().toLowerCase() === targetLanguage.trim().toLowerCase()) {
      this.addError('sourceLanguage', 'Source and target languages cannot be the same.')
      this.addError('targetLanguage', 'Source and target languages cannot be the same.')
    }

    return !this.hasErrors()
  }

  // Validate API key
  async validateApiKey(apiKey, providerName) {
    if (!apiKey || !apiKey.trim()) {
      this.addError('apiKey', `API key for ${providerName} cannot be empty.`)
      return false
    }

    // Basic API key format validation
    const trimmedKey = apiKey.trim()
    if (trimmedKey.length < 10) {
      this.addError('apiKey', 'API key appears to be too short.')
      return false
    }

    return true
  }

  // Validate prompt template
  async validatePromptTemplate(template) {
    if (!template || !template.trim()) {
      this.addError('promptTemplate', 'Prompt template cannot be empty.')
      return false
    }

    // Check for required placeholders
    const trimmedTemplate = template.trim()
    const requiredPlaceholders = ['$_{TEXT}']
    const missingPlaceholders = []

    requiredPlaceholders.forEach(placeholder => {
      if (!trimmedTemplate.includes(placeholder)) {
        missingPlaceholders.push(placeholder)
      }
    })

    if (missingPlaceholders.length > 0) {
      this.addError('promptTemplate', `Prompt template must include: ${missingPlaceholders.join(', ')}`)
      return false
    }

    return true
  }

  // Validate excluded sites
  async validateExcludedSites(sites) {
    if (!sites) return true // Optional field

    const siteList = Array.isArray(sites) ? sites : sites.split(',').map(s => s.trim()).filter(Boolean)
    const invalidSites = []

    siteList.forEach(site => {
      // Basic domain validation
      if (!this.isValidDomain(site)) {
        invalidSites.push(site)
      }
    })

    if (invalidSites.length > 0) {
      this.addError('excludedSites', `Invalid domain(s): ${invalidSites.join(', ')}`)
      return false
    }

    return true
  }

  // Validate import file
  async validateImportFile(file) {
    if (!file) {
      this.addError('importFile', 'Please select a file to import.')
      return false
    }

    if (!file.name.endsWith('.json')) {
      this.addError('importFile', 'Only JSON files are supported.')
      return false
    }

    if (file.size > 5 * 1024 * 1024) { // 5MB limit
      this.addError('importFile', 'File size must be less than 5MB.')
      return false
    }

    return true
  }

  // Helper method to validate domain names
  isValidDomain(domain) {
    if (!domain || typeof domain !== 'string') return false
    
    // Remove protocol if present
    domain = domain.replace(/^https?:\/\//, '')
    
    // Remove path if present
    domain = domain.split('/')[0]
    
    // Basic domain regex
    const domainRegex = /^[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/
    
    return domainRegex.test(domain) && domain.length <= 253
  }
}

// Validation composable for Vue components
export function useValidation() {
  const validator = new OptionsValidator()

  return {
    validator,
    validateLanguages: validator.validateLanguages.bind(validator),
    validateApiKey: validator.validateApiKey.bind(validator),
    validatePromptTemplate: validator.validatePromptTemplate.bind(validator),
    validateExcludedSites: validator.validateExcludedSites.bind(validator),
    validateImportFile: validator.validateImportFile.bind(validator),
    clearErrors: validator.clearErrors.bind(validator),
    hasErrors: validator.hasErrors.bind(validator),
    getFieldErrors: validator.getFieldErrors.bind(validator),
    getFirstError: validator.getFirstError.bind(validator),
    getAllErrors: validator.getAllErrors.bind(validator)
  }
}

// Field validation rules
export const validationRules = {
  required: {
    test: (value) => Boolean(value && value.toString().trim()),
    message: 'This field is required'
  },
  
  minLength: (min) => ({
    test: (value) => !value || value.toString().length >= min,
    message: `Must be at least ${min} characters`
  }),
  
  maxLength: (max) => ({
    test: (value) => !value || value.toString().length <= max,
    message: `Must be no more than ${max} characters`
  }),
  
  email: {
    test: (value) => !value || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value),
    message: 'Must be a valid email address'
  },
  
  url: {
    test: (value) => !value || /^https?:\/\/.+$/.test(value),
    message: 'Must be a valid URL'
  },
  
  apiKey: {
    test: (value) => !value || (value.trim().length >= 10 && !/\s/.test(value)),
    message: 'API key must be at least 10 characters with no spaces'
  }
}

// Validate a single field with multiple rules
export async function validateField(value, rules, fieldName = 'Field') {
  const errors = []
  
  for (const rule of rules) {
    if (!rule.test(value)) {
      errors.push(rule.message)
    }
  }
  
  return errors
}

export default {
  OptionsValidator,
  useValidation,
  validationRules,
  validateField
}