import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createSourceZip } from "./create-source-zip.mjs";

const requiredFiles = [
  ".gitignore",
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

const temporaryDirectories = [];

function fixture() {
  const rootPath = fs.mkdtempSync(path.join(os.tmpdir(), "source-zip-test-"));
  const outputDir = path.join(rootPath, "output");
  temporaryDirectories.push(rootPath);

  for (const directory of ["config", "scripts", "src", "docs"]) {
    fs.mkdirSync(path.join(rootPath, directory), { recursive: true });
  }
  fs.writeFileSync(path.join(rootPath, "package.json"), '{"version":"1.2.3"}');
  for (const file of requiredFiles.filter((file) => file !== "package.json")) {
    fs.writeFileSync(path.join(rootPath, file), `contents:${file}`);
  }

  return { rootPath, outputDir };
}

function zipEntries(zipPath) {
  return execFileSync("unzip", ["-Z1", zipPath], { encoding: "utf8" })
    .trim()
    .split("\n");
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

describe("createSourceZip", () => {
  it("includes required build inputs and excludes tests, secrets, caches, and generated output", async () => {
    const { rootPath, outputDir } = fixture();
    fs.mkdirSync(path.join(rootPath, "src", "tests"));
    fs.mkdirSync(path.join(rootPath, "src", "node_modules", "private"), { recursive: true });
    fs.mkdirSync(path.join(rootPath, "scripts", ".git"));
    fs.mkdirSync(path.join(rootPath, "scripts", ".cache"));
    fs.mkdirSync(path.join(rootPath, "src", "dist"));
    fs.writeFileSync(path.join(rootPath, "src", "feature.test.js"), "test");
    fs.writeFileSync(path.join(rootPath, "src", "feature.spec.js"), "spec");
    fs.writeFileSync(path.join(rootPath, "src", "tests", "case.js"), "test folder");
    fs.writeFileSync(path.join(rootPath, "src", "feature.js"), "source content");
    execFileSync("git", ["init", "--quiet"], { cwd: rootPath });
    execFileSync("git", ["add", "--", "config", "scripts", "src"], { cwd: rootPath });
    fs.writeFileSync(path.join(rootPath, "src", "local-credentials.json"), "secret");
    fs.writeFileSync(path.join(rootPath, "src", "node_modules", "private", "secret.js"), "secret");
    fs.writeFileSync(path.join(rootPath, "scripts", ".git", "config"), "git");
    fs.writeFileSync(path.join(rootPath, "scripts", ".cache", "data"), "cache");
    fs.writeFileSync(path.join(rootPath, "src", "dist", "bundle.js"), "generated");
    fs.writeFileSync(path.join(rootPath, "src", ".env.local"), "secret");
    fs.writeFileSync(path.join(rootPath, "src", "private.pem"), "secret");

    const zipPath = await createSourceZip({ rootPath, outputDir });
    const entries = zipEntries(zipPath);

    expect(entries).toContain("pnpm-workspace.yaml");
    expect(entries).toContain("docs/Changelog.md");
    expect(entries).toContain("src/feature.js");
    expect(entries).not.toContain("src/local-credentials.json");
    expect(execFileSync("unzip", ["-p", zipPath, "src/feature.js"], { encoding: "utf8" }))
      .toBe("source content");
    expect(entries.some((entry) => /(?:\.test|\.spec)\.js$/i.test(entry))).toBe(false);
    expect(entries.some((entry) => /(?:^|\/)(?:tests|node_modules|\.git|dist|\.cache)(?:\/|$)/.test(entry))).toBe(false);
    expect(entries.some((entry) => /(?:^|\/)\.env(?:\.|$)|\.(?:pem|key)$/i.test(entry))).toBe(false);
  });

  it("fails before touching an existing release artifact when a required item is missing", async () => {
    const { rootPath, outputDir } = fixture();
    fs.mkdirSync(outputDir);
    const artifact = path.join(outputDir, "Source-v1.2.3.zip");
    fs.writeFileSync(artifact, "existing release artifact");
    fs.rmSync(path.join(rootPath, "LICENSE"));

    await expect(createSourceZip({ rootPath, outputDir })).rejects.toThrow(
      "required items missing: LICENSE"
    );
    expect(fs.readFileSync(artifact, "utf8")).toBe("existing release artifact");
  });

  it("fails clearly when the tracked source inventory cannot be established", async () => {
    const { rootPath, outputDir } = fixture();

    await expect(createSourceZip({ rootPath, outputDir })).rejects.toThrow(
      "unable to establish tracked source files"
    );
    expect(fs.existsSync(outputDir)).toBe(false);
  });

  it("preserves an existing artifact when a tracked file is missing", async () => {
    const { rootPath, outputDir } = fixture();
    const trackedFile = path.join(rootPath, "src", "deleted.js");
    fs.writeFileSync(trackedFile, "tracked source");
    execFileSync("git", ["init", "--quiet"], { cwd: rootPath });
    execFileSync("git", ["add", "--", "src/deleted.js"], { cwd: rootPath });
    fs.unlinkSync(trackedFile);
    fs.mkdirSync(outputDir);
    const artifact = path.join(outputDir, "Source-v1.2.3.zip");
    fs.writeFileSync(artifact, "existing release artifact");

    await expect(createSourceZip({ rootPath, outputDir })).rejects.toThrow(
      "tracked source file is missing or unreadable: src/deleted.js"
    );
    expect(fs.readFileSync(artifact, "utf8")).toBe("existing release artifact");
  });

  it("preserves an existing artifact when exclusions leave no tracked source files", async () => {
    const { rootPath, outputDir } = fixture();
    fs.writeFileSync(path.join(rootPath, "src", "only.test.js"), "test");
    execFileSync("git", ["init", "--quiet"], { cwd: rootPath });
    execFileSync("git", ["add", "--", "src/only.test.js"], { cwd: rootPath });
    fs.mkdirSync(outputDir);
    const artifact = path.join(outputDir, "Source-v1.2.3.zip");
    fs.writeFileSync(artifact, "existing release artifact");

    await expect(createSourceZip({ rootPath, outputDir })).rejects.toThrow(
      "tracked source inventory is empty after exclusions"
    );
    expect(fs.readFileSync(artifact, "utf8")).toBe("existing release artifact");
  });

  it("atomically replaces an existing artifact after successful archive completion", async () => {
    const { rootPath, outputDir } = fixture();
    fs.writeFileSync(path.join(rootPath, "src", "tracked.js"), "tracked source");
    execFileSync("git", ["init", "--quiet"], { cwd: rootPath });
    execFileSync("git", ["add", "--", "src/tracked.js"], { cwd: rootPath });
    fs.mkdirSync(outputDir);
    const artifact = path.join(outputDir, "Source-v1.2.3.zip");
    fs.writeFileSync(artifact, "old artifact");

    const zipPath = await createSourceZip({ rootPath, outputDir });

    expect(zipPath).toBe(artifact);
    expect(zipEntries(artifact)).toContain("src/tracked.js");
    expect(fs.readdirSync(outputDir)).toEqual(["Source-v1.2.3.zip"]);
  });

  it("preserves the existing artifact and removes the temporary ZIP after an archive warning", async () => {
    const { rootPath, outputDir } = fixture();
    const trackedFile = path.join(rootPath, "src", "disappearing.js");
    fs.writeFileSync(trackedFile, "tracked source");
    execFileSync("git", ["init", "--quiet"], { cwd: rootPath });
    execFileSync("git", ["add", "--", "src/disappearing.js"], { cwd: rootPath });
    fs.mkdirSync(outputDir);
    const artifact = path.join(outputDir, "Source-v1.2.3.zip");
    fs.writeFileSync(artifact, "old artifact");
    const originalCreateWriteStream = fs.createWriteStream;
    const createWriteStreamSpy = vi
      .spyOn(fs, "createWriteStream")
      .mockImplementation(function (...args) {
        fs.unlinkSync(trackedFile);
        return originalCreateWriteStream.apply(fs, args);
      });

    try {
      await expect(createSourceZip({ rootPath, outputDir })).rejects.toThrow(
        /archive warning|ENOENT/
      );
      expect(fs.readFileSync(artifact, "utf8")).toBe("old artifact");
      expect(fs.readdirSync(outputDir)).toEqual(["Source-v1.2.3.zip"]);
    } finally {
      createWriteStreamSpy.mockRestore();
    }
  });
});
