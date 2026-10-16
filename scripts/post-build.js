import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.join(__dirname, '..');
const distDir = path.join(rootDir, 'dist');

console.log('[post-build] Verifying and synchronizing dist output...');

// Ensure dist/pages directory exists
const distPagesDir = path.join(distDir, 'pages');
if (!fs.existsSync(distPagesDir)) {
  fs.mkdirSync(distPagesDir, { recursive: true });
}

// Copy pages
const pagesDir = path.join(rootDir, 'pages');
if (fs.existsSync(pagesDir)) {
  fs.readdirSync(pagesDir).forEach((file) => {
    fs.copyFileSync(path.join(pagesDir, file), path.join(distPagesDir, file));
    console.log(`[post-build] Copied pages/${file} -> dist/pages/${file}`);
  });
}

// Root static assets to ensure are present in dist/
const rootAssets = [
  'sitemap.xml',
  'robots.txt',
  'google03905a8a03a50ab1.html',
  'sw.js',
  'manifest.json',
  'favicon.ico',
  'icon-48.png',
  'icon-96.png',
  'favicon-32.png',
  'apple-touch-icon.png',
  'icon.png',
  'icon-192.png',
  'icon-512.png',
  'icon-maskable-192.png',
  'icon-maskable-512.png',
  'og-image.png',
  '404.html'
];

rootAssets.forEach((asset) => {
  const publicPath = path.join(rootDir, 'public', asset);
  const rootPath = path.join(rootDir, asset);
  const srcPath = fs.existsSync(publicPath) ? publicPath : rootPath;
  const destPath = path.join(distDir, asset);
  if (fs.existsSync(srcPath) && !fs.existsSync(destPath)) {
    fs.copyFileSync(srcPath, destPath);
  }
});

// Copy screenshot assets to dist/assets/screenshots
const srcScreenshotsDir = path.join(rootDir, 'assets', 'screenshots');
const distScreenshotsDir = path.join(distDir, 'assets', 'screenshots');
if (fs.existsSync(srcScreenshotsDir)) {
  if (!fs.existsSync(distScreenshotsDir)) {
    fs.mkdirSync(distScreenshotsDir, { recursive: true });
  }
  fs.readdirSync(srcScreenshotsDir).forEach((file) => {
    fs.copyFileSync(path.join(srcScreenshotsDir, file), path.join(distScreenshotsDir, file));
    console.log(`[post-build] Copied screenshot: ${file} -> dist/assets/screenshots/${file}`);
  });
}

// Also copy icon assets into dist/assets for relative resolution from nested bundles
const distAssetsDir = path.join(distDir, 'assets');
if (fs.existsSync(distAssetsDir)) {
  ['icon-192.png', 'icon-512.png', 'icon.png', 'icon-maskable-192.png', 'icon-maskable-512.png', 'og-image.png'].forEach((icon) => {
    const publicPath = path.join(rootDir, 'public', icon);
    const assetPath = path.join(rootDir, 'assets', icon);
    const rootPath = path.join(rootDir, icon);
    const srcPath = fs.existsSync(publicPath) ? publicPath : (fs.existsSync(assetPath) ? assetPath : rootPath);
    if (fs.existsSync(srcPath)) {
      fs.copyFileSync(srcPath, path.join(distAssetsDir, icon));
    }
  });
}

// Normalize favicon paths in dist/index.html to stable canonical root URLs required by Google Search
const distIndexHtml = path.join(distDir, 'index.html');
if (fs.existsSync(distIndexHtml)) {
  let html = fs.readFileSync(distIndexHtml, 'utf8');
  html = html.replace(/<link rel="icon" href="[^"]*" sizes="48x48">/g, '<link rel="icon" href="/favicon.ico" sizes="48x48">');
  html = html.replace(/<link rel="icon" type="image\/png" sizes="48x48" href="[^"]*">/g, '<link rel="icon" type="image/png" sizes="48x48" href="/icon-48.png">');
  html = html.replace(/<link rel="icon" type="image\/png" sizes="96x96" href="[^"]*">/g, '<link rel="icon" type="image/png" sizes="96x96" href="/icon-96.png">');
  html = html.replace(/<link rel="shortcut icon" href="[^"]*">/g, '<link rel="shortcut icon" href="/favicon.ico">');
  fs.writeFileSync(distIndexHtml, html);
  console.log('[post-build] Normalized favicon paths in dist/index.html to stable root URLs');
}

// The first module requests can finish before the worker controls the page.
// Precache the generated bundles so a first-visit offline reload can hydrate.
const workerPath = path.join(distDir, 'sw.js');
const bundles = fs.readdirSync(distAssetsDir)
  .filter(file => /\.(?:js|css)$/.test(file))
  .sort()
  .map(file => `./assets/${file}`);
const worker = fs.readFileSync(workerPath, 'utf8');
const precacheAnchor = 'const ASSETS_TO_CACHE = [';
if (!worker.includes(precacheAnchor) || !bundles.length) {
  throw new Error('Missing service worker precache anchor or built bundles.');
}
fs.writeFileSync(workerPath, worker.replace(precacheAnchor,
  `${precacheAnchor}\n${bundles.map(file => `  ${JSON.stringify(file)},`).join('\n')}`));
console.log(`[post-build] Added ${bundles.length} built bundles to offline precache.`);
console.log('[post-build] All static assets successfully verified in dist/.');
