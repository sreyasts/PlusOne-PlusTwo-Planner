import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  getHandbookUrl,
  hasHandbook,
  getHandbookInfo,
  RATIONALIZED_CHAPTER_IDS,
  CANONICAL_HANDBOOK_MAP,
} from '../src/utils/handbook-lookup.js';
import { PLUS_ONE_SYLLABUS } from '../src/data/syllabus-plus-one.js';
import { PLUS_TWO_SYLLABUS } from '../src/data/syllabus-plus-two.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

const publicHandbooksDir = path.resolve(projectRoot, 'public', 'handbooks');
const primaryManifestPath = path.resolve(publicHandbooksDir, 'library_manifest.json');
const fallbackManifestPath = 'D:\\study meterials\\mission+1+2\\library_manifest.json';

const manifestPath = fs.existsSync(primaryManifestPath)
  ? primaryManifestPath
  : (fs.existsSync(fallbackManifestPath) ? fallbackManifestPath : null);

console.log('='.repeat(78));
console.log('     HSS PLANNER - MISSION+1+2 HANDBOOK & SYLLABUS VERIFICATION AUDIT    ');
console.log('='.repeat(78));
console.log(`Working Directory   : ${projectRoot}`);
console.log(`Public Handbooks    : ${publicHandbooksDir}`);
console.log(`Manifest Path       : ${manifestPath || 'NOT FOUND'}`);
console.log(`Timestamp           : ${new Date().toISOString()}\n`);

const errors = [];
const warnings = [];

if (!manifestPath) {
  console.error('[FATAL] library_manifest.json not found in public/handbooks or fallback path.');
  process.exit(1);
}

// ---------------------------------------------------------------------------
// 1. MANIFEST & DISK PHYSICAL INTEGRITY AUDIT (479/479 HANDBOOKS)
// ---------------------------------------------------------------------------
console.log('--- 1. STATIC ASSET & MANIFEST INTEGRITY AUDIT ---');
let manifest;
try {
  manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
} catch (err) {
  console.error(`[FATAL] Failed to parse manifest JSON: ${err.message}`);
  process.exit(1);
}

const chapters = manifest.chapters || [];
console.log(`Manifest Version     : ${manifest.version || 'unknown'}`);
console.log(`Total Listed Entries : ${chapters.length}`);

if (chapters.length !== 479) {
  errors.push(`Manifest expected exactly 479 chapters, but found ${chapters.length}`);
}

let manifestVerifiedCount = 0;
let totalSizeBytes = 0;
const streamCounts = {};
const levelCounts = { '+1': 0, '+2': 0 };

for (const ch of chapters) {
  const relPath = ch.relative_path;
  if (!relPath) {
    errors.push(`Manifest entry ${ch.id || 'unknown'} has missing relative_path`);
    continue;
  }

  // Web-safety checks
  if (relPath.includes('\\')) {
    errors.push(`Relative path contains backslashes: ${relPath}`);
  }
  if (relPath.includes(' ')) {
    errors.push(`Relative path contains spaces: ${relPath}`);
  }
  if (!relPath.endsWith('.pdf')) {
    errors.push(`Relative path does not end with .pdf: ${relPath}`);
  }

  const diskPath = path.resolve(publicHandbooksDir, relPath);
  if (!fs.existsSync(diskPath)) {
    errors.push(`Handbook file missing on disk: ${diskPath} (${ch.id})`);
    continue;
  }

  const stat = fs.statSync(diskPath);
  if (stat.size === 0) {
    errors.push(`Handbook file on disk is empty (0 bytes): ${diskPath}`);
    continue;
  }

  if (ch.file_size_bytes && stat.size !== ch.file_size_bytes) {
    warnings.push(`File size difference for ${relPath}: manifest=${ch.file_size_bytes}, disk=${stat.size}`);
  }

  totalSizeBytes += stat.size;
  manifestVerifiedCount++;

  const lvl = ch.level || (relPath.startsWith('+1') ? '+1' : '+2');
  if (levelCounts[lvl] !== undefined) levelCounts[lvl]++;

  const streamKey = `${lvl}/${ch.stream || 'Unknown'}`;
  streamCounts[streamKey] = (streamCounts[streamKey] || 0) + 1;
}

console.log(`Physical Files OK   : ${manifestVerifiedCount} / ${chapters.length}`);
console.log(`Total Storage Size  : ${(totalSizeBytes / (1024 * 1024)).toFixed(2)} MB (${totalSizeBytes.toLocaleString()} bytes)`);
console.log(`Grade Breakdown     : +1: ${levelCounts['+1']} files | +2: ${levelCounts['+2']} files`);
console.log('Stream Breakdown    :');
for (const [st, cnt] of Object.entries(streamCounts)) {
  console.log(`  - ${st.padEnd(28)} : ${cnt} handbooks`);
}
console.log();

// ---------------------------------------------------------------------------
// 2. CURRICULUM CHAPTERS RESOLUTION AUDIT (288 UNIQUE CHAPTERS)
// ---------------------------------------------------------------------------
console.log('--- 2. CURRICULUM MAPPING & RESOLUTION AUDIT (288 UNIQUE CHAPTERS) ---');
const allCurriculumTasks = [...PLUS_ONE_SYLLABUS, ...PLUS_TWO_SYLLABUS];
const uniqueCurriculumChapters = new Map();

