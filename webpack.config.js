// webpack.config.js
const path = require("path");
const CopyPlugin = require("copy-webpack-plugin");
const { CleanWebpackPlugin } = require("clean-webpack-plugin");

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
    path: path.resolve(__dirname, "dist"),
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
  plugins: [
    new CleanWebpackPlugin(),
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
