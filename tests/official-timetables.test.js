import { describe, it, expect } from 'vitest';
import {
  DHSE_EXAM_CYCLES,
  DHSE_ACADEMIC_MILESTONES,
  detectExamCycleForDeadline,
  getOfficialExamSchedule,
  getOfficialExamEventsForPlan,
  getSubjectExamDeadlines,
  getOfficialExamPresets,
} from '../src/data/dhse-exam-timetables.js';
import {
  buildIntelligentPlan,
  validatePlan,
  getCanonicalTasks,
} from '../src/engine/planner.js';
import { generateSchedule, validateSchedule } from '../src/core/scheduler.js';
import { generateIcsCalendar } from '../src/utils/calendar.js';

describe('Official Kerala DHSE 2026-2027 Exam Timetables & Intelligent Scheduling', () => {
  it('defines accurate official exam windows for Christmas, Model, and Public exams', () => {
    expect(DHSE_EXAM_CYCLES.christmas.startDate).toBe('2026-12-08');
    expect(DHSE_EXAM_CYCLES.christmas.endDate).toBe('2026-12-17');
    expect(DHSE_EXAM_CYCLES.model.startDate).toBe('2027-02-11');
    expect(DHSE_EXAM_CYCLES.model.endDate).toBe('2027-02-24');
    expect(DHSE_EXAM_CYCLES.public.startDate).toBe('2027-03-02');
    expect(DHSE_EXAM_CYCLES.public.endDate).toBe('2027-03-30');
    expect(DHSE_ACADEMIC_MILESTONES.practicalsStartDate).toBe('2027-01-25');
    expect(DHSE_ACADEMIC_MILESTONES.christmasVacationStart).toBe('2026-12-19');
    expect(DHSE_ACADEMIC_MILESTONES.schoolReopenDate).toBe('2026-12-28');
  });

  it('detects exam cycles and generates dynamic official presets', () => {
    expect(detectExamCycleForDeadline('2026-12-17')).toBe('christmas');
    expect(detectExamCycleForDeadline('2027-02-24')).toBe('model');
    expect(detectExamCycleForDeadline('2027-03-30')).toBe('public');
    expect(detectExamCycleForDeadline('2026-10-30')).toBe('custom');

    const presets = getOfficialExamPresets(new Date('2026-11-26T10:00:00'));
    expect(presets.christmas.date).toBe('2026-12-17');
    expect(presets.christmas.isUpcoming).toBe(true);
    expect(presets.model.date).toBe('2027-02-24');
    expect(presets.public.date).toBe('2027-03-30');
  });

  it('returns accurate stream-isolated Plus Two (+2) & Plus One (+1) Christmas Exam timetables', () => {
    const p2CsXmas = getOfficialExamSchedule({ grade: '+2', stream: 'cs', examCycle: 'christmas' });
    expect(p2CsXmas.find((e) => e.subjects.includes('Physics'))).toMatchObject({ date: '2026-12-09', session: 'FN', time: '9:30 AM' });
    expect(p2CsXmas.find((e) => e.subjects.includes('Mathematics'))).toMatchObject({ date: '2026-12-11', session: 'FN' });
    expect(p2CsXmas.find((e) => e.subjects.includes('Chemistry'))).toMatchObject({ date: '2026-12-14', session: 'FN' });
    expect(p2CsXmas.find((e) => e.subjects.includes('Computer Science'))).toMatchObject({ date: '2026-12-16', session: 'FN' });
    expect(p2CsXmas.some((e) => e.subjects.includes('Botany'))).toBe(false);

    const p1BioXmas = getOfficialExamSchedule({ grade: '+1', stream: 'bio', examCycle: 'christmas' });
    expect(p1BioXmas.find((e) => e.subjects.includes('Physics'))).toMatchObject({ date: '2026-12-10', session: 'AN', time: '1:30 PM' });
    expect(p1BioXmas.find((e) => e.subjects.includes('Mathematics'))).toMatchObject({ date: '2026-12-14', session: 'FN', time: '9:30 AM' });
    expect(p1BioXmas.find((e) => e.subjects.includes('Chemistry'))).toMatchObject({ date: '2026-12-15', session: 'AN' });
    expect(p1BioXmas.find((e) => e.subjects.includes('Botany'))).toMatchObject({ date: '2026-12-16', session: 'AN' });
    expect(p1BioXmas.some((e) => e.subjects.includes('Computer Science'))).toBe(false);
  });

  it('returns accurate Plus Two (+2) & Plus One (+1) Public Exam (March 2027) timetables across streams', () => {
    const p2CommPub = getOfficialExamSchedule({ grade: '+2', stream: 'commerce', examCycle: 'public' });
    expect(p2CommPub.find((e) => e.subjects.includes('Business Studies'))).toMatchObject({ date: '2027-03-08', session: 'FN' });
    expect(p2CommPub.find((e) => e.subjects.includes('Economics'))).toMatchObject({ date: '2027-03-15', session: 'FN' });
    expect(p2CommPub.find((e) => e.subjects.includes('Accountancy'))).toMatchObject({ date: '2027-03-24', session: 'FN' });
    expect(p2CommPub.find((e) => e.subjects.includes('Computer Applications'))).toMatchObject({ date: '2027-03-29', session: 'FN' });

    const p1HumPub = getOfficialExamSchedule({ grade: '+1', stream: 'humanities', examCycle: 'public' });
    expect(p1HumPub.find((e) => e.subjects.includes('Sociology'))).toMatchObject({ date: '2027-03-08', session: 'FN' });
    expect(p1HumPub.find((e) => e.subjects.includes('History'))).toMatchObject({ date: '2027-03-12', session: 'AN', time: '2:00 PM' });
    expect(p1HumPub.find((e) => e.subjects.includes('Economics'))).toMatchObject({ date: '2027-03-22', session: 'FN' });
    expect(p1HumPub.find((e) => e.subjects.includes('Political Science'))).toMatchObject({ date: '2027-03-30', session: 'AN', time: '2:00 PM' });
  });

  it('aligns Christmas Exam plan (both +1 and +2) to finish syllabus before Dec 8 and creates official exam-eve revisions', () => {
    ['+1', '+2'].forEach((grade) => {
      ['cs', 'bio', 'commerce', 'humanities'].forEach((stream) => {
        const tasks = getCanonicalTasks({ grade, stream, termScope: 2 });
        const plan = buildIntelligentPlan({
          grade,
          stream,
          termScope: 2,
          startDateStr: '2026-11-26',
          deadlineDateStr: '2026-12-17',
          examCycle: 'christmas',
          useOfficialTimetable: true,
          alignToOfficialExamWindow: true,
          includeExamEveTasks: true,
        });

        expect(plan.isValid).toBe(true);
        expect(plan.examCycle).toBe('christmas');
        expect(plan.diagnostics.officialSchedule.enabled).toBe(true);
        expect(plan.diagnostics.officialSchedule.grade).toBe(grade);

        const val = validatePlan(plan.planDays, tasks, { stream });
        expect(val.isValid).toBe(true);
        expect(val.scorecard.omittedTasks).toBe(0);
        expect(val.scorecard.duplicateTasks).toBe(0);
        expect(val.scorecard.orderingViolations).toBe(0);

        // Syllabus study days finish before Dec 8 exam start
        const dec8Idx = plan.planDays.findIndex((d) => d.date === '2026-12-08');
        expect(dec8Idx).toBeGreaterThan(0);
        expect(plan.planDays[dec8Idx].isRevisionDay).toBe(true);

        // Official exam days exist on Dec 8-17
        const examDays = plan.planDays.filter((d) => d.isOfficialExamDay);
        expect(examDays.length).toBeGreaterThanOrEqual(5);
        expect(examDays.every((d) => Array.isArray(d.officialExams) && d.officialExams.length > 0)).toBe(true);
      });
    });
  });

  it('aligns Model Exam (Feb 11-24) and Public Exam (Mar 2-30) plans with all DHSE milestones for +1 and +2', () => {
    const p1Model = generateSchedule({
      grade: '+1',
      stream: 'cs',
      termScope: 3,
      startDate: '2027-01-10',
      examDate: '2027-02-24',
      examCycle: 'model',
      useOfficialTimetable: true,
      alignToOfficialExamWindow: true,
      includeExamEveTasks: true,
    });
    expect(p1Model.isValid).toBe(true);
    expect(p1Model.examCycle).toBe('model');
    expect(p1Model.plan.some((d) => d.isPracticalMilestone && d.date === '2027-01-25')).toBe(true);
    expect(p1Model.plan.find((d) => d.date === '2027-02-11').isRevisionDay).toBe(true);
    expect(p1Model.plan.filter((d) => d.isOfficialExamDay).length).toBeGreaterThanOrEqual(5);

    const p2Public = buildIntelligentPlan({
      grade: '+2',
      stream: 'bio',
      termScope: 3,
      startDateStr: '2026-11-26',
      deadlineDateStr: '2027-03-30',
      examCycle: 'public',
      useOfficialTimetable: true,
      alignToOfficialExamWindow: true,
      includeExamEveTasks: true,
    });
    expect(p2Public.isValid).toBe(true);
    expect(p2Public.examCycle).toBe('public');
    expect(p2Public.diagnostics.officialSchedule.hasChristmasMilestone).toBe(true);
    expect(p2Public.diagnostics.officialSchedule.hasModelMilestone).toBe(true);
    expect(p2Public.diagnostics.officialSchedule.hasPublicMilestone).toBe(true);
    expect(p2Public.planDays.some((d) => d.isChristmasVacation && d.date === '2026-12-25')).toBe(true);
    expect(p2Public.planDays.some((d) => d.isPracticalMilestone && d.date === '2027-01-25')).toBe(true);

    // Public exam eve of Chemistry (Mar 8) is Mar 7, and exam day Mar 8 is marked FN 9:30 AM
    const mar7 = p2Public.planDays.find((d) => d.date === '2027-03-07');
    const mar8 = p2Public.planDays.find((d) => d.date === '2027-03-08');
    expect(mar7.isExamEve).toBe(true);
    expect(mar7.exclusiveSubject).toBe('Chemistry');
    expect(mar8.isOfficialExamDay).toBe(true);
    expect(mar8.officialExams[0].paperTitle).toContain('Chemistry');
    expect(mar8.officialExams[0].session).toBe('FN');

    // Public exam of Physics (Mar 12) is AN 2:00 PM
    const mar12 = p2Public.planDays.find((d) => d.date === '2027-03-12');
    expect(mar12.isOfficialExamDay).toBe(true);
    expect(mar12.officialExams[0].paperTitle).toContain('Physics');
    expect(mar12.officialExams[0].session).toBe('AN');
    expect(mar12.officialExams[0].time).toBe('2:00 PM');

    const val = validateSchedule(p2Public);
    expect(val.valid).toBe(true);
  });

  it('orders subject urgency by official exam dates and exports official exam events to .ics calendar', () => {
    const deadlines = getSubjectExamDeadlines({
      grade: '+2',
      stream: 'commerce',
      startDate: '2027-01-01',
      deadlineDate: '2027-03-30',
      examCycle: 'public',
    });
    expect(deadlines.orderedSubjects).toEqual([
      'Business Studies',
      'Economics',
      'Accountancy',
      'Computer Applications',
    ]);

    const p2Public = buildIntelligentPlan({
      grade: '+2',
      stream: 'commerce',
      termScope: 3,
      startDateStr: '2027-01-01',
      deadlineDateStr: '2027-03-30',
      examCycle: 'public',
      useOfficialTimetable: true,
      alignToOfficialExamWindow: true,
      includeExamEveTasks: true,
    });
    const ics = generateIcsCalendar(p2Public.planDays, { stream: 'commerce' });
    expect(ics).toContain('SUMMARY:DHSE Public Exam (+2): Business Studies [FN 9:30 AM]');
    expect(ics).toContain('DTSTART:20270308T093000');
    expect(ics).toContain('SUMMARY:DHSE Public Exam (+2): Accountancy [FN 9:30 AM]');
    expect(ics).toContain('DTSTART:20270324T093000');
  });
});
