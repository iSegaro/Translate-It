// src/services/ValidationService.js
class ValidationService {
  isValidUrl(url) {
    try {
      new URL(url);
      return true;
    } catch {
      return false;
    }
  }

  isNonEmptyString(str) {
    return typeof str === 'string' && str.trim().length > 0;
  }

  isValidEmail(email) {
    // Basic email validation regex
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }

  isPositiveNumber(num) {
    return typeof num === 'number' && num > 0;
  }
}

export default ValidationService;
