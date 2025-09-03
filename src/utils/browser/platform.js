// src/utils/platformDetector.js

/**
 * تعریف ثابت‌های مربوط به پلتفرم‌ها.
 */
export const Platform = {
  Default: "default",
  WhatsApp: "whatsapp",
  Telegram: "telegram",
  Instagram: "instagram",
  Twitter: "twitter",
  Medium: "medium",
  ChatGPT: "chatgpt",
  Youtube: "youtube",
  Discord: "discord",
};

/**
 * تشخیص پلتفرم بر اساس نام دامنه.
 * @returns {string} نام پلتفرم یا Platform.Default اگر تشخیص داده نشد.
 */
export function detectPlatform() {
  const hostname = typeof window !== 'undefined' ? window.location.hostname.toLowerCase() : '';
  const platformMap = {
    "web.whatsapp.com": Platform.WhatsApp,
    "web.telegram.org": Platform.Telegram,
    "www.instagram.com": Platform.Instagram,
    "twitter.com": Platform.Twitter,
    "x.com": Platform.Twitter,
    "medium.com": Platform.Medium,
    "chat.openai.com": Platform.ChatGPT,
    "chat.com": Platform.ChatGPT,
    "chatgpt.com": Platform.ChatGPT,
    "www.youtube.com": Platform.Youtube,
    "discord.com": Platform.Discord,
  };

  return platformMap[hostname] || Platform.Default;
}

/**
 * دریافت نام پلتفرم.
 * @returns {string} نام پلتفرم یا Platform.Default اگر تشخیص داده نشد.
 */
export function getPlatformName() {
  const hostname = typeof window !== 'undefined' ? window.location.hostname.toLowerCase() : '';

  // لیست پلتفرم‌های پشتیبانی شده
  const platformPatterns = [
    { name: Platform.Twitter, patterns: ["twitter.com", "x.com"] },
    { name: Platform.WhatsApp, patterns: ["web.whatsapp.com"] },
    { name: Platform.Telegram, patterns: ["web.telegram.org"] },
    { name: Platform.Medium, patterns: ["medium.com"] },
    { name: Platform.ChatGPT, patterns: ["chat.openai.com"] },
    { name: Platform.Instagram, patterns: ["instagram.com"] },
    { name: Platform.Youtube, patterns: ["youtube.com"] },
    { name: Platform.Discord, patterns: ["discord.com"] },
  ];

  // جستجو در لیست پلتفرم‌ها
  for (const platform of platformPatterns) {
    if (platform.patterns.some((pattern) => hostname.includes(pattern))) {
      return platform.name;
    }
  }

  // اگر پلتفرم تشخیص داده نشد، از حالت پیش‌فرض استفاده کنید
  return Platform.Default;
}

/**
 * تشخیص پلتفرم بر اساس بخشی از URL.
 * @returns {string} نام پلتفرم یا Platform.Default اگر تشخیص داده نشد.
 */
export function detectPlatformByURL() {
  const hostname = typeof window !== 'undefined' ? window.location.hostname.toLowerCase() : '';
  if (hostname.includes("twitter.com") || hostname.includes("x.com"))
    return Platform.Twitter;
  if (hostname.includes("medium.com")) return Platform.Medium;
  if (hostname.includes("telegram.com")) return Platform.Telegram;
  if (hostname.includes("whatsapp.com")) return Platform.WhatsApp;
  if (hostname.includes("instagram.com")) return Platform.Instagram;
  if (hostname.includes("youtube.com")) return Platform.Youtube;
  if (hostname.includes("discord.com")) return Platform.Discord;
  return Platform.Default;
}
