import { describe, expect, it } from 'vitest';
import { buildIntelligentPlan, PLANNER_ENGINE_VERSION } from '../src/engine/planner.js';
import { migrateLegacyUserPlan } from '../src/engine/migration.js';
import { createStudyBackup, parseStudyBackup } from '../src/utils/study-backup.js';
import { getRemainingPlanTasks } from '../src/utils/plan-scope.js';

const startDate = '2026-10-21';
const deadlineDate = '2026-12-21';

describe('Dual-grade planning engine (+1 and +2) & portable plans', () => {
  it('correctly partitions and returns syllabus for Plus One (+1) across streams', () => {
    const csTasks = getRemainingPlanTasks({ grade: '+1', stream: 'cs' });
    expect(csTasks.length).toBeGreaterThan(10);
    expect(csTasks.every(t => t.grade === '+1')).toBe(true);
    expect(csTasks.some(t => t.subject === 'Computer Science')).toBe(true);
    expect(csTasks.some(t => t.subject === 'Botany')).toBe(false);

    const bioTasks = getRemainingPlanTasks({ grade: '+1', stream: 'bio' });
    expect(bioTasks.every(t => t.grade === '+1')).toBe(true);
    expect(bioTasks.some(t => t.subject === 'Botany')).toBe(true);
    expect(bioTasks.some(t => t.subject === 'Zoology')).toBe(true);
    expect(bioTasks.some(t => t.subject === 'Computer Science')).toBe(false);

    const commTasks = getRemainingPlanTasks({ grade: '+1', stream: 'commerce' });
    expect(commTasks.every(t => t.grade === '+1')).toBe(true);
    expect(commTasks.some(t => t.subject === 'Accountancy')).toBe(true);
    expect(commTasks.some(t => t.subject === 'Business Studies')).toBe(true);
    expect(commTasks.some(t => t.subject === 'Physics')).toBe(false);

    const humTasks = getRemainingPlanTasks({ grade: '+1', stream: 'humanities' });
    expect(humTasks.every(t => t.grade === '+1')).toBe(true);
    expect(humTasks.some(t => t.subject === 'History')).toBe(true);
    expect(humTasks.some(t => t.subject === 'Political Science')).toBe(true);
    expect(humTasks.some(t => t.subject === 'Physics')).toBe(false);
  });

  it('correctly partitions and returns syllabus for Plus Two (+2) across streams', () => {
    const p2Cs = getRemainingPlanTasks({ grade: '+2', stream: 'cs' });
    expect(p2Cs.length).toBeGreaterThan(10);
    expect(p2Cs.every(t => t.grade === '+2')).toBe(true);
    expect(p2Cs.some(t => t.subject === 'Computer Science')).toBe(true);
    expect(p2Cs.some(t => t.subject === 'Botany')).toBe(false);

    const p2Comm = getRemainingPlanTasks({ grade: '+2', stream: 'commerce' });
    expect(p2Comm.every(t => t.grade === '+2')).toBe(true);
    expect(p2Comm.some(t => t.subject === 'Accountancy')).toBe(true);
  });

  it('filters syllabus by target term (Term 1, Term 2, Term 3)', () => {
    const term1Tasks = getRemainingPlanTasks({ grade: '+1', stream: 'cs', targetTerm: 1 });
    expect(term1Tasks.every(t => (t.term || 1) <= 1)).toBe(true);

    const term2Tasks = getRemainingPlanTasks({ grade: '+1', stream: 'cs', targetTerm: 2 });
    expect(term2Tasks.every(t => (t.term || 1) <= 2)).toBe(true);
    expect(term2Tasks.length).toBeGreaterThan(term1Tasks.length);

    const term3Tasks = getRemainingPlanTasks({ grade: '+1', stream: 'cs', targetTerm: 3 });
    expect(term3Tasks.length).toBeGreaterThanOrEqual(term2Tasks.length);
  });

  it('excludes completed tasks and chapters', () => {
    const all = getRemainingPlanTasks({ grade: '+1', stream: 'bio' });
    const completedTaskId = all[0].id;
    const completedChapId = all[1].chapId;

    const remaining = getRemainingPlanTasks({
      grade: '+1',
      stream: 'bio',
      completedTaskIds: new Set([completedTaskId]),
      completedChapterIds: new Set([completedChapId]),
    });

    expect(remaining.some(t => t.id === completedTaskId)).toBe(false);
    expect(remaining.some(t => t.chapId === completedChapId)).toBe(false);
    expect(remaining.length).toBeLessThan(all.length);
  });

  it('round-trips a Plus One (+1) plan with its completion state in backups', () => {
    const tasks = getRemainingPlanTasks({ grade: '+1', stream: 'bio' });
    const generated = buildIntelligentPlan(deadlineDate, tasks, startDate, [], 'bio');
    const state = {
      ...generated,
      grade: '+1',
      stream: 'bio',
      engineVersion: PLANNER_ENGINE_VERSION,
      plan: generated.planDays,
    };
    state.plan.flatMap(day => day.tasks)[0].completed = true;

    const backup = createStudyBackup(state, '7.0.0');
    const restored = parseStudyBackup(JSON.stringify(backup));

    expect(restored.grade).toBe('+1');
    expect(restored.stream).toBe('bio');
    expect(restored.plan).toEqual(state.plan);
    expect(restored.plan.flatMap(day => day.tasks)[0].completed).toBe(true);
  });

  it('round-trips a Plus Two (+2) plan with its completion state in backups', () => {
    const tasks = getRemainingPlanTasks({ grade: '+2', stream: 'commerce' });
    const generated = buildIntelligentPlan(deadlineDate, tasks, startDate, [], 'commerce');
    const state = {
      ...generated,
      grade: '+2',
      stream: 'commerce',
      engineVersion: PLANNER_ENGINE_VERSION,
      plan: generated.planDays,
    };
    state.plan.flatMap(day => day.tasks)[0].completed = true;

    const backup = createStudyBackup(state, '7.0.0');
    const restored = parseStudyBackup(JSON.stringify(backup));

    expect(restored.grade).toBe('+2');
    expect(restored.stream).toBe('commerce');
    expect(restored.plan).toEqual(state.plan);
    expect(restored.plan.flatMap(day => day.tasks)[0].completed).toBe(true);
  });

  it('migrates legacy plans preserving completed tasks without corruption', () => {
    const tasks = getRemainingPlanTasks({ grade: '+1', stream: 'cs' });
    const state = {
      grade: '+1',
      stream: 'cs',
      engineVersion: PLANNER_ENGINE_VERSION - 1,
      startDate,
      deadlineDate,
      plan: [{ date: startDate, tasks: [{ ...tasks[0], completed: true }] }],
    };

    const migrated = migrateLegacyUserPlan(state);
    const migratedTasks = migrated.plan.flatMap(day => day.tasks);
    expect(migratedTasks.find(task => task.id === tasks[0].id).completed).toBe(true);
    expect(migrated.grade).toBe('+1');
  });
});
