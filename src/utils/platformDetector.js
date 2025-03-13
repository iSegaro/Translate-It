// src/utils/platformDetector.js

/**
 * تشخیص پلتفرم بر اساس نام دامنه.
 * @returns {string} نام پلتفرم یا 'default' اگر تشخیص داده نشد.
 */
export function detectPlatform() {
  const hostname = window.location.hostname.toLowerCase();
  const platformMap = {
    "web.whatsapp.com": "whatsapp",
    "twitter.com": "twitter",
    "x.com": "twitter",
    "web.telegram.org": "telegram",
    "medium.com": "medium",
    "chat.openai.com": "chatgpt",
  };

  return platformMap[hostname] || "default";
}

/**
 * دریافت نام پلتفرم به صورت خوانا.
 * @returns {string} نام پلتفرم یا 'default' اگر تشخیص داده نشد.
 */
export function getPlatformName() {
  const hostname = window.location.hostname.toLowerCase();

  // لیست پلتفرم‌های پشتیبانی شده
  const platformPatterns = [
    { name: "Twitter", patterns: ["twitter.com", "x.com"] },
    { name: "WhatsApp", patterns: ["web.whatsapp.com"] },
    { name: "Telegram", patterns: ["web.telegram.org"] },
    { name: "Medium", patterns: ["medium.com"] },
    { name: "ChatGPT", patterns: ["chat.openai.com"] },
    // اضافه کردن پلتفرم‌های دیگر در اینجا
  ];

  // جستجو در لیست پلتفرم‌ها
  for (const platform of platformPatterns) {
    if (platform.patterns.some((pattern) => hostname.includes(pattern))) {
      return platform.name;
    }
  }

  // اگر پلتفرم تشخیص داده نشد، از حالت پیش‌فرض استفاده کنید
  return "default";
}

/**
 * تشخیص پلتفرم بر اساس بخشی از URL.
 * @returns {string} نام پلتفرم یا undefined اگر تشخیص داده نشد.
 */
export function detectPlatformByURL() {
  const hostname = window.location.hostname;
  if (hostname.includes("twitter.com")) return "twitter";
  if (hostname.includes("x.com")) return "twitter";
  if (hostname.includes("medium.com")) return "medium";
  if (hostname.includes("telegram.com")) return "telegram";
  if (hostname.includes("whatsapp.com")) return "whatsapp";
  if (hostname.includes("medium.com")) return "medium";
  return undefined;
}
