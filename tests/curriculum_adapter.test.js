import { describe, it, expect } from 'vitest';
import {
  CurriculumAdapter,
  KeralaDHSEAdapter,
  CBSEClass12Adapter,
} from '../src/adapters/index.js';
import { buildIntelligentPlan, validatePlan } from '../src/engine/planner.js';

describe('Curriculum Adapter Architecture & Multi-Board Scheduling', () => {
  describe('CurriculumAdapter Base Contract', () => {
    it('validates compliant tasks successfully', () => {
      const validTask = {
        id: 'TEST_12_PHY_01_P1',
        grade: '12',
        subject: 'Physics',
        chapNumber: 1,
        chapId: 'TEST_PHY_01',
        chapterName: 'Electrostatics',
        part: 1,
        totalParts: 2,
        topicTitle: "Coulomb's Law",
        estimatedMinutes: 60,
        prerequisiteId: null,
      };

      const result = CurriculumAdapter.validateTask(validTask);
      expect(result.valid).toBe(true);
      expect(result.errors.length).toBe(0);
    });

    it('rejects invalid tasks and flags missing fields', () => {
      const invalidTask = {
        id: 'BAD_TASK',
        subject: 'Physics',
        // missing chapNumber, chapterName, part, totalParts, topicTitle
      };

      const result = CurriculumAdapter.validateTask(invalidTask);
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors.some((e) => e.includes('chapNumber'))).toBe(true);
      expect(result.errors.some((e) => e.includes('chapterName'))).toBe(true);
    });

    it('enforces prerequisite chaining on multi-part chapters', () => {
      const unlinkedPart2 = {
        id: 'TEST_12_PHY_01_P2',
        grade: '12',
        subject: 'Physics',
        chapNumber: 1,
        chapId: 'TEST_PHY_01',
        chapterName: 'Electrostatics',
        part: 2,
        totalParts: 2,
        topicTitle: "Gauss's Law",
        estimatedMinutes: 60,
        // missing prerequisiteId
      };

      const result = CurriculumAdapter.validateTask(unlinkedPart2);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('prerequisiteId'))).toBe(true);
    });
  });

  describe('KeralaDHSEAdapter', () => {
    it('initializes canonical tasks for CS stream', () => {
      const adapter = new KeralaDHSEAdapter({ stream: 'cs' });
      expect(adapter.boardId).toBe('kerala-dhse');
      expect(adapter.grade).toBe('+2');
      const subjects = adapter.getSubjects();
      expect(subjects).toContain('Physics');
      expect(subjects).toContain('Chemistry');
      expect(subjects).toContain('Mathematics');
      expect(subjects).toContain('Computer Science');
      expect(adapter.getTasks().length).toBeGreaterThan(100);
    });

    it('dynamically adapts when switching streams', () => {
      const adapter = new KeralaDHSEAdapter({ stream: 'commerce' });
      const subjects = adapter.getSubjects();
      expect(subjects).toContain('Accountancy');
      expect(subjects).toContain('Business Studies');
      expect(subjects).not.toContain('Physics');

      adapter.setStream('bio');
      const bioSubjects = adapter.getSubjects();
      expect(bioSubjects).toContain('Botany');
      expect(bioSubjects).toContain('Zoology');
    });

    it('provides structured chapter-part hierarchies', () => {
      const adapter = new KeralaDHSEAdapter({ stream: 'cs' });
      const phyChapters = adapter.getSubjectChapters('Physics');
      expect(phyChapters.length).toBe(14);
      expect(phyChapters[0].chapterName).toBe('Electric Charges and Fields');
      expect(phyChapters[0].parts.length).toBeGreaterThan(0);
    });

    it('initializes Plus One canonical tasks across all streams when grade is +1', () => {
      const adapter = new KeralaDHSEAdapter({ grade: '+1', stream: 'commerce' });
      expect(adapter.grade).toBe('+1');
      const tasks = adapter.getTasks();
      expect(tasks.length).toBeGreaterThan(50);
      expect(tasks.every((t) => t.grade === '+1')).toBe(true);
      const subjects = adapter.getSubjects();
      expect(subjects).toContain('Accountancy');
      expect(subjects).toContain('Business Studies');
      expect(subjects).toContain('Economics');
      expect(subjects).toContain('Computer Applications');
    });
  });

  describe('CBSEClass12Adapter (National Board Integration)', () => {
    it('initializes rationalized NCERT curriculum for PCM + CS', () => {
      const adapter = new CBSEClass12Adapter({ stream: 'pcm_cs' });
      expect(adapter.boardId).toBe('cbse-class12');
      expect(adapter.grade).toBe('12');

      const subjects = adapter.getSubjects();
      expect(subjects).toEqual(
        expect.arrayContaining(['Physics', 'Chemistry', 'Mathematics', 'Computer Science', 'English Core'])
      );

      const tasks = adapter.getTasks();
      expect(tasks.length).toBeGreaterThan(60);

      // Verify all tasks conform to strict schema
      tasks.forEach((t) => {
        const val = CurriculumAdapter.validateTask(t);
        expect(val.valid).toBe(true);
      });
    });

    it('calculates total estimated study minutes accurately', () => {
      const adapter = new CBSEClass12Adapter({ stream: 'pcm_cs' });
      const totalMinutes = adapter.getTotalEstimatedMinutes();
      expect(totalMinutes).toBeGreaterThan(3000);
    });

    it('schedules a complete multi-month CBSE study plan seamlessly via buildIntelligentPlan', () => {
      const adapter = new CBSEClass12Adapter({ stream: 'pcm_cs' });

      // Feed adapter directly to the engine
      const plan = buildIntelligentPlan({
        adapter,
        startDateStr: '2026-10-01',
        deadlineDateStr: '2027-02-15',
        personalization: {
          intensity: 'balanced',
          weeklyRhythm: 'weekend_booster',
        },
      });

      expect(plan.stream).toBe('custom');
      expect(plan.plan.length).toBeGreaterThan(100);
      expect(plan.revisionDaysCount).toBe(10);
      expect(plan.valid).toBe(true);
      expect(plan.issues.length).toBe(0);

      // Verify that every single configured CBSE task is scheduled
      const scheduledTaskIds = new Set();
      plan.plan.forEach((day) => {
        day.tasks.forEach((t) => {
          if (!t.isRevision) {
            scheduledTaskIds.add(t.id);
          }
        });
      });

      const adapterTasks = adapter.getTasks();
      expect(scheduledTaskIds.size).toBe(adapterTasks.length);
      adapterTasks.forEach((t) => {
        expect(scheduledTaskIds.has(t.id)).toBe(true);
      });

      // Verify dependency topological order: Part 1 must always be scheduled before Part 2
      const taskDayIndexMap = new Map();
      plan.plan.forEach((day, dayIndex) => {
        day.tasks.forEach((t) => {
          if (!taskDayIndexMap.has(t.id)) {
            taskDayIndexMap.set(t.id, dayIndex);
          }
        });
      });

      adapterTasks.forEach((t) => {
        if (t.part > 1 && t.prerequisiteId) {
          const prereqDay = taskDayIndexMap.get(t.prerequisiteId);
          const currentDay = taskDayIndexMap.get(t.id);
          expect(prereqDay).toBeDefined();
          expect(currentDay).toBeDefined();
          expect(prereqDay).toBeLessThanOrEqual(currentDay);
        }
      });
    });

    it('schedules custom curricula using direct tasks array without an adapter class', () => {
      const customTasks = [
        {
          id: 'CUSTOM_BIO_01_P1',
          grade: '12',
          subject: 'Biotechnology',
          chapNumber: 1,
          chapId: 'C_BIO_01',
          chapterName: 'Recombinant DNA Technology',
          part: 1,
          totalParts: 2,
          topicTitle: 'Restriction Endonucleases and Cloning Vectors',
          estimatedMinutes: 60,
          prerequisiteId: null,
        },
        {
          id: 'CUSTOM_BIO_01_P2',
          grade: '12',
          subject: 'Biotechnology',
          chapNumber: 1,
          chapId: 'C_BIO_01',
          chapterName: 'Recombinant DNA Technology',
          part: 2,
          totalParts: 2,
          topicTitle: 'PCR Amplification and Gel Electrophoresis',
          estimatedMinutes: 60,
          prerequisiteId: 'CUSTOM_BIO_01_P1',
        },
      ];

      const plan = buildIntelligentPlan({
        tasks: customTasks,
        startDateStr: '2026-10-01',
        deadlineDateStr: '2026-10-15',
      });

      expect(plan.valid).toBe(true);
      const val = validatePlan(plan, customTasks, { stream: 'custom' });
      expect(val.isValid).toBe(true);
      expect(val.issues.length).toBe(0);
    });
  });
});
