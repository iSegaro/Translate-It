// src/services/ValidationService.js
class ValidationService {
  isValidUrl(url) {
    try {
      new URL(url);
      return true;
    } catch (e) {
      return false;
    }
  }

  isNonEmptyString(str) {
    return typeof str === 'string' && str.trim().length > 0;
  }

  isValidEmail(email) {
    // Basic email validation regex
    const emailRegex = /^[^
@]+@[^
@]+\.[^
@]+$/;
    return emailRegex.test(email);
  }

  isPositiveNumber(num) {
    return typeof num === 'number' && num > 0;
  }
}

export default ValidationService;
