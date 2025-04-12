// webpack.chrome.js
const path = require("path");
const fs = require("fs");
const rimraf = require("rimraf");
const CopyPlugin = require("copy-webpack-plugin");
const TerserPlugin = require("terser-webpack-plugin");
const { merge } = require("webpack-merge");
// const ZipPlugin = require("zip-webpack-plugin");
const common = require("./webpack.common.js");

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

// جایگزینی placeholderهای i18n در کلید name
if (typeof manifest.name === "string") {
  manifest.name = manifest.name.replace(/__MSG_(\w+)__/g, (match, key) => {
    return messages[key] ? messages[key].message : match;
  });
}

const extensionName = manifest.name.replace(/ /g, "-");
const extensionVersion = manifest.version;
// خروجی هر build به پوشه‌ای با نام منحصر به فرد در مسیر زیر تولید می‌شود:
const outputFolderName = extensionName;
const outputFullPath = path.resolve(
  __dirname,
  "Build-Extension",
  outputFolderName
);

// پاکسازی پوشه build قبلی
rimraf.sync(outputFullPath);

const chromeDistConfig = {
  mode: "production",
  output: {
    path: outputFullPath,
    filename: "[name].bundle.js",
  },
  optimization: {
    minimize: true,
    minimizer: [
      new TerserPlugin({
        terserOptions: {
          compress: { drop_console: true },
        },
      }),
    ],
  },
  plugins: [
    new CopyPlugin({
      patterns: [
        {
          from: "src/manifest.chrome.json",
          to: "manifest.json",
          transform(content) {
            let manifest = JSON.parse(content);
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
        {
          from: "html/*.html",
          to: "html/[name][ext]",
        },
        {
          from: "styles/*.css",
          to: "styles/[name][ext]",
        },
        {
          from: "icons/*.png",
          to: ({ absoluteFilename }) => {
            const iconName = path.basename(absoluteFilename);
            return `icons/${iconName}`;
          },
        },
        {
          from: "html/offscreen.html",
          to: "offscreen.html",
        },
        {
          from: "src/offscreen.js",
          to: "offscreen.js",
        },
        {
          from: "node_modules/webextension-polyfill/dist/browser-polyfill.js",
        },
        {
          from: "_locales",
          to: "_locales",
        },
      ],
    }),
    // new ZipPlugin({
    //   filename: `${extensionName}-v${extensionVersion}.zip`,
    //   path: outputFullPathZIP,
    //   fileOptions: {
    //     mtime: new Date(),
    //     mode: 0o100664,
    //     compress: true,
    //     forceZip64Format: false,
    //   },
    //   zipOptions: {
    //     forceZip64Format: false,
    //   },
    // }),
  ],
};

module.exports = merge(common, chromeDistConfig);
