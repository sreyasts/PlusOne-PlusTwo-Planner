import sharp from 'sharp';
import path from 'path';
import { fileURLToPath } from 'url';
import { APP_LOGO_SVG } from '../src/ui/illustrations.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const publicDir = path.join(root, 'public');

async function renderIcons() {
  const svgBuffer = Buffer.from(APP_LOGO_SVG.trim());

  await sharp(svgBuffer).resize(512, 512).png().toFile(path.join(publicDir, 'icon-512.png'));
  await sharp(svgBuffer).resize(192, 192).png().toFile(path.join(publicDir, 'icon-192.png'));
  await sharp(svgBuffer).resize(192, 192).png().toFile(path.join(publicDir, 'icon.png'));
  await sharp(svgBuffer).resize(32, 32).png().toFile(path.join(publicDir, 'favicon-32.png'));
  
  const iconsDir = path.join(publicDir, 'icons');
  await sharp(svgBuffer).resize(192, 192).png().toFile(path.join(iconsDir, 'icon-192.png'));
  await sharp(svgBuffer).resize(512, 512).png().toFile(path.join(iconsDir, 'icon-512.png'));
  
  console.log('Successfully generated modern high-res app icons from APP_LOGO_SVG!');
}

renderIcons().catch(err => {
  console.error(err);
  process.exit(1);
});
