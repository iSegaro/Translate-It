// webpack.common.js
const TerserPlugin = require("terser-webpack-plugin");

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
            drop_console: process.env.NODE_ENV === "production", // حذف console.log در حالت production
          },
        },
      }),
    ],
  },
  devtool: "cheap-module-source-map",
};
