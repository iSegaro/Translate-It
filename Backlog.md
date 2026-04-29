# Project Backlog

List of features, enhancements, and ideas planned for future development.

## Features and Enhancements

- **PDF Support**: Enable direct translation of text within PDF files.
- **ESC Key Flexibility**: Add option to revert and cancel `Select Element` via `ESC`.
- **Code Cleanup**: Remove unused `compact` mode from `ProviderSelector.vue` to improve maintainability.
- **Error Handling Refactoring**: The error handling logic is still inherited from a legacy version. Although the system currently functions correctly, it is architecturally unsound as both lower and upper layers are redundantly handling errors. Detailed information can be found in `ERROR_MANAGMENT_ISSUE.md`.

- مقدار shared/config/constanst ها تفکیک شده. توی پروژه کدهای قدیمی هنوز فایل کامل constants.js رو ایمپورت میکنند. باید ریفکتور اتفاق بیافته تا از فایل های صحیح استفاده کنند.

- Integration Module: Gmail, Twitter, Goolge Docs

- بهبود حالت نوشتن

- بهبود نمایش آیکون در انتخاب متن، تا برای فایرفاکس در جای مناسبی ظاهر بشه. در حال حاضر با آیکونی که خود مرورگر برای انتخاب متن انتخاب میکنه، تداخل داره.

- اضافه کردن تغییر شورتات در صفحه تنظیمات Select Element تا کاربر بتونه به صفحه تنظیمات شورتکات مرورگرش هدایت بشه و شورتکات فعلی که تنظیم شده رو بتونه در همین صفحه تنظیمات افزونه برای این ویژگی ببینه.

- اضافه کردن ویژگی textbox در WindowsManager تا کاربر بتونه متن رو ادیت کنه و دوباره ترجمه کنه

- مینیمال کردن کامپوننت انتخاب سرعت در صفحه تنظیمات پرووایدرها

- اضافه کردن جستجوی گوگل - https://github.com/LuanRT/google-this

- اضافه کردن FAV برای کلمات

- بهبود لاگ تا لازم نباشه در همه فایل ها تعریف بشه. باید بررسی کنم چه رویکردی بهینه تر و استاندارد است. اینکه در هر فایل لاگر ایمپورت بشه یا اینه در کلاس والد بهش ارسال شود؟

- بهبود تایم‌اوت های ترجمه. در صفحه آپشن برای هر پرووایدر امکان تعیین تایم‌اوت برای اون پرووایدر اضافه شود.

- برای پرووایدر OpenRouter کاربر باید بتونه انتخاب کنه که سقف Token برای API Key انتخاب شده چقدر است. در زیر خطایی است که در موقع محدودیت توکن رخ میده:
Error during translation: Error: This request requires more credits, or fewer max_tokens. You requested up to 4096 tokens, but can only afford 2795. To increase, visit https://openrouter.ai/settings/keys and create a key with a higher weekly limit
نکته ای که باید توجه شود این است که در هر بار درخواست، مقدار این توکن کمتر میشود. یعنی بعد از استفاده مقدار 2784 توکن داره.

- اضافه کردن grok به پرووایدرها

- برای توسعه ، از WebAI to API استفاده کنم.

---

## Research and Resources

### Potential Translation Providers
- [MyMemory Translated](https://mymemory.translated.net/): Free and open-source translation engine.
- [Reverso Context](https://www.reverso.net/text-translation#sl=eng&tl=per): For examining translations in context and usage examples.
- [LibreTranslator (Linguist JS)](https://github.com/translate-tools/linguist-translators/blob/master/translators/LibreTranslator.js): Open-source translator implementation.
- [Baidu Translator](https://github.com/ttop32/MouseTooltipTranslator/blob/main/src/translator/baidu.js): Investigation of Baidu translator implementation.
- [DeepSeek Model Interface](https://asmodeus.free.nf/?i=1): Custom interface/resource for DeepSeek model.

### Other
- [Lumetrium Prompt Catalog](https://lumetrium.com/definer/wiki/sources/ai/prompts/catalog): Catalog of specialized prompts for translation and dictionary services.
- [Immersive Translate Prompts](https://github.com/immersive-translate/prompts/tree/main/plugins)
- [Wiktionary](https://github.com/LearnRomanian/wiktionary-scraper)

---

## Documentation
