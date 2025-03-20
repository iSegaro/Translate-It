// webpack.config.js
const path = require("path");
const CopyPlugin = require("copy-webpack-plugin");
const TerserPlugin = require("terser-webpack-plugin");
const fs = require("fs");

const rimraf = require("rimraf");

// خواندن محتویات فایل manifest.json
const manifest = JSON.parse(fs.readFileSync("./manifest.json", "utf8"));
const extensionName = manifest.name.replace(/ /g, "_");
const extensionVersion = manifest.version;
const outputFolderName = `${extensionName}_v${extensionVersion}`;
const outputFullPath = path.resolve(
  __dirname,
  "Chrome-Extension",
  outputFolderName
);

// پاک کردن دستی دایرکتوری build قبل از build
rimraf.sync(outputFullPath);

module.exports = {
  entry: {
    content: [
      "core-js/stable",
      "regenerator-runtime/runtime",
      "./src/content.js",
    ],
    background: "./src/background.js",
    options: "./src/options.js",
    popup: "./src/popup.js",
  },
  resolve: {
    extensions: [".js"],
  },
  output: {
    path: outputFullPath,
    filename: "[name].bundle.js",
  },
  target: "web",
  module: {
    rules: [
      {
        test: /\.js$/,
        exclude: /node_modules/,
        use: {
          loader: "babel-loader",
          options: {
            presets: ["@babel/preset-env"],
          },
        },
      },
    ],
  },
  optimization: {
    minimize: true,
    minimizer: [
      new TerserPlugin({
        terserOptions: {
          compress: {
            drop_console: process.env.NODE_ENV === "production" ? true : false, // حذف console.log در حالت production
          },
        },
      }),
    ],
  },
  plugins: [
    new CopyPlugin({
      patterns: [
        {
          from: "manifest.json",
          to: ".",
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
  devtool: "cheap-module-source-map",
};
