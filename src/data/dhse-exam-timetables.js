/**
 * Official Kerala DHSE Higher Secondary Examination Timetables & Academic Calendar (2026–2027)
 * Covers Plus One (+1) and Plus Two (+2) across Science (CS & Bio), Commerce, and Humanities:
 * 1. Second Terminal (Christmas) Examinations: December 8 – December 17, 2026
 * 2. Practical Examinations: January 25, 2027 onwards
 * 3. Model Examinations: February 11 – February 24, 2027
 * 4. Public (Board) Examinations: March 2 – March 30, 2027
 */

export const DHSE_EXAM_CYCLES = {
  christmas: {
    id: 'christmas',
    name: 'Christmas Exam (Term 2)',
    shortName: 'Christmas Exam',
    mlName: 'ക്രിസ്മസ് പരീക്ഷ (രണ്ടാം ടേം)',
    startDate: '2026-12-08',
    endDate: '2026-12-17',
    defaultTerm: 2,
    vacationStart: '2026-12-19',
    vacationEnd: '2026-12-27',
    reopenDate: '2026-12-28',
    isTentativeSubjectOrder: false,
    note: 'Official DHSE Second Terminal (Christmas) Exam timetable: Dec 8 – Dec 17, 2026 (+2 Forenoon 9:30 AM, +1 Afternoon 1:30 PM / Fri 2:00 PM).',
  },
  model: {
    id: 'model',
    name: 'Model Examinations 2027',
    shortName: 'Model Exam',
    mlName: 'മോഡൽ പരീക്ഷ 2027',
    startDate: '2027-02-11',
    endDate: '2027-02-24',
    defaultTerm: 3,
    practicalsStartDate: '2027-01-25',
    isTentativeSubjectOrder: true,
    note: 'Official DHSE Model Exam window: Feb 11 – Feb 24, 2027 (Full Syllabus). Subject order follows DHSE subject-group sequencing; check school notice board for local adjustments.',
  },
  public: {
    id: 'public',
    name: 'Public / Board Exam 2027',
    shortName: 'Public Exam',
    mlName: 'പബ്ലിക് / ബോർഡ് പരീക്ഷ 2027',
    startDate: '2027-03-02',
    endDate: '2027-03-30',
    defaultTerm: 3,
    practicalsStartDate: '2027-01-25',
    expectedResultDate: '2027-05-15',
    isTentativeSubjectOrder: false,
    note: 'Official DHSE Kerala Public Examination timetable: March 2 – March 30, 2027 (FN 9:30 AM / AN 2:00 PM).',
  },
};

export const DHSE_ACADEMIC_MILESTONES = {
  christmasVacationStart: '2026-12-19',
  christmasVacationEnd: '2026-12-27',
  schoolReopenDate: '2026-12-28',
  practicalsStartDate: '2027-01-25',
  expectedResultDate: '2027-05-15',
};

const STREAM_CORE_SUBJECTS = {
  cs: ['Physics', 'Chemistry', 'Mathematics', 'Computer Science'],
  bio: ['Physics', 'Chemistry', 'Mathematics', 'Botany', 'Zoology'],
  commerce: ['Accountancy', 'Business Studies', 'Economics', 'Computer Applications'],
  humanities: ['History', 'Political Science', 'Sociology', 'Economics'],
};

/**
 * Raw official timetable entries per cycle and grade (+2 / +1).
 * `subjects` maps to canonical syllabus subject names (empty array for language papers).
 * `paperTitle` is the human-readable official exam paper name.
 */
