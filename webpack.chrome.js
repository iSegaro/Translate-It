// webpack.chrome.js
const path = require("path");
const fs = require("fs");
const rimraf = require("rimraf");
const CopyPlugin = require("copy-webpack-plugin");
const { merge } = require("webpack-merge");
const common = require("./webpack.common.js");

// خواندن manifest مربوط به کروم
const manifest = JSON.parse(fs.readFileSync("./manifest.chrome.json", "utf8"));
const extensionName = manifest.name.replace(/ /g, "_");
const extensionVersion = manifest.version;
const outputFolderName = `${extensionName}`;
const outputFullPath = path.resolve(
  __dirname,
  "Build-Extension",
  "Chrome",
  outputFolderName
);

// حذف دایرکتوری build قبل از build
rimraf.sync(outputFullPath);

const chromeConfig = {
  output: {
    path: outputFullPath,
    filename: "[name].bundle.js",
  },
  plugins: [
    new CopyPlugin({
      patterns: [
        {
          from: "manifest.chrome.json",
          to: "manifest.json",
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

module.exports = merge(common, chromeConfig);
