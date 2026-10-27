import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
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

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');
const handbooksDir = path.resolve(projectRoot, 'public', 'handbooks');
const manifestPath = path.resolve(handbooksDir, 'library_manifest.json');

describe('Empirical Adversarial Stress Harness: Mission+1+2 Handbooks & Lookup Engine', () => {
  // -------------------------------------------------------------------------
  // 1. All 479 Manifest Paths vs Physical Disk Paths
  // -------------------------------------------------------------------------
  describe('1. Manifest vs Disk Physical Integrity (All 479 Files)', () => {
    it('manifest exists, is valid JSON, and defines exactly 479 chapters', () => {
      expect(fs.existsSync(manifestPath)).toBe(true);
      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
      expect(Array.isArray(manifest.chapters)).toBe(true);
      expect(manifest.chapters.length).toBe(479);
    });

    it('verifies all 479 files exist on disk, match byte size, and have %PDF- header', () => {
      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
      let missingCount = 0;
      let sizeMismatchCount = 0;
      let corruptHeaderCount = 0;
      let totalBytes = 0;

      for (const ch of manifest.chapters) {
        // Path safety assertion
        expect(ch.relative_path).toMatch(/^[+][12]\/[A-Za-z0-9_/-]+\.pdf$/);
        expect(ch.relative_path).not.toContain('\\');
        expect(ch.relative_path).not.toContain(' ');

        const diskPath = path.resolve(handbooksDir, ch.relative_path);
        if (!fs.existsSync(diskPath)) {
          missingCount++;
          continue;
        }

        const stat = fs.statSync(diskPath);
        if (stat.size !== ch.file_size_bytes) {
          sizeMismatchCount++;
        }
        totalBytes += stat.size;

        // Magic bytes check: every PDF must begin with %PDF- (0x25 0x50 0x44 0x46 0x2D)
        const buf = Buffer.alloc(5);
        const fd = fs.openSync(diskPath, 'r');
        fs.readSync(fd, buf, 0, 5, 0);
        fs.closeSync(fd);
        if (buf.toString('utf8') !== '%PDF-') {
          corruptHeaderCount++;
        }
      }

      expect(missingCount).toBe(0);
      expect(sizeMismatchCount).toBe(0);
      expect(corruptHeaderCount).toBe(0);
      expect(totalBytes).toBe(61610628);
    });

    it('verifies 0 orphaned or unmanifested PDF files exist in public/handbooks/', () => {
      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
      const manifestSet = new Set(manifest.chapters.map((c) => path.normalize(c.relative_path)));

      function scanDir(dir, rel = '') {
        let results = [];
        const entries = fs.readdirSync(dir);
        for (const entry of entries) {
          const full = path.join(dir, entry);
          const r = path.join(rel, entry);
          if (fs.statSync(full).isDirectory()) {
            results = results.concat(scanDir(full, r));
          } else if (entry.endsWith('.pdf')) {
            results.push(r);
          }
        }
        return results;
      }

      const allDiskPdfs = scanDir(handbooksDir);
      expect(allDiskPdfs.length).toBe(479);
      const unmanifested = allDiskPdfs.filter((f) => !manifestSet.has(path.normalize(f)));
      expect(unmanifested).toHaveLength(0);
    });
  });

  // -------------------------------------------------------------------------
  // 2. Adversarial Edge Cases: Path Traversal, Types & Poisoning
  // -------------------------------------------------------------------------
  describe('2. Adversarial Edge Cases: Path Traversal, Types & Poisoning', () => {
    it('defends against directory traversal payloads across all input channels', () => {
      const traversalPayloads = [
        '../../../etc/passwd',
        '..\\..\\windows\\system32',
        '/etc/shadow',
        '..\\..\\..\\..\\boot.ini',
        '+1/../../package.json',
        '%2e%2e%2f%2e%2e%2f',
        '....//....//',
      ];

      for (const payload of traversalPayloads) {
        // Direct chapId
        expect(getHandbookUrl(payload)).toBe(null);
        expect(hasHandbook(payload)).toBe(false);

        // Nested in task object
        expect(getHandbookUrl({ chapId: payload })).toBe(null);
        expect(getHandbookUrl({ id: payload })).toBe(null);

        // Grade/subject injection
        expect(getHandbookUrl({ grade: payload, subject: 'Physics', chapNumber: 1 })).toBe(null);
        expect(getHandbookUrl({ grade: '+1', subject: payload, chapNumber: 1 })).toBe(null);

        // Stream injection: should safely ignore or fallback, never leak outside /handbooks/
        const res = getHandbookUrl('+1_Physics_1', { stream: payload });
        expect(res).not.toBe(null);
        expect(res.startsWith('/handbooks/+1/')).toBe(true);
        expect(res).not.toContain('..');
      }
    });

    it('defends against prototype pollution and prototype key attacks', () => {
      const prototypeKeys = [
        '__proto__',
        'constructor',
        'prototype',
        'toString',
        'valueOf',
        'hasOwnProperty',
        'isPrototypeOf',
        'propertyIsEnumerable',
      ];

      for (const key of prototypeKeys) {
        expect(getHandbookUrl(key)).toBe(null);
        expect(hasHandbook(key)).toBe(false);
        const info = getHandbookInfo(key);
        expect(info.url).toBe(null);
        expect(info.available).toBe(false);
      }
    });

    it('safely handles falsy, nullish, and primitive types without crashing', () => {
      const primitives = [
        null,
        undefined,
        0,
        1,
        -1,
        NaN,
        Infinity,
        -Infinity,
        true,
        false,
        '',
        '   ',
        '\t\n\r',
        '\0',
      ];

      for (const p of primitives) {
        expect(getHandbookUrl(p)).toBe(null);
        expect(hasHandbook(p)).toBe(false);
        expect(getHandbookInfo(p).available).toBe(false);
      }
    });

    it('empirically captures edge-case defect: non-string chapId in object throws TypeError', () => {
      // Finding: Line 1276 calls rawChapId.replace() without checking if rawChapId is a string.
      // Numbers, booleans, objects, arrays throw TypeError: rawChapId.replace is not a function
      expect(() => getHandbookUrl({ chapId: 123 })).toThrow(TypeError);
      expect(() => getHandbookUrl({ chapId: true })).toThrow(TypeError);
      expect(() => getHandbookUrl({ chapId: {} })).toThrow(TypeError);
      expect(() => getHandbookUrl({ chapId: [] })).toThrow(TypeError);
    });

    it('empirically captures edge-case defect: explicit null contextState throws TypeError', () => {
      // Finding: Line 1260 attempts contextState.stream when contextState is passed as null.
      // Default argument contextState = {} only defaults on undefined, not null.
      expect(() => getHandbookUrl('+1_Physics_1', null)).toThrow(TypeError);
    });

    it('handles case variations in synthetic options and normalizers', () => {
      // Grades
      expect(normalizeHandbookGrade('+1')).toBe('+1');
      expect(normalizeHandbookGrade('PLUS_ONE')).toBe('+1');
      expect(normalizeHandbookGrade('plusone')).toBe('+1');
      expect(normalizeHandbookGrade('11')).toBe('+1');
      expect(normalizeHandbookGrade('+2')).toBe('+2');
      expect(normalizeHandbookGrade('PLUS_TWO')).toBe('+2');
      expect(normalizeHandbookGrade('plustwo')).toBe('+2');
      expect(normalizeHandbookGrade('12')).toBe('+2');

      // Subjects
      expect(normalizeHandbookSubject('PHYSICS')).toBe('Physics');
      expect(normalizeHandbookSubject('chemistry')).toBe('Chemistry');
      expect(normalizeHandbookSubject('MaThS')).toBe('Mathematics');
      expect(normalizeHandbookSubject('COMPUTER SCIENCE')).toBe('Computer_Science');

      // Titles
      expect(normalizeHandbookTitle('UNITS AND MEASUREMENTS')).toBe('unitsandmeasurements');
      expect(normalizeHandbookTitle('Units and Measurements')).toBe('unitsandmeasurements');

      // Synthetic options with uppercase
      const url = getHandbookUrl({
        grade: 'PLUS_ONE',
        subject: 'PHYSICS',
        chapNumber: 1,
      });
      expect(url).toBe('/handbooks/+1/Biology_Science/Physics/Chapter_01_Units_and_Measurements.pdf');
    });

    it('verifies URL encoding behavior (+1 vs %2B1)', () => {
      // Standard canonical ID
      expect(getHandbookUrl('+1_Physics_1')).toBe('/handbooks/+1/Biology_Science/Physics/Chapter_01_Units_and_Measurements.pdf');

      // URL-encoded chapId without decoding returns null (safe fallback, no crash, no wrong file)
      expect(getHandbookUrl('%2B1_Physics_1')).toBe(null);

      // Decoded chapId resolves properly
      expect(getHandbookUrl(decodeURIComponent('%2B1_Physics_1'))).toBe(
        '/handbooks/+1/Biology_Science/Physics/Chapter_01_Units_and_Measurements.pdf'
      );
    });
  });

  // -------------------------------------------------------------------------
  // 3. Rationalized Chapter IDs Strict Invariants (Must return null)
  // -------------------------------------------------------------------------
  describe('3. Rationalized Chapter IDs Invariant (Strictly null, never 404)', () => {
    const rationalizedChapters = [
      '+2_Economics_6',
      '+2_Sociology_4',
      '+2_Sociology_9',
      '+2_Sociology_12',
      '+1_Political_Science_9',
      '+1_Political_Science_10',
      '+1_Political_Science_16',
      '+1_Sociology_7',
    ];

    it('strictly returns null, hasHandbook=false, and rationalized=true for all 8 IDs', () => {
      expect(rationalizedChapters.length).toBe(8);

      for (const id of rationalizedChapters) {
        // String lookup
        expect(getHandbookUrl(id)).toBe(null);
        expect(hasHandbook(id)).toBe(false);

        // Metadata inspection
        const info = getHandbookInfo(id);
        expect(info.url).toBe(null);
        expect(info.available).toBe(false);
        expect(info.rationalized).toBe(true);

        // Task object lookup
        expect(getHandbookUrl({ id: `${id}_P1`, chapId: id })).toBe(null);

        // Stream context lookup
        expect(getHandbookUrl(id, { stream: 'Commerce' })).toBe(null);
        expect(getHandbookUrl(id, { stream: 'Humanities' })).toBe(null);
      }
    });

    it('strictly returns null when queried via synthetic options', () => {
      const syntheticRationalized = [
        { grade: '+2', subject: 'Economics', chapNumber: 6 },
        { grade: '+2', subject: 'Sociology', chapNumber: 4 },
        { grade: '+2', subject: 'Sociology', chapNumber: 9 },
        { grade: '+2', subject: 'Sociology', chapNumber: 12 },
        { grade: '+1', subject: 'Political_Science', chapNumber: 9 },
        { grade: '+1', subject: 'Political_Science', chapNumber: 10 },
        { grade: '+1', subject: 'Political_Science', chapNumber: 16 },
        { grade: '+1', subject: 'Sociology', chapNumber: 7 },
      ];

      for (const opt of syntheticRationalized) {
        expect(getHandbookUrl(opt)).toBe(null);
        expect(hasHandbook(opt)).toBe(false);
      }
    });
  });

  // -------------------------------------------------------------------------
  // 4. High-Throughput Stress Benchmark (30,000+ Lookups, Latency < 0.1ms)
  // -------------------------------------------------------------------------
  describe('4. High-Throughput Benchmark (30,000+ Lookups)', () => {
    it('executes 30,000 lookups with average latency < 0.1ms per call', () => {
      const mixedWorkload = [
        '+1_Physics_1',
        '+1_Chemistry_2',
        '+1_Mathematics_3',
        '+2_Physics_1',
        '+2_Botany_2',
        '+2_Economics_6', // rationalized
        '+1_Political_Science_9', // rationalized
        { grade: '+1', subject: 'Physics', chapNumber: 1 },
        { grade: '+2', subject: 'Economics', chapNumber: 7 },
        { grade: '+1', chapterName: 'Units and Measurements' },
        { chapId: 'non_existent_chap_id' },
        { grade: '+1', subject: 'InvalidSubject', chapNumber: 99 },
        '../../../etc/passwd',
        'toString',
        '+2_Zoology_7',
      ];

      const iterations = 30000;
      const start = performance.now();

      for (let i = 0; i < iterations; i++) {
        const query = mixedWorkload[i % mixedWorkload.length];
        getHandbookUrl(query);
      }

      const totalDurationMs = performance.now() - start;
      const avgLatencyMs = totalDurationMs / iterations;

      expect(avgLatencyMs).toBeLessThan(0.1);
      // Log empirical result
      console.log(`[Benchmark] ${iterations} lookups in ${totalDurationMs.toFixed(2)}ms (avg ${avgLatencyMs.toFixed(6)}ms/call)`);
    });
  });
});
