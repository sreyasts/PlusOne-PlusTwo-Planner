import { describe, expect, it } from 'vitest';
import { buildIntelligentPlan } from '../src/engine/planner.js';

function chapter(chapNumber, minutes, subject = 'Physics') {
  const chapId = `${subject}-${chapNumber}`;
  return minutes.map((estimatedMinutes, index) => ({
    id: `${chapId}-${index + 1}`, chapId, chapNumber, chapterName: `Chapter ${chapNumber}`,
    subject, grade: '+2', part: index + 1, totalParts: minutes.length, estimatedMinutes,
  }));
}

function plan(tasks, deadline, dailyHours) {
  return buildIntelligentPlan({ tasks, startDate: '2026-11-20', deadlineDate: deadline, dailyHours });
}

describe('Chapter pacing', () => {
  it('puts a quarter chapter on each day when there is room to spread the work', () => {
    const tasks = chapter(1, [45, 45, 45, 45]);
    const result = plan(tasks, '2026-11-23', 3);
    expect(result.planDays.map(day => day.tasks.map(task => task.id))).toEqual(tasks.map(task => [task.id]));
  });

  it('fits three whole chapters of the same subject into one day when necessary', () => {
    const tasks = Array.from({ length: 6 }, (_, i) => chapter(i + 1, [30, 30])).flat();
    const result = plan(tasks, '2026-11-21', 3);
    expect(result.isValid).toBe(true);
    for (const day of result.planDays) {
      expect(new Set(day.tasks.map(task => task.chapId)).size).toBe(3);
      expect(day.tasks.every(task => task.isFullOnDay)).toBe(true);
      expect(day.totalMinutes).toBe(180);
    }
  });

  it('uses available minutes to split an oversized chapter into consecutive portions', () => {
    const tasks = chapter(1, [45, 45, 45, 45]);
    const result = plan(tasks, '2026-11-21', 1.5);
    expect(result.planDays.map(day => day.tasks.map(task => task.part))).toEqual([[1, 2], [3, 4]]);
    expect(result.planDays.every(day => day.totalMinutes === 90)).toBe(true);
    expect(result.diagnostics.isInfeasible).toBe(false);
  });

  it('reports unfinished syllabus when the time or block limit prevents full coverage', () => {
    const tasks = Array.from({ length: 9 }, (_, i) => chapter(i + 1, [20])).flat();
    const result = plan(tasks, '2026-11-21', 4);
    expect(result.planDays.map(day => day.tasks.length)).toEqual([3, 3]);
    expect(result.diagnostics.isInfeasible).toBe(true);
    expect(result.diagnostics.unscheduledTaskIds).toEqual(tasks.slice(6).map(task => task.id));
    expect(result.scorecard.omittedTasks).toBe(3);
  });

  it('keeps the scheduled work within the chosen time even when a part cannot fit', () => {
    const tasks = [...chapter(1, [70], 'Physics'), ...chapter(2, [40], 'Physics'), ...chapter(1, [35], 'Chemistry')];
    const result = plan(tasks, '2026-11-21', 1);
    expect(result.planDays.flatMap(day => day.tasks.map(task => task.id)).sort()).toEqual(['Chemistry-1-1', 'Physics-2-1']);
    expect(result.diagnostics.unscheduledTaskIds).toEqual(['Physics-1-1']);
    expect(result.planDays.every(day => day.totalMinutes <= 60)).toBe(true);
  });

  it('mixes subjects in two whole chapter blocks when two fit each day', () => {
    const tasks = ['Physics', 'Chemistry'].flatMap(subject => [1, 2].flatMap(i => chapter(i, [30, 30], subject)));
    const result = plan(tasks, '2026-11-21', 2);
    expect(result.isValid).toBe(true);
    for (const day of result.planDays) {
      expect(new Set(day.tasks.map(task => task.subject)).size).toBe(2);
      expect(new Set(day.tasks.map(task => task.chapId)).size).toBe(2);
      expect(day.totalMinutes).toBe(120);
    }
  });
});
