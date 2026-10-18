import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import archiver from "archiver";
import chalk from "chalk";
import { fileURLToPath, pathToFileURL } from "node:url";

const sourceFilesAndDirs = [
  ".gitignore",
  "config",
  "scripts",
  "src",
  "package.json",
  "pnpm-lock.yaml",
  "pnpm-workspace.yaml",
  "AGENTS.md",
  "README.md",
  "CONTEXT.md",
  "LICENSE",
  "NOTICE",
  "docs/Changelog.md",
  "eslint.config.js",
  "vitest.config.js",
  ".stylelintrc.json",
  ".prettierrc.json",
];

const excludedPathParts = new Set([
  ".git",
  "node_modules",
  "dist",
  "coverage",
  ".cache",
  ".vite",
  ".turbo",
  ".output",
]);

function shouldInclude(entry) {
  const name = entry.name.replaceAll("\\", "/");
  const parts = name.split("/");
  const baseName = parts.at(-1);

  if (parts.some((part) => excludedPathParts.has(part))) return false;
  if (parts.includes("tests")) return false;
  if (/\.(test|spec)\.js$/i.test(baseName)) return false;
  if (/^\.env(?:\.|$)/i.test(baseName) && !/^\.env\.example$/i.test(baseName)) {
    return false;
  }
  if (/\.(?:log|tmp|swp|swo)$/i.test(baseName)) return false;
  if (/\.(?:pem|key|p12|pfx)$/i.test(baseName)) return false;
  if (baseName === ".DS_Store") return false;

  return entry;
}

function getTrackedSourceFiles(rootPath) {
  const result = spawnSync("git", ["ls-files", "-z", "--", "config", "scripts", "src"], {
    cwd: rootPath,
    encoding: "buffer",
  });
  if (result.error || result.status !== 0) {
    const details = result.error?.message || result.stderr?.toString("utf8").trim();
    throw new Error(
      `Cannot create source ZIP; unable to establish tracked source files${details ? `: ${details}` : ""}`
    );
  }
  return result.stdout
    .toString("utf8")
    .split("\0")
    .filter(Boolean)
    .filter((name) => shouldInclude({ name }));
}

export async function createSourceZip({ rootPath, outputDir }) {
  const packageJson = JSON.parse(
    fs.readFileSync(path.join(rootPath, "package.json"), "utf8")
  );
  const missing = sourceFilesAndDirs.filter(
    (item) => !fs.existsSync(path.join(rootPath, item))
  );
  if (missing.length) {
    throw new Error(`Cannot create source ZIP; required items missing: ${missing.join(", ")}`);
  }
  const trackedSourceFiles = getTrackedSourceFiles(rootPath);
  if (!trackedSourceFiles.length) {
    throw new Error("Cannot create source ZIP; tracked source inventory is empty after exclusions");
  }
  for (const trackedFile of trackedSourceFiles) {
    try {
      fs.accessSync(path.join(rootPath, trackedFile), fs.constants.R_OK);
    } catch (error) {
      throw new Error(
        `Cannot create source ZIP; tracked source file is missing or unreadable: ${trackedFile}: ${error.message}`
      );
    }
  }

  fs.mkdirSync(outputDir, { recursive: true });
  const outputFilePath = path.join(
    outputDir,
    `Source-v${packageJson.version}.zip`
  );
  const temporaryFilePath = path.join(
    outputDir,
    `.${path.basename(outputFilePath)}.${randomUUID()}.tmp`
  );

  try {
    await new Promise((resolve, reject) => {
      const output = fs.createWriteStream(temporaryFilePath, { flags: "wx" });
      const archive = archiver("zip", { zlib: { level: 9 } });
      let finalized = false;
      let closed = false;
      let settled = false;

      const fail = (error) => {
        if (settled) return;
        settled = true;
        archive.abort();
        output.destroy();
        reject(error);
      };
      const completeIfReady = () => {
        if (finalized && closed && !settled) {
          settled = true;
          resolve();
        }
      };

      output.on("close", () => {
        closed = true;
        completeIfReady();
      });
      output.on("error", fail);
      archive.on("error", fail);
      archive.on("warning", (error) => {
        fail(new Error(`Cannot create source ZIP; archive warning: ${error.message}`));
      });
      archive.pipe(output);

      for (const item of sourceFilesAndDirs) {
        const itemPath = path.join(rootPath, item);
        if (fs.statSync(itemPath).isDirectory()) {
          for (const trackedFile of trackedSourceFiles) {
            if (trackedFile.startsWith(`${item}/`)) {
              archive.file(path.join(rootPath, trackedFile), { name: trackedFile });
            }
          }
        } else {
          archive.file(itemPath, { name: item });
        }
      }

      archive.finalize().then(
        () => {
          finalized = true;
          completeIfReady();
        },
        fail
      );
    });
    await fs.promises.rename(temporaryFilePath, outputFilePath);
  } catch (error) {
    await fs.promises.rm(temporaryFilePath, { force: true });
    throw error;
  }

  return outputFilePath;
}

const scriptPath = fileURLToPath(import.meta.url);
if (
  process.argv[1] &&
  pathToFileURL(path.resolve(process.argv[1])).href === pathToFileURL(scriptPath).href
) {
  const rootPath = path.resolve(path.dirname(scriptPath), "../..");
  const outputDir = path.join(rootPath, "dist", "Publish");
  console.log(chalk.cyan.bold(`\n📦 Creating source code archive...`));
  createSourceZip({ rootPath, outputDir })
    .then((outputFilePath) => {
      console.log(chalk.green.bold(`\n✅ Source ZIP created at ${outputFilePath}`));
    })
    .catch((error) => {
      console.error(chalk.red(`❌ ${error.message}`));
      process.exitCode = 1;
    });
}