export const DHSE_OFFICIAL_TIMETABLES = {
  christmas: {
    '+2': [
      { date: '2026-12-08', session: 'FN', time: '9:30 AM', subjects: ['Economics'], paperTitle: 'Economics / Electronic Systems' },
      { date: '2026-12-09', session: 'FN', time: '9:30 AM', subjects: ['Physics', 'Sociology'], paperTitle: 'Physics / Sociology / Anthropology' },
      { date: '2026-12-10', session: 'FN', time: '9:30 AM', subjects: [], isLanguagePaper: true, paperTitle: 'Part II Languages (Malayalam / Hindi / Arabic / Sanskrit / CS & IT)' },
      { date: '2026-12-11', session: 'FN', time: '9:30 AM', subjects: ['Mathematics'], paperTitle: 'Mathematics / Part III Languages / Psychology' },
      { date: '2026-12-14', session: 'FN', time: '9:30 AM', subjects: ['Chemistry', 'History', 'Business Studies'], paperTitle: 'Chemistry / History / Business Studies' },
      { date: '2026-12-15', session: 'FN', time: '9:30 AM', subjects: ['Botany', 'Zoology', 'Political Science', 'Computer Applications'], paperTitle: 'Biology / Political Science / Computer Applications' },
      { date: '2026-12-16', session: 'FN', time: '9:30 AM', subjects: ['Computer Science'], paperTitle: 'Computer Science / Statistics / Home Science' },
      { date: '2026-12-16', session: 'AN', time: '1:30 PM', subjects: ['Accountancy'], paperTitle: 'Accountancy / Geography / Geology' },
      { date: '2026-12-17', session: 'FN', time: '9:30 AM', subjects: [], isLanguagePaper: true, paperTitle: 'Part I English' },
    ],
    '+1': [
      { date: '2026-12-08', session: 'AN', time: '1:30 PM', subjects: ['Economics'], paperTitle: 'Economics / Electronic Systems' },
      { date: '2026-12-09', session: 'AN', time: '1:30 PM', subjects: [], isLanguagePaper: true, paperTitle: 'Part I English' },
      { date: '2026-12-10', session: 'AN', time: '1:30 PM', subjects: ['Physics', 'Sociology'], paperTitle: 'Physics / Sociology / Anthropology' },
      { date: '2026-12-11', session: 'AN', time: '2:00 PM', subjects: ['Computer Science'], paperTitle: 'Computer Science / Statistics / Home Science' },
      { date: '2026-12-14', session: 'FN', time: '9:30 AM', subjects: ['Mathematics'], paperTitle: 'Mathematics / Part III Languages / Psychology' },
      { date: '2026-12-14', session: 'AN', time: '1:30 PM', subjects: ['Accountancy'], paperTitle: 'Accountancy / Geography / Geology' },
      { date: '2026-12-15', session: 'AN', time: '1:30 PM', subjects: ['Chemistry', 'History', 'Business Studies'], paperTitle: 'Chemistry / History / Business Studies' },
      { date: '2026-12-16', session: 'AN', time: '1:30 PM', subjects: ['Botany', 'Zoology', 'Political Science', 'Computer Applications'], paperTitle: 'Biology / Political Science / Computer Applications' },
      { date: '2026-12-17', session: 'AN', time: '1:30 PM', subjects: [], isLanguagePaper: true, paperTitle: 'Part II Languages (Malayalam / Hindi / Arabic / Sanskrit / CS & IT)' },
    ],
  },
  model: {
    '+2': [
      { date: '2027-02-11', session: 'FN', time: '9:30 AM', subjects: [], isLanguagePaper: true, isTentativeSubjectOrder: true, paperTitle: 'Part I English' },
      { date: '2027-02-12', session: 'FN', time: '9:30 AM', subjects: [], isLanguagePaper: true, isTentativeSubjectOrder: true, paperTitle: 'Part II Languages' },
      { date: '2027-02-15', session: 'FN', time: '9:30 AM', subjects: ['Chemistry', 'History', 'Business Studies'], isTentativeSubjectOrder: true, paperTitle: 'Chemistry / History / Business Studies' },
      { date: '2027-02-16', session: 'FN', time: '9:30 AM', subjects: ['Physics', 'Sociology'], isTentativeSubjectOrder: true, paperTitle: 'Physics / Sociology' },
      { date: '2027-02-17', session: 'FN', time: '9:30 AM', subjects: ['Economics'], isTentativeSubjectOrder: true, paperTitle: 'Economics' },
      { date: '2027-02-18', session: 'FN', time: '9:30 AM', subjects: ['Mathematics'], isTentativeSubjectOrder: true, paperTitle: 'Mathematics' },
      { date: '2027-02-19', session: 'FN', time: '9:30 AM', subjects: ['Accountancy'], isTentativeSubjectOrder: true, paperTitle: 'Accountancy' },
      { date: '2027-02-22', session: 'FN', time: '9:30 AM', subjects: ['Botany', 'Zoology', 'Political Science', 'Computer Applications'], isTentativeSubjectOrder: true, paperTitle: 'Biology / Political Science / Computer Applications' },
      { date: '2027-02-23', session: 'FN', time: '9:30 AM', subjects: ['Computer Science'], isTentativeSubjectOrder: true, paperTitle: 'Computer Science / Statistics' },
    ],
    '+1': [
      { date: '2027-02-11', session: 'AN', time: '1:30 PM', subjects: ['Accountancy'], isTentativeSubjectOrder: true, paperTitle: 'Accountancy' },
      { date: '2027-02-12', session: 'AN', time: '2:00 PM', subjects: ['Physics', 'Sociology'], isTentativeSubjectOrder: true, paperTitle: 'Physics / Sociology' },
      { date: '2027-02-15', session: 'AN', time: '1:30 PM', subjects: ['Chemistry', 'History', 'Business Studies'], isTentativeSubjectOrder: true, paperTitle: 'Chemistry / History / Business Studies' },
      { date: '2027-02-16', session: 'AN', time: '1:30 PM', subjects: [], isLanguagePaper: true, isTentativeSubjectOrder: true, paperTitle: 'Part I English' },
      { date: '2027-02-17', session: 'AN', time: '1:30 PM', subjects: ['Mathematics'], isTentativeSubjectOrder: true, paperTitle: 'Mathematics' },
      { date: '2027-02-18', session: 'AN', time: '1:30 PM', subjects: ['Economics'], isTentativeSubjectOrder: true, paperTitle: 'Economics' },
      { date: '2027-02-19', session: 'AN', time: '2:00 PM', subjects: [], isLanguagePaper: true, isTentativeSubjectOrder: true, paperTitle: 'Part II Languages' },
      { date: '2027-02-22', session: 'AN', time: '1:30 PM', subjects: ['Computer Science'], isTentativeSubjectOrder: true, paperTitle: 'Computer Science / Statistics' },
      { date: '2027-02-23', session: 'AN', time: '1:30 PM', subjects: ['Botany', 'Zoology', 'Political Science', 'Computer Applications'], isTentativeSubjectOrder: true, paperTitle: 'Biology / Political Science / Computer Applications' },
    ],
  },
  public: {
    '+2': [
      { date: '2027-03-02', session: 'FN', time: '9:30 AM', subjects: [], isLanguagePaper: true, paperTitle: 'Part II Languages (Malayalam / Hindi / Arabic / Sanskrit / CS & IT)' },
      { date: '2027-03-08', session: 'FN', time: '9:30 AM', subjects: ['Chemistry', 'History', 'Business Studies'], paperTitle: 'Chemistry / History / Business Studies' },
      { date: '2027-03-12', session: 'AN', time: '2:00 PM', subjects: ['Physics', 'Sociology'], paperTitle: 'Physics / Sociology / Anthropology' },
      { date: '2027-03-15', session: 'FN', time: '9:30 AM', subjects: ['Economics'], paperTitle: 'Economics / Electronic Systems' },
      { date: '2027-03-17', session: 'FN', time: '9:30 AM', subjects: ['Mathematics'], paperTitle: 'Mathematics' },
      { date: '2027-03-22', session: 'FN', time: '9:30 AM', subjects: [], isLanguagePaper: true, paperTitle: 'Part I English' },
      { date: '2027-03-24', session: 'FN', time: '9:30 AM', subjects: ['Accountancy'], paperTitle: 'Accountancy / Geography / Geology' },
      { date: '2027-03-29', session: 'FN', time: '9:30 AM', subjects: ['Botany', 'Zoology', 'Political Science', 'Computer Applications'], paperTitle: 'Biology / Political Science / Computer Applications' },
      { date: '2027-03-30', session: 'AN', time: '2:00 PM', subjects: ['Computer Science'], paperTitle: 'Computer Science / Statistics / Home Science' },
    ],
    '+1': [
      { date: '2027-03-02', session: 'FN', time: '9:30 AM', subjects: ['Accountancy'], paperTitle: 'Accountancy / Geography / Geology' },
      { date: '2027-03-08', session: 'FN', time: '9:30 AM', subjects: ['Physics', 'Sociology'], paperTitle: 'Physics / Sociology / Anthropology' },
      { date: '2027-03-12', session: 'AN', time: '2:00 PM', subjects: ['Chemistry', 'History', 'Business Studies'], paperTitle: 'Chemistry / History / Business Studies' },
      { date: '2027-03-15', session: 'FN', time: '9:30 AM', subjects: [], isLanguagePaper: true, paperTitle: 'Part I English' },
      { date: '2027-03-19', session: 'FN', time: '9:30 AM', subjects: ['Mathematics'], paperTitle: 'Mathematics' },
      { date: '2027-03-22', session: 'FN', time: '9:30 AM', subjects: ['Economics'], paperTitle: 'Economics / Electronic Systems' },
      { date: '2027-03-24', session: 'FN', time: '9:30 AM', subjects: [], isLanguagePaper: true, paperTitle: 'Part II Languages (Malayalam / Hindi / Arabic / Sanskrit / CS & IT)' },
      { date: '2027-03-29', session: 'FN', time: '9:30 AM', subjects: ['Computer Science'], paperTitle: 'Computer Science / Statistics / Home Science' },
      { date: '2027-03-30', session: 'AN', time: '2:00 PM', subjects: ['Botany', 'Zoology', 'Political Science', 'Computer Applications'], paperTitle: 'Biology / Political Science / Computer Applications' },
    ],
  },
};