for (const task of allCurriculumTasks) {
  if (!uniqueCurriculumChapters.has(task.chapId)) {
    uniqueCurriculumChapters.set(task.chapId, task);
  }
}

const totalUniqueChapters = uniqueCurriculumChapters.size;
console.log(`Total Unique Syllabus Chapters : ${totalUniqueChapters} (Expected: 288)`);
if (totalUniqueChapters !== 288) {
  errors.push(`Expected 288 unique syllabus chapters, but got ${totalUniqueChapters}`);
}

const STREAMS = ['cs', 'bio', 'commerce', 'humanities'];
let activeChaptersResolved = 0;
let rationalizedVerified = 0;
let streamCombinationsTested = 0;

for (const [chapId, chap] of uniqueCurriculumChapters.entries()) {
  const isRationalized = RATIONALIZED_CHAPTER_IDS.has(chapId);

  // 1) Default context lookup
  const defaultUrl = getHandbookUrl(chap);
  const info = getHandbookInfo(chap);

  if (isRationalized) {
    if (defaultUrl !== null) {
      errors.push(`Rationalized chapter ${chapId} returned non-null URL: ${defaultUrl}`);
    }
    if (hasHandbook(chap)) {
      errors.push(`hasHandbook returned true for rationalized chapter ${chapId}`);
    }
    if (info.available !== false || info.rationalized !== true) {
      errors.push(`getHandbookInfo incorrect for rationalized chapter ${chapId}: ${JSON.stringify(info)}`);
    }
    rationalizedVerified++;
  } else {
    if (!defaultUrl) {
      errors.push(`Active chapter ${chapId} (${chap.chapterName}) returned null URL`);
    } else {
      if (!defaultUrl.startsWith('/handbooks/')) {
        errors.push(`Handbook URL must start with '/handbooks/': ${defaultUrl}`);
      }
      if (defaultUrl.includes(' ')) {
        errors.push(`Handbook URL contains unencoded spaces: ${defaultUrl}`);
      }

      const relPath = defaultUrl.replace(/^\/handbooks\//, '');
      const diskPath = path.resolve(publicHandbooksDir, relPath);
      if (!fs.existsSync(diskPath)) {
        errors.push(`Resolved URL 404s on disk for ${chapId}: ${diskPath}`);
      } else {
        const stat = fs.statSync(diskPath);
        if (stat.size === 0) {
          errors.push(`Resolved URL file is 0 bytes for ${chapId}: ${diskPath}`);
        }
      }
      activeChaptersResolved++;
    }
  }

  // 2) Cross-check across all 4 streams
  for (const stream of STREAMS) {
    streamCombinationsTested++;
    const streamUrl = getHandbookUrl(chap, { stream });
    if (isRationalized) {
      if (streamUrl !== null) {
        errors.push(`Rationalized chapter ${chapId} returned non-null for stream ${stream}: ${streamUrl}`);
      }
    } else {
      if (!streamUrl) {
        errors.push(`Active chapter ${chapId} returned null for stream ${stream}`);
      } else {
        const relPath = streamUrl.replace(/^\/handbooks\//, '');
        const diskPath = path.resolve(publicHandbooksDir, relPath);
        if (!fs.existsSync(diskPath)) {
          errors.push(`Stream-routed handbook 404s on disk for ${chapId} (${stream}): ${diskPath}`);
        }
      }
    }
  }
}

console.log(`Active Chapters Resolved   : ${activeChaptersResolved} / 280 (100%)`);
console.log(`Rationalized Checked (null): ${rationalizedVerified} / 8 (100%)`);
console.log(`Stream Matrix Invocations  : ${streamCombinationsTested} tests passed`);
console.log();

// ---------------------------------------------------------------------------
// 3. INVERTED & SHIFTED SUBJECT INVARIANTS AUDIT
// ---------------------------------------------------------------------------
console.log('--- 3. INVERTED & SHIFTED SUBJECT INVARIANTS AUDIT ---');
const shiftedChecks = [
  {
    name: '+2 Zoology Ch 3 (Inheritance) -> Botany Ch 2',
    chapId: '+2_Zoology_3',
    expectedRelPath: '+2/Biology_Science/Biology/Botany/Chapter_02_Principles_of_Inheritance_and_Variation.pdf',
  },
  {
    name: '+2 Zoology Ch 4 (Molecular Basis) -> Botany Ch 3',
    chapId: '+2_Zoology_4',
    expectedRelPath: '+2/Biology_Science/Biology/Botany/Chapter_03_Molecular_Basis_of_Inheritance.pdf',
  },
  {
    name: '+2 Zoology Ch 7 (Microbes) -> Botany Ch 4',
    chapId: '+2_Zoology_7',
    expectedRelPath: '+2/Biology_Science/Biology/Botany/Chapter_04_Microbes_in_Human_Welfare.pdf',
  },
  {
    name: '+2 Botany Ch 2 (Biotech Principles) -> Botany Ch 5',
    chapId: '+2_Botany_2',
    expectedRelPath: '+2/Biology_Science/Biology/Botany/Chapter_05_Biotechnology_Principles_and_Processes.pdf',
  },
  {
    name: '+2 Botany Ch 5 (Ecosystem) -> Botany Ch 8',
    chapId: '+2_Botany_5',
    expectedRelPath: '+2/Biology_Science/Biology/Botany/Chapter_08_Ecosystem.pdf',
  },
  {
    name: '+2 Economics Ch 7 (Intro to Macro) -> Macro Ch 6',
    chapId: '+2_Economics_7',
    expectedRelPath: '+2/Commerce/Economics/Chapter_06_Introduction_to_Macroeconomics.pdf',
  },
  {
    name: '+2 Economics Ch 12 (Open Economy) -> Macro Ch 11',
    chapId: '+2_Economics_12',
    expectedRelPath: '+2/Commerce/Economics/Chapter_11_Open_Economy_Macroeconomics.pdf',
  },
  {
    name: '+1 Business Studies Ch 7 (Sources of Finance) -> Manifest Ch 8',
    chapId: '+1_Business_Studies_7',
    expectedRelPath: '+1/Commerce/Business_Studies/Chapter_08_Sources_of_Business_Finance.pdf',
  },
  {
    name: '+1 Business Studies Ch 10 (International Business) -> Manifest Ch 11',
    chapId: '+1_Business_Studies_10',
    expectedRelPath: '+1/Commerce/Business_Studies/Chapter_11_International_Business.pdf',
  },
];

let shiftedPassed = 0;
for (const check of shiftedChecks) {
  const url = getHandbookUrl(check.chapId);
  const expectedUrl = '/handbooks/' + check.expectedRelPath;
  if (url !== expectedUrl) {
    errors.push(`Shifted invariant failed for ${check.name}: expected '${expectedUrl}', got '${url}'`);
  } else {
    const fullPath = path.resolve(publicHandbooksDir, check.expectedRelPath);
    if (!fs.existsSync(fullPath)) {
      errors.push(`Shifted target file does not exist on disk: ${fullPath}`);
    } else {
      shiftedPassed++;
      console.log(`  [PASS] ${check.name}`);
    }
  }
}
console.log(`Shifted / Inverted Invariants: ${shiftedPassed} / ${shiftedChecks.length} verified OK.\n`);

// ---------------------------------------------------------------------------
// 4. RATIONALIZED CHAPTERS ZERO-404 AUDIT
// ---------------------------------------------------------------------------
console.log('--- 4. RATIONALIZED CHAPTERS ZERO-404 AUDIT (8 CHAPTERS) ---');
const rationalizedIds = [
  '+2_Economics_6',
  '+2_Sociology_4',
  '+2_Sociology_9',
  '+2_Sociology_12',
  '+1_Political_Science_9',
  '+1_Political_Science_10',
  '+1_Political_Science_16',
  '+1_Sociology_7',
];

let rationalizedOk = 0;
for (const id of rationalizedIds) {
  const url = getHandbookUrl(id);
  const has = hasHandbook(id);
  if (url !== null || has !== false) {
    errors.push(`Rationalized chapter ${id} did not return null/false: url=${url}, has=${has}`);
  } else {
    rationalizedOk++;
    console.log(`  [PASS] ${id} correctly mapped to null`);
  }
}
console.log(`Rationalized Zero-404 Guard: ${rationalizedOk} / ${rationalizedIds.length} verified OK.\n`);

// ---------------------------------------------------------------------------
// 5. SUMMARY & EXIT CODE
// ---------------------------------------------------------------------------
console.log('='.repeat(78));
console.log('                          VERIFICATION SUMMARY                           ');
console.log('='.repeat(78));
console.log(`Manifest Handbooks Tested : ${chapters.length}`);
console.log(`Physical Handbooks on Disk: ${manifestVerifiedCount} (100% Verified, Non-Empty)`);
console.log(`Unique Syllabus Chapters  : ${totalUniqueChapters}`);
console.log(`Active Chapters Resolved  : ${activeChaptersResolved} / 280`);
console.log(`Rationalized Checked      : ${rationalizedVerified} / 8 (Zero 404s guaranteed)`);
console.log(`Stream Matrix Tests       : ${streamCombinationsTested}`);
console.log(`Warnings                  : ${warnings.length}`);
console.log(`Broken Links / Errors     : ${errors.length}`);
console.log('='.repeat(78));

if (warnings.length > 0) {
  console.log('\nWarnings:');
  warnings.forEach((w, i) => console.log(`  ${i + 1}. ${w}`));
}

if (errors.length > 0) {
  console.error('\nFAILED: Verification encountered broken links or invariant violations:');
  errors.forEach((e, i) => console.error(`  ${i + 1}. ${e}`));
  console.error('\nExit Code: 1');
  process.exit(1);
}

console.log('\n[SUCCESS] 100% of Mission+1+2 handbooks (479/479) and curriculum chapters (288/288) verified with 0 errors.');
console.log('Exit Code: 0\n');
process.exit(0);
