// webpack.chrome.js

/* eslint-disable no-undef */

const path = require("path");
const fs = require("fs");
const rimraf = require("rimraf");
const CopyPlugin = require("copy-webpack-plugin");
const { merge } = require("webpack-merge");
const common = require("./webpack.common.js");
const archiver = require("archiver");
const packageJson = require("./package.json");

const isBuildMode = process.env.BUILD_MODE === "build";
const isPublishMode = process.env.PUBLISH_MODE === "true";

// خواندن manifest مربوط به کروم
const manifestFilePath = "./src/manifest.chrome.json";
const manifestRaw = fs.readFileSync(manifestFilePath, "utf8");
const manifest = JSON.parse(manifestRaw);

const defaultLocale = "en";
const messagesPath = path.resolve(
  __dirname,
  "_locales",
  defaultLocale,
  "messages.json"
);

let messages = {};
try {
  messages = JSON.parse(fs.readFileSync(messagesPath, "utf8"));
} catch (error) {
  console.error("Error reading messages file:", error);
}

// جایگزینی placeholderهای i18n در name
if (typeof manifest.name === "string") {
  manifest.name = manifest.name.replace(/__MSG_(\w+)__/g, (match, key) => {
    return messages[key] ? messages[key].message : match;
  });
}

const extensionName = manifest.name.replace(/ /g, "-");
const extensionVersion = packageJson.version;

const outputFolderPath = path.resolve(
  __dirname,
  "Build-Extension",
  "Chrome",
  `${extensionName}-v${extensionVersion}`
);

// --- منطق شرطی برای تعیین مسیر فایل ZIP ---
let zipFilePath;
if (isPublishMode) {
  // اگر در حالت publish بود، خروجی را در پوشه Publish قرار بده
  zipFilePath = path.resolve(
    __dirname,
    "Build-Extension",
    "Publish",
    `${extensionName}-v${extensionVersion}-for-Chrome.zip`
  );
} else {
  // در حالت build عادی، خروجی را در همان پوشه Chrome قرار بده
  zipFilePath = path.resolve(
    outputFolderPath, // استفاده از مسیر پوشه خروجی build
    `../${extensionName}-v${extensionVersion}.zip` // نام‌گذاری ساده‌تر برای build عادی
  );
}
// --- پایان منطق شرطی ---

rimraf.sync(outputFolderPath);
if (fs.existsSync(zipFilePath)) fs.unlinkSync(zipFilePath);

// کلاس ساخت فایل zip بعد از build
class ZipAfterBuildPlugin {
  apply(compiler) {
    compiler.hooks.afterEmit.tapAsync(
      "ZipAfterBuildPlugin",
      (compilation, callback) => {
        const output = fs.createWriteStream(zipFilePath);
        const archive = archiver("zip", { zlib: { level: 9 } });

        output.on("close", () => {
          console.log(
            `✅ ZIP created at ${zipFilePath} (${archive.pointer()} bytes)`
          );
          callback();
        });

        archive.on("error", (err) => callback(err));

        archive.pipe(output);
        archive.directory(outputFolderPath, false);
        archive.finalize();
      }
    );
  }
}

const chromeDistConfig = {
  mode: "production",
  output: {
    path: outputFolderPath,
    filename: "[name].bundle.js",
  },
  plugins: [
    new CopyPlugin({
      patterns: [
        {
          from: "src/manifest.chrome.json",
          to: "manifest.json",
          transform(content) {
            let manifest = JSON.parse(content);
            manifest.version = packageJson.version;
            if (typeof manifest.name === "string") {
              manifest.name = manifest.name.replace(
                /__MSG_(\w+)__/g,
                (match, key) => {
                  return messages[key] ? messages[key].message : match;
                }
              );
            }
            return Buffer.from(JSON.stringify(manifest, null, 2));
          },
        },
        { from: "html/*.html", to: "html/[name][ext]" },
        { from: "styles/*.css", to: "styles/[name][ext]" },
        {
          from: "icons/*.png",
          to: ({ absoluteFilename }) => {
            const iconName = path.basename(absoluteFilename);
            return `icons/${iconName}`;
          },
        },
        {
          from: "icons/api-providers/*.svg",
          to: ({ absoluteFilename }) => {
            const iconName = path.basename(absoluteFilename);
            return `icons/api-providers/${iconName}`;
          },
        },
        {
          from: "icons/*.svg",
          to: ({ absoluteFilename }) => {
            const iconName = path.basename(absoluteFilename);
            return `icons/${iconName}`;
          },
        },
        {
          from: "icons/flags/*.svg",
          to: ({ absoluteFilename }) => {
            const iconName = path.basename(absoluteFilename);
            return `icons/flags/${iconName}`;
          },
        },
        { from: "html/offscreen.html", to: "offscreen.html" },
        { from: "src/offscreen.js", to: "offscreen.js" },
        { from: "node_modules/webextension-polyfill/dist/browser-polyfill.js" },
        { from: "_locales", to: "_locales" },
      ],
    }),
    ...(isBuildMode ? [new ZipAfterBuildPlugin()] : []),
  ],
};

module.exports = merge(common, chromeDistConfig);
