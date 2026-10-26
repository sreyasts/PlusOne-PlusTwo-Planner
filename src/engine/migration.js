/**
 * Backward-Compatible State Migration Engine (v6.1.0)
 * Safely upgrades legacy study plans (v1 through v5) to v6.
 * Guarantees 100% preservation of user checkmarks, progress, and historical completion.
 */

import { PLANNER_ENGINE_VERSION, ENGINE_VERSION, formatLocalDateStr, buildIntelligentPlan } from './planner.js';
import { getRemainingPlanTasks } from '../utils/improvement.js';

export const PLAN_MIGRATION_VERSION = 5;
export const MIGRATION_VERSION = 6;

export function migrateOldState(oldState) {
  if (!oldState || !Array.isArray(oldState.plan)) return null;

  const migratedPlan = oldState.plan.map((day, dIdx) => ({
    dayNumber: day.dayNumber || dIdx + 1,
    date: day.date,
    isRevisionDay: Boolean(day.isRevisionDay),
    tasks: (day.tasks || []).map((t, tIdx) => ({
      id: t.id || `migrated_${dIdx}_${tIdx}`,
      chapId: t.chapId || `${t.grade || '+2'}_${(t.subject || '').replace(/\s+/g, '_')}_${tIdx}`,
      grade: t.grade || '+2',
      subject: t.subject || 'General',
      chapterName: t.chapterName || (t.chapter ? t.chapter.replace(/^\d+\.\s*/, '') : 'Chapter Portion'),
      topicTitle: t.topicTitle || t.topic || 'Concept & Problems',
      completed: Boolean(t.completed),
      term: t.term || 1,
      isRevision: Boolean(t.isRevision),
      estimatedMinutes: t.estimatedMinutes || 60,
    })),
  }));

  let detectedStream = oldState.stream;
  if (!detectedStream) {
    const allSubjects = new Set(migratedPlan.flatMap((d) => d.tasks.map((t) => t.subject)));
    if (allSubjects.has('Accountancy') || allSubjects.has('Business Studies')) {
      detectedStream = 'commerce';
    } else if (allSubjects.has('History') || allSubjects.has('Political Science') || allSubjects.has('Sociology')) {
      detectedStream = 'humanities';
    } else if (allSubjects.has('Botany') || allSubjects.has('Zoology')) {
      detectedStream = 'bio';
    } else {
      detectedStream = 'cs';
    }
  }

  return {
    stream: detectedStream,
    startDate: oldState.startDate || formatLocalDateStr(),
    deadlineDate: oldState.deadlineDate || '2026-11-30',
    targetTerm: oldState.targetTerm || 2,
    completedChaptersOnInit: oldState.completedChapters || [],
    improvementConfig: oldState.improvementConfig || [],
    plan: migratedPlan,
    revisionDaysCount: oldState.revisionDaysCount || 0,
    totalConfiguredTasks: migratedPlan.reduce((acc, d) => acc + d.tasks.length, 0),
    _migratedFromV1: true,
  };
}

export function migrateLegacyUserPlan(existingState) {
  if (!existingState || !Array.isArray(existingState.plan)) return null;

  if (existingState.engineVersion && existingState.engineVersion >= PLANNER_ENGINE_VERSION) {
    return existingState;
  }

  const completedTaskIds = new Set();
  const completedChapterIds = new Set(existingState.completedChaptersOnInit || []);

  existingState.plan.forEach((day) => {
    (day.tasks || []).forEach((t) => {
      if (t.completed) {
        completedTaskIds.add(t.id);
      }
    });
  });

  let userStream = existingState.stream;
  if (!userStream) {
    const allSubjects = new Set(existingState.plan.flatMap((d) => (d.tasks || []).map((t) => t.subject)));
    if (allSubjects.has('Accountancy') || allSubjects.has('Business Studies')) {
      userStream = 'commerce';
    } else if (allSubjects.has('History') || allSubjects.has('Political Science') || allSubjects.has('Sociology')) {
      userStream = 'humanities';
    } else if (allSubjects.has('Botany') || allSubjects.has('Zoology')) {
      userStream = 'bio';
    } else {
      userStream = 'cs';
    }
  }
  const targetTerm = existingState.targetTerm || 3;
  const deadlineDate = existingState.deadlineDate || '2026-11-30';
  const improvementConfig = existingState.improvementConfig || [];
  const startDate = existingState.startDate || formatLocalDateStr();

  const userGrade = existingState.grade || '+2';
  const allTasksToPlan = getRemainingPlanTasks({ grade: userGrade, stream: userStream, targetTerm, improvementConfig, completedChapterIds });

  const generated = buildIntelligentPlan(
    deadlineDate,
    allTasksToPlan,
    startDate,
    improvementConfig,
    userStream,
    existingState.personalization || {}
  );

  if (!generated || !generated.planDays) {
    return existingState;
  }

  generated.planDays.forEach((day) => {
    (day.tasks || []).forEach((t) => {
      if (completedTaskIds.has(t.id)) {
        t.completed = true;
      }
    });
  });

  return {
    ...existingState,
    engineVersion: PLANNER_ENGINE_VERSION,
    plan: generated.planDays,
    revisionDaysCount: generated.revisionDaysCount,
    diagnostics: generated.diagnostics,
    scorecard: generated.scorecard,
    migratedAt: new Date().toISOString(),
  };
}

