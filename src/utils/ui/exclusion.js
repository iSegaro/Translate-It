// src/utils/exclusion.js

// لیست سایت‌هایی که به صورت پیش‌فرض و همیشگی غیرفعال هستند
export const DEFAULT_EXCLUDED_SITES = [
  // "accounts.google.com",
  // "chrome.google.com/webstore",
  // "addons.mozilla.org",
  // "meet.google.com",
  // "acrobat.adobe.com",
  // "developer.chrome.com",
  // "docs.google.com",
  // "docs.microsoft.com",
  // "developers.google.com",
  // "ai.google.dev"
  // "t24.theorie24.de"
];

export const DEFAULT_EXCLUDED_TEXT_FIELDS_ICON = [
  "microsoftonline.com",
  "docs.microsoft.com",
  "cloud.microsoft",
  "word.cloud.microsoft",
  "excel.cloud.microsoft",
  "powerpoint.cloud.microsoft",
  "microsoft365.com",
  "word.office365.com",
  "excel.office365.com",
  "powerpoint.office365.com",
  "office.com",
  "live.com",
  "outlook.office.com",
  "word.office.com",
  "excel.office.com",
  "powerpoint.office.com",
  "excel.live.com",
  "powerpoint.live.com",
  "onedrive.live.com",
  "sharepoint.com",
  "acrobat.adobe.com",
  "docs.google.com/document",
  "docs.google.com/spreadsheets",
  "docs.google.com/presentation",
  "docs.google.com/forms",
  "docs.google.com/drawings",
  "docs.google.com/sites",
  "canva.com/design",
  "dochub.com",
  "edit-document.pdffiller.com",
  "zoho.com/writer",
  "zoho.com/sheet",
  "zoho.com/show",
];

/**
 * بررسی می‌کند که آیا یک URL در لیست پیش‌فرض مستثنی
 * برای قابلیت نمایش آیکون ترجمه در فیلد متنی است یا خیر
 * @param {string} url - آدرس صفحه‌ای که باید بررسی شود
 * @param {string[]} userExcludedSites - لیست سایت‌های مستثنی شده توسط کاربر (اختیاری)
 * @returns {boolean} - اگر URL باید مستثنی شود، true برمی‌گرداند
 */
export function isUrlExcluded_TEXT_FIELDS_ICON(url, userExcludedSites = []) {
  if (!url) return true; // URL نامعتبر را همیشه مستثنی کن

  // ۱. بررسی در لیست پیش‌فرض
  const isDefaultExcluded = DEFAULT_EXCLUDED_TEXT_FIELDS_ICON.some((site) =>
    url.includes(site),
  );
  if (isDefaultExcluded) {
    return true;
  }

  // ۲. بررسی در لیست کاربر
  const isUserExcluded = userExcludedSites.some((site) => url.includes(site));
  if (isUserExcluded) {
    return true;
  }

  return false;
}

/**
 * بررسی می‌کند که آیا یک URL در لیست پیش‌فرض یا لیست کاربر مستثنی شده است یا خیر
 * @param {string} url - آدرس صفحه‌ای که باید بررسی شود
 * @param {string[]} userExcludedSites - لیست سایت‌های مستثنی شده توسط کاربر
 * @returns {boolean} - اگر URL باید مستثنی شود، true برمی‌گرداند
 */
export function isUrlExcluded(url, userExcludedSites = []) {
  if (!url) return true; // URL نامعتبر را همیشه مستثنی کن

  // ۱. بررسی در لیست پیش‌فرض
  const isDefaultExcluded = DEFAULT_EXCLUDED_SITES.some((site) =>
    url.includes(site),
  );
  if (isDefaultExcluded) {
    return true;
  }

  // ۲. بررسی در لیست کاربر
  const isUserExcluded = userExcludedSites.some((site) => url.includes(site));
  if (isUserExcluded) {
    return true;
  }

  return false;
}
