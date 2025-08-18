# Issue: پیام‌های ترجمه گاهی به بک‌گراند نمی‌رسند (Timeout)

تاریخ: {}

خلاصهٔ مسئله
- بعضی اوقات درخواست ترجمه‌ای که از محتوای صفحه/سایدپنل/پاپ‌آپ فرستاده می‌شود، به پردازش‌کنندهٔ بک‌گراند نمی‌رسد و فرستنده پس از سپری شدن timeout محلی، خطای `Translation timeout` دریافت می‌کند.

هدف این سند
- بررسی ساختار مسیجینگ فعلی
- تشخیص ریشه‌های احتمالی مشکل
- ارائهٔ مجموعهٔ تغییرات پیشنهادی، الویت‌بندی‌شده و قابل پیاده‌سازی
- نمونهٔ کد و گام‌های تست برای ارزیابی راه‌حل

1) خلاصهٔ معماری پیام‌رسانی فعلی
- پیام‌ها با `MessageFormat.create(...)` ساخته می‌شوند و فیلدهایی مثل `action`, `context`, `messageId`, `timestamp`, `version` دارند.
- ارسال از طرف UI از `browser.runtime.sendMessage()` استفاده می‌کند (composable `useMessaging.sendMessage`). در برخی موارد الگوی fire-and-forget نیز استفاده شده است.
- بک‌گراند از `SimpleMessageHandler` استفاده می‌کند که یک listener واحد روی `browser.runtime.onMessage` ثبت می‌کند و هم callback-style و هم promise-style را پشتیبانی می‌نماید.

2) شواهد و نقاط ضعف مشاهده‌شده
- پیام-id تولید و ساختار پیام استاندارد است — این نکته مثبت است.
- اما موارد متعددی باعث می‌شوند پیام "به‌موقع" به بک‌گراند نرسد یا فرستنده آن را به‌عنوان failure ببیند:
  - service worker (MV3) ممکن است خوابیده یا در حال راه‌اندازی باشد و `sendMessage` در برخی شرایط fail یا کند شود.
  - نبود ACK: فرستنده نمی‌داند پیام دریافت شده یا خیر؛ تنها منتظر نتیجهٔ نهایی است.
  - ارسال بدون retry و بدون fallback: اگر `sendMessage` هنگام ارسال reject کند یا drop شود، هیچ تلاش جایگزین انجام نمی‌شود.
  - handlerهای بک‌گراند ممکن است عملیات طولانی انجام دهند و ack فوری نفرستند؛ یا چنان طراحی شده‌اند که نگهداری کانال پاسخ طولانی‌مدت باعث از هم‌گسیختگی می‌شود.
  - احتمال leak در listenerها: برخی listenerها ثبت اما پاک نمی‌شوند که باعث رفتار غیرمنتظره می‌شود.

3) ریشه‌های محتمل مشکل
- MV3 lifecycle: service worker بسته یا در حال awake شدن است.
- race بین mount شدن UI و آماده‌شدن background listener.
- عدم وجود یک لایهٔ قابل‌اطمینان برای ارسال (retry/backoff/port fallback).

4) راهکارها و پیشنهادها (الویت‌بندی شده)

Stage A — کم‌ریسک، سریع (پیشنهاد شروعی)
- اضافه کردن الگوی ACK برای پیام‌های حساس (مثلاً ترجمه):
  - وقتی فرستنده پیام `TRANSLATE_REQUEST` می‌فرستد، بک‌گراند بلافاصله یک پاسخ ACK برگرداند (مثلاً `{ack:true, messageId}`) تا فرستنده بداند پیام رسیده است.
  - فرستنده در صورت عدم دریافت ACK در بازهٔ کوتاه (مثلاً 800–1500ms) یک یا چند retry با backoff انجام دهد.
- پیاده‌سازی یک wrapper در `useMessaging` به نام `sendWithAck` یا `sendWithRetry` که این منطق را پیاده‌سازی کند.

مزایا: کمترین تغییر در کد، سریع قابل پیاده‌سازی، مشکل drop به‌مقدار زیادی کاهش می‌یابد.

Stage B — متوسط: پایداری بیشتر
- پیاده‌سازی fallback به `runtime.connect` (port) و ارسال از طریق `port.postMessage` اگر `sendMessage` ناموفق باشد.
- برای sidepanel/popup که معمولاً session طولانی دارند می‌توان از پورت به‌عنوان مسیر اصلی استفاده کرد.

