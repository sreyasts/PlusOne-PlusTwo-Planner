import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import {
  getHandbookUrl,
  hasHandbook,
  getHandbookInfo,
  normalizeHandbookGrade,
  normalizeHandbookSubject,
  normalizeHandbookTitle,
  CANONICAL_HANDBOOK_MAP,
  RATIONALIZED_CHAPTER_IDS,
} from '../src/utils/handbook-lookup.js';
import { PLUS_ONE_SYLLABUS } from '../src/data/syllabus-plus-one.js';
import { PLUS_TWO_SYLLABUS } from '../src/data/syllabus-plus-two.js';

describe('Mission+1+2 Study Material Handbook Lookup Engine', () => {
  describe('Grade & Subject Normalization', () => {
    it('normalizes various grade formats to +1 and +2', () => {
      expect(normalizeHandbookGrade('+1')).toBe('+1');
      expect(normalizeHandbookGrade('11')).toBe('+1');
      expect(normalizeHandbookGrade(11)).toBe('+1');
      expect(normalizeHandbookGrade('plus_one')).toBe('+1');
      expect(normalizeHandbookGrade('plus-one')).toBe('+1');
      expect(normalizeHandbookGrade('Plus One')).toBe('+1');
      expect(normalizeHandbookGrade('+2')).toBe('+2');
      expect(normalizeHandbookGrade('12')).toBe('+2');
      expect(normalizeHandbookGrade(12)).toBe('+2');
      expect(normalizeHandbookGrade('plus_two')).toBe('+2');
      expect(normalizeHandbookGrade('plus-two')).toBe('+2');
      expect(normalizeHandbookGrade('invalid')).toBe(null);
      expect(normalizeHandbookGrade(null)).toBe(null);
    });

    it('normalizes subject names and aliases', () => {
      expect(normalizeHandbookSubject('Physics')).toBe('Physics');
      expect(normalizeHandbookSubject('phy')).toBe('Physics');
      expect(normalizeHandbookSubject('Maths')).toBe('Mathematics');
      expect(normalizeHandbookSubject('Mathematics')).toBe('Mathematics');
      expect(normalizeHandbookSubject('Computer Science')).toBe('Computer_Science');
      expect(normalizeHandbookSubject('cs')).toBe('Computer_Science');
      expect(normalizeHandbookSubject('Business Studies')).toBe('Business_Studies');
      expect(normalizeHandbookSubject('Political Science')).toBe('Political_Science');
      expect(normalizeHandbookSubject('Computer Applications')).toBe('Computer_Applications');
      expect(normalizeHandbookSubject('Botany')).toBe('Botany');
      expect(normalizeHandbookSubject('Zoology')).toBe('Zoology');
    });

    it('normalizes titles for resilient lookup', () => {
      expect(normalizeHandbookTitle('Units and Measurements')).toBe('unitsandmeasurements');
      expect(normalizeHandbookTitle('SI Units, Dimensions & Analysis!')).toBe('siunitsdimensionsanalysis');
    });
  });

  describe('Canonical ChapId Lookup', () => {
    it('accurately resolves canonical chapter IDs', () => {
      const url1 = getHandbookUrl('+1_Physics_1');
      expect(url1).toBe('/handbooks/+1/Biology_Science/Physics/Chapter_01_Units_and_Measurements.pdf');
      expect(hasHandbook('+1_Physics_1')).toBe(true);

      const url2 = getHandbookUrl('+2_Physics_1');
      expect(url2).toBe('/handbooks/+2/Biology_Science/Physics/Chapter_01_Electric_Charges_and_Fields.pdf');
      expect(hasHandbook('+2_Physics_1')).toBe(true);
    });

    it('resolves cross-subject NCERT shifted chapters (Zoology in Botany)', () => {
      // Zoology Ch 3 is located in Botany in Mission+1+2
      const zoo3 = getHandbookUrl('+2_Zoology_3');
      expect(zoo3).toBe('/handbooks/+2/Biology_Science/Biology/Botany/Chapter_02_Principles_of_Inheritance_and_Variation.pdf');

      // Zoology Ch 7 (Microbes in Human Welfare) is under Botany Ch 4
      const zoo7 = getHandbookUrl('+2_Zoology_7');
      expect(zoo7).toBe('/handbooks/+2/Biology_Science/Biology/Botany/Chapter_04_Microbes_in_Human_Welfare.pdf');
    });

    it('resolves shifted chapters (Botany, Economics, Business Studies)', () => {
      // Botany Ch 2 maps to Manifest Ch 5
      expect(getHandbookUrl('+2_Botany_2')).toBe('/handbooks/+2/Biology_Science/Biology/Botany/Chapter_05_Biotechnology_Principles_and_Processes.pdf');

      // Economics Ch 7 maps to Macroeconomics Ch 6
      expect(getHandbookUrl('+2_Economics_7')).toBe('/handbooks/+2/Commerce/Economics/Chapter_06_Introduction_to_Macroeconomics.pdf');

      // Business Studies Ch 7 maps to Manifest Ch 8
      expect(getHandbookUrl('+1_Business_Studies_7')).toBe('/handbooks/+1/Commerce/Business_Studies/Chapter_08_Sources_of_Business_Finance.pdf');
    });
  });

  describe('Rationalized Chapters Integrity (Must return null)', () => {
    const rationalized = [
      '+2_Economics_6',
      '+2_Sociology_4',
      '+2_Sociology_9',
      '+2_Sociology_12',
      '+1_Political_Science_9',
      '+1_Political_Science_10',
      '+1_Political_Science_16',
      '+1_Sociology_7',
    ];

    it.each(rationalized)('returns null and hasHandbook=false for rationalized chapter %s', (chapId) => {
      expect(getHandbookUrl(chapId)).toBe(null);
      expect(hasHandbook(chapId)).toBe(false);

      const info = getHandbookInfo(chapId);
      expect(info.url).toBe(null);
      expect(info.available).toBe(false);
      expect(info.rationalized).toBe(true);
    });

    it('returns null when querying rationalized chapters by title or options', () => {
      expect(getHandbookUrl({ grade: '+2', chapterName: 'Non-Competitive Markets' })).toBe(null);
      expect(getHandbookUrl({ grade: '+2', subject: 'Economics', chapNumber: 6 })).toBe(null);
      expect(getHandbookUrl({ grade: '+2', chapterName: 'The Market as a Social Institution' })).toBe(null);
      expect(getHandbookUrl({ grade: '+1', chapterName: 'Constitution as a Living Document' })).toBe(null);
    });
  });

  describe('Synthetic Options & Planner Task Objects', () => {
    it('resolves handbook from planner task object with id and chapId', () => {
      const task = {
        id: '+1_Physics_1_P1',
        chapId: '+1_Physics_1',
        grade: '+1',
        subject: 'Physics',
        chapNumber: 1,
        chapterName: 'Units and Measurements',
      };
      expect(getHandbookUrl(task)).toBe('/handbooks/+1/Biology_Science/Physics/Chapter_01_Units_and_Measurements.pdf');
      expect(hasHandbook(task)).toBe(true);
    });

    it('resolves handbook from task object with only id', () => {
      expect(getHandbookUrl({ id: '+1_Physics_1_P2' })).toBe('/handbooks/+1/Biology_Science/Physics/Chapter_01_Units_and_Measurements.pdf');
    });

    it('resolves handbook from options object with grade, subject, and chapNumber', () => {
      expect(getHandbookUrl({ grade: '+1', subject: 'Physics', chapNumber: 1 })).toBe('/handbooks/+1/Biology_Science/Physics/Chapter_01_Units_and_Measurements.pdf');
      expect(getHandbookUrl({ level: 11, subject: 'Maths', num: 1 })).toBe('/handbooks/+1/Biology_Science/Maths/Chapter_01_Sets.pdf');
    });

    it('resolves handbook by title', () => {
      expect(getHandbookUrl({ grade: '+1', chapterName: 'Units and Measurements' })).toBe('/handbooks/+1/Biology_Science/Physics/Chapter_01_Units_and_Measurements.pdf');
      expect(getHandbookUrl({ grade: '+1', subject: 'Physics', chapterName: 'Units and Measurements' })).toBe('/handbooks/+1/Biology_Science/Physics/Chapter_01_Units_and_Measurements.pdf');
    });
  });

  describe('Stream-Specific Path Resolution', () => {
    it('resolves stream-specific path when stream context is provided', () => {
      // Physics in Bio stream
      const bioUrl = getHandbookUrl('+1_Physics_1', { stream: 'bio' });
      expect(bioUrl).toBe('/handbooks/+1/Biology_Science/Physics/Chapter_01_Units_and_Measurements.pdf');

      // Physics in CS stream
      const csUrl = getHandbookUrl('+1_Physics_1', { stream: 'cs' });
      expect(csUrl).toBe('/handbooks/+1/Computer_Science/Physics/Chapter_01_Units_and_Measurements.pdf');

      // Maths in Commerce stream
      const commUrl = getHandbookUrl('+1_Mathematics_1', { stream: 'commerce' });
      expect(commUrl).toBe('/handbooks/+1/Commerce/Maths/Chapter_01_Sets.pdf');

      // Economics in Humanities stream
      const humUrl = getHandbookUrl('+1_Economics_8', { stream: 'humanities' });
      expect(humUrl).toBe('/handbooks/+1/Humanities/Economics/Chapter_09_Indian_Economy_on_the_Eve_of_Independence.pdf');
    });
  });

  describe('Metadata Helper getHandbookInfo', () => {
    it('returns structured metadata for available handbook', () => {
      const info = getHandbookInfo('+1_Physics_1');
      expect(info).toEqual({
        url: '/handbooks/+1/Biology_Science/Physics/Chapter_01_Units_and_Measurements.pdf',
        relativePath: '+1/Biology_Science/Physics/Chapter_01_Units_and_Measurements.pdf',
        filename: 'Chapter_01_Units_and_Measurements.pdf',
        available: true,
        rationalized: false,
      });
    });
  });

  describe('Full Curriculum Verification (100% of Syllabus Chapters)', () => {
    const allChaps = [
      ...new Map(PLUS_ONE_SYLLABUS.map((t) => [t.chapId, t])).values(),
      ...new Map(PLUS_TWO_SYLLABUS.map((t) => [t.chapId, t])).values(),
    ];

    it('verifies all 289 unique syllabus chapters resolve without error', () => {
      expect(allChaps.length).toBe(289);

      let resolvedCount = 0;
      let rationalizedCount = 0;

      for (const ch of allChaps) {
        const url = getHandbookUrl(ch);
        if (RATIONALIZED_CHAPTER_IDS.has(ch.chapId)) {
          expect(url).toBe(null);
          expect(hasHandbook(ch)).toBe(false);
          rationalizedCount++;
        } else {
          expect(url).not.toBe(null);
          expect(hasHandbook(ch)).toBe(true);

          // Verify physical file exists on disk in public/handbooks/
          const relPath = url.replace(/^\/handbooks\//, '');
          const fullPath = path.resolve(process.cwd(), 'public/handbooks', relPath);
          expect(fs.existsSync(fullPath)).toBe(true);
          resolvedCount++;
        }
      }

      expect(resolvedCount).toBe(281);
      expect(rationalizedCount).toBe(8);
      expect(resolvedCount + rationalizedCount).toBe(289);
    });
  });

  describe('Synchronous Performance Benchmark', () => {
    it('executes lookups synchronously in < 0.1ms per call', () => {
      const iterations = 10000;
      const start = performance.now();
      for (let i = 0; i < iterations; i++) {
        getHandbookUrl('+1_Physics_1');
        getHandbookUrl('+2_Economics_6');
        getHandbookUrl({ grade: '+1', subject: 'Physics', chapNumber: 1 });
      }
      const totalMs = performance.now() - start;
      const msPerCall = totalMs / (iterations * 3);

      expect(msPerCall).toBeLessThan(0.1);
    });
  });
});
