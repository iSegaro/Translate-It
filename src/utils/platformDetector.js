// src/utils/platformDetector.js

/**
 * تشخیص پلتفرم بر اساس نام دامنه.
 * @returns {string} نام پلتفرم یا 'default' اگر تشخیص داده نشد.
 */
export function detectPlatform() {
  const hostname = window.location.hostname.toLowerCase();
  const platformMap = {
    "web.whatsapp.com": "whatsapp",
    "web.telegram.org": "telegram",
    "www.instagram.com": "instagram",
    "twitter.com": "twitter",
    "x.com": "twitter",
    "medium.com": "medium",
    "chat.openai.com": "chatgpt",
    "chat.com": "chatgpt",
    "chatgpt.com": "chatgpt",
    "www.youtube.com": "youtube",
  };

  return platformMap[hostname] || "default";
}

/**
 * دریافت نام پلتفرم.
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
    { name: "Instagram", patterns: ["instagram.com"] },
    { name: "Youtube", patterns: ["youtube.com"] },
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
 * @returns {string} نام پلتفرم یا 'default' اگر تشخیص داده نشد.
 */
export function detectPlatformByURL() {
  const hostname = window.location.hostname.toLowerCase();
  if (hostname.includes("twitter.com") || hostname.includes("x.com"))
    return "twitter";
  if (hostname.includes("medium.com")) return "medium";
  if (hostname.includes("telegram.com")) return "telegram";
  if (hostname.includes("whatsapp.com")) return "whatsapp";
  if (hostname.includes("instagram.com")) return "instagram";
  if (hostname.includes("youtube.com")) return "youtube";
  return "default";
}
