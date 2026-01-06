// Validation utilities for options page

export class OptionsValidator {
  constructor() {
    this.errors = {};
  }

  // Clear all errors
  clearErrors() {
    this.errors = {};
  }

  // Add error for a field
  addError(field, message) {
    if (!this.errors[field]) {
      this.errors[field] = [];
    }
    this.errors[field].push(message);
  }

  // Check if there are any errors
  hasErrors() {
    return Object.keys(this.errors).length > 0;
  }

  // Get errors for a specific field
  getFieldErrors(field) {
    return this.errors[field] || [];
  }

  // Get first error for a field
  getFirstError(field) {
    const fieldErrors = this.getFieldErrors(field);
    return fieldErrors.length > 0 ? fieldErrors[0] : null;
  }

  // Get all errors as flat array
  getAllErrors() {
    const allErrors = [];
    Object.values(this.errors).forEach((fieldErrors) => {
      allErrors.push(...fieldErrors);
    });
    return allErrors;
  }

  // Validate language settings
  async validateLanguages(sourceLanguage, targetLanguage) {
    this.clearErrors();

    // Check for empty languages
    if (!sourceLanguage || !sourceLanguage.trim()) {
      this.addError("sourceLanguage", "validation_source_language_empty");
    }

    if (!targetLanguage || !targetLanguage.trim()) {
      this.addError("targetLanguage", "validation_target_language_empty");
    }

    // Check if languages are the same (only if both are provided)
    if (
      sourceLanguage &&
      targetLanguage &&
      sourceLanguage.trim().toLowerCase() ===
        targetLanguage.trim().toLowerCase()
    ) {
      this.addError("sourceLanguage", "validation_same_languages");
      this.addError("targetLanguage", "validation_same_languages");
    }

    return !this.hasErrors();
  }

  // Validate API key
  async validateApiKey(apiKey, providerName) {
    if (!apiKey || !apiKey.trim()) {
      this.addError("apiKey", {
        key: "validation_api_key_empty",
        params: { provider: providerName }
      });
      return false;
    }

    // Basic API key format validation
    const trimmedKey = apiKey.trim();
    if (trimmedKey.length < 10) {
      this.addError("apiKey", "validation_api_key_too_short");
      return false;
    }

    return true;
  }

  // Validate prompt template
  async validatePromptTemplate(template) {
    if (!template || !template.trim()) {
      this.addError("promptTemplate", "validation_prompt_template_empty");
      return false;
    }

    // Check for required placeholders
    const trimmedTemplate = template.trim();
    const requiredPlaceholders = ["$_{SOURCE}", "$_{TARGET}"];
    const missingPlaceholders = [];

    requiredPlaceholders.forEach((placeholder) => {
      if (!trimmedTemplate.includes(placeholder)) {
        missingPlaceholders.push(placeholder);
      }
    });

    if (missingPlaceholders.length > 0) {
      this.addError("promptTemplate", {
        key: "validation_prompt_template_missing_placeholders",
        params: { placeholders: missingPlaceholders.join(", ") }
      });
      return false;
    }

    return true;
  }

  // Validate excluded sites
  async validateExcludedSites(sites) {
    if (!sites) return true; // Optional field

    const siteList = Array.isArray(sites)
      ? sites
      : sites
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean);
    const invalidSites = [];

    siteList.forEach((site) => {
      // Basic domain validation
      if (!this.isValidDomain(site)) {
        invalidSites.push(site);
      }
    });

    if (invalidSites.length > 0) {
      this.addError("excludedSites", {
        key: "validation_invalid_domains",
        params: { domains: invalidSites.join(", ") }
      });
      return false;
    }

    return true;
  }

  // Validate import file
  async validateImportFile(file) {
    if (!file) {
      this.addError("importFile", "validation_import_file_required");
      return false;
    }

    if (!file.name.endsWith(".json")) {
      this.addError("importFile", "validation_import_file_json_only");
      return false;
    }

    if (file.size > 5 * 1024 * 1024) {
      // 5MB limit
      this.addError("importFile", "validation_import_file_too_large");
      return false;
    }

    return true;
  }

  // Helper method to validate domain names
  isValidDomain(domain) {
    if (!domain || typeof domain !== "string") return false;

    // Remove protocol if present
    domain = domain.replace(/^https?:\/\//, "");

    // Remove path if present
    domain = domain.split("/")[0];

    // Basic domain regex
    const domainRegex =
      /^[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;

    return domainRegex.test(domain) && domain.length <= 253;
  }
}

// Validation composable for Vue components
export function useValidation() {
  const validator = new OptionsValidator();

  // Helper to translate error object or string to message
  // This should be called from Vue components with access to i18n
  const translateError = (error, t) => {
    if (!error) return null;
    if (typeof error === 'string') {
      // String is a translation key
      return t(error);
    }
    if (error.key && error.params) {
      return t(error.key, error.params);
    }
    if (error.key) {
      return t(error.key);
    }
    return error.message || error;
  };

  // Get first translated error for a field
  const getFirstErrorTranslated = (field, t) => {
    const error = validator.getFirstError(field);
    return error ? translateError(error, t) : null;
  };

  // Get all translated errors for a field
  const getFieldErrorsTranslated = (field, t) => {
    const errors = validator.getFieldErrors(field);
    return errors.map(error => translateError(error, t));
  };

  // Get all translated errors as flat array
  const getAllErrorsTranslated = (t) => {
    const errors = validator.getAllErrors();
    return errors.map(error => translateError(error, t));
  };

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
    getAllErrors: validator.getAllErrors.bind(validator),
    translateError,
    getFirstErrorTranslated,
    getFieldErrorsTranslated,
    getAllErrorsTranslated,
  };
}

// Field validation rules
export const validationRules = {
  required: {
    key: "validation_field_required",
    test: (value) => Boolean(value && value.toString().trim()),
  },

  minLength: (min) => ({
    key: "validation_min_length",
    params: { min },
    test: (value) => !value || value.toString().length >= min,
  }),

  maxLength: (max) => ({
    key: "validation_max_length",
    params: { max },
    test: (value) => !value || value.toString().length <= max,
  }),

  email: {
    key: "validation_invalid_email",
    test: (value) => !value || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value),
  },

  url: {
    key: "validation_invalid_url",
    test: (value) => !value || /^https?:\/\/.+$/.test(value),
  },

  apiKey: {
    key: "validation_api_key_invalid",
    test: (value) => !value || (value.trim().length >= 10 && !/\s/.test(value)),
  },
};

// Validate a single field with multiple rules
export async function validateField(value, rules) {
  const errors = [];

  for (const rule of rules) {
    if (!rule.test(value)) {
      // Support both old format (message string) and new format (key + params)
      if (typeof rule === 'string' || (typeof rule === 'object' && rule.message)) {
        // Legacy format - return as is
        errors.push(typeof rule === 'string' ? rule : rule.message);
      } else {
        // New format - return object with key and optional params
        errors.push({
          key: rule.key,
          params: rule.params || {}
        });
      }
    }
  }

  return errors;
}

export default {
  OptionsValidator,
  useValidation,
  validationRules,
  validateField,
};