مزایا: port سرویس‌ورکر را wake می‌کند، کانال دوطرفه و پایدار فراهم می‌کند و برای پیام‌های طولانی مناسب‌تر است.

Stage C — اختیاری پیشرفته
- صف محلی (storage-backed queue): ذخیرهٔ پیام‌ها در `storage.local` یا indexedDB تا زمانی که ACK نیامد، مجدداً تلاش شود. این مورد برای تضمین delivery 100٪ مناسب است.

5) طراحی پیشنهادی دقیق و نمونهٔ کد (الگو)

- فرستنده — sendWithRetry (pseudo, قابل تبدیل به JS):

```js
// useMessaging.js — الگوی پیشنهادی
async function sendWithRetry(message, {ackTimeout=1200, totalTimeout=12000} = {}){
  // ۱) سریع try sendMessage
  try {
    const res = await promiseTimeout(browser.runtime.sendMessage(message), ackTimeout);
    // اگر پاسخ ack است که ادامه بده
    if (res && res.ack) return await waitForResult(message.messageId, totalTimeout);
  } catch (err){
    // لاگ و ادامه به fallback
    console.debug('sendMessage failed or timed out, will fallback to port', err);
  }

  // ۲) fallback: open port و ارسال
  const port = browser.runtime.connect({name: 'translation-port'});
  return new Promise((resolve, reject) =>{
    const to = setTimeout(()=>{ port.disconnect(); reject(new Error('no-response')); }, totalTimeout);
    port.onMessage.addListener((m)=>{
      if (m.type === 'ACK' && m.messageId === message.messageId) {
        // received ack, wait for final
      }
      if (m.type === 'RESULT' && m.messageId === message.messageId) {
        clearTimeout(to); resolve(m.data);
      }
    });
    port.postMessage(message);
  });
}

function promiseTimeout(p, ms){
  return new Promise((res, rej)=>{
    const t = setTimeout(()=>rej(new Error('timeout')), ms);
    p.then(r=>{ clearTimeout(t); res(r); }).catch(e=>{ clearTimeout(t); rej(e); });
  });
}
```

- بک‌گراند — handler الگو (pseudo):

```js
// background.js
browser.runtime.onConnect.addListener(port => {
  port.onMessage.addListener(async (msg) => {
    // validate msg
    port.postMessage({ type: 'ACK', messageId: msg.messageId });

    // پردازش async
    try{
      const result = await doTranslate(msg.data);
      port.postMessage({ type: 'RESULT', messageId: msg.messageId, data: result });
    } catch(err){
      port.postMessage({ type: 'RESULT', messageId: msg.messageId, error: err.message });
    }
  });
});

// همچنین onMessage (sendMessage) باید ack سریع ارسال کند:
browser.runtime.onMessage.addListener((msg, sender, sendResponse) =>{
  if (msg.action === 'TRANSLATE_REQUEST'){
    sendResponse({ ack: true, messageId: msg.messageId });
    // process async and later notify via tabs.sendMessage or port
    (async()=>{
      const res = await doTranslate(msg.data);
      // send final using tabs.sendMessage or ports
    })();
    return true; // keep channel open if using sendResponse async
  }
});
```

6) تست و اعتبارسنجی
- سناریوهای پیشنهادی:
  1. service worker خوابیده — ارسال ترجمه و مشاهدهٔ ACK و نتیجه.
  2. sendMessage reject — fallback به port کار کند.
  3. تأخیر طولانی در ترجمه — ACK سریع و نتیجهٔ نهایی دیر منتشر شود.
  4. بستن تب هنگام ارسال — قطع پورت و عدم crash.

7) قدم‌های پیشنهادی برای اجرا (تخمین زمانی)
- مرحلهٔ 1 (ACK + retry wrapper): 0.5–1 روز — کم‌ریسک، سریع، اثر قابل‌توجه.
- مرحلهٔ 2 (port fallback): 0.5–1.5 روز — نیاز به تغییر در useMessaging و background, تست reconnect/cleanup.
- مرحلهٔ 3 (queue-backed persistence): 1–2 روز — در صورت نیاز به delivery قطعی.
- مرحلهٔ 4 (audit listener leaks + مانیتورینگ): 0.5–1 روز.

8) لاگ‌گذاری و مانیتورینگ
- در `useMessaging` لاگ کنید: attempts, channel used (sendMessage/port), ack times, final response times و error stack.
- در بک‌گراند لاگ کنید: onConnect, onDisconnect, message received, ack sent، result sent.

