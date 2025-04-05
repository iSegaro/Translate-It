// webpack.firefox.js
const path = require("path");
const fs = require("fs");
const rimraf = require("rimraf");
const CopyPlugin = require("copy-webpack-plugin");
const TerserPlugin = require("terser-webpack-plugin");
const { merge } = require("webpack-merge");
// const ZipPlugin = require("zip-webpack-plugin");
const common = require("./webpack.common.js");

// خواندن manifest مربوط به فایرفاکس از فایل manifest.firefox.json
const manifest = JSON.parse(
  fs.readFileSync("./src/manifest.firefox.json", "utf8")
);
const extensionName = manifest.name.replace(/ /g, "-");
const extensionVersion = manifest.version;
const outputFolderName = extensionName;
const outputFullPathZIP = path.resolve(__dirname, "Build-Extension", "Firefox");
const outputFullPath = path.resolve(
  __dirname,
  "Build-Extension",
  "Firefox",
  outputFolderName
);

// پاکسازی پوشه build قبلی
rimraf.sync(outputFullPath);

const firefoxDistConfig = {
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
          from: "src/manifest.firefox.json",
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
          // کپی offscreen.html
          from: "html/offscreen.html",
          to: "offscreen.html",
        },
        {
          // کپی offscreen.js
          from: "html/offscreen.js",
          to: "offscreen.js",
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

module.exports = merge(common, firefoxDistConfig);