function normalizeGradeKey(grade) {
  return (grade === '+1' || grade === 11 || grade === 'plus_one') ? '+1' : '+2';
}

function getDayName(dateStr) {
  const d = new Date(`${dateStr}T12:00:00`);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-US', { weekday: 'short' });
}

function formatStreamPaperLabel(matchedSubjects, rawEntry) {
  if (rawEntry.isLanguagePaper) return rawEntry.paperTitle;
  const hasBot = matchedSubjects.includes('Botany');
  const hasZoo = matchedSubjects.includes('Zoology');
  if (hasBot || hasZoo) {
    const others = matchedSubjects.filter((s) => s !== 'Botany' && s !== 'Zoology');
    return ['Biology (Botany & Zoology)', ...others].join(' & ');
  }
  return matchedSubjects.join(' & ');
}

/**
 * Infer the target exam cycle from a deadline date (unless explicitly given).
 * @param {string} deadlineDate
 * @param {string} [explicitCycle]
 * @returns {'christmas' | 'model' | 'public' | 'custom'}
 */
export function detectExamCycleForDeadline(deadlineDate, explicitCycle = null) {
  if (explicitCycle && DHSE_EXAM_CYCLES[explicitCycle]) {
    return explicitCycle;
  }
  if (explicitCycle === 'custom') return 'custom';
  if (!deadlineDate || typeof deadlineDate !== 'string') return 'custom';

  if (deadlineDate >= '2026-12-01' && deadlineDate <= '2026-12-27') return 'christmas';
  if (deadlineDate >= '2027-02-01' && deadlineDate <= '2027-02-26') return 'model';
  if (deadlineDate >= '2027-02-27' && deadlineDate <= '2027-04-05') return 'public';
  return 'custom';
}

