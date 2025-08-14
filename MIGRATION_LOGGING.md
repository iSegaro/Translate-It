# Logging System Migration Plan (Vue Modernization)

هدف: بهینه‌سازی و یکپارچه‌سازی سیستم لاگ موجود با معماری جدید Vue بدون ایجاد رگرسیون و با کمترین ریسک.

## 1. وضعیت فعلی (Current State)
- چندین فایل از الگوی موقت `let logger; function getLogger()` استفاده می‌کنند.
- گاهی Component نامعتبر یا ناسازگار (مثلاً تایپ متفاوت) استفاده شده.
- سطوح لاگ در بعضی بخش‌ها زیاد (Content / Translation) و در بعضی کم (UI) اما فاقد انسجام.
- سازوکار کش مرکزی برای لاگرهای scoped وجود نداشت (ایجاد آبجکت‌های جدید در هر import).
- مستند رسمی `docs/LOGGING_SYSTEM.md` نیاز به به‌روزرسانی برای الگوی جدید دارد.

## 2. طراحی جدید (Target Design)
- استفاده از `LOG_COMPONENTS` واحد (افزودن Core, Translation) و جلوگیری از string literal های پراکنده.
- API استاندارد: `getScopedLogger(component, subComponent?)` برای تولید و کش لاگر.
- سطوح پایه قابل تنظیم از طریق `setLogLevel` و قابل introspect با `listLoggerLevels`.
- حداقل سطح در production: WARN جهانی، ولی override برحسب نیاز (Error برای Error، Info برای جریان‌های حیاتی).
- عدم افزودن Component‌های غیر ضروری؛ فقط `subComponent` برای تمایز استراتژی/ماژول داخلی.

## 3. جدول سطوح پیشنهادی اولیه
| Component      | Level (Dev) | Level (Prod Default) | توضیح |
|----------------|-------------|-----------------------|-------|
| Background     | INFO        | INFO                  | رخدادهای سرویس ورکر
| Core           | INFO        | WARN                  | فقط مشکلات در prod (بعد از پایدار شدن)
| Content        | DEBUG       | WARN                  | در prod کاهش نویز
| Translation    | DEBUG       | INFO                  | ردیابی pipeline در dev
| Messaging      | WARN        | WARN                  | فقط anomalie ها
| Providers      | INFO        | INFO                  | نتایج مهم درخواست‌ها
| UI             | INFO        | WARN                  | کاهش نویز ظاهری در prod
| Storage        | INFO        | WARN                  | خطا + عملیات مهم
| Capture        | DEBUG       | INFO                  | پردازش تصویر پرهزینه
| Error          | ERROR       | ERROR                 | همیشه خطاها

(مرحله 2 به بعد Production tuning اعمال می‌شود.)

## 4. مراحل مهاجرت (Phased Rollout)
### Phase 0 – آماده‌سازی (DONE)
- [x] افزودن Core/Translation در `logConstants.js`.
- [x] افزودن `getScopedLogger` + کش.
- [x] افزودن `listLoggerLevels`.

### Phase 1 – استراتژی‌ها و هسته
- [ ] پوشش پوشه‌های: `src/strategies/`, `src/core/`, `src/providers/`
- [ ] جایگزینی الگوی قدیمی با:
  ```js
  import { getScopedLogger } from '@/utils/core/logger.js'
  import { LOG_COMPONENTS } from '@/utils/core/logConstants.js'
  const logger = getScopedLogger(LOG_COMPONENTS.TRANSLATION, 'MyStrategy')
  ```
- [ ] حذف singleton های بومی.

### Phase 2 – Content Scripts & UI
- [ ] پوشش: `src/content-scripts/`, `src/views/`, `src/components/`, `src/sidepanel.js`, `src/popup`
- [ ] کاهش لاگ‌های تکراری DOM (سطح DEBUG)

### Phase 3 – Translation Pipeline
- [ ] ماژول‌های `translation` / `services` -> subComponent برای provider یا مرحله (StageFetch, StageAssemble)
- [ ] افزودن `logInitSequence` در boot pipeline.

### Phase 4 – Storage & Messaging
- [ ] یکپارچه کردن آدرس‌دهی لاگ در `storage/` و `messaging/`.
- [ ] اطمینان از عدم افشای داده حساس (mask tokens).

### Phase 5 – Cleanup & Harden
- [ ] حذف `quickLoggers` در صورت بی‌نیازی (یا علامت Deprecated در داکیومنت).
- [ ] افزودن تست کوچک Vitest برای اطمینان از کش شدن logger ها.
- [ ] اسکریپت lint rule سفارشی (اختیاری) برای منع string literal خارج از `LOG_COMPONENTS`.

## 5. تغییرات کد پیشنهادی (Patterns)
قدیم:
```js
let logger;
function getLogger() {
  if (!logger) logger = createLogger('Translation')
  return logger;
}
```
جدید:
```js
import { getScopedLogger } from '@/utils/core/logger.js'
import { LOG_COMPONENTS } from '@/utils/core/logConstants.js'
const logger = getScopedLogger(LOG_COMPONENTS.TRANSLATION, 'SentenceAssembler')
```

## 6. اعتبارسنجی
Checkpoints:
1. اسکریپت Dev: `listLoggerLevels()` در کنسول -> نمایش ساختار.
2. اجرای سناریو: ترجمه متن + باز کردن sidepanel -> عدم وجود خطا.
3. آزمایش کاهش نویز: `setLogLevel('global', LOG_LEVELS.WARN)` -> فقط WARN+.
4. تست vitest: تایید reference equality برای دو بار فراخوانی یک subComponent.

## 7. ریسک‌ها و Mitigation
| ریسک | تاثیر | راهکار |
|------|-------|--------|
| استفاده از string literal | پراکندگی | ESLint Rule / PR Review |
| فراموشی subComponent | افت دقت دیباگ | دستورالعمل مستند |
| زیاده‌روی در subComponent | نویز | راهنمای سبک: حداکثر 1 عمق |
| عدم حذف الگوهای قدیمی | بدهی | Phase 5 check-list |

## 8. Follow-Up های آینده
- ادغام با سیستم تله‌متری سبک (جمع آمار شمارش خطا بدون داده شخصی).
- Export لاگ‌های اخیر برای گزارش باگ کاربر.
- Mask کردن PII در provider responses.

## 9. به‌روزرسانی مستندات
- [ ] docs/LOGGING_SYSTEM.md -> افزودن بخش "Scoped Logger API".
- [ ] docs/ARCHITECTURE.md -> اشاره به Cross-cutting concern.

---
Progress: Phase 0 انجام شد.

