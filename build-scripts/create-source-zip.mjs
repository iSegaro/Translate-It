// build-scripts/create-source-zip.mjs

/* eslint-disable no-undef */

import fs from "fs";
import path from "path";
import archiver from "archiver";
import chalk from "chalk";
import { fileURLToPath } from "url";

// خواندن اطلاعات پکیج برای گرفتن نسخه
const packageJson = JSON.parse(fs.readFileSync("./package.json", "utf8"));
const extensionVersion = packageJson.version;

// مسیرهای پروژه
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootPath = path.resolve(__dirname, "..");

// تعریف مسیر خروجی به پوشه Publish
const outputDir = path.resolve(rootPath, "Build-Extension", "Publish");
const outputFilePath = path.resolve(
  outputDir,
  `Source-v${extensionVersion}.zip`
);

// لیست فایل‌ها و پوشه‌هایی که باید در سورس کد نهایی گنجانده شوند
const sourceFilesAndDirs = [
  ".gitignore",
  "build-scripts",
  "Backlog.md",
  "Changelog.md",
  "CLAUDE.md",
  "eslint.config.mjs",
  "html",
  "icons",
  "_locales",
  "package.json",
  "pnpm-lock.yaml",
  "Privacy.md",
  "Prompt.ai",
  "README.md",
  "README_FARSI.md",
  "src",
  "styles",
  "webpack.chrome.js",
  "webpack.common.js",
  "webpack.firefox.js",
];

// اطمینان از وجود پوشه خروجی
if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

console.log(
  chalk.cyan.bold(`\n📦 Creating source code archive for v${extensionVersion}...`)
);

// ایجاد stream برای فایل zip
const output = fs.createWriteStream(outputFilePath);
const archive = archiver("zip", {
  zlib: { level: 9 }, // بالاترین سطح فشرده‌سازی
});

// مدیریت رویداد بسته شدن stream
output.on("close", () => {
  console.log(
    chalk.green.bold(
      `\n✅ Source ZIP created at ${outputFilePath} (${archive.pointer()} bytes)`
    )
  );
});

// مدیریت خطا
archive.on("error", (err) => {
  throw err;
});

// اتصال stream آرشیو به فایل خروجی
archive.pipe(output);

// افزودن فایل‌ها و پوشه‌ها به آرشیو
sourceFilesAndDirs.forEach((item) => {
  const itemPath = path.resolve(rootPath, item);
  
  // بررسی وجود فایل یا پوشه قبل از افزودن
  if (!fs.existsSync(itemPath)) {
    console.log(chalk.yellow(`⚠️  Skipping ${item} (not found)`));
    return;
  }
  
  if (fs.statSync(itemPath).isDirectory()) {
    archive.directory(itemPath, item);
  } else {
    archive.file(itemPath, { name: item });
  }
});

// نهایی کردن آرشیو
archive.finalize();