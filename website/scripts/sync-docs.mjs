// Sync the repository's markdown into the Starlight content tree.
//
// The docs live next to the code (docs/, package readmes, roadmap.md,
// security.md) and stay the single source of truth. This script copies them
// into src/content/docs/ at build time, adds the frontmatter Starlight needs,
// and rewrites relative links so they resolve on the site (or fall back to the
// file on GitHub). It also mounts the built web verifier under public/verify/.
//
// src/content/docs/ is entirely generated and git-ignored; edit the sources
// (or content-src/ for the hand-written pages), not the copies.

import {
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, posix, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, "../..");
const contentDir = resolve(here, "../src/content/docs");
const publicDir = resolve(here, "../public");

const base = (process.env.BASE_PATH ?? "/").replace(/\/+$/, "");
const GITHUB_BLOB = "https://github.com/jherediagu/open-art-shield/blob/main/";
const GITHUB_EDIT = "https://github.com/jherediagu/open-art-shield/edit/main/";
const GITHUB_RAW = "https://raw.githubusercontent.com/jherediagu/open-art-shield/main/";

/** @type {Array<{ source: string; slug: string; title?: string; order: number }>} */
const PAGES = [
  { source: "docs/getting-started.md", slug: "guides/getting-started", order: 1 },
  { source: "docs/demo.md", slug: "guides/demo", title: "Demo guide", order: 2 },
  {
    source: "examples/readme.md",
    slug: "guides/examples",
    title: "Reproducible examples",
    order: 3,
  },
  { source: "docs/architecture.md", slug: "reference/architecture", order: 1 },
  { source: "docs/threat-model.md", slug: "reference/threat-model", order: 2 },
  {
    source: "docs/benchmarks/latest.md",
    slug: "reference/benchmark",
    title: "Protection benchmark",
    order: 3,
  },
  { source: "docs/research.md", slug: "reference/research", order: 4 },
  { source: "readme.md", slug: "reference/readme", title: "Full README (CLI and SDK)", order: 5 },
  {
    source: "packages/core/readme.md",
    slug: "packages/core",
    title: "@openartshield/core",
    order: 1,
  },
  {
    source: "packages/node/readme.md",
    slug: "packages/node",
    title: "@openartshield/node",
    order: 2,
  },
  { source: "packages/cli/readme.md", slug: "packages/cli", title: "@openartshield/cli", order: 3 },
  { source: "packages/web/readme.md", slug: "packages/web", title: "@openartshield/web", order: 4 },
  {
    source: "packages/server/readme.md",
    slug: "packages/server",
    title: "@openartshield/server",
    order: 5,
  },
  { source: "roadmap.md", slug: "project/roadmap", order: 1 },
  { source: "security.md", slug: "project/security", title: "Security policy", order: 2 },
];

const GENERATED_DIRS = ["guides", "reference", "packages", "project"];
/** Hand-written pages, kept in content-src/ with a `{{base}}` placeholder. */
const templateDir = resolve(here, "../content-src");
const IMAGE_EXT = /\.(png|jpe?g|gif|webp|svg|avif)$/i;

const routeBySource = new Map(PAGES.map((page) => [page.source, `${base}/${page.slug}/`]));

/** Resolve a link target relative to the source file into a repo-relative path. */
function repoPath(sourceFile, target) {
  const fromDir = posix.dirname(sourceFile);
  return posix.normalize(posix.join(fromDir, target));
}

function rewriteTarget(sourceFile, rawTarget) {
  const target = rawTarget.trim();
  if (target === "" || /^(https?:|mailto:|#)/i.test(target)) return rawTarget;
  const [pathPart, anchor = ""] = target.split("#");
  const hash = anchor ? `#${anchor}` : "";
  if (pathPart === "") return rawTarget;

  const path = repoPath(sourceFile, pathPart);
  const route = routeBySource.get(path);
  if (route) return `${route}${hash}`;
  if (IMAGE_EXT.test(path)) return `${GITHUB_RAW}${path}`;
  return `${GITHUB_BLOB}${path}${hash}`;
}

function rewriteLinks(sourceFile, markdown) {
  // Markdown links and images: [text](target) / ![alt](target). Fenced code is
  // left alone by only touching lines outside ``` blocks.
  const lines = markdown.split("\n");
  let inFence = false;
  return lines
    .map((line) => {
      if (/^\s*(```|~~~)/.test(line)) {
        inFence = !inFence;
        return line;
      }
      if (inFence) return line;
      return line.replace(
        /(!?\[[^\]]*\]\()([^)\s]+)((?:\s+"[^"]*")?\))/g,
        (_m, open, target, close) => `${open}${rewriteTarget(sourceFile, target)}${close}`,
      );
    })
    .join("\n");
}

function extractTitle(markdown) {
  const match = /^#\s+(.+?)\s*$/m.exec(markdown);
  return match ? match[1].replace(/`/g, "") : undefined;
}

function stripFirstHeading(markdown) {
  return markdown.replace(/^#\s+.+\n+/m, "");
}

function frontmatter(fields) {
  const lines = ["---"];
  for (const [key, value] of Object.entries(fields)) {
    if (value === undefined) continue;
    if (typeof value === "object") {
      lines.push(`${key}:`);
      for (const [k, v] of Object.entries(value)) lines.push(`  ${k}: ${JSON.stringify(v)}`);
    } else {
      lines.push(`${key}: ${JSON.stringify(value)}`);
    }
  }
  lines.push("---", "");
  return lines.join("\n");
}

function syncPages() {
  for (const dir of GENERATED_DIRS)
    rmSync(resolve(contentDir, dir), { recursive: true, force: true });

  for (const page of PAGES) {
    const sourcePath = resolve(repo, page.source);
    if (!existsSync(sourcePath)) {
      console.warn(`sync-docs: missing ${page.source}, skipped`);
      continue;
    }
    const raw = readFileSync(sourcePath, "utf8");
    const title = page.title ?? extractTitle(raw) ?? page.slug;
    const body = rewriteLinks(page.source, stripFirstHeading(raw));
    const out = resolve(contentDir, `${page.slug}.md`);
    mkdirSync(dirname(out), { recursive: true });
    writeFileSync(
      out,
      frontmatter({
        title,
        editUrl: `${GITHUB_EDIT}${page.source}`,
        sidebar: { order: page.order },
      }) + body,
    );
  }
  console.log(`sync-docs: ${PAGES.length} pages synced (base "${base || "/"}")`);
}

function renderTemplates() {
  for (const name of readdirSync(templateDir)) {
    const raw = readFileSync(resolve(templateDir, name), "utf8");
    writeFileSync(resolve(contentDir, name), raw.replaceAll("{{base}}", base));
  }
  console.log("sync-docs: hand-written pages rendered");
}

function mountVerifier() {
  const verifierDir = resolve(repo, "examples/web-verifier");
  const built = resolve(verifierDir, "dist/verifier.js");
  const target = resolve(publicDir, "verify");
  rmSync(target, { recursive: true, force: true });
  if (!existsSync(built)) {
    console.warn(
      "sync-docs: examples/web-verifier is not built; /verify/ will be missing. " +
        "Run `pnpm --filter @openartshield/web-verifier... build` first.",
    );
    return;
  }
  mkdirSync(target, { recursive: true });
  cpSync(resolve(verifierDir, "index.html"), resolve(target, "index.html"));
  cpSync(resolve(verifierDir, "dist"), resolve(target, "dist"), { recursive: true });
  console.log("sync-docs: verifier mounted at /verify/");
}

mkdirSync(contentDir, { recursive: true });
syncPages();
renderTemplates();
mountVerifier();
