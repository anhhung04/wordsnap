import { defineConfig } from "vite";
import { resolve } from "path";
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "fs";

type BrowserTarget = "chrome" | "firefox";
type ManifestJson = Record<string, unknown> & {
  background?: Record<string, unknown>;
  browser_specific_settings?: Record<string, unknown>;
};

function resolveBrowserTarget(mode: string): BrowserTarget {
  return mode === "firefox" ? "firefox" : "chrome";
}

function buildManifest(target: BrowserTarget): ManifestJson {
  const manifestPath = resolve(__dirname, "src/manifest.json");
  const manifest = JSON.parse(readFileSync(manifestPath, "utf-8")) as ManifestJson;

  if (target === "firefox") {
    manifest.background = {
      scripts: ["background.js"],
      type: "module",
    };
    manifest.browser_specific_settings = {
      gecko: {
        id: "wordsnap@local.addon",
        strict_min_version: "115.0",
      },
    };
    return manifest;
  }

  manifest.background = {
    service_worker: "background.js",
    type: "module",
  };
  delete manifest.browser_specific_settings;
  return manifest;
}

/**
 * Parse a minified import like: import{s as n}from"./chunks/foo-bar.js";
 * Returns { bindings: [{local, source}], path }
 */
function parseImport(line: string): { bindings: Array<{ local: string; source: string }>; path: string } | null {
  const m = line.match(/^import\{([^}]+)\}from"\.\/([^"]+)";\s*$/);
  if (!m) return null;
  const path = m[2];
  const bindings = m[1].split(",").map((b) => {
    const parts = b.trim().split(" as ");
    return { local: parts[1] || parts[0], source: parts[0].trim() };
  });
  return { bindings, path };
}

/**
 * Parse a minified export like: export{o as a,n as g,t as o,e as r,s};
 * Returns a map: exportedName -> localName
 */
function parseExport(chunkCode: string): Record<string, string> {
  const m = chunkCode.match(/export\{([^}]*)\};?\s*$/);
  if (!m) return {};
  const map: Record<string, string> = {};
  for (const pair of m[1].split(",")) {
    const parts = pair.trim().split(" as ");
    const exportedName = (parts[1] || parts[0]).trim();
    const localName = parts[0].trim();
    map[exportedName] = localName;
  }
  return map;
}

/**
 * Inline a chunk import: wrap chunk code in IIFE, return variable assignments.
 */
function inlineChunkImport(
  chunkCode: string,
  bindings: Array<{ local: string; source: string }>
): string {
  const exportMap = parseExport(chunkCode);
  const body = chunkCode.replace(/export\{[^}]*\};?\s*$/, ";");

  // Build the return object keys we need (only export keys actually imported)
  const neededExports = bindings.map((b) => b.source);
  const returnPairs = neededExports.map((exp) => `${exp}:${exportMap[exp] || exp}`);

  const iife = `(function(){${body}return{${returnPairs.join(",")}};}())`;

  // Generate var assignments
  const assignments = bindings.map((b) => {
    const exp = b.source;
    return `var ${b.local}=${iife}.${exp};`;
  });

  return assignments.join("");
}

function copyExtensionFiles(target: BrowserTarget, outDir: string) {
  return {
    name: `copy-extension-files:${target}`,
    writeBundle() {
      const distDir = resolve(__dirname, outDir);

      writeFileSync(
        resolve(distDir, "manifest.json"),
        `${JSON.stringify(buildManifest(target), null, 2)}\n`
      );

      const iconsDir = resolve(distDir, "icons");
      if (!existsSync(iconsDir)) mkdirSync(iconsDir, { recursive: true });
      for (const size of [16, 48, 128]) {
        copyFileSync(
          resolve(__dirname, `src/assets/icons/icon${size}.png`),
          resolve(distDir, `icons/icon${size}.png`)
        );
      }

      for (const page of ["options"]) {
        const srcHtml = resolve(distDir, `src/${page}/index.html`);
        const destDir = resolve(distDir, page);
        const destHtml = resolve(destDir, "index.html");
        if (!existsSync(srcHtml)) continue;

        if (!existsSync(destDir)) mkdirSync(destDir, { recursive: true });
        let html = readFileSync(srcHtml, "utf-8");
        html = html.replace(/\.\.\/\.\.\//g, "../");
        writeFileSync(destHtml, html);
      }

      const srcDir = resolve(distDir, "src");
      if (existsSync(srcDir)) {
        rmSync(srcDir, { recursive: true, force: true });
      }

      // Firefox: inline chunk deps into content.js so it runs as a classic script
      if (target === "firefox") {
        const contentJsPath = resolve(distDir, "content.js");
        if (existsSync(contentJsPath)) {
          let code = readFileSync(contentJsPath, "utf-8");
          const importRe = /^import\{[^}]+\}from"\.\/([^"]+)";\s*/gm;
          let match: RegExpExecArray | null;
          while ((match = importRe.exec(code)) !== null) {
            const fullMatch = match[0];
            const chunkPath = resolve(distDir, match[1]);
            if (existsSync(chunkPath)) {
              const chunkCode = readFileSync(chunkPath, "utf-8");
              const parsed = parseImport(fullMatch);
              if (parsed) {
                const replacement = inlineChunkImport(chunkCode, parsed.bindings);
                code = code.replace(fullMatch, replacement);
                importRe.lastIndex = 0; // reset after string modification
              }
            }
          }
          writeFileSync(contentJsPath, code);
        }
      }
    },
  };
}

export default defineConfig(({ mode }) => {
  const browserTarget = resolveBrowserTarget(mode);
  const outDir = `dist/${browserTarget}`;

  return {
    base: "./",
    build: {
      outDir,
      emptyOutDir: true,
      rollupOptions: {
        input: {
          content: resolve(__dirname, "src/content/index.ts"),
          background: resolve(__dirname, "src/background/index.ts"),
          options: resolve(__dirname, "src/options/index.html"),
        },
        output: {
          entryFileNames: (chunkInfo) => {
            if (chunkInfo.name === "options") {
              return "[name]/index.js";
            }
            return "[name].js";
          },
          chunkFileNames: "chunks/[name]-[hash].js",
          assetFileNames: "assets/[name]-[hash][extname]",
        },
      },
      target: browserTarget === "firefox" ? "firefox115" : "chrome110",
      minify: "terser",
      sourcemap: false,
    },
    resolve: {
      alias: {
        "@": resolve(__dirname, "src"),
      },
    },
    plugins: [copyExtensionFiles(browserTarget, outDir)],
  };
});