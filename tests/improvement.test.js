import { describe, expect, it } from 'vitest';
import { buildIntelligentPlan, PLANNER_ENGINE_VERSION } from '../src/engine/planner.js';
import { migrateLegacyUserPlan } from '../src/engine/migration.js';
import { createStudyBackup, parseStudyBackup } from '../src/utils/study-backup.js';
import { getImprovementSubjects, getRemainingPlanTasks, validateImprovementSelection } from '../src/utils/improvement.js';

const startDate = '2026-10-21';
const deadlineDate = '2026-12-21';
const selected = [{ subject: 'Physics', examDate: '2026-12-20' }];

describe('Improvement study scope and portable plans', () => {
  it('accepts explicit future dates and limits optional subjects to the selected +2 stream', () => {
    expect(validateImprovementSelection(selected, 'imp_only', startDate, deadlineDate)).toEqual(selected);
    expect(getImprovementSubjects('imp_only')).toContain('History');
    expect(getImprovementSubjects('commerce')).toContain('Accountancy');
    expect(getImprovementSubjects('cs')).not.toContain('History');
    expect(() => validateImprovementSelection([{ subject: 'History', examDate: deadlineDate }], 'cs', startDate, deadlineDate)).toThrow('supported');
  });

  it.each(['', '2026-02-30', '2026-10-20', startDate, '2026-12-22'])('rejects missing, impossible, past or out-of-period exam dates: %s', examDate => {
    expect(() => validateImprovementSelection([{ subject: 'Physics', examDate }], 'imp_only', startDate, deadlineDate)).toThrow('exam date');
  });

  it('requires an improvement-only selection and rejects duplicate subjects', () => {
    expect(() => validateImprovementSelection([], 'imp_only', startDate, deadlineDate)).toThrow('at least one');
    expect(() => validateImprovementSelection([...selected, ...selected], 'imp_only', startDate, deadlineDate)).toThrow('once');
    expect(validateImprovementSelection([], 'cs', startDate, deadlineDate)).toEqual([]);
  });

  it('rebuilds only selected +1 lessons, excluding completed tasks and chapters', () => {
    const all = getRemainingPlanTasks({ stream: 'imp_only', improvementConfig: selected });
    expect(all.length).toBeGreaterThan(1);
    expect(all.every(task => task.grade === '+1' && task.subject === 'Physics')).toBe(true);
    const remaining = getRemainingPlanTasks({
      stream: 'imp_only', improvementConfig: selected,
      completedTaskIds: new Set([all[0].id]), completedChapterIds: new Set([all[1].chapId]),
    });
    expect(remaining.some(task => task.id === all[0].id || task.chapId === all[1].chapId)).toBe(false);
    const mixed = getRemainingPlanTasks({ stream: 'cs', targetTerm: 1, improvementConfig: selected });
    expect(mixed.some(task => task.grade === '+1')).toBe(true);
    expect(mixed.some(task => task.grade === '+2')).toBe(true);
    expect(mixed.filter(task => task.grade === '+2').every(task => task.term <= 1)).toBe(true);
  });

  it('round-trips a real +1 plan with its dates, selected subjects and completion', () => {
    const generated = buildIntelligentPlan(deadlineDate, getRemainingPlanTasks({ stream: 'imp_only', improvementConfig: selected }), startDate, selected, 'imp_only');
    const state = { ...generated, engineVersion: PLANNER_ENGINE_VERSION, improvementConfig: selected, plan: generated.planDays };
    state.plan.flatMap(day => day.tasks)[0].completed = true;
    const restored = parseStudyBackup(JSON.stringify(createStudyBackup(state, '6.4.3')));
    expect(restored.stream).toBe('imp_only');
    expect(restored.improvementConfig).toEqual(selected);
    expect(restored.plan).toEqual(state.plan);
  });

  it('rejects malformed, duplicate or unsupported backup subject/date metadata but permits historical exam dates', () => {
    const task = getRemainingPlanTasks({ stream: 'imp_only', improvementConfig: selected })[0];
    const state = { stream: 'imp_only', plan: [{ date: startDate, tasks: [task] }] };
    for (const improvementConfig of [[{ subject: 'Physics' }], [{ subject: 'Physics', examDate: '2026-02-30' }], [...selected, ...selected], [{ subject: 'Unknown', examDate: deadlineDate }]]) {
      expect(() => createStudyBackup({ ...state, improvementConfig }, '6.4.3')).toThrow();
    }
    expect(() => createStudyBackup({ ...state, improvementConfig: [{ subject: 'Physics', examDate: '2025-12-20' }] }, '6.4.3')).not.toThrow();
  });

  it('migrates old improvement-only plans without adding +2 or unselected subjects', () => {
    const tasks = getRemainingPlanTasks({ stream: 'imp_only', improvementConfig: selected });
    const state = {
      stream: 'imp_only', engineVersion: PLANNER_ENGINE_VERSION - 1, startDate, deadlineDate,
      improvementConfig: selected, plan: [{ date: startDate, tasks: [{ ...tasks[0], completed: true }] }],
    };
    const migrated = migrateLegacyUserPlan(state);
    const migratedTasks = migrated.plan.flatMap(day => day.tasks);
    expect(migratedTasks.filter(task => !task.isRevision && !task.isExamEveTask).every(task => task.grade === '+1' && task.subject === 'Physics')).toBe(true);
    expect(migratedTasks.find(task => task.id === tasks[0].id).completed).toBe(true);
    expect(migrated.improvementConfig).toEqual(selected);
  });
});
