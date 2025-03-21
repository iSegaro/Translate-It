// webpack.firefox.js
const path = require("path");
const fs = require("fs");
const rimraf = require("rimraf");
const CopyPlugin = require("copy-webpack-plugin");
const { merge } = require("webpack-merge");
const common = require("./webpack.common.js");

// خواندن manifest مربوط به فایرفاکس
const manifest = JSON.parse(fs.readFileSync("./manifest.firefox.json", "utf8"));
const extensionName = manifest.name.replace(/ /g, "_");
const extensionVersion = manifest.version;
const outputFolderName = `${extensionName}`;
const outputFullPath = path.resolve(
  __dirname,
  "Build-Extension",
  "Firefox",
  outputFolderName
);

// حذف دایرکتوری build قبل از build
rimraf.sync(outputFullPath);

const firefoxConfig = {
  output: {
    path: outputFullPath,
    filename: "[name].bundle.js",
  },
  plugins: [
    new CopyPlugin({
      patterns: [
        {
          from: "manifest.firefox.json",
          to: "manifest.json",
          transform(content, path) {
            let manifest = JSON.parse(content);
            manifest.browser_specific_settings = {
              gecko: {
                id: "ai-writing-companion@amm1rr.com", // شناسه یکتا برای افزونه
                strict_min_version: "91.0",
              },
            };
            return Buffer.from(JSON.stringify(manifest, null, 2));
          },
        },
        {
          from: "styles/*.css",
          to: "styles/[name][ext]",
        },
        {
          from: "icons/icon*.png",
          to: ({ absoluteFilename }) => {
            const iconName = path.basename(absoluteFilename);
            return `icons/${iconName}`;
          },
        },
        {
          from: "html/*.html",
          to: "html/[name][ext]",
        },
      ],
    }),
  ],
};

module.exports = merge(common, firefoxConfig);
