// webpack.chrome.js

/* eslint-disable no-undef */

const path = require("path");
const fs = require("fs");
const rimraf = require("rimraf");
const CopyPlugin = require("copy-webpack-plugin");
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
  entry: {
    content: [
      "core-js/stable",
      "regenerator-runtime/runtime",
      "./src/content.js",
    ],
    background: "./src/backgrounds/background.js",
    options: "./src/options.js",
    popup: "./src/popup/main.js",
    sidepanel: "./src/sidepanel/sidepanel.js",
    "offscreen-chrome": "./src/offscreen-chrome.js",
  },
  output: {
    path: outputFolderPath,
    filename: "[name].bundle.js",
  },
  resolve: {
    extensions: [".js"],
  },
  module: {
    rules: [
      {
        test: /\.js$/,
        exclude: /node_modules/,
        use: {
          loader: "babel-loader",
          options: {
            presets: ["@babel/preset-env"],
            plugins: [["@babel/plugin-proposal-decorators", { legacy: true }]],
          },
        },
      },
    ],
  },
  optimization: {
    minimize: true,
    minimizer: [
      new (require("terser-webpack-plugin"))({
        terserOptions: {
          compress: {
            evaluate: false,
            drop_console: process.env.NODE_ENV === "production",
            unsafe: false,
          },
          mangle: {
            keep_classnames: true,
            keep_fnames: true,
          },
          format: {
            comments: false,
          },
        },
        extractComments: false,
      }),
    ],
  },
  devtool: "cheap-module-source-map",
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
        { from: "html/options.html", to: "html/options.html" },
        { from: "html/popup.html", to: "html/popup.html" },
        { from: "html/sidepanel.html", to: "html/sidepanel.html" },
        { from: "html/offscreen-chrome.html", to: "html/offscreen-chrome.html" },
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
        { from: "node_modules/webextension-polyfill/dist/browser-polyfill.js" },
        { from: "_locales", to: "_locales" },
      ],
    }),
    ...(isBuildMode ? [new ZipAfterBuildPlugin()] : []),
  ],
};

module.exports = chromeDistConfig;
