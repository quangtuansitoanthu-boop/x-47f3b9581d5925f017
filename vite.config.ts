import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';
import fs from 'node:fs';
import path from 'node:path';
import { filterIosContent } from './src/lib/domain/ios-content-policy';

function staticAssetsFallbackPlugin() {
  const mimeTypes: Record<string, string> = {
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.webp': 'image/webp',
    '.svg': 'image/svg+xml',
    '.gif': 'image/gif',
    '.mp3': 'audio/mpeg',
    '.m4a': 'audio/mp4',
    '.aac': 'audio/aac',
    '.mp4': 'video/mp4',
    '.json': 'application/json',
    '.css': 'text/css',
    '.js': 'application/javascript',
    '.ico': 'image/x-icon',
    '.ttf': 'font/ttf',
  };

  return {
    name: 'static-assets-fallback',
    configureServer(server: any) {
      server.middlewares.use((req: any, res: any, next: any) => {
        const url = (req.url || '').split('?')[0];
        if (url.startsWith('/assets/')) {
          const relativePath = decodeURIComponent(url.slice('/assets/'.length));
          const filePath = path.resolve(process.cwd(), 'assets', relativePath);
          if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
            const ext = path.extname(filePath).toLowerCase();
            res.setHeader('Content-Type', mimeTypes[ext] || 'application/octet-stream');
            return fs.createReadStream(filePath).pipe(res);
          }
        }
        if (url === '/manifest.json') {
          const manifestPath = path.resolve(process.cwd(), 'manifest.json');
          if (fs.existsSync(manifestPath)) {
            res.setHeader('Content-Type', 'application/manifest+json');
            return fs.createReadStream(manifestPath).pipe(res);
          }
        }
        next();
      });
    },
    closeBundle() {
      try {
        const assetsSrc = path.resolve(process.cwd(), 'assets');
        const manifestSrc = path.resolve(process.cwd(), 'manifest.json');
        for (const target of ['dist-sveltekit', '.svelte-kit/output/client']) {
          const targetDir = path.resolve(process.cwd(), target);
          if (fs.existsSync(targetDir)) {
            const targetAssets = path.resolve(targetDir, 'assets');
            if (fs.existsSync(targetAssets) && !fs.statSync(targetAssets).isDirectory()) {
              fs.rmSync(targetAssets, { force: true });
              fs.cpSync(assetsSrc, targetAssets, { recursive: true });
            }
            const targetManifest = path.resolve(targetDir, 'manifest.json');
            if (fs.existsSync(targetManifest) && fs.statSync(targetManifest).size < 100) {
              fs.copyFileSync(manifestSrc, targetManifest);
            }
          }
        }
      } catch (err) {
        console.warn('staticAssetsFallbackPlugin bundle sync error:', err);
      }
    }
  };
}

export default defineConfig({
  cacheDir: 'node_modules/.vite_cache',
  plugins: [
    {
      name: 'ios-content-exclusions',
      enforce: 'pre',
      transform(code, id) {
        if (process.env.CAPACITOR_BUILD !== '1') return;
        if (/\/src\/lib\/data\/(?:offline-books-(?:vi|en)|offline-bundled-articles|offline-talks|english-pack-manifest|chapters-en-availability)\.json$/u.test(id.replaceAll('\\', '/'))) {
          return JSON.stringify(filterIosContent(JSON.parse(code)));
        }
      },
    },
    staticAssetsFallbackPlugin(), sveltekit(),
  ],
  server: {
    watch: {
      // HTML trong trace kiểm thử không được làm tải lại màn hình đang thao tác.
      ignored: ['**/dist-sveltekit/**', '**/.wrangler/**', '**/.artifacts/**', '**/test-results/**'],
    },
  },
  // Pinned so a toolchain upgrade cannot silently raise the browser floor.
  // Members read the site on older phones, and iOS 14 is the oldest release
  // still worth serving; esbuild lowers newer syntax (logical assignment,
  // static blocks, private fields) down to it.
  build: {
    target: ['es2020', 'safari14', 'chrome87', 'firefox78', 'edge88'],
  },
  optimizeDeps: {
    include: ['@ckeditor/ckeditor5-build-decoupled-document'],
  },
});
