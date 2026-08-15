⚠️ P1 — Dead Code (GeometrySyncEngine + CanonicalAnchor)

فعلاً مخالف حذف هستم.

این‌ها dead code هستند، اما به نظر من abandoned code نیستند؛ بلکه infrastructure فاز بعدی هستند.

دو راه داریم:

حذف کامل
یا مستندسازی به‌عنوان "future integration"

من دومی را ترجیح می‌دهم، چون قبلاً آگاهانه این لایه را ساخته‌ایم. حذفش و بعداً بازنویسی کردن ارزش ندارد.

-------------------

⚠️ P2 — Duplicate scrollToPage()

این مورد را الان انجام نمی‌دهم.

دلیل:

scrollToPage() مسیر عمومی Navigation است.

restorePdfBackedScrollAnchor() مسیر Zoom Transition است.

اگر یکی کنیم، ممکن است coupling ناخواسته ایجاد شود.

اول باید Audit بگیریم که آیا واقعاً این دو contract یکسان هستند یا نه.

------------------

❌ P2 — Remove duplicate IntersectionObserver

این را بدون Audit قبول نمی‌کنم.

ممکن است دو Observer عمداً برای دو مسئولیت مختلف ساخته شده باشند و فقط callback مشابه باشد.

قبل از حذف باید ownership آن‌ها بررسی شود.

------------------

⚠️ P3 — Parallelize buildPageMetrics()

فعلاً نه.

این optimisation است، نه مشکل معماری.

------------------


🟡 Zoom rebuilds all page metrics
PdfDocumentSession.rebuildPageMetrics()
هر تغییر zoom تمام صفحات را دوباره getPage() و getViewport() می‌کند.
برای PDFهای بزرگ هزینه‌بر است.
🟡 Virtualized PdfPageView mount
الان همه صفحات در DOM هستند.
برای PDFهای خیلی بزرگ (200+ صفحه) هزینه DOM دارد.
ولی ریسک بالاتر دارد و احتمالاً بعد از release session ارزش بررسی دارد.
🟡 usePdfTextFitter incremental loop
بهینه‌سازی الگوریتمی است.
impact کمتر.

