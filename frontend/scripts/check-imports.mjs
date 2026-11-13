#!/usr/bin/env node
/**
 * Pre-flight check: every relative import in src/ must resolve to a real file.
 *
 * This exists because a partially-extracted ZIP produces Vite's cryptic
 *   "[plugin:vite:import-analysis] Failed to resolve import ..."
 * overlay. This script instead prints exactly which files are missing and how to fix it.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve, relative } from "node:path";

const SRC = resolve(process.cwd(), "src");
const EXTS = ["", ".ts", ".tsx", ".js", ".jsx", ".mjs", ".json",
  "/index.ts", "/index.tsx", "/index.js", "/index.jsx"];
const IMPORT_RE = /(?:^|\n)\s*(?:import|export)[\s\S]*?from\s*["']([^"']+)["']|import\(\s*["']([^"']+)["']\s*\)/g;

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(ts|tsx|js|jsx)$/.test(name)) out.push(p);
  }
  return out;
}

function resolves(spec, fromFile) {
  if (!spec.startsWith(".")) return true; // bare package import, not our concern
  const base = resolve(dirname(fromFile), spec);
  return EXTS.some((e) => {
    try { return statSync(base + e).isFile(); } catch { return false; }
  });
}

const missing = [];
for (const file of walk(SRC)) {
  const text = readFileSync(file, "utf8");
  for (const m of text.matchAll(IMPORT_RE)) {
    const spec = m[1] || m[2];
    if (!spec || !spec.startsWith(".")) continue;
    if (!resolves(spec, file)) missing.push({ file: relative(process.cwd(), file), spec });
  }
}

if (missing.length) {
  console.error("\n[trustshare] Broken imports - the project folder is incomplete.\n");
  for (const { file, spec } of missing) console.error(`  ${file}  ->  ${spec}`);
  console.error(
    "\nThis usually means the ZIP was extracted over an older copy, or some files were skipped.\n" +
    "Fix: delete the whole project folder, extract the ZIP again into a clean directory,\n" +
    "then run `npm install` and `npm run dev`.\n"
  );
  process.exit(1);
}
console.log("[trustshare] All local imports resolve.");
