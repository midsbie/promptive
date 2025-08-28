/* eslint-disable no-console */
/*global process*/
import { build } from "esbuild";
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

function getRepoRoot() {
  // 1) Prefer npm contract if present
  const cwd = process.cwd();
  if (existsSync(resolve(cwd, "package.json"))) return cwd;

  // 2) Git repo root (works with worktrees too)
  try {
    const out = execFileSync("git", ["rev-parse", "--show-toplevel"], {
      stdio: ["ignore", "pipe", "ignore"],
    })
      .toString()
      .trim();
    if (out) return out;
  } catch {
    // ignore
  }

  // 3) Walk up from this file to find a sentinel
  let dir = dirname(fileURLToPath(import.meta.url));
  while (true) {
    if (existsSync(resolve(dir, ".git")) || existsSync(resolve(dir, "package.json"))) {
      return dir;
    }

    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }

  return cwd;
}

function createConfig(rootDir) {
  return {
    entryPoints: {
      background: resolve(rootDir, "src/background/main.ts"),
      content: resolve(rootDir, "src/content/main.ts"),
      sidebar: resolve(rootDir, "src/sidebar/main.ts"),
      options: resolve(rootDir, "src/options/main.ts"),
    },
    outdir: "dist",
    bundle: true,
    format: "esm",
    splitting: false,
    sourcemap: true,
    target: ["firefox120"],
    platform: "browser",
  };
}

const rootDir = getRepoRoot();
const config = createConfig(rootDir);
console.log("Build config:", config);

console.info("Building...");
await build(config);
console.log("done.");
