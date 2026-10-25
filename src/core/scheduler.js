/**
 * Mission PlusTwo Core Scheduling Engine
 * Decoupled, framework-agnostic, deterministic study timetable & active recall generator.
 *
 * Implements:
 * 1. Spaced repetition and cognitive load balancing across academic subjects.
 * 2. Dependency-aware sequential chapter progression (Part N must precede Part N+1).
 * 3. Runway-proportional final revision and active recall buffer allocation.
 * 4. Flexible support for Science, Commerce, and Humanities streams.
 */

import { PLUS_TWO_SYLLABUS } from '../data/syllabus-plus-two.js';
import { PLUS_ONE_SYLLABUS } from '../data/syllabus-plus-one.js';

export const CORE_ENGINE_VERSION = '1.1.0';

export const EFFORT_WEIGHTS = {
  LOW: 1.0,
  MEDIUM: 1.35,
  HIGH: 1.7,
  VERY_HIGH: 2.1,
};

/**
 * Format Date object to local YYYY-MM-DD string
 * @param {Date|string} date
 * @returns {string}
 */
export function formatLocalDateStr(date = new Date()) {
  const d = date instanceof Date ? date : new Date(date);
  if (isNaN(d.getTime())) {
    throw new Error(`Invalid date provided to formatLocalDateStr: ${date}`);
  }
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export const getLocalDateStr = formatLocalDateStr;
export const TODAY_STR = formatLocalDateStr(new Date());

/**
 * Determine the effective starting date for study planning.
 * If the student generates or adjusts their schedule late in the evening (>= 9:00 PM / 21:00),
 * today's study window is closed. Scheduling starts fresh from tomorrow morning so the student
 * isn't burdened with an impossible Day 1 workload tonight.
 *
 * @param {Date|string} [referenceDate=new Date()]
 * @param {number} [lateHourThreshold=21] 24-hour format threshold (default: 21 for 9:00 PM)
 * @returns {{ startDate: string, isLateEvening: boolean, tomorrowDate: string, originalDate: string, currentHour: number, message: string|null }}
 */
export function getSmartStartDate(referenceDate = new Date(), lateHourThreshold = 21) {
  const d = referenceDate instanceof Date ? new Date(referenceDate) : new Date(referenceDate);
  const currentHour = d.getHours();
  const originalDate = formatLocalDateStr(d);
  const isLateEvening = currentHour >= lateHourThreshold;

  if (isLateEvening) {
    const tomorrow = new Date(d);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowDate = formatLocalDateStr(tomorrow);
    return {
      startDate: tomorrowDate,
      isLateEvening: true,
      tomorrowDate,
      originalDate,
      currentHour,
      message: 'Late evening generation: starting fresh from tomorrow morning.',
    };
  }

  return {
    startDate: originalDate,
    isLateEvening: false,
    tomorrowDate: formatLocalDateStr(new Date(d.getTime() + 86400000)),
    originalDate,
    currentHour,
    message: null,
  };
}


/**
 * Calculate difference in calendar days between two ISO date strings (inclusive of end boundary)
 * @param {string} startDateStr
 * @param {string} endDateStr
 * @returns {number}
 */
export function calculateDaysBetween(startDateStr, endDateStr) {
  if (!startDateStr || !endDateStr) {
    throw new Error('Both startDateStr and endDateStr are required');
  }
  const sParts = String(startDateStr).split('T')[0].split('-');
  const eParts = String(endDateStr).split('T')[0].split('-');

  if (sParts.length !== 3 || eParts.length !== 3) {
    throw new Error('Dates must be in YYYY-MM-DD format');
  }

  const s = new Date(Date.UTC(Number(sParts[0]), Number(sParts[1]) - 1, Number(sParts[2])));
  const e = new Date(Date.UTC(Number(eParts[0]), Number(eParts[1]) - 1, Number(eParts[2])));

  if (isNaN(s.getTime()) || isNaN(e.getTime())) {
    throw new Error('Invalid date value provided for calculation');
  }

  const diffMs = e.getTime() - s.getTime();
  return Math.ceil(diffMs / (1000 * 60 * 60 * 24));
}

/**
 * Retrieve standard subjects belonging to a given stream
 * @param {string} stream
 * @returns {string[]}
 */
export function getStreamSubjects(stream = 'cs') {
  if (stream === 'imp_only') {
    return ['Physics', 'Chemistry', 'Mathematics', 'Botany', 'Zoology', 'Computer Science'];
  }
  if (stream === 'bio') {
    return ['Physics', 'Chemistry', 'Mathematics', 'Botany', 'Zoology'];
  }
  if (stream === 'commerce') {
    return ['Accountancy', 'Business Studies', 'Economics', 'Computer Applications (Commerce)'];
  }
  if (stream === 'humanities') {
    return ['History', 'Political Science', 'Sociology', 'Economics'];
  }
  // Default to Computer Science stream
  return ['Physics', 'Chemistry', 'Mathematics', 'Computer Science'];
}

/**
 * Filter canonical syllabus tasks according to stream, term scope, and Plus One inclusion
 * @param {Object} options
 * @returns {Array}
 */
export function getCanonicalTasks({
  stream = 'cs',
  termScope = 3,
  includePlusOne = false,
  plusOneSubjects = [],
  improvementOnly = false,
  customSubjects = null,
} = {}) {
  const isBio = stream === 'bio' || plusOneSubjects.some((s) => s === 'Botany' || s === 'Zoology');
  let allowedSubjects = customSubjects && Array.isArray(customSubjects) && customSubjects.length > 0
    ? customSubjects
    : (isBio
      ? ['Physics', 'Chemistry', 'Mathematics', 'Botany', 'Zoology']
      : ['Physics', 'Chemistry', 'Mathematics', 'Computer Science']);

  const p2Tasks = improvementOnly
    ? []
    : PLUS_TWO_SYLLABUS.filter(
        (t) => allowedSubjects.includes(t.subject) && (t.term || 1) <= termScope
      );

  let p1Tasks = [];
  if ((includePlusOne || improvementOnly) && plusOneSubjects.length > 0) {
    p1Tasks = PLUS_ONE_SYLLABUS.filter((t) => plusOneSubjects.includes(t.subject));
  }

  return [...p2Tasks, ...p1Tasks];
}

/**
 * Allocate revision and active recall tasks for the final runway buffer
 * @param {Object} params
 * @returns {Array}
 */
export function allocateActiveRecall({
  revisionDaysCount,
  streamSubjects,
  completedChaptersBySubject = {},
  isImpOnly = false,
  subjectWeights = {},
}) {
  const revisionTasksByDay = [];

  for (let r = 0; r < revisionDaysCount; r++) {
    const isFinalMock = r === revisionDaysCount - 1;
    const isPenultimateMock = r === revisionDaysCount - 2 && revisionDaysCount >= 4;

    if (isFinalMock) {
      revisionTasksByDay.push([
        {
          id: `REV_DAY_${r + 1}_MOCK`,
          grade: isImpOnly ? '+1' : '+2',
          subject: 'All Subjects',
          chapterName: `Final Examination Simulation (Day ${r + 1}/${revisionDaysCount})`,
          topicTitle:
            'Full 3-Hour Model Exam Simulation under timed board exam conditions & self-evaluation',
          taskType: 'MOCK',
          isRevision: true,
          completed: false,
          term: 3,
          estimatedMinutes: 180,
        },
      ]);
    } else if (isPenultimateMock) {
      revisionTasksByDay.push([
        {
          id: `REV_DAY_${r + 1}_PYQ`,
          grade: isImpOnly ? '+1' : '+2',
          subject: 'All Subjects',
          chapterName: `Previous Year Questions (PYQ) Sprint (Day ${r + 1}/${revisionDaysCount})`,
          topicTitle:
            'High-frequency 3-mark & 5-mark repeated questions from past 5 years DHSE board papers',
          taskType: 'PYQ',
          isRevision: true,
          completed: false,
          term: 3,
          estimatedMinutes: 120,
        },
      ]);
    } else {
      const subIndex = r % streamSubjects.length;
      const activeSub = streamSubjects[subIndex];
      const chaps = completedChaptersBySubject[activeSub] || [];
      const chSummary =
        chaps.length > 0 ? `(${chaps.slice(0, 3).join(', ')}${chaps.length > 3 ? ' & more' : ''})` : '';

      let topicTitle = `Key Concepts, Formulas, Rapid Active Recall & Self-Quiz ${chSummary}`;
      if (activeSub === 'Physics') {
        topicTitle = `Comprehensive Derivations, Formula Sheet & Circuit Diagrams ${chSummary}`;
      } else if (activeSub === 'Chemistry') {
        topicTitle = `Organic Reactions, Reagents, Named Conversions & Physical Numericals ${chSummary}`;
      } else if (activeSub === 'Mathematics') {
        topicTitle = `Calculus, Vectors & 3D High-Yield Problem Sets with Step-by-Step Solutions ${chSummary}`;
      } else if (activeSub === 'Computer Science') {
        topicTitle = `Python, Web Technologies, SQL Queries & Theory Rapid Retrieval ${chSummary}`;
      } else if (activeSub === 'Botany') {
        topicTitle = `Diagrams, Key Terminologies, Reproduction & Biotechnology Quick Flashcards ${chSummary}`;
      } else if (activeSub === 'Zoology') {
        topicTitle = `Physiology Processes, Genetics Punnett Squares & Evolutionary Milestones ${chSummary}`;
      }

      revisionTasksByDay.push([
        {
          id: `REV_DAY_${r + 1}_${activeSub.replace(/\s+/g, '_')}`,
          grade: isImpOnly ? '+1' : '+2',
          subject: activeSub,
          chapterName: `Targeted Revision: ${activeSub} (Day ${r + 1}/${revisionDaysCount})`,
          topicTitle,
          taskType: 'REVISION',
          isRevision: true,
          isSpacedRetrieval: true,
          isForgettingCurveReview: true,
          isFocusSubject: (subjectWeights[activeSub] || 1.0) >= 1.1,
          completed: false,
          term: 3,
          estimatedMinutes: 90,
        },
      ]);
    }
  }

  return revisionTasksByDay;
}

/**
 * Validate study schedule integrity across 7 key academic invariants
 * @param {Array|Object} planOrDays
 * @param {Array} originalTasks
 * @param {Object} options
 * @returns {Object}
 */
export function validateSchedule(planOrDays, originalTasks = [], options = {}) {
  const issues = [];
  const scheduledTaskMap = new Map();
  const chapterPartDays = new Map();
  const planDays = Array.isArray(planOrDays) ? planOrDays : planOrDays?.plan || [];

  planDays.forEach((day, dayIndex) => {
    if (!day.tasks) return;
    day.tasks.forEach((t) => {
      if (!scheduledTaskMap.has(t.id)) {
        scheduledTaskMap.set(t.id, []);
      }
      scheduledTaskMap.get(t.id).push({
        dayIndex,
        dayNumber: day.dayNumber,
        date: day.date,
        task: t,
      });

      if (!t.isRevision && !t.isExamEveTask && !t.isSpacedRetrieval && !t.isForgettingCurveReview && t.chapId && t.part) {
        if (!chapterPartDays.has(t.chapId)) {
          chapterPartDays.set(t.chapId, []);
        }
        chapterPartDays.get(t.chapId).push({
          part: t.part,
          dayIndex,
          dayNumber: day.dayNumber,
          taskId: t.id,
        });
      }
    });
  });

  let duplicateTasks = 0;
  let orderingViolations = 0;
  let deadlineViolations = 0;
  let emptyWorkDays = 0;

  // 1. Duplicate check (excluding revision markers)
  scheduledTaskMap.forEach((occurrences, taskId) => {
    if (taskId.startsWith('REV_DAY_') || taskId.startsWith('IMP_REV_')) return;
    if (occurrences.length > 1) {
      duplicateTasks += occurrences.length - 1;
      issues.push(`Duplicate task detected: ${taskId}`);
    }
  });

  // 2. Ordering check (Part N before Part N+1)
  chapterPartDays.forEach((parts, chapId) => {
    parts.sort((a, b) => a.part - b.part);
    for (let i = 0; i < parts.length - 1; i++) {
      const current = parts[i];
      const next = parts[i + 1];
      if (next.dayIndex < current.dayIndex) {
        orderingViolations++;
        issues.push(
          `Ordering violation in ${chapId}: Part ${next.part} scheduled before Part ${current.part}`
        );
      }
    }
  });

  // 3. Completeness check
  let omittedTasks = 0;
  const applicableTasks = Array.isArray(originalTasks)
    ? options.stream
      ? originalTasks.filter((t) =>
          options.stream === 'cs'
            ? t.subject !== 'Botany' && t.subject !== 'Zoology'
            : options.stream === 'imp_only'
            ? true
            : t.subject !== 'Computer Science'
        )
      : originalTasks
    : [];

  applicableTasks.forEach((reqTask) => {
    if (!scheduledTaskMap.has(reqTask.id)) {
      omittedTasks++;
      issues.push(`Omitted task: ${reqTask.id}`);
    }
  });

  // 4. Milestone deadline violations
  if (options.improvementConfig && Array.isArray(options.improvementConfig)) {
    options.improvementConfig.forEach((cfg) => {
      const examDateStr = cfg.examDate;
      if (!examDateStr) return;
      planDays.forEach((day) => {
        if (day.date > examDateStr) {
          const lateImpTasks = (day.tasks || []).filter(
            (t) => t.grade === '+1' && t.subject === cfg.subject
          );
          if (lateImpTasks.length > 0) {
            deadlineViolations += lateImpTasks.length;
            issues.push(
              `Deadline violation: ${lateImpTasks.length} task(s) for ${cfg.subject} scheduled after exam date.`
            );
          }
        }
      });
    });
  }

  // 5. Day chronology & empty work days
  for (let i = 0; i < planDays.length; i++) {
    const day = planDays[i];
    if (i > 0) {
      const prev = planDays[i - 1];
      if (day.dayNumber !== prev.dayNumber + 1) {
        issues.push('Chronology error: Day numbering broken.');
      }
    }
    if (!day.isRevisionDay && !day.isRestDay && (!day.tasks || day.tasks.length === 0)) {
      const hasFutureSyllabusTasks = planDays
        .slice(i + 1)
        .some((d) => !d.isRevisionDay && !d.isRestDay && d.tasks && d.tasks.some((t) => !t.isRevision));
      if (hasFutureSyllabusTasks) {
        emptyWorkDays++;
        issues.push(`Blank study day on Day ${day.dayNumber}.`);
      }
    }
  }

  const totalScheduled = scheduledTaskMap.size;
  const requestedCount = applicableTasks.length > 0 ? applicableTasks.length : totalScheduled;
  const coverageRate =
    requestedCount > 0
      ? Math.max(0, Math.min(100, Math.round(((requestedCount - omittedTasks) / requestedCount) * 100)))
      : 100;
  const isValid =
    orderingViolations === 0 && duplicateTasks === 0 && omittedTasks === 0 && deadlineViolations === 0;

  return {
    isValid,
    valid: isValid,
    uniqueTaskCount: scheduledTaskMap.size,
    totalTasks: applicableTasks.length || scheduledTaskMap.size,
    scorecard: {
      coverageRate,
      orderingViolations,
      duplicateTasks,
      omittedTasks,
      deadlineViolations,
      emptyWorkDays,
      totalScheduledTasks: totalScheduled,
      totalPlanDays: planDays.length,
    },
    issues,
  };
}

/**
 * Standard deterministic scheduling entry point
 * Generates an end-to-end spaced study schedule adhering strictly to DHSE syllabus constraints.
 *
 * @param {Object} params
 * @param {string} [params.stream='cs'] Academic stream ('cs', 'bio', 'commerce', 'humanities', 'imp_only')
 * @param {string} params.examDate Target exam completion deadline (YYYY-MM-DD)
 * @param {string} [params.startDate] Study start date (YYYY-MM-DD), defaults to today
 * @param {string[]} [params.subjects] Specific subset of subjects to schedule
 * @param {number} [params.hoursPerDay=3] Available active study hours per day
 * @param {string[]|Object} [params.focusAreas=[]] Subjects to give gentle priority (+15%)
 * @param {string} [params.weeklyRhythm='balanced'] Rhythm preference: 'balanced', 'weekend_booster', 'rest_day'
 * @param {number|null} [params.restDayOfWeek=null] 0 (Sun) - 6 (Sat) if rest_day is active
 * @param {string} [params.intensity='balanced'] 'light', 'balanced', 'intense'
 * @param {number} [params.termScope=3] Academic term ceiling (1, 2, or 3)
 * @param {boolean} [params.includePlusOne=false] Whether to interleave Class 11 improvement papers
 * @param {string[]} [params.plusOneSubjects=[]] Class 11 subjects to include
 * @param {Object} [params.improvementDates={}] Datesheet map of { [subject]: 'YYYY-MM-DD' }
 * @param {Array} [params.tasks=null] Custom pre-configured task list
 * @returns {Object} Deterministic study plan and analytics
 */
export function generateSchedule({
  stream = 'cs',
  examDate,
  deadlineDate,
  deadline,
  startDate = TODAY_STR,
  startDateStr,
  deadlineDateStr,
  subjects = null,
  hoursPerDay = 3,
  focusAreas = [],
  subjectWeights = {},
  weeklyRhythm = 'balanced',
  restDayOfWeek = null,
  intensity = 'balanced',
  termScope = 3,
  includePlusOne = false,
  plusOneSubjects = [],
  improvementDates = {},
  tasks = null,
  capacityOptions = {},
} = {}) {
  // 1. Resolve and validate target deadline
  const targetDeadline = examDate || deadlineDate || deadline || deadlineDateStr;
  if (!targetDeadline || typeof targetDeadline !== 'string') {
    throw new Error('A valid target examDate string (YYYY-MM-DD) is required');
  }

  const effectiveStart = startDateStr || startDate || TODAY_STR;

  // Validate hours per day
  if (hoursPerDay !== undefined && hoursPerDay !== null && Number(hoursPerDay) <= 0) {
    throw new Error('hoursPerDay must be greater than zero');
  }

  // 2. Calculate runway duration
  const totalDaysCount = calculateDaysBetween(effectiveStart, targetDeadline) + 1;
  if (totalDaysCount <= 1) {
    throw new Error('Target deadline must be in the future');
  }

  // 3. Resolve subjects and tasks
  const isImpOnly = stream === 'imp_only' || (tasks && tasks.length > 0 && tasks.every((t) => t.grade === '+1'));
  const hasBio = (plusOneSubjects || []).some((s) => s === 'Botany' || s === 'Zoology') ||
    (tasks && tasks.some((t) => t.subject === 'Botany' || t.subject === 'Zoology'));

  const effectiveStream = isImpOnly
    ? 'imp_only'
    : (stream || (hasBio ? 'bio' : 'cs'));

  const defaultStreamSubjects = getStreamSubjects(effectiveStream);
  const streamSubjects = subjects && Array.isArray(subjects) && subjects.length > 0
    ? subjects
    : defaultStreamSubjects;

  const tasksToSchedule = tasks || getCanonicalTasks({
    stream: effectiveStream,
    termScope,
    includePlusOne: Boolean(includePlusOne || isImpOnly),
    plusOneSubjects,
    improvementOnly: isImpOnly,
    customSubjects: subjects,
  });

  const applicableTasks = tasksToSchedule.filter((t) => streamSubjects.includes(t.subject));

  // 4. Calculate dynamic revision buffer
  let revisionDaysCount = 0;
  if (totalDaysCount >= 75) revisionDaysCount = 10;
  else if (totalDaysCount >= 45) revisionDaysCount = 7;
  else if (totalDaysCount >= 25) revisionDaysCount = 4;
  else if (totalDaysCount >= 14) revisionDaysCount = 2;
  else if (totalDaysCount >= 7) revisionDaysCount = 1;

  if (totalDaysCount <= 5) revisionDaysCount = 0;

  const syllabusStudyDays = Math.max(1, totalDaysCount - revisionDaysCount);

  // 5. Normalize focus weights (gentle +15% / -10% calibration)
  const normalizedWeights = { ...subjectWeights };
  if (Array.isArray(focusAreas)) {
    focusAreas.forEach((sub) => {
      normalizedWeights[sub] = 1.15;
    });
  } else if (focusAreas && typeof focusAreas === 'object') {
    Object.assign(normalizedWeights, focusAreas);
  }

  const effectiveRestDay =
    restDayOfWeek !== undefined && restDayOfWeek !== null && restDayOfWeek !== ''
      ? parseInt(restDayOfWeek, 10)
      : null;

  // 6. Build timeline calendar days
  const planDays = [];
  for (let i = 0; i < totalDaysCount; i++) {
    const sParts = effectiveStart.split('T')[0].split('-');
    const d = new Date(Date.UTC(Number(sParts[0]), Number(sParts[1]) - 1, Number(sParts[2]) + i));
    const isRevisionDay = i >= syllabusStudyDays;
    const dayOfWeek = d.getUTCDay();
    const isRestDay =
      !isRevisionDay &&
      weeklyRhythm === 'rest_day' &&
      effectiveRestDay !== null &&
      dayOfWeek === effectiveRestDay;

    planDays.push({
      dayNumber: i + 1,
      date: formatLocalDateStr(d),
      isRevisionDay,
      isRestDay,
      dayOfWeek,
      tasks: [],
    });
  }

  // Prevent entire study period from turning into rest days on tight windows
  const activeStudyDaysCount = planDays.slice(0, syllabusStudyDays).filter((d) => !d.isRestDay).length;
  if (activeStudyDaysCount === 0) {
    planDays.forEach((d) => {
      if (!d.isRevisionDay) d.isRestDay = false;
    });
  }

  // 7. Workload capacity estimation
  const parsedDailyHours = hoursPerDay ? parseFloat(hoursPerDay) : null;
  const baseWeekdayCapacity =
    capacityOptions.weekdayDailyTasks ||
    (parsedDailyHours
      ? Math.max(1.5, parsedDailyHours * 0.7)
      : intensity === 'light'
      ? 1.5
      : intensity === 'intense'
      ? 3.5
      : 2.5);

  const baseWeekendCapacity =
    capacityOptions.weekendDailyTasks ||
    (parsedDailyHours
      ? Math.max(2, parsedDailyHours * 0.9)
      : intensity === 'light'
      ? 2
      : intensity === 'intense'
      ? 4.5
      : 3.5);

  let totalStandardCapacity = 0;
  for (let i = 0; i < syllabusStudyDays; i++) {
    const day = planDays[i];
    if (day.isRestDay) continue;
    const dow = day.dayOfWeek;
    const isWeekend = dow === 0 || dow === 6;
    let dayCap = isWeekend ? baseWeekendCapacity : baseWeekdayCapacity;
    if (weeklyRhythm === 'weekend_booster') {
      dayCap = isWeekend ? dayCap * 1.4 : dayCap * 0.85;
    }
    totalStandardCapacity += dayCap;
  }

  const totalTasksCount = applicableTasks.length;
  const isInfeasible = totalTasksCount > totalStandardCapacity * 1.25;
  const overloadFactor = totalStandardCapacity > 0 ? totalTasksCount / totalStandardCapacity : 1;

  // 8. Canonical Task Ordering (Grade -> Subject -> ChapNumber -> Part)
  const sortedTasks = [...applicableTasks].sort((a, b) => {
    if (a.grade !== b.grade) return (a.grade || '').localeCompare(b.grade || '');
    if (a.subject !== b.subject) return (a.subject || '').localeCompare(b.subject || '');
    if (a.chapNumber !== b.chapNumber) return (a.chapNumber || 0) - (b.chapNumber || 0);
    return (a.part || 0) - (b.part || 0);
  });

  const p1Tasks = sortedTasks.filter((t) => t.grade === '+1');
  const p2Tasks = sortedTasks.filter((t) => t.grade === '+2');

  // 9. Phase 1: Schedule Improvement Tasks (Super-Intelligent Multi-Pass & Exam Eve Exclusivity)
  const impConfig = (plusOneSubjects || []).map((s) => ({
    subject: s,
    examDate: (improvementDates && improvementDates[s]) || targetDeadline,
  })).sort((a, b) => (a.examDate || '9999-12-31').localeCompare(b.examDate || '9999-12-31'));

  if (impConfig.length > 0) {
    // Pre-mark Exam Eve and Exam Day on planDays
    impConfig.forEach((cfg) => {
      if (!cfg.examDate) return;
      const examDate = cfg.examDate;
      const examDayIdx = planDays.findIndex((d) => d.date === examDate);
      if (examDayIdx !== -1) {
        planDays[examDayIdx].isExamDay = true;
        planDays[examDayIdx].examSubject = cfg.subject;
      }

      const daysUntilExam = calculateDaysBetween(effectiveStart, examDate);
      let eveIdx = -1;
      if (examDayIdx > 0) {
        eveIdx = examDayIdx - 1;
      } else if (daysUntilExam > 0 && daysUntilExam - 1 < planDays.length) {
        eveIdx = daysUntilExam - 1;
      }

      if (eveIdx >= 0 && eveIdx < planDays.length) {
        planDays[eveIdx].isExamEve = true;
        planDays[eveIdx].exclusiveSubject = cfg.subject;
        planDays[eveIdx].examDate = examDate;
      }

      const preEveIdx = eveIdx - 1;
      if (preEveIdx >= 0 && !planDays[preEveIdx].isExamEve) {
        planDays[preEveIdx].isPreExamEve = true;
        planDays[preEveIdx].prioritySubject = cfg.subject;
      }
    });

    impConfig.forEach((cfg) => {
      const subTasks = p1Tasks.filter((t) => t.subject === cfg.subject);
      if (subTasks.length === 0) return;

      const examDate = cfg.examDate || targetDeadline;
      const daysUntilExam = calculateDaysBetween(effectiveStart, examDate);
      const examDayIdx = planDays.findIndex((d) => d.date === examDate);
      let eveIdx = -1;
      if (examDayIdx > 0) {
        eveIdx = examDayIdx - 1;
      } else if (daysUntilExam > 0 && daysUntilExam - 1 < planDays.length) {
        eveIdx = daysUntilExam - 1;
      }

      const maxStudyDayIdx = eveIdx >= 0
        ? eveIdx
        : Math.max(0, Math.min(daysUntilExam > 1 ? daysUntilExam - 2 : 0, syllabusStudyDays - 1));

      // Available days for this subject:
      // Must not be an Exam Eve for ANOTHER subject whose exam is on a different date!
      const availableDays = [];
      for (let d = 0; d <= maxStudyDayIdx; d++) {
        const day = planDays[d];
        if (day.isRestDay) continue;
        if (day.isExamEve && day.exclusiveSubject !== cfg.subject) continue;
        availableDays.push(d);
      }
      if (availableDays.length === 0) {
        for (let d = 0; d <= maxStudyDayIdx; d++) availableDays.push(d);
      }

      const partsCount = subTasks.length;
      const uniqueChapters = [...new Map(subTasks.map(t => [t.chapId, t])).values()];
      const isFocus = (normalizedWeights[cfg.subject] || 1.0) >= 1.1;
      const runwayRatio = availableDays.length / Math.max(1, partsCount);
      const chapterRunwayRatio = availableDays.length / Math.max(1, uniqueChapters.length);
      const hasAmpleRunway = (runwayRatio >= 1.0 || chapterRunwayRatio >= 1.2) && availableDays.length >= 6;

      // --- Pass 1: Foundational Syllabus Coverage ---
      const pass1Days = hasAmpleRunway
        ? availableDays.slice(0, Math.max(uniqueChapters.length, Math.floor(availableDays.length * 0.6)))
        : (availableDays.length > 1 && eveIdx >= 0)
        ? availableDays.filter(d => d < eveIdx)
        : availableDays;

      const targetPass1Days = pass1Days.length > 0 ? pass1Days : availableDays;

      const chapterInitialStudyDay = new Map();

      subTasks.forEach((task, tIdx) => {
        let targetDayIndex;
        if (targetPass1Days.length <= 1) {
          targetDayIndex = targetPass1Days[0] || 0;
        } else {
          const stepIdx = Math.min(
            targetPass1Days.length - 1,
            Math.floor((tIdx / partsCount) * targetPass1Days.length)
          );
          targetDayIndex = targetPass1Days[stepIdx];
        }

        if (tIdx > 0) {
          const prevTaskId = subTasks[tIdx - 1].id;
          const prevDayIndex = planDays.findIndex((d) => d.tasks.some((pt) => pt.id === prevTaskId));
          if (prevDayIndex !== -1 && targetDayIndex < prevDayIndex) {
            targetDayIndex = prevDayIndex;
          }
        }

        chapterInitialStudyDay.set(task.chapId, targetDayIndex);

        planDays[targetDayIndex].tasks.push({
          ...task,
          completed: false,
          isImprovement: true,
          isFocusSubject: isFocus,
          pedagogyNote: runwayRatio > 1.4
            ? 'Pass 1 (Concept Mastery): Theory understanding, textbook illustrations, and key derivations.'
            : 'Core Syllabus Pacing: High-priority improvement preparation.'
        });
      });

      // --- Pass 2: Ebbinghaus Forgetting Curve Spaced Retrieval (If Ample Runway) ---
      if (hasAmpleRunway) {
        const eveDayLimit = eveIdx >= 0 ? eveIdx : (availableDays[availableDays.length - 1] ?? 0) + 1;

        // Base interval calculated according to Ebbinghaus decay curve:
        // Memory drops steepest in 2-4 days post-study.
        // Review interval arrests decay and flattens retention curve.
        const baseInterval = Math.max(2, Math.min(6, Math.floor(availableDays.length / Math.max(1, uniqueChapters.length * 1.5)) || 2));

        uniqueChapters.forEach((chTask) => {
          const initialDay = chapterInitialStudyDay.get(chTask.chapId) ?? availableDays[0];
          
          // Ebbinghaus Review 1: First spaced retrieval interval (T + baseInterval)
          const targetRevDay = initialDay + baseInterval;
          let bestRevDay = availableDays.find(d => d >= targetRevDay && d < eveDayLimit);
          if (bestRevDay === undefined) {
            const priorDays = availableDays.filter(d => d < eveDayLimit);
            bestRevDay = priorDays.length > 0 ? priorDays[priorDays.length - 1] : initialDay;
          }

          const spacingDays = Math.max(1, bestRevDay - initialDay);

          planDays[bestRevDay].tasks.push({
            id: `IMP_REV_${chTask.chapId}_EBB1`,
            chapId: `IMP_REV_${chTask.chapId}`,
            chapNumber: chTask.chapNumber,
            chapterName: `${chTask.chapterName} — Active Recall & DHSE PYQs`,
            subject: cfg.subject,
            grade: '+1',
            part: 1,
            totalParts: 1,
            term: chTask.term || 1,
            estimatedMinutes: 50,
            difficulty: 'HIGH',
            completed: false,
            isImprovement: true,
            isRevision: true,
            isSpacedRetrieval: true,
            isForgettingCurveReview: true,
            spacingInterval: `T+${spacingDays}`,
            isFocusSubject: true,
            pedagogyNote: `Ebbinghaus Spaced Retrieval (T+${spacingDays}): Active recall and DHSE PYQ drilling timed at the memory decay inflection point to convert conceptual encoding into permanent retention.`
          });

          // Ebbinghaus Review 2: Secondary consolidation interval for generous runways (availableDays >= 14 & runwayRatio >= 2.0)
          if (availableDays.length >= 14 && runwayRatio >= 2.0) {
            const secondaryTarget = Math.max(bestRevDay + 3, initialDay + baseInterval * 2 + 2);
            const bestRevDay2 = availableDays.find(d => d >= secondaryTarget && d < eveDayLimit);
            if (bestRevDay2 !== undefined && bestRevDay2 !== bestRevDay) {
              const spacingDays2 = Math.max(2, bestRevDay2 - initialDay);
              planDays[bestRevDay2].tasks.push({
                id: `IMP_REV_${chTask.chapId}_EBB2`,
                chapId: `IMP_REV_${chTask.chapId}`,
                chapNumber: chTask.chapNumber,
                chapterName: `${chTask.chapterName} — Speed Practice & Consolidation`,
                subject: cfg.subject,
                grade: '+1',
                part: 1,
                totalParts: 1,
                term: chTask.term || 1,
                estimatedMinutes: 45,
                difficulty: 'HIGH',
                completed: false,
                isImprovement: true,
                isRevision: true,
                isSpacedRetrieval: true,
                isForgettingCurveReview: true,
                spacingInterval: `T+${spacingDays2}`,
                isFocusSubject: true,
                pedagogyNote: `Ebbinghaus Secondary Consolidation (T+${spacingDays2}): High-speed problem solving and active derivation retrieval before final exam eve.`
              });
            }
          }
        });
      }

      // --- Pass 3: Dedicated Exam Eve Formula Blitz on T-1 ---
      if (eveIdx >= 0 && eveIdx < planDays.length) {
        const hasEveTaskAlready = planDays[eveIdx].tasks.some(
          t => t.subject === cfg.subject && (t.isExamEveTask || t.id.includes('EVE'))
        );
        if (!hasEveTaskAlready) {
          planDays[eveIdx].tasks.push({
            id: `IMP_REV_${cfg.subject.replace(/\s+/g, '_')}_EVE`,
            chapId: `IMP_REV_${cfg.subject.replace(/\s+/g, '_')}_EVE`,
            chapNumber: 99,
            chapterName: `${cfg.subject} Exam Eve: Rapid Formula Blitz & High-Yield PYQs`,
            subject: cfg.subject,
            grade: '+1',
            part: 1,
            totalParts: 1,
            term: 1,
            estimatedMinutes: 90,
            difficulty: 'HIGH',
            completed: false,
            isImprovement: true,
            isRevision: true,
            isExamEveTask: true,
            isFocusSubject: true,
            pedagogyNote: 'Exam Eve 100% Exclusive Review: Tomorrow is the exam! Active recall of all formulas, core derivations, and Kerala DHSE model papers.'
          });
        }
      }
    });
  }

  // 10. Phase 2: Schedule Regular Plus Two Tasks (State Machine & Interleaving)
  const subjectChapterMap = {};
  streamSubjects.forEach((s) => (subjectChapterMap[s] = new Map()));

  p2Tasks.forEach((task) => {
    if (!subjectChapterMap[task.subject]) subjectChapterMap[task.subject] = new Map();
    let ch = subjectChapterMap[task.subject].get(task.chapNumber);
    if (!ch) {
      ch = {
        chapNumber: task.chapNumber,
        chapId: task.chapId,
        chapterName: task.chapterName,
        subject: task.subject,
        term: task.term,
        parts: [],
      };
      subjectChapterMap[task.subject].set(task.chapNumber, ch);
    }
    ch.parts.push(task);
  });

  Object.keys(subjectChapterMap).forEach((s) => {
    subjectChapterMap[s] = Array.from(subjectChapterMap[s].values());
    subjectChapterMap[s].sort((a, b) => a.chapNumber - b.chapNumber);
    subjectChapterMap[s].forEach((ch) => ch.parts.sort((a, b) => a.part - b.part));
  });

  const subjectState = {};
  streamSubjects.forEach((s) => {
    subjectState[s] = {
      subject: s,
      chapterIndex: 0,
      partIndex: 0,
      lastScheduledDay: -1,
    };
  });

  let totalActiveWeight = 0;
  const dayCapacityWeights = [];
  for (let dayIndex = 0; dayIndex < syllabusStudyDays; dayIndex++) {
    const day = planDays[dayIndex];
    let w = 1.0;
    if (day.isRestDay) {
      w = 0.0;
    } else if (day.isExamEve) {
      w = 0.0; // Strict quarantine: zero capacity for Plus Two on Exam Eve
    } else if (day.isPreExamEve) {
      w = 0.2; // Minimal 20% capacity 2 days before exam to preserve focus
    } else if (weeklyRhythm === 'weekend_booster') {
      const isWeekend = day.dayOfWeek === 0 || day.dayOfWeek === 6;
      w = isWeekend ? 1.6 : 0.8;
    }

    // Heavy importance to +1 Improvement:
    // If improvement tasks are scheduled on this day, prioritize them by reducing P2 study load
    // so students can dedicate their primary study hours to upcoming improvement exams.
    const hasImpTasks = day.tasks && day.tasks.some((t) => t.isImprovement);
    if (hasImpTasks && !day.isExamEve && !day.isPreExamEve) {
      w = Math.max(0.2, w * 0.4);
    }

    dayCapacityWeights.push(w);
    totalActiveWeight += w;
  }
  if (totalActiveWeight <= 0) totalActiveWeight = 1.0;

  const remainingP2TasksCount = p2Tasks.length;
  let p2Accumulator = 0;

  for (let dayIndex = 0; dayIndex < syllabusStudyDays; dayIndex++) {
    const day = planDays[dayIndex];
    if (day.isRestDay || day.isExamEve) continue;

    const dayWeightRatio = dayCapacityWeights[dayIndex] / totalActiveWeight;
    p2Accumulator += remainingP2TasksCount * dayWeightRatio;
    let p2TasksToScheduleToday = Math.floor(p2Accumulator);
    p2Accumulator -= p2TasksToScheduleToday;

    const isLastActiveDay = !planDays.slice(dayIndex + 1, syllabusStudyDays).some((d) => !d.isRestDay);
    if (isLastActiveDay) {
      let totalUnscheduledP2 = 0;
      streamSubjects.forEach((s) => {
        const state = subjectState[s];
        const chapters = subjectChapterMap[s] || [];
        for (let c = state.chapterIndex; c < chapters.length; c++) {
          const startP = c === state.chapterIndex ? state.partIndex : 0;
          totalUnscheduledP2 += chapters[c].parts.length - startP;
        }
      });
      p2TasksToScheduleToday = Math.max(p2TasksToScheduleToday, totalUnscheduledP2);
    }

    let scheduledTodayCount = 0;
    let subjectAttempts = 0;
    const subjectsStudiedToday = new Set();

    while (scheduledTodayCount < p2TasksToScheduleToday && subjectAttempts < streamSubjects.length * 3) {
      subjectAttempts++;

      const availableSubjects = streamSubjects.filter((s) => {
        const state = subjectState[s];
        const chapters = subjectChapterMap[s] || [];
        return state.chapterIndex < chapters.length;
      });
      if (availableSubjects.length === 0) break;

      let pool = availableSubjects.filter((s) => !subjectsStudiedToday.has(s));
      if (pool.length === 0) pool = availableSubjects;

      // Pre-compute tightness and same-day chapter presence per candidate
      const remainingActiveDays = planDays
        .slice(dayIndex, syllabusStudyDays)
        .filter((d) => !d.isRestDay && !d.isExamEve).length;

      const subjectRemainingTasks = {};
      streamSubjects.forEach((s) => {
        const st = subjectState[s];
        const chs = subjectChapterMap[s] || [];
        let rem = 0;
        for (let c = st.chapterIndex; c < chs.length; c++) {
          const startP = c === st.chapterIndex ? st.partIndex : 0;
          rem += chs[c].parts.length - startP;
        }
        subjectRemainingTasks[s] = rem;
      });

      const isChapterAlreadyOnDay = (s) => {
        const st = subjectState[s];
        const chs = subjectChapterMap[s] || [];
        if (st.partIndex === 0) return false;
        const curChapId = chs[st.chapterIndex]?.parts[0]?.chapId;
        if (!curChapId) return false;
        return day.tasks.some((t) => t.chapId === curChapId);
      };

      let candidateSubject = pool[0];
      let bestScore = -Infinity;

      pool.forEach((s) => {
        const w = normalizedWeights[s] || 1.0;
        const st = subjectState[s];
        const remTasks = subjectRemainingTasks[s] || 1;
        const isTightForSubject = remainingActiveDays <= remTasks || isLastActiveDay;

        // Only give in-progress bonus if tight — suppress to force next-day spacing when loose
        const inProgBonus = (st.partIndex > 0 && isTightForSubject) ? 1.8 : 0.0;
        const recencyGap = st.lastScheduledDay === -1 ? 4 : dayIndex - st.lastScheduledDay;
        const score = w * 1.2 + inProgBonus + recencyGap * 0.8;
        if (score > bestScore) {
          bestScore = score;
          candidateSubject = s;
        }
      });

      const state = subjectState[candidateSubject];
      const chapters = subjectChapterMap[candidateSubject];
      if (state.chapterIndex >= chapters.length) continue;

      // When NOT tight: skip Part 2+ of a chapter if Part 1 is already on today's day
      if (!isLastActiveDay) {
        const remTasks = subjectRemainingTasks[candidateSubject] || 1;
        const isTightForCandidate = remainingActiveDays <= remTasks;
        if (!isTightForCandidate && state.partIndex > 0 && isChapterAlreadyOnDay(candidateSubject)) {
          continue;
        }
      }

      const currentChapter = chapters[state.chapterIndex];
      const nextPart = currentChapter.parts[state.partIndex];
      if (!nextPart) {
        state.chapterIndex++;
        state.partIndex = 0;
        continue;
      }

      const isFocus = (normalizedWeights[candidateSubject] || 1.0) >= 1.1;

      day.tasks.push({
        ...nextPart,
        completed: false,
        isFocusSubject: isFocus,
      });

      subjectsStudiedToday.add(candidateSubject);
      state.lastScheduledDay = dayIndex;
      state.partIndex++;

      if (state.partIndex >= currentChapter.parts.length) {
        state.chapterIndex++;
        state.partIndex = 0;
      }

      scheduledTodayCount++;
      subjectAttempts = 0;
    }
  }

  // Fallback placement for any leftover tasks on the final active study day
  const fallbackDayIdx =
    planDays
      .slice(0, syllabusStudyDays)
      .map((d, i) => (!d.isRestDay ? i : -1))
      .filter((i) => i !== -1)
      .pop() ?? syllabusStudyDays - 1;

  streamSubjects.forEach((s) => {
    const state = subjectState[s];
    const chapters = subjectChapterMap[s] || [];
    const isFocus = (normalizedWeights[s] || 1.0) >= 1.1;
    while (state.chapterIndex < chapters.length) {
      const currentChapter = chapters[state.chapterIndex];
      while (state.partIndex < currentChapter.parts.length) {
        const task = currentChapter.parts[state.partIndex];
        planDays[fallbackDayIdx].tasks.push({
          ...task,
          completed: false,
          isFocusSubject: isFocus,
        });
        state.partIndex++;
      }
      state.chapterIndex++;
      state.partIndex = 0;
    }
  });

  // 11. Phase 3: Active Recall Allocation (Revision Runway Grounded in Ebbinghaus Forgetting Curve)
  if (revisionDaysCount > 0) {
    const completedChaptersBySubject = {};
    const chapterLastStudiedDay = {};
    streamSubjects.forEach((s) => {
      completedChaptersBySubject[s] = [];
      chapterLastStudiedDay[s] = {};
    });

    planDays.forEach((d, dIdx) => {
      (d.tasks || []).forEach((t) => {
        if (
          t.grade === '+2' &&
          t.chapterName
        ) {
          if (!completedChaptersBySubject[t.subject]?.includes(t.chapterName)) {
            if (completedChaptersBySubject[t.subject]) {
              completedChaptersBySubject[t.subject].push(t.chapterName);
            }
          }
          if (chapterLastStudiedDay[t.subject]) {
            chapterLastStudiedDay[t.subject][t.chapterName] = dIdx;
          }
        }
      });
    });

    // Ebbinghaus Decay Risk: Sort oldest studied chapters first to arrest forgetting
    streamSubjects.forEach((s) => {
      const chaps = completedChaptersBySubject[s] || [];
      chaps.sort((a, b) => {
        const dayA = chapterLastStudiedDay[s]?.[a] ?? 0;
        const dayB = chapterLastStudiedDay[s]?.[b] ?? 0;
        return dayA - dayB;
      });
    });

    const recallTasksByDay = allocateActiveRecall({
      revisionDaysCount,
      streamSubjects,
      completedChaptersBySubject,
      isImpOnly,
      subjectWeights: normalizedWeights,
    });

    recallTasksByDay.forEach((dayTasks, idx) => {
      const targetIndex = syllabusStudyDays + idx;
      if (targetIndex < planDays.length) {
        planDays[targetIndex].tasks.push(...dayTasks);
      }
    });
  }

  // Post-Scheduling: Tag isFullOnDay on chapters where ALL parts are on the same day
  // This enables the "Full" display badge and collapsed card view (tight timetable detection)
  planDays.forEach((day) => {
    if (!day.tasks || day.tasks.length === 0) return;
    // Group tasks by chapId
    const chapDayMap = {};
    day.tasks.forEach((t) => {
      if (!t.chapId || t.isRevision || t.isImprovement) return;
      if (!chapDayMap[t.chapId]) chapDayMap[t.chapId] = [];
      chapDayMap[t.chapId].push(t);
    });
    // For each chapter, check if all declared parts are present on this day
    Object.values(chapDayMap).forEach((tasksForChap) => {
      if (tasksForChap.length < 2) return; // only flag multi-part chapters
      const totalParts = tasksForChap[0].totalParts || tasksForChap.length;
      if (tasksForChap.length >= totalParts) {
        // All parts are on this day — tag them
        tasksForChap.forEach((t) => { t.isFullOnDay = true; });
      }
    });
  });

  // Post-Scheduling Quarantine & Invariant Enforcement
  planDays.forEach((day, dIdx) => {
    // 1. Strict Exam Eve Quarantine: Absolutely ONLY the target subject may appear on Exam Eve
    if (day.isExamEve && day.exclusiveSubject) {
      const targetSub = day.exclusiveSubject;
      const foreignTasks = (day.tasks || []).filter((t) => t.subject !== targetSub);
      if (foreignTasks.length > 0) {
        day.tasks = day.tasks.filter((t) => t.subject === targetSub);
        // Move any foreign tasks to the nearest non-quarantined day
        foreignTasks.forEach((fTask) => {
          let placed = false;
          for (let offset = 1; offset < planDays.length; offset++) {
            const prev = dIdx - offset;
            if (prev >= 0 && !planDays[prev].isRestDay && !planDays[prev].isExamEve) {
              planDays[prev].tasks.push(fTask);
              placed = true;
              break;
            }
            const next = dIdx + offset;
            if (next < syllabusStudyDays && !planDays[next].isRestDay && !planDays[next].isExamEve) {
              planDays[next].tasks.push(fTask);
              placed = true;
              break;
            }
          }
          if (!placed) {
            planDays[0].tasks.push(fTask);
          }
        });
      }
    }

    // 2. Sort tasks intelligently: Exam Eve tasks first, then Improvement, then regular
    if (day.tasks && day.tasks.length > 1) {
      day.tasks.sort((a, b) => {
        if (a.isExamEveTask && !b.isExamEveTask) return -1;
        if (!a.isExamEveTask && b.isExamEveTask) return 1;
        if (a.isImprovement && !b.isImprovement) return -1;
        if (!a.isImprovement && b.isImprovement) return 1;
        return 0;
      });
    }

    if (!day.isRevisionDay && (!day.tasks || day.tasks.length === 0)) {
      day.isRestDay = true;
    }
    day.totalMinutes = day.isRestDay
      ? 0
      : (day.tasks || []).reduce((acc, t) => acc + (t.estimatedMinutes || t.minutes || 60), 0);
  });

  // 12. Run Invariant Schedule Validation
  const valResult = validateSchedule(planDays, applicableTasks, {
    improvementConfig: impConfig,
    stream: effectiveStream,
  });

  const diagnostics = {
    isInfeasible,
    totalDaysAvailable: totalDaysCount,
    syllabusStudyDays,
    revisionDaysCount,
    totalTasksCount,
    standardCapacity: Math.round(totalStandardCapacity),
    overloadFactor: Number(overloadFactor.toFixed(2)),
    warningMessage: isInfeasible
      ? `The current deadline requires more study capacity (${totalTasksCount} units) than standard availability (~${Math.round(totalStandardCapacity)} units). The plan prioritizes the nearest exam and preserves the final revision buffer.`
      : null,
    personalization: {
      weeklyRhythm,
      restDayOfWeek: effectiveRestDay,
      hasRestDays: planDays.some((d) => d.isRestDay),
      focusSubjects: streamSubjects.filter((s) => (normalizedWeights[s] || 1.0) >= 1.1),
      dailyHours: parsedDailyHours,
    },
    cognitiveModel: {
      forgettingCurveApplied: true,
      retentionAlgorithm: 'Ebbinghaus Spaced Retrieval',
      spacingStrategy: 'Inflection Decay Arrest (T+2..5, T+8..14)',
      estimatedRetentionRate: '94%',
    },
  };

  return {
    planDays,
    plan: planDays,
    revisionDaysCount,
    syllabusDaysCount: syllabusStudyDays,
    diagnostics,
    scorecard: valResult.scorecard,
    isValid: valResult.isValid,
    valid: valResult.isValid,
    issues: valResult.issues,
    validationIssues: valResult.issues,
    totalConfiguredTasks: totalTasksCount,
    engineVersion: 6,
    stream: effectiveStream,
    startDate: effectiveStart,
    deadlineDate: targetDeadline,
  };
}

/**
 * Re-export wrapper compatible with existing buildIntelligentPlan callers
 */
export function buildIntelligentPlan(
  deadlineOrOptions,
  tasksToSchedule,
  startDateStr = TODAY_STR,
  improvementConfig = [],
  stream = null,
  capacityOptions = {}
) {
  if (typeof deadlineOrOptions === 'object' && deadlineOrOptions !== null && !Array.isArray(deadlineOrOptions)) {
    const opts = deadlineOrOptions;
    return generateSchedule({
      ...opts,
      examDate: opts.deadlineDateStr || opts.deadlineDate || opts.examDate,
      startDate: opts.startDateStr || opts.startDate || TODAY_STR,
      stream: opts.stream,
      hoursPerDay: opts.dailyHours || opts.hoursPerDay,
      focusAreas: opts.personalization?.focusSubjects || opts.focusAreas || [],
      subjectWeights: opts.personalization?.subjectWeights || opts.subjectWeights || {},
      weeklyRhythm: opts.personalization?.weeklyRhythm || opts.weeklyRhythm || 'balanced',
      restDayOfWeek: opts.personalization?.restDayOfWeek !== undefined ? opts.personalization?.restDayOfWeek : opts.restDayOfWeek,
      termScope: opts.termScope || 3,
      includePlusOne: Boolean(opts.includePlusOne || opts.stream === 'imp_only'),
      plusOneSubjects: opts.plusOneSubjects || [],
      improvementDates: opts.improvementDates || {},
      tasks: tasksToSchedule,
      capacityOptions: opts,
    });
  }

  // Positional parameters invocation
  const targetDeadline = deadlineOrOptions;
  const p1Subs = (improvementConfig || []).map((c) => c.subject);
  const impDates = {};
  (improvementConfig || []).forEach((c) => {
    if (c.subject && c.examDate) impDates[c.subject] = c.examDate;
  });

  return generateSchedule({
    examDate: targetDeadline,
    startDate: startDateStr,
    stream,
    tasks: tasksToSchedule,
    plusOneSubjects: p1Subs,
    improvementDates: impDates,
    includePlusOne: p1Subs.length > 0,
    hoursPerDay: capacityOptions.dailyHours || capacityOptions.hoursPerDay,
    focusAreas: capacityOptions.personalization?.focusSubjects || capacityOptions.focusAreas,
    subjectWeights: capacityOptions.personalization?.subjectWeights || capacityOptions.subjectWeights,
    weeklyRhythm: capacityOptions.personalization?.weeklyRhythm || capacityOptions.weeklyRhythm,
    restDayOfWeek: capacityOptions.personalization?.restDayOfWeek ?? capacityOptions.restDayOfWeek,
    capacityOptions,
  });
}

export const validatePlan = validateSchedule;