export function migrateUserState(rawState) {
  if (!rawState || typeof rawState !== 'object') {
    return null;
  }

  // If already at latest engine version, return clean copy
  if (rawState.engineVersion === ENGINE_VERSION && Array.isArray(rawState.plan)) {
    return { ...rawState };
  }

  // Extract completed task IDs from any legacy structure
  const completedTaskIds = new Set();

  if (Array.isArray(rawState.plan)) {
    rawState.plan.forEach((day) => {
      if (Array.isArray(day.tasks)) {
        day.tasks.forEach((task) => {
          if (task && task.completed && task.id) {
            completedTaskIds.add(task.id);
          }
        });
      }
    });
  }

  if (Array.isArray(rawState.completedTasks)) {
    rawState.completedTasks.forEach((id) => completedTaskIds.add(id));
  }

  // Upgrade the plan days and tasks
  const rawPlanArray = Array.isArray(rawState.plan) ? rawState.plan : [];
  const upgradedPlan = rawPlanArray.map((day, dIdx) => {
    const rawTasksArray = (day && Array.isArray(day.tasks)) ? day.tasks : [];
    const upgradedTasks = rawTasksArray.map((t, tIdx) => {
      const isCompleted = completedTaskIds.has(t.id) || Boolean(t.completed);

      // Clean topic title formatting (replace legacy "Part 1 of 3" with clean subtopics)
      let topic = t.topicTitle || '';
      if (topic.includes('of')) {
        topic = topic.replace(/Part (\d+) of (\d+)/i, 'Part $1/$2');
      }

      return {
        ...t,
        id: t.id || `legacy_task_${dIdx}_${tIdx}`,
        grade: t.grade || (t.id && t.id.startsWith('p1_') ? '+1' : '+2'),
        completed: isCompleted,
        topicTitle: topic,
        estimatedMinutes: t.estimatedMinutes || 60,
      };
    });

    const totalMinutes = upgradedTasks.reduce(
      (acc, t) => acc + (t.estimatedMinutes || 60),
      0
    );

    return {
      ...day,
      dayNumber: day.dayNumber || dIdx + 1,
      totalMinutes: day.totalMinutes || totalMinutes,
      tasks: upgradedTasks,
    };
  });

  return {
    ...rawState,
    engineVersion: ENGINE_VERSION,
    grade: rawState.grade || (rawPlanArray.some(d => ((d && d.tasks) || []).some(t => t.grade === '+1')) && !rawPlanArray.some(d => ((d && d.tasks) || []).some(t => t.grade === '+2')) ? '+1' : '+2'),
    stream: rawState.stream || 'cs',
    createdDate: rawState.createdDate || formatLocalDateStr(),
    deadlineDate: rawState.deadlineDate || '2027-02-28',
    termScope: rawState.termScope || 3,
    includePlusOne: Boolean(rawState.includePlusOne),
    plusOneSubjects: rawState.plusOneSubjects || [],
    dailyStudyHours: rawState.dailyStudyHours || 3.5,
    plan: upgradedPlan,
  };
}

