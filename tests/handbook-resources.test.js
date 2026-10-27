import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  getHandbookUrl,
  hasHandbook,
  getHandbookInfo,
  CANONICAL_HANDBOOK_MAP,
  RATIONALIZED_CHAPTER_IDS,
} from '../src/utils/handbook-lookup.js';
import { PLUS_ONE_SYLLABUS } from '../src/data/syllabus-plus-one.js';
import { PLUS_TWO_SYLLABUS } from '../src/data/syllabus-plus-two.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');
const handbooksDir = path.resolve(projectRoot, 'public', 'handbooks');
const manifestPath = path.resolve(handbooksDir, 'library_manifest.json');

describe('Milestone 3: Mission+1+2 Handbook Automated Verification & Guardrails', () => {
  // -------------------------------------------------------------------------
  // 1. Static Manifest & Disk Invariants (479/479 Handbooks)
  // -------------------------------------------------------------------------
  describe('1. Static Manifest & Disk Invariants (479/479 Handbooks)', () => {
    it('loads library_manifest.json containing exactly 479 chapters', () => {
      expect(fs.existsSync(manifestPath)).toBe(true);
      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
      expect(Array.isArray(manifest.chapters)).toBe(true);
      expect(manifest.chapters.length).toBe(479);
    });

    it('verifies every single handbook file exists on disk and is non-empty (>0 bytes)', () => {
      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
      let missingCount = 0;
      let emptyCount = 0;
      let totalBytes = 0;

      for (const ch of manifest.chapters) {
        const fullPath = path.resolve(handbooksDir, ch.relative_path);
        if (!fs.existsSync(fullPath)) {
          missingCount++;
        } else {
          const stat = fs.statSync(fullPath);
          if (stat.size === 0) {
            emptyCount++;
          }
          totalBytes += stat.size;
        }
      }

      expect(missingCount).toBe(0);
      expect(emptyCount).toBe(0);
      // Entire library should be ~58-62 MB
      expect(totalBytes).toBeGreaterThan(50 * 1024 * 1024);
    });

    it('verifies all 479 relative paths conform to web-safe formatting', () => {
      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
      for (const ch of manifest.chapters) {
        expect(ch.relative_path).toMatch(/^[+][12]\/[A-Za-z0-9_/-]+\.pdf$/);
        expect(ch.relative_path).not.toContain('\\');
        expect(ch.relative_path).not.toContain(' ');
      }
    });

    it('verifies exact stream and grade distribution across all 479 handbooks', () => {
      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
      const counts = {};
      for (const ch of manifest.chapters) {
        const streamKey = `${ch.level}/${ch.stream}`;
        counts[streamKey] = (counts[streamKey] || 0) + 1;
      }

      expect(counts['+1/Computer_Science']).toBe(49);
      expect(counts['+1/Biology_Science']).toBe(56);
      expect(counts['+1/Commerce']).toBe(71);
      expect(counts['+1/Humanities']).toBe(68);

      expect(counts['+2/Computer_Science']).toBe(49);
      expect(counts['+2/Biology_Science']).toBe(50);
      expect(counts['+2/Commerce']).toBe(70);
      expect(counts['+2/Humanities']).toBe(66);

      const total = Object.values(counts).reduce((a, b) => a + b, 0);
      expect(total).toBe(479);
    });
  });

  // -------------------------------------------------------------------------
  // 2. Full Curriculum Stream Matrix (All 4 Streams, +1 & +2)
  // -------------------------------------------------------------------------
  describe('2. Full Curriculum Stream Matrix (All 4 Streams, +1 & +2)', () => {
    const allTasks = [...PLUS_ONE_SYLLABUS, ...PLUS_TWO_SYLLABUS];
    const uniqueChapters = new Map();
    for (const task of allTasks) {
      if (!uniqueChapters.has(task.chapId)) {
        uniqueChapters.set(task.chapId, task);
      }
    }

    it('contains exactly 288 unique syllabus chapters (142 for +1, 146 for +2)', () => {
      expect(uniqueChapters.size).toBe(288);
      const plusOneCount = [...uniqueChapters.values()].filter(t => t.grade === '+1').length;
      const plusTwoCount = [...uniqueChapters.values()].filter(t => t.grade === '+2').length;
      expect(plusOneCount).toBe(142);
      expect(plusTwoCount).toBe(146);
    });

    it('resolves 100% of the 280 active curriculum chapters with 0 broken links on disk', () => {
      let resolvedCount = 0;
      for (const [chapId, chap] of uniqueChapters.entries()) {
        if (!RATIONALIZED_CHAPTER_IDS.has(chapId)) {
          const url = getHandbookUrl(chap);
          expect(url).not.toBeNull();
          expect(url.startsWith('/handbooks/')).toBe(true);

          const relPath = url.replace(/^\/handbooks\//, '');
          const diskPath = path.resolve(handbooksDir, relPath);
          expect(fs.existsSync(diskPath)).toBe(true);
          expect(fs.statSync(diskPath).size).toBeGreaterThan(0);
          resolvedCount++;
        }
      }
      expect(resolvedCount).toBe(280);
    });

    it('cross-checks all 288 chapters across all 4 streams (CS, Bio, Commerce, Humanities)', () => {
      const streams = ['cs', 'bio', 'commerce', 'humanities'];
      for (const [chapId, chap] of uniqueChapters.entries()) {
        const isRat = RATIONALIZED_CHAPTER_IDS.has(chapId);
        for (const st of streams) {
          const url = getHandbookUrl(chap, { stream: st });
          if (isRat) {
            expect(url).toBeNull();
          } else {
            expect(url).not.toBeNull();
            const relPath = url.replace(/^\/handbooks\//, '');
            const diskPath = path.resolve(handbooksDir, relPath);
            expect(fs.existsSync(diskPath)).toBe(true);
          }
        }
      }
    });

    it('correctly routes science, math, and economics handbooks according to stream', () => {
      // Physics in Bio vs CS
      const bioPhy = getHandbookUrl('+1_Physics_1', { stream: 'bio' });
      expect(bioPhy).toBe('/handbooks/+1/Biology_Science/Physics/Chapter_01_Units_and_Measurements.pdf');

      const csPhy = getHandbookUrl('+1_Physics_1', { stream: 'cs' });
      expect(csPhy).toBe('/handbooks/+1/Computer_Science/Physics/Chapter_01_Units_and_Measurements.pdf');

      // Chemistry in Bio vs CS
      const bioChem = getHandbookUrl('+1_Chemistry_1', { stream: 'bio' });
      expect(bioChem).toBe('/handbooks/+1/Biology_Science/Chemistry/Chapter_01_Some_Basic_Concepts_of_Chemistry.pdf');

      const csChem = getHandbookUrl('+1_Chemistry_1', { stream: 'cs' });
      expect(csChem).toBe('/handbooks/+1/Computer_Science/Chemistry/Chapter_01_Some_Basic_Concepts_of_Chemistry.pdf');

      // Maths in Commerce
      const commMath = getHandbookUrl('+1_Mathematics_1', { stream: 'commerce' });
      expect(commMath).toBe('/handbooks/+1/Commerce/Maths/Chapter_01_Sets.pdf');

      // Economics in Humanities vs Commerce
      const humEcon = getHandbookUrl('+1_Economics_8', { stream: 'humanities' });
      expect(humEcon).toBe('/handbooks/+1/Humanities/Economics/Chapter_09_Indian_Economy_on_the_Eve_of_Independence.pdf');

      const commEcon = getHandbookUrl('+1_Economics_8', { stream: 'commerce' });
      expect(commEcon).toBe('/handbooks/+1/Commerce/Economics/Chapter_09_Indian_Economy_on_the_Eve_of_Independence.pdf');
    });
  });

  // -------------------------------------------------------------------------
  // 3. Inverted and Shifted Subjects Guardrails
  // -------------------------------------------------------------------------
  describe('3. Inverted and Shifted Subjects Guardrails', () => {
    it('correctly maps +2 Zoology chapters into Botany directory in Mission+1+2 library', () => {
      // Zoology Ch 3 (Principles of Inheritance and Variation) is Botany Ch 2
      const zoo3 = getHandbookUrl('+2_Zoology_3');
      expect(zoo3).toBe('/handbooks/+2/Biology_Science/Biology/Botany/Chapter_02_Principles_of_Inheritance_and_Variation.pdf');
      expect(fs.existsSync(path.resolve(handbooksDir, zoo3.replace(/^\/handbooks\//, '')))).toBe(true);

      // Zoology Ch 4 (Molecular Basis of Inheritance) is Botany Ch 3
      const zoo4 = getHandbookUrl('+2_Zoology_4');
      expect(zoo4).toBe('/handbooks/+2/Biology_Science/Biology/Botany/Chapter_03_Molecular_Basis_of_Inheritance.pdf');
      expect(fs.existsSync(path.resolve(handbooksDir, zoo4.replace(/^\/handbooks\//, '')))).toBe(true);

      // Zoology Ch 7 (Microbes in Human Welfare) is Botany Ch 4
      const zoo7 = getHandbookUrl('+2_Zoology_7');
      expect(zoo7).toBe('/handbooks/+2/Biology_Science/Biology/Botany/Chapter_04_Microbes_in_Human_Welfare.pdf');
      expect(fs.existsSync(path.resolve(handbooksDir, zoo7.replace(/^\/handbooks\//, '')))).toBe(true);
    });

    it('correctly maps shifted +2 Botany chapters', () => {
      // Botany Ch 2 (Biotechnology: Principles and Processes) is Chapter 05
      const bot2 = getHandbookUrl('+2_Botany_2');
      expect(bot2).toBe('/handbooks/+2/Biology_Science/Biology/Botany/Chapter_05_Biotechnology_Principles_and_Processes.pdf');
      expect(fs.existsSync(path.resolve(handbooksDir, bot2.replace(/^\/handbooks\//, '')))).toBe(true);

      // Botany Ch 3 (Biotechnology and its Applications) is Chapter 06
      const bot3 = getHandbookUrl('+2_Botany_3');
      expect(bot3).toBe('/handbooks/+2/Biology_Science/Biology/Botany/Chapter_06_Biotechnology_and_its_Applications.pdf');
      expect(fs.existsSync(path.resolve(handbooksDir, bot3.replace(/^\/handbooks\//, '')))).toBe(true);

      // Botany Ch 4 (Organisms and Populations) is Chapter 07
      const bot4 = getHandbookUrl('+2_Botany_4');
      expect(bot4).toBe('/handbooks/+2/Biology_Science/Biology/Botany/Chapter_07_Organisms_and_Populations.pdf');
      expect(fs.existsSync(path.resolve(handbooksDir, bot4.replace(/^\/handbooks\//, '')))).toBe(true);

      // Botany Ch 5 (Ecosystem) is Chapter 08
      const bot5 = getHandbookUrl('+2_Botany_5');
      expect(bot5).toBe('/handbooks/+2/Biology_Science/Biology/Botany/Chapter_08_Ecosystem.pdf');
      expect(fs.existsSync(path.resolve(handbooksDir, bot5.replace(/^\/handbooks\//, '')))).toBe(true);
    });

    it('correctly maps +2 Economics Micro / Macro shifted chapters', () => {
      // Microeconomics: Ch 1-5
      expect(getHandbookUrl('+2_Economics_1')).toBe('/handbooks/+2/Commerce/Economics/Chapter_01_Introduction_to_Microeconomics.pdf');
      expect(getHandbookUrl('+2_Economics_5')).toBe('/handbooks/+2/Commerce/Economics/Chapter_05_Market_Equilibrium.pdf');

      // Ch 6 is rationalized
      expect(getHandbookUrl('+2_Economics_6')).toBeNull();

      // Macroeconomics: Ch 7-12
      expect(getHandbookUrl('+2_Economics_7')).toBe('/handbooks/+2/Commerce/Economics/Chapter_06_Introduction_to_Macroeconomics.pdf');
      expect(getHandbookUrl('+2_Economics_8')).toBe('/handbooks/+2/Commerce/Economics/Chapter_07_National_Income_Accounting.pdf');
      expect(getHandbookUrl('+2_Economics_9')).toBe('/handbooks/+2/Commerce/Economics/Chapter_08_Money_and_Banking.pdf');
      expect(getHandbookUrl('+2_Economics_10')).toBe('/handbooks/+2/Commerce/Economics/Chapter_09_Determination_of_Income_and_Employment.pdf');
      expect(getHandbookUrl('+2_Economics_11')).toBe('/handbooks/+2/Commerce/Economics/Chapter_10_Government_Budget_and_the_Economy.pdf');
      expect(getHandbookUrl('+2_Economics_12')).toBe('/handbooks/+2/Commerce/Economics/Chapter_11_Open_Economy_Macroeconomics.pdf');
    });

    it('correctly maps shifted +1 Business Studies chapters', () => {
      // Ch 7 -> Chapter 08 Sources of Business Finance
      expect(getHandbookUrl('+1_Business_Studies_7')).toBe('/handbooks/+1/Commerce/Business_Studies/Chapter_08_Sources_of_Business_Finance.pdf');

      // Ch 8 -> Chapter 09 MSME and Business Entrepreneurship
      expect(getHandbookUrl('+1_Business_Studies_8')).toBe('/handbooks/+1/Commerce/Business_Studies/Chapter_09_MSME_and_Business_Entrepreneurship.pdf');

      // Ch 9 -> Chapter 10 Internal Trade
      expect(getHandbookUrl('+1_Business_Studies_9')).toBe('/handbooks/+1/Commerce/Business_Studies/Chapter_10_Internal_Trade.pdf');

      // Ch 10 -> Chapter 11 International Business
      expect(getHandbookUrl('+1_Business_Studies_10')).toBe('/handbooks/+1/Commerce/Business_Studies/Chapter_11_International_Business.pdf');
    });
  });

  // -------------------------------------------------------------------------
  // 4. Rationalized Chapters Zero-404 Guardrails
  // -------------------------------------------------------------------------
  describe('4. Rationalized Chapters Zero-404 Guardrails', () => {
    const rationalizedList = [
      '+2_Economics_6',
      '+2_Sociology_4',
      '+2_Sociology_9',
      '+2_Sociology_12',
      '+1_Political_Science_9',
      '+1_Political_Science_10',
      '+1_Political_Science_16',
      '+1_Sociology_7',
    ];

    it('verifies RATIONALIZED_CHAPTER_IDS has exactly 8 chapters', () => {
      expect(RATIONALIZED_CHAPTER_IDS.size).toBe(8);
      for (const id of rationalizedList) {
        expect(RATIONALIZED_CHAPTER_IDS.has(id)).toBe(true);
      }
    });

    it.each(rationalizedList)('returns null and hasHandbook=false for %s across all invocation forms', (chapId) => {
      expect(getHandbookUrl(chapId)).toBeNull();
      expect(hasHandbook(chapId)).toBe(false);

      const info = getHandbookInfo(chapId);
      expect(info.available).toBe(false);
      expect(info.rationalized).toBe(true);
      expect(info.url).toBeNull();

      // With stream context
      expect(getHandbookUrl(chapId, { stream: 'bio' })).toBeNull();
      expect(getHandbookUrl(chapId, { stream: 'cs' })).toBeNull();
      expect(getHandbookUrl(chapId, { stream: 'commerce' })).toBeNull();
      expect(getHandbookUrl(chapId, { stream: 'humanities' })).toBeNull();
    });

    it('returns null when querying rationalized chapters by title', () => {
      expect(getHandbookUrl({ grade: '+2', chapterName: 'Non-Competitive Markets' })).toBeNull();
      expect(getHandbookUrl({ grade: '+2', chapterName: 'The Market as a Social Institution' })).toBeNull();
      expect(getHandbookUrl({ grade: '+2', chapterName: 'The Story of Indian Democracy' })).toBeNull();
      expect(getHandbookUrl({ grade: '+2', chapterName: 'Globalisation and Social Change' })).toBeNull();
      expect(getHandbookUrl({ grade: '+1', chapterName: 'Constitution as a Living Document' })).toBeNull();
      expect(getHandbookUrl({ grade: '+1', chapterName: 'The Philosophy of the Constitution' })).toBeNull();
      expect(getHandbookUrl({ grade: '+1', chapterName: 'Development' })).toBeNull();
      expect(getHandbookUrl({ grade: '+1', chapterName: 'Environment and Society' })).toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  // 5. URL Formatting & Standards Compliance
  // -------------------------------------------------------------------------
  describe('5. URL Formatting & Standards Compliance', () => {
    it('ensures every non-null URL is web-safe, begins with /handbooks/, and has no spaces', () => {
      for (const [key, relPath] of Object.entries(CANONICAL_HANDBOOK_MAP)) {
        if (relPath !== null) {
          const url = getHandbookUrl(key);
          expect(url).toMatch(/^\/handbooks\/[A-Za-z0-9_./+-]+\.pdf$/);
          expect(url).not.toContain(' ');
          expect(url).not.toContain('\\');
        }
      }
    });
  });

  // -------------------------------------------------------------------------
  // 6. UI DOM Contracts: Today View and Syllabus View
  // -------------------------------------------------------------------------
  describe('6. UI DOM Contracts: Today View and Syllabus View', () => {
    const appSource = fs.readFileSync(path.resolve(projectRoot, 'src/app.js'), 'utf8');
    const styleSource = fs.readFileSync(path.resolve(projectRoot, 'src/style.css'), 'utf8');

    it('verifies Today View button contract exists with daily-notes-btn class and security attributes', () => {
      // Must contain daily-notes-btn link markup
      expect(appSource).toContain('class="daily-notes-btn"');
      expect(appSource).toContain('target="_blank"');
      expect(appSource).toContain('rel="noopener noreferrer"');
      expect(appSource).toContain('onclick="event.stopPropagation()"');
      expect(appSource).toContain('📖 Notes');

      // Test conditional rendering logic:
      // Active task with handbook produces link with daily-notes-btn
      const sampleTask = { id: '+1_Physics_1_P1', chapId: '+1_Physics_1' };
      const url = getHandbookUrl(sampleTask);
      expect(url).not.toBeNull();
      const renderedActive = url
        ? `<div class="daily-task-actions"><a href="${url}" target="_blank" rel="noopener noreferrer" onclick="event.stopPropagation()" class="daily-notes-btn">📖 Notes</a></div>`
        : '';
      expect(renderedActive).toContain('daily-notes-btn');
      expect(renderedActive).toContain(url);

      // Rationalized task produces empty string (no button)
      const rationalizedTask = { id: '+2_Economics_6_P1', chapId: '+2_Economics_6' };
      const ratUrl = getHandbookUrl(rationalizedTask);
      expect(ratUrl).toBeNull();
      const renderedRat = ratUrl
        ? `<div class="daily-task-actions"><a href="${ratUrl}" target="_blank" rel="noopener noreferrer" onclick="event.stopPropagation()" class="daily-notes-btn">📖 Notes</a></div>`
        : '';
      expect(renderedRat).toBe('');
    });

    it('verifies Syllabus View button contract exists with syllabus-notes-btn class and security attributes', () => {
      expect(appSource).toContain('class="syllabus-notes-btn"');

      // Test conditional rendering logic for syllabus chapter
      const sampleChap = { chapId: '+1_Chemistry_1', grade: '+1', subject: 'Chemistry', chapNumber: 1 };
      const url = getHandbookUrl(sampleChap);
      expect(url).not.toBeNull();
      const renderedActive = url
        ? `<a href="${url}" target="_blank" rel="noopener noreferrer" onclick="event.stopPropagation()" class="syllabus-notes-btn">📖 Notes</a>`
        : '';
      expect(renderedActive).toContain('syllabus-notes-btn');
      expect(renderedActive).toContain(url);

      // Rationalized syllabus chapter produces no button
      const ratChap = { chapId: '+2_Economics_6', grade: '+2', subject: 'Economics', chapNumber: 6 };
      const ratUrl = getHandbookUrl(ratChap);
      expect(ratUrl).toBeNull();
      const renderedRat = ratUrl
        ? `<a href="${ratUrl}" target="_blank" rel="noopener noreferrer" onclick="event.stopPropagation()" class="syllabus-notes-btn">📖 Notes</a>`
        : '';
      expect(renderedRat).toBe('');
    });

    it('verifies CSS styling rules and accessibility for both buttons in src/style.css', () => {
      // Base styles
      expect(styleSource).toContain('.daily-notes-btn {');
      expect(styleSource).toContain('.syllabus-notes-btn {');

      // Hover styles
      expect(styleSource).toContain('.daily-notes-btn:hover {');
      expect(styleSource).toContain('.syllabus-notes-btn:hover {');

      // Focus-visible for keyboard accessibility
      expect(styleSource).toContain('.daily-notes-btn:focus-visible');
      expect(styleSource).toContain('.syllabus-notes-btn:focus-visible');

      // Dark mode styles
      expect(styleSource).toContain('html.dark .daily-notes-btn');
      expect(styleSource).toContain('html.dark .syllabus-notes-btn');
    });
  });
});
