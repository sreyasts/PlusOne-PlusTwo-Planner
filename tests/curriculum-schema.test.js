import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import Ajv from 'ajv';

describe('Curriculum Schema & Data Validation (data/kerala-dhse/)', () => {
  const schemaPath = path.resolve(__dirname, '../schemas/curriculum.schema.json');
  const schemaContent = JSON.parse(fs.readFileSync(schemaPath, 'utf8'));

  const ajv = new Ajv({ allErrors: true });
  const validate = ajv.compile(schemaContent);

  const dataDir = path.resolve(__dirname, '../data/kerala-dhse');
  const jsonFiles = fs
    .readdirSync(dataDir)
    .filter((f) => f.endsWith('.json'));

  it('contains the required stream files (science, commerce, humanities)', () => {
    expect(jsonFiles).toContain('science.json');
    expect(jsonFiles).toContain('commerce.json');
    expect(jsonFiles).toContain('humanities.json');
  });

  jsonFiles.forEach((file) => {
    it(`strictly validates ${file} against schemas/curriculum.schema.json`, () => {
      const filePath = path.join(dataDir, file);
      const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));

      const isValid = validate(data);
      if (!isValid) {
        console.error(`Validation errors in ${file}:`, validate.errors);
      }
      expect(isValid).toBe(true);
      expect(validate.errors).toBeNull();

      // Deep Invariant Checks
      expect(data.stream).toBeDefined();
      expect(Array.isArray(data.subjects)).toBe(true);
      expect(data.subjects.length).toBeGreaterThan(0);

      const subjectIds = new Set();
      data.subjects.forEach((subject) => {
        // Required properties
        expect(subject.subjectId).toMatch(/^[a-z0-9-]+$/);
        expect(subject.subjectName.length).toBeGreaterThanOrEqual(2);
        expect(subject.stream).toBe(data.stream);
        expect(Array.isArray(subject.chapters)).toBe(true);
        expect(subject.chapters.length).toBeGreaterThan(0);

        // Subject ID uniqueness
        expect(subjectIds.has(subject.subjectId)).toBe(false);
        subjectIds.add(subject.subjectId);

        const chapterNumbers = new Set();
        subject.chapters.forEach((chapter) => {
          expect(chapter.chapterNumber).toBeGreaterThanOrEqual(1);
          expect(chapter.title.length).toBeGreaterThanOrEqual(2);
          expect(chapter.weightageScore).toBeGreaterThanOrEqual(0);
          expect(chapter.recommendedRevisionHours).toBeGreaterThanOrEqual(0.25);

          // No duplicate chapter numbers in a single subject
          expect(chapterNumbers.has(chapter.chapterNumber)).toBe(false);
          chapterNumbers.add(chapter.chapterNumber);
        });
      });
    });
  });

  it('enforces stream purity and updated chapter counts across Science, Commerce, and Humanities', () => {
    const sci = JSON.parse(fs.readFileSync(path.join(dataDir, 'science.json'), 'utf8'));
    const com = JSON.parse(fs.readFileSync(path.join(dataDir, 'commerce.json'), 'utf8'));
    const hum = JSON.parse(fs.readFileSync(path.join(dataDir, 'humanities.json'), 'utf8'));

    // Science stream: 12 subjects (6 in Class 12, 6 in Class 11) - Zero Commerce/Humanities subjects
    expect(sci.subjects.length).toBe(12);
    const contaminatedIds = [
      'accountancy-plus-two',
      'business-studies-plus-two',
      'economics-plus-two',
      'computer-applications-plus-two',
      'history-plus-two',
      'political-science-plus-two',
      'sociology-plus-two'
    ];
    contaminatedIds.forEach(id => {
      expect(sci.subjects.some(s => s.subjectId === id)).toBe(false);
    });

    // Class 11 Computer Science: 13-chapter official Python curriculum
    const cs11 = sci.subjects.find(s => s.subjectId === 'computer-science-plus-one');
    expect(cs11).toBeDefined();
    expect(cs11.chapters.length).toBe(13);
    expect(cs11.chapters[0].title).toBe('Introduction to Computing');
    expect(cs11.chapters[12].title).toBe('Computers and Society');

    // Commerce stream: 8 subjects (4 in Class 12, 4 in Class 11)
    expect(com.subjects.length).toBe(8);
    // Class 11 Computer Applications: 8-chapter official Python/AI curriculum
    const ca11 = com.subjects.find(s => s.subjectId === 'computer-applications-plus-one');
    expect(ca11).toBeDefined();
    expect(ca11.chapters.length).toBe(8);
    expect(ca11.chapters[0].title).toBe('Computing System');
    expect(ca11.chapters[7].title).toBe('AI and its Applications');

    // Humanities stream: 8 subjects (4 in Class 12, 4 in Class 11)
    expect(hum.subjects.length).toBe(8);
    // Class 12 History: 12 chapters including Chapter 12 Framing the Constitution
    const hist2 = hum.subjects.find(s => s.subjectId === 'history-plus-two');
    expect(hist2).toBeDefined();
    expect(hist2.chapters.length).toBe(12);
    expect(hist2.chapters[11].chapterNumber).toBe(12);
    expect(hist2.chapters[11].title).toBe('Framing the Constitution');

    // Class 12 Political Science: 15 chapters
    const pol2 = hum.subjects.find(s => s.subjectId === 'political-science-plus-two');
    expect(pol2).toBeDefined();
    expect(pol2.chapters.length).toBe(15);
    expect(pol2.chapters[11].chapterNumber).toBe(12);
    expect(pol2.chapters[14].chapterNumber).toBe(15);
    expect(pol2.chapters[14].title).toBe('Recent Developments in Indian Politics');
  });
});
