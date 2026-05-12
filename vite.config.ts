import { defineConfig } from 'vite';
import { resolve } from 'path';
import { copyFileSync, mkdirSync, existsSync, readFileSync, writeFileSync, rmSync } from 'fs';

// Plugin to copy static assets and fix paths
function copyExtensionFiles() {
  return {
    name: 'copy-extension-files',
    writeBundle() {
      const distDir = resolve(__dirname, 'dist');

      // Copy manifest
      copyFileSync(
        resolve(__dirname, 'src/manifest.json'),
        resolve(distDir, 'manifest.json')
      );

      // Copy icons
      const iconsDir = resolve(distDir, 'icons');
      if (!existsSync(iconsDir)) mkdirSync(iconsDir, { recursive: true });
      for (const size of [16, 48, 128]) {
        copyFileSync(
          resolve(__dirname, `src/assets/icons/icon${size}.png`),
          resolve(distDir, `icons/icon${size}.png`)
        );
      }

      // Move HTML files from dist/src/* to dist/* and fix paths
      for (const page of ['options', 'notes']) {
        const srcHtml = resolve(distDir, `src/${page}/index.html`);
        const destDir = resolve(distDir, page);
        const destHtml = resolve(destDir, 'index.html');
        if (existsSync(srcHtml)) {
          if (!existsSync(destDir)) mkdirSync(destDir, { recursive: true });
          let html = readFileSync(srcHtml, 'utf-8');
          html = html.replace(/\.\.\/\.\.\//g, '../');
          writeFileSync(destHtml, html);
        }
      }

      // Clean up empty src dir
      const srcDir = resolve(distDir, 'src');
      if (existsSync(srcDir)) {
        try {
          rmSync(srcDir, { recursive: true });
        } catch { /* ignore */ }
      }
    },
  };
}

export default defineConfig({
  base: './',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        content: resolve(__dirname, 'src/content/index.ts'),
        background: resolve(__dirname, 'src/background/index.ts'),
        options: resolve(__dirname, 'src/options/index.html'),
        notes: resolve(__dirname, 'src/notes/index.html'),
      },
      output: {
        entryFileNames: (chunkInfo) => {
          if (chunkInfo.name === 'options' || chunkInfo.name === 'notes') {
            return '[name]/index.js';
          }
          return '[name].js';
        },
        chunkFileNames: 'chunks/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash][extname]',
      },
    },
    target: 'chrome110',
    minify: 'terser',
    sourcemap: false,
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    },
  },
  plugins: [copyExtensionFiles()],
});
