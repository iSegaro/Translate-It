// webpack.edge.js
const path = require("path");
const fs = require("fs");
const rimraf = require("rimraf");
const CopyPlugin = require("copy-webpack-plugin");
const { merge } = require("webpack-merge");
const common = require("./webpack.common.js");
const archiver = require("archiver");

const isBuildMode = process.env.BUILD_MODE === "build";

// خواندن manifest مربوط به edge
const manifestFilePath = "./src/manifest.edge.json";
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
const extensionVersion = manifest.version;

const outputFolderPath = path.resolve(
  __dirname,
  "Build-Extension",
  "Edge",
  `${extensionName}-v${extensionVersion}`
);
const zipFilePath = path.resolve(
  __dirname,
  "Build-Extension",
  "Edge",
  `${extensionName}-v${extensionVersion}.zip`
);

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

const edgeDistConfig = {
  mode: "production",
  output: {
    path: outputFolderPath,
    filename: "[name].bundle.js",
  },
  plugins: [
    new CopyPlugin({
      patterns: [
        {
          from: "src/manifest.edge.json",
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
          from: "icons/*.svg",
          to: ({ absoluteFilename }) => {
            const iconName = path.basename(absoluteFilename);
            return `icons/${iconName}`;
          },
        },
        { from: "html/offscreen.html", to: "offscreen.html" },
        { from: "src/offscreen.js", to: "offscreen.js" },
        { from: "node_modules/webextension-polyfill/dist/browser-polyfill.js" },
        { from: "_locales", to: "_locales" },
        {
          from: "src/pageBridge.js",
          to: "pageBridge.js",
        },
      ],
    }),
    ...(isBuildMode ? [new ZipAfterBuildPlugin()] : []),
  ],
};

module.exports = merge(common, edgeDistConfig);
