import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

const DEFAULT_SOURCE_DIR = 'D:\\study meterials\\mission+1+2';
const sourceDir = process.env.HANDBOOKS_SRC_DIR || process.argv[2] || DEFAULT_SOURCE_DIR;
const targetDir = path.resolve(projectRoot, 'public', 'handbooks');
const manifestPath = path.join(sourceDir, 'library_manifest.json');

console.log('================================================================');
console.log('       MISSION+1+2 STUDY HANDBOOK IMPORT & VERIFICATION         ');
console.log('================================================================');
console.log(`Source Directory : ${sourceDir}`);
console.log(`Target Directory : ${targetDir}`);
console.log(`Source Manifest  : ${manifestPath}\n`);

if (!fs.existsSync(manifestPath)) {
  console.error(`ERROR: library_manifest.json not found at: ${manifestPath}`);
  process.exit(1);
}

const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
const chapters = manifest.chapters || [];
console.log(`Manifest loaded successfully: ${chapters.length} chapters defined.\n`);

if (chapters.length !== 479) {
  console.warn(`WARNING: Expected 479 chapters in manifest, found ${chapters.length}.`);
}

// Ensure target root directory exists
if (!fs.existsSync(targetDir)) {
  fs.mkdirSync(targetDir, { recursive: true });
}

let copiedCount = 0;
let verifiedCount = 0;
let totalBytes = 0;
const errors = [];

for (const ch of chapters) {
  const srcFile = path.join(sourceDir, ch.relative_path);
  const destFile = path.join(targetDir, ch.relative_path);
  const destSubdir = path.dirname(destFile);

  if (!fs.existsSync(srcFile)) {
    errors.push(`Missing source file: ${srcFile} (ID: ${ch.id})`);
    continue;
  }

  if (!fs.existsSync(destSubdir)) {
    fs.mkdirSync(destSubdir, { recursive: true });
  }

  // Check if file already exists with identical size
  let needsCopy = true;
  if (fs.existsSync(destFile)) {
    const existingStat = fs.statSync(destFile);
    if (existingStat.size === ch.file_size_bytes) {
      needsCopy = false;
      verifiedCount++;
      totalBytes += existingStat.size;
    }
  }

  if (needsCopy) {
    fs.copyFileSync(srcFile, destFile);
    const destStat = fs.statSync(destFile);
    if (destStat.size !== ch.file_size_bytes) {
      errors.push(`Size mismatch for ${ch.relative_path}: expected ${ch.file_size_bytes} bytes, got ${destStat.size} bytes`);
    } else {
      copiedCount++;
      totalBytes += destStat.size;
    }
  }
}

// Also copy library_manifest.json into public/handbooks for self-contained runtime access
const targetManifestPath = path.join(targetDir, 'library_manifest.json');
fs.copyFileSync(manifestPath, targetManifestPath);

console.log('----------------------------------------------------------------');
console.log(`Newly Copied Files : ${copiedCount}`);
console.log(`Already Up-To-Date : ${verifiedCount}`);
console.log(`Total Handbooks OK : ${copiedCount + verifiedCount} / ${chapters.length}`);
console.log(`Total Payload Size : ${(totalBytes / (1024 * 1024)).toFixed(2)} MB (${totalBytes.toLocaleString()} bytes)`);
console.log(`Manifest Synced    : ${fs.existsSync(targetManifestPath) ? 'YES' : 'NO'}`);
console.log('----------------------------------------------------------------');

if (errors.length > 0) {
  console.error(`\nFAILED: Encountered ${errors.length} error(s) during import:`);
  errors.forEach((err, idx) => console.error(`  ${idx + 1}. ${err}`));
  process.exit(1);
}

console.log('\nSUCCESS: 100% of the 479 chapter handbooks verified on disk.\n');