/**
 * Get the official exam timetable rows for a specific grade, stream, and exam cycle.
 * Combines core stream subjects (filtering out unrelated streams) + common Part I/II Languages.
 */
export function getOfficialExamSchedule({
  grade = '+2',
  stream = 'cs',
  examCycle = 'public',
  includeLanguages = true,
} = {}) {
  const gradeKey = normalizeGradeKey(grade);
  const cycleMeta = DHSE_EXAM_CYCLES[examCycle];
  const rawEntries = DHSE_OFFICIAL_TIMETABLES[examCycle]?.[gradeKey] || [];
  const streamSubs = STREAM_CORE_SUBJECTS[stream] || STREAM_CORE_SUBJECTS.cs;

  const events = [];
  rawEntries.forEach((entry) => {
    const matchedSubjects = (entry.subjects || []).filter((s) => streamSubs.includes(s));
    if (matchedSubjects.length === 0 && !(includeLanguages && entry.isLanguagePaper)) {
      return;
    }
    events.push({
      date: entry.date,
      dayName: getDayName(entry.date),
      session: entry.session,
      time: entry.time,
      grade: gradeKey,
      stream,
      examCycle,
      examCycleName: cycleMeta?.name || examCycle,
      examCycleShortName: cycleMeta?.shortName || examCycle,
      subjects: matchedSubjects,
      isLanguagePaper: Boolean(entry.isLanguagePaper),
      isTentativeSubjectOrder: Boolean(entry.isTentativeSubjectOrder),
      paperTitle: formatStreamPaperLabel(matchedSubjects, entry),
    });
  });

  return events.sort((a, b) => {
    if (a.date !== b.date) return a.date.localeCompare(b.date);
    if (a.session === b.session) return 0;
    return a.session === 'FN' ? -1 : 1;
  });
}

/**
 * Return all official exam events (Christmas, Model, Public) falling inside [startDate, deadlineDate].
 */
