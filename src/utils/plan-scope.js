import { getStreamSubjects } from '../engine/planner.js';
import { PLUS_ONE_SYLLABUS } from '../data/syllabus-plus-one.js';
import { PLUS_TWO_SYLLABUS } from '../data/syllabus-plus-two.js';

/**
 * Validate that a string matches YYYY-MM-DD and is a valid calendar date.
 */
export function isCalendarDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T12:00:00`);
  return !Number.isNaN(date.getTime()) && date.getFullYear() === Number(value.slice(0, 4)) &&
    date.getMonth() + 1 === Number(value.slice(5, 7)) && date.getDate() === Number(value.slice(8, 10));
}

/** Legacy stub for backwards compatibility */
export function getImprovementSubjects(_stream) {
  return [];
}

/** Legacy stub for backwards compatibility */
export function validateImprovementSelection(_config, _stream, _startDate, _deadlineDate) {
  return [];
}

/**
 * Rebuild only the active study scope for the student's selected grade (+1 or +2) and stream.
 * Filters by target academic term (Term 1, Term 2, or Full Year) and excludes completed portions.
 */
export function getRemainingPlanTasks({
  grade = '+2',
  stream = 'cs',
  targetTerm = 3,
  completedChapterIds = new Set(),
  completedTaskIds = new Set()
} = {}) {
  const effectiveGrade = (stream === 'imp_only' || grade === '+1' || grade === 11 || grade === 'plus_one') ? '+1' : '+2';
  const effectiveStream = stream === 'imp_only' ? 'cs' : stream;
  const allowedSubjects = getStreamSubjects(effectiveStream);
  const sourceSyllabus = effectiveGrade === '+1' ? PLUS_ONE_SYLLABUS : PLUS_TWO_SYLLABUS;

  return sourceSyllabus
    .filter(task => allowedSubjects.includes(task.subject) && (task.term || 1) <= targetTerm)
    .filter(task => !completedChapterIds.has(task.chapId) && !completedTaskIds.has(task.id));
}
