import { getStreamSubjects } from '../engine/planner.js';
import { PLUS_ONE_SYLLABUS } from '../data/syllabus-plus-one.js';
import { PLUS_TWO_SYLLABUS } from '../data/syllabus-plus-two.js';

export function getImprovementSubjects(stream) {
  return getStreamSubjects(stream).filter(subject => PLUS_ONE_SYLLABUS.some(task => task.subject === subject));
}

export function isCalendarDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T12:00:00`);
  return !Number.isNaN(date.getTime()) && date.getFullYear() === Number(value.slice(0, 4)) &&
    date.getMonth() + 1 === Number(value.slice(5, 7)) && date.getDate() === Number(value.slice(8, 10));
}

/** Validate user-selected dates; importing a historical backup uses structural validation instead. */
export function validateImprovementSelection(config, stream, startDate, deadlineDate) {
  if (!Array.isArray(config) || !isCalendarDate(startDate) || !isCalendarDate(deadlineDate)) {
    throw new TypeError('Choose valid planning dates before selecting improvement subjects.');
  }
  if (stream === 'imp_only' && config.length === 0) {
    throw new TypeError('Select at least one +1 Improvement subject.');
  }
  const supported = getImprovementSubjects(stream);
  const seen = new Set();
  return config.map(item => {
    if (!item || !supported.includes(item.subject) || seen.has(item.subject)) {
      throw new TypeError('Choose each supported improvement subject once.');
    }
    if (!isCalendarDate(item.examDate) || item.examDate <= startDate || item.examDate > deadlineDate) {
      throw new TypeError(`Choose an exam date for ${item.subject} after the plan start and on or before the target date.`);
    }
    seen.add(item.subject);
    return { subject: item.subject, examDate: item.examDate };
  });
}

/** Rebuild only the original study scope, retaining exclusions and completed task IDs. */
export function getRemainingPlanTasks({ stream, targetTerm = 3, improvementConfig = [], completedChapterIds = new Set(), completedTaskIds = new Set() }) {
  const allowedSubjects = getStreamSubjects(stream);
  const selected = new Set(improvementConfig.filter(item => allowedSubjects.includes(item.subject)).map(item => item.subject));
  const tasks = stream === 'imp_only' ? [] : PLUS_TWO_SYLLABUS.filter(task =>
    allowedSubjects.includes(task.subject) && task.term <= targetTerm);
  return [...tasks, ...PLUS_ONE_SYLLABUS.filter(task => selected.has(task.subject))]
    .filter(task => !completedChapterIds.has(task.chapId) && !completedTaskIds.has(task.id));
}