export function getOfficialExamEventsForPlan({
  grade = '+2',
  stream = 'cs',
  startDate,
  deadlineDate,
  examCycle = null,
  includeLanguages = true,
} = {}) {
  const cyclesToInclude = examCycle && DHSE_EXAM_CYCLES[examCycle]
    ? [examCycle]
    : ['christmas', 'model', 'public'];

  const all = [];
  cyclesToInclude.forEach((cId) => {
    const list = getOfficialExamSchedule({ grade, stream, examCycle: cId, includeLanguages });
    list.forEach((ev) => {
      if (startDate && ev.date < startDate) return;
      if (deadlineDate && ev.date > deadlineDate) return;
      all.push(ev);
    });
  });

  return all.sort((a, b) => {
    if (a.date !== b.date) return a.date.localeCompare(b.date);
    if (a.session === b.session) return 0;
    return a.session === 'FN' ? -1 : 1;
  });
}

/**
 * Compute per-subject exam dates for the target (or nearest active) exam cycle in [startDate, deadlineDate].
 * Returns { targetCycle, subjectDates: { [subject]: 'YYYY-MM-DD' }, orderedSubjects: string[] }.
 */
export function getSubjectExamDeadlines({
  grade = '+2',
  stream = 'cs',
  startDate,
  deadlineDate,
  examCycle = null,
} = {}) {
  const resolvedCycle = detectExamCycleForDeadline(deadlineDate, examCycle);
  const cyclesOrder = resolvedCycle !== 'custom'
    ? [resolvedCycle]
    : ['christmas', 'model', 'public'];

  let activeEvents = [];
  let activeCycle = resolvedCycle;

  for (const cId of cyclesOrder) {
    const evs = getOfficialExamSchedule({
      grade,
      stream,
      examCycle: cId,
      includeLanguages: false,
    }).filter((ev) => (!startDate || ev.date >= startDate) && (!deadlineDate || ev.date <= deadlineDate));

    if (evs.length > 0) {
      activeEvents = evs;
      activeCycle = cId;
      break;
    }
  }

  // Fallback: if deadline sits right before the exam window (e.g. Feb 28 before Mar 2 Public Exam),
  // still use the upcoming cycle's relative subject exam order for intelligent prioritization!
  if (activeEvents.length === 0 && deadlineDate) {
    const upcomingCycle =
      deadlineDate <= '2026-12-20' ? 'christmas' :
      deadlineDate <= '2027-02-26' ? 'model' : 'public';
    activeEvents = getOfficialExamSchedule({
      grade,
      stream,
      examCycle: upcomingCycle,
      includeLanguages: false,
    });
    if (activeCycle === 'custom') activeCycle = upcomingCycle;
  }

  const subjectDates = {};
  const orderedSubjects = [];
  activeEvents.forEach((ev) => {
    ev.subjects.forEach((sub) => {
      if (!subjectDates[sub]) {
        subjectDates[sub] = ev.date;
        orderedSubjects.push(sub);
      }
    });
  });

  return {
    targetCycle: activeCycle,
    subjectDates,
    orderedSubjects,
    events: activeEvents,
  };
}

/**
 * Compute official exam quick presets for Setup Wizard and Adjust Plan modal.
 */
export function getOfficialExamPresets(referenceDate = new Date()) {
  const d = referenceDate instanceof Date ? referenceDate : new Date(referenceDate);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const todayStr = `${y}-${m}-${day}`;

  const sprintDate = new Date(d);
  sprintDate.setDate(sprintDate.getDate() + 30);
  const sprintStr = `${sprintDate.getFullYear()}-${String(sprintDate.getMonth() + 1).padStart(2, '0')}-${String(sprintDate.getDate()).padStart(2, '0')}`;

  return {
    todayStr,
    sprint: {
      id: 'sprint',
      date: sprintStr,
      termScope: 2,
      cycle: 'custom',
    },
    christmas: {
      id: 'christmas',
      date: DHSE_EXAM_CYCLES.christmas.endDate,
      startDate: DHSE_EXAM_CYCLES.christmas.startDate,
      termScope: 2,
      cycle: 'christmas',
      isUpcoming: todayStr <= DHSE_EXAM_CYCLES.christmas.endDate,
    },
    model: {
      id: 'model',
      date: DHSE_EXAM_CYCLES.model.endDate,
      startDate: DHSE_EXAM_CYCLES.model.startDate,
      termScope: 3,
      cycle: 'model',
      isUpcoming: todayStr <= DHSE_EXAM_CYCLES.model.endDate,
    },
    public: {
      id: 'public',
      date: DHSE_EXAM_CYCLES.public.endDate,
      startDate: DHSE_EXAM_CYCLES.public.startDate,
      termScope: 3,
      cycle: 'public',
      isUpcoming: todayStr <= DHSE_EXAM_CYCLES.public.endDate,
    },
  };
}