9) نتیجه‌گیری، کار انجام‌شده و وضعیت فعلی
- پیشنهاد من شروع با Stage A: اضافه کردن ACK و `sendMessage` wrapper با retries. این تغییر کم‌ریسک است و به‌سرعت اثربخش خواهد بود.
- در پروژه بخشی از مرحلهٔ A و بعضی از تغییرات Stage B پیاده‌سازی شده‌اند: ماژول `ReliableMessaging` موجود استفاده شده و چندین فایلِ مصرف‌کننده به مسیر قابل‌اطمینان مهاجرت داده شدند (دیدگاه کامل در `findings.md`).
- اگر بعد از این مهاجرت هنوز مواردی از پیام‌های گم‌شده مشاهده شد، مرحلهٔ بعدی فعال کردن پورت به‌عنوان مسیر اصلی (یا اضافه کردن queue-backed persistence) خواهد بود.

---
این سند آمادهٔ تبدیل به issue در tracker یا PR است. تغییراتی در `useMessaging` و چند کامپوننت و manager اعمال شده تا مسیر قابل‌اطمینان (`sendReliable`) استفاده شود؛ لطفاً برای ادامهٔ کار و اجرای تست‌ها اطلاع دهید.

10) Audit Plan (پیش از پیاده‌سازی بیشتر)

هدف: پیدا کردن دقیق محل‌های آسیب‌پذیر در پیام‌رسانی، شناسایی listener leak ها، تایید رفتار ACK/port و تولید یک گزارش عملی برای اصلاحات بعدی.

قدم‌ها (قابل اجرا):
- 10.1 Static scan: تمام فایل‌هایی که `runtime.sendMessage`, `runtime.onMessage`, `runtime.connect`, `port.postMessage`, `onMessage.addListener` را صدا می‌زنند فهرست می‌شوند.
  - خروجی: فهرستی از فایل‌ها/خط‌ها با توضیح مختصر (مثلاً "sendMessage used without retry")

- 10.2 Listener lifecycle audit: برای هر listener ثبت‌شده بررسی می‌کنیم که در unmount/cleanup حتماً removeListener فراخوانی شده باشد.
  - تمرکز روی فایل‌های Vue composables و component هایی که از `browser.runtime.onMessage.addListener` استفاده کرده‌اند.
  - خروجی: لیستی از موارد نیازمند اصلاح (با فایل و خط پیشنهادی برای removeListener)

- 10.3 ACK/Response behavior: بررسی کنیم که handlerهای بک‌گراند برای پیام‌های حساس (TRANSLATE و موارد مشابه) ACK فوری ارسال کنند یا نه.
  - بررسی `handleTranslate`, `handleTranslateText`, `translation-engine` و هر handler مرتبط.
  - خروجی: تایید/رد اینکه هر handler فوراً ack می‌دهد و اگر نه، نقاطی که باید اضافه شود.

- 10.4 Port usage audit: شناسایی تمام نقاطی که از `runtime.connect`/port استفاده شده و بررسی مدیریت disconnect/reconnect و cleanup.
  - خروجی: مواردی که نیاز به اضافه کردن `onDisconnect` یا `port.disconnect()` دارند.

- 10.5 Timeout and retry configuration: بازبینی مقادیر timeout (WindowsConfig.TIMEOUTS و مقادیر در ReliableMessaging) و تایید اینکه مقادیر معقول هستند.
  - خروجی: پیشنهادهایی برای تنظیمات ackTimeout/retries/totalTimeout بر اساس نتایج لاگ‌ها.

- 10.6 Integration smoke tests: طراحی سناریوهای دستی که قبلاً ذکر شد (service worker asleep, sendMessage reject, delayed result, tab close) و اجرای آن‌ها.
  - خروجی: نتایج و لاگ‌های مرتبط با هر سناریو.

- 10.7 Report و next steps: جمع‌آوری یافته‌ها و تولید یک patch-list (فایل‌ها و خطوط پیشنهادی) که برای اصلاح باید انجام شود.

اعتبارات و خروجی‌ها
- خروجی نهایی: یک issue.md آپدیت‌شده (این فایل) با بخش "Findings" و لیست تغییرات پیشنهادی + تست سناریوها و log snapshots.
- مدت زمان تقریبی: 2–4 ساعت برای audit کامل و اجرای smoke tests (بسته به پیچیدگی و رفتار محیط تست).



**Findings report**: see `findings.md` for the full audit output and recommended patches.
