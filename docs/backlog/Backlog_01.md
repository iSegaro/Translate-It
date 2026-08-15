
1. **Recovery ownership / accounting — بالاترین اولویت.** این همان بخش معماری است که قبلاً در آن مشخص شده بود Structured Recovery داخل همان translation attempt چند HTTP call ایجاد می‌کند و ownership بین `BaseAIProvider`، `ProviderRequestEngine`، Queue/Stats/RateLimit/Health پخش شده. موارد مهم باقی‌مانده شامل retry بعد از partial recovery، health propagation، timeout budget و conversation-history isolation هستند. این بخش هم روی reliability اثر دارد، هم مستقیماً روی هزینه‌ی Provider Pro. من مرحله بعد را روی همین می‌گذارم.

2. **RequestHealthMonitor / circuit-breaker integration.** قبلاً مشخص شده بود failureهای contract/recovery الزاماً به health layer نمی‌رسند و `RequestHealthMonitor` هم در production نقش روشنی ندارد. باید تصمیم بگیریم یا واقعاً وارد runtime شود، یا dead architecture حذف شود. وجود یک health system نصفه‌فعال بدتر از نداشتن آن است.

3. **Queue retry بعد از partial success.** مخصوصاً برای Select Element/structured batches: اگر بخشی از logical parentها commit شده باشند، retry نباید کل payload را دوباره ترجمه کند یا accounting/history را تکرار کند. P9.7 سمت DOM را transactional و parent-local کرد، اما باید سمت request/retry ownership هم با آن هماهنگ باشد.

4. **Cross-frame hardening امنیتی.** nested iframe routing الان functional شده، اما `postMessage('*')` و origin/source validation هنوز debt هستند. همچنین unmatched/detached iframe fallback باید جدا بررسی شود. این را بعد از Recovery می‌گذارم چون احتمال exploit/incorrect routing کمتر از مشکلات provider execution است، ولی ارزش بررسی دارد.

5. **WebAI / non-cooperative provider cancellation.** لاگ WebAI نشان داد request می‌تواند چند دقیقه در server بماند. سمت extension cancellation الان بسیار بهتر شده، ولی اگر localhost/server بعد از abort همچنان inference را ادامه دهد، برای Provider Pro هزینه‌ی واقعی تولید می‌کند. قبل از تجاری‌سازی باید protocol cancellation/deadline propagation را audit کنیم.

6. **Generic `MessageRouter` / CrossFrame debt.** در auditهای iframe دو مورد فرعی دیده شد: guardهای مشکوک مثل `frameRegistry.isInIframe` و listener lifecycle عمومی `MessageRouter`. چون route مربوط به translation window را جدا کرده‌ایم، اینها دیگر blocker نیستند؛ فقط اگر audit نشان دهد روی messageهای فعال دیگری duplicate handling ایجاد می‌کنند ارزش fix دارند.

7. isInIframe و listener leak

مواردی مثل `MainFeatureLoader` timer cleanup، bootstrap-exclusion integration test، mouse-resize coverage، touch dock coverage و Vue defense-in-depth را فعلاً **عقب می‌اندازم**. impact آنها محدود است و الان نسبت هزینه/فایده‌ی پایین‌تری دارند.

اگر بخواهم فقط **یک مورد بعدی** انتخاب کنم:

> **Audit کامل Recovery ownership از یک logical translation attempt تا physical provider calls، retry، stats، rate-limit، health و conversation commit.**

این بخش در حال حاضر بزرگ‌ترین debt معماری باقی‌مانده‌ای است که هم روی پایداری فعلی و هم روی economics نسخه Pro اثر مستقیم دارد.
