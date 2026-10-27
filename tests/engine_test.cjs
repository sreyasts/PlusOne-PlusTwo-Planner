const fs = require('fs');
const path = require('path');

const htmlPath = path.join(__dirname, '..', 'index.html');
const html = fs.readFileSync(htmlPath, 'utf8');
const cssPath = path.join(__dirname, '..', 'src', 'style.css');
const css = fs.readFileSync(cssPath, 'utf8');

// Set up virtual DOM/browser environment for script execution
const docClasses = new Set();
const docElement = {
  classList: {
    _classes: docClasses,
    add(c) { docClasses.add(c); },
    remove(c) { docClasses.delete(c); },
    contains(c) { return docClasses.has(c); }
  }
};

const localStorageData = {};
globalThis.localStorage = {
  getItem(k) { return localStorageData[k] || null; },
  setItem(k, v) { localStorageData[k] = String(v); },
  removeItem(k) { delete localStorageData[k]; },
  clear() { for (const k in localStorageData) delete localStorageData[k]; }
};

globalThis.navigator = { onLine: true, serviceWorker: { register: () => Promise.resolve() } };
globalThis.window = {
  addEventListener: () => {},
  removeEventListener: () => {},
  matchMedia: () => ({ matches: false, addEventListener: () => {} }),
  location: { reload: () => {} },
  scrollTo: () => {}
};
globalThis.document = {
  documentElement: docElement,
  addEventListener: () => {},
  removeEventListener: () => {},
  getElementById: () => null,
  querySelector: () => null,
  querySelectorAll: () => []
};

const context = { document: globalThis.document };

(async function runAllChecks() {
  const planner = await import('../src/engine/planner.js');
  const migration = await import('../src/engine/migration.js');
  const syllabusP2 = await import('../src/data/syllabus-plus-two.js');
  const syllabusP1 = await import('../src/data/syllabus-plus-one.js');
  await import('../src/app.js');

  const {
    PLANNER_ENGINE_VERSION,
    buildIntelligentPlan,
    validatePlan,
    getLocalDateStr,
    calculateDaysBetween,
    TODAY_STR,
  } = planner;

  const {
    PLAN_MIGRATION_VERSION,
    migrateLegacyUserPlan,
  } = migration;

  const { PLUS_TWO_SYLLABUS } = syllabusP2;
  const { PLUS_ONE_SYLLABUS } = syllabusP1;

  const {
    getTaskChapterTitle,
    formatTaskTopicTitle,
    renderTaskGradeBadge,
    renderTaskPartBadge,
    getThemePreference,
    isDarkModeActive,
    applyTheme,
    setThemePreference
  } = globalThis.window;

let totalChecks = 0;
let passedChecks = 0;
let failedChecks = 0;

function assert(condition, message) {
  totalChecks++;
  if (condition) {
    passedChecks++;
  } else {
    failedChecks++;
    console.error(`[FAIL] ${message}`);
  }
}

console.log('\n--- 1. CANONICAL SYLLABUS AUDIT (HSSLIVE SCERT SCHEME OF WORK) ---');
assert(PLANNER_ENGINE_VERSION === 6, 'PLANNER_ENGINE_VERSION is 6');

// Chemistry Class 12: 10 chapters (Alcohols & Aldehydes in Term 2, Amines & Biomolecules in Term 3)
const chem12 = PLUS_TWO_SYLLABUS.filter(t => t.subject === 'Chemistry');
const chem12Chapters = [...new Set(chem12.map(t => t.chapterName))];
assert(chem12Chapters.length === 10, `Class 12 Chemistry has 10 chapters (found ${chem12Chapters.length})`);
assert(chem12Chapters.some(c => c.toLowerCase().includes('amines')), 'Class 12 Chemistry includes Amines');
assert(chem12Chapters.some(c => c.toLowerCase().includes('biomolecules')), 'Class 12 Chemistry includes Biomolecules');
const alcTerm = chem12.find(t => t.chapterName.includes('Alcohols'))?.term;
assert(alcTerm === 2, `Class 12 Chemistry Alcohols is Term 2 (found Term ${alcTerm})`);

// Physics Class 12: 14 chapters
const phys12 = PLUS_TWO_SYLLABUS.filter(t => t.subject === 'Physics');
const phys12Chapters = [...new Set(phys12.map(t => t.chapterName))];
assert(phys12Chapters.length === 14, `Class 12 Physics has 14 chapters (found ${phys12Chapters.length})`);

// Maths Class 12: 13 chapters (Vector Algebra & 3D Geometry in Term 2)
const maths12 = PLUS_TWO_SYLLABUS.filter(t => t.subject === 'Mathematics');
const maths12Chapters = [...new Set(maths12.map(t => t.chapterName))];
assert(maths12Chapters.length === 13, `Class 12 Maths has 13 chapters (found ${maths12Chapters.length})`);
const vecTerm = maths12.find(t => t.chapterName.includes('Vector Algebra'))?.term;
assert(vecTerm === 2, `Class 12 Maths Vector Algebra is Term 2 (found Term ${vecTerm})`);

// CS Class 12: 12 chapters (Official HSSLive: includes Advances in Computing & ICT and Society)
const cs12 = PLUS_TWO_SYLLABUS.filter(t => t.subject === 'Computer Science');
const cs12Chapters = [...new Set(cs12.map(t => t.chapterName))];
assert(cs12Chapters.length === 12, `Class 12 CS has 12 chapters (found ${cs12Chapters.length})`);
assert(cs12Chapters.some(c => c.includes('Advances in Computing')), 'Class 12 CS includes Advances in Computing');
assert(cs12Chapters.some(c => c.includes('ICT and Society')), 'Class 12 CS includes ICT and Society');

// Botany Class 12: 5 chapters (Official HSSLive: Ecosystem is Ch 5)
const bot12 = PLUS_TWO_SYLLABUS.filter(t => t.subject === 'Botany');
const bot12Chapters = [...new Set(bot12.map(t => t.chapterName))];
assert(bot12Chapters.length === 5, `Class 12 Botany has 5 chapters (found ${bot12Chapters.length})`);

// Zoology Class 12: 8 chapters (Official HSSLive: includes Biodiversity and Conservation)
const zoo12 = PLUS_TWO_SYLLABUS.filter(t => t.subject === 'Zoology');
const zoo12Chapters = [...new Set(zoo12.map(t => t.chapterName))];
assert(zoo12Chapters.length === 8, `Class 12 Zoology has 8 chapters (found ${zoo12Chapters.length})`);
assert(zoo12Chapters.some(c => c.includes('Biodiversity and Conservation')), 'Class 12 Zoology includes Biodiversity and Conservation');

// Plus One Computer Science: 13 chapters (2026-27 Revised SCERT Curriculum with Python Programming & 72 Theory / 28 Practical)
const cs11 = PLUS_ONE_SYLLABUS.filter(t => t.subject === 'Computer Science');
const cs11Chapters = [...new Set(cs11.map(t => t.chapterName))];
assert(cs11Chapters.length === 13, `Class 11 CS has 13 chapters for 2026-27 Revised Syllabus (found ${cs11Chapters.length})`);
assert(cs11Chapters.some(c => c.includes('Getting Started with Python')), 'Class 11 CS includes Getting Started with Python');
assert(cs11Chapters.some(c => c.includes('Sorting and Searching')), 'Class 11 CS includes Sorting and Searching');
assert(cs11Chapters.some(c => c.includes('Computers and Society')), 'Class 11 CS includes Computers and Society');

// Plus One Physics: 14 chapters
const phys11 = PLUS_ONE_SYLLABUS.filter(t => t.subject === 'Physics');
const phys11Chapters = [...new Set(phys11.map(t => t.chapterName))];
assert(phys11Chapters.length === 14, `Class 11 Physics has 14 chapters (found ${phys11Chapters.length})`);

// Plus One Chemistry: 9 chapters
const chem11 = PLUS_ONE_SYLLABUS.filter(t => t.subject === 'Chemistry');
const chem11Chapters = [...new Set(chem11.map(t => t.chapterName))];
assert(chem11Chapters.length === 9, `Class 11 Chemistry has 9 chapters (found ${chem11Chapters.length})`);

// Plus One Maths: 14 chapters
const maths11 = PLUS_ONE_SYLLABUS.filter(t => t.subject === 'Mathematics');
const maths11Chapters = [...new Set(maths11.map(t => t.chapterName))];
assert(maths11Chapters.length === 14, `Class 11 Maths has 14 chapters (found ${maths11Chapters.length})`);

// Plus One Botany: 9 chapters
const bot11 = PLUS_ONE_SYLLABUS.filter(t => t.subject === 'Botany');
const bot11Chapters = [...new Set(bot11.map(t => t.chapterName))];
assert(bot11Chapters.length === 9, `Class 11 Botany has 9 chapters (found ${bot11Chapters.length})`);

// Plus One Zoology: 10 chapters
const zoo11 = PLUS_ONE_SYLLABUS.filter(t => t.subject === 'Zoology');
const zoo11Chapters = [...new Set(zoo11.map(t => t.chapterName))];
assert(zoo11Chapters.length === 10, `Class 11 Zoology has 10 chapters (found ${zoo11Chapters.length})`);

// Check prerequisites on canonical tasks
PLUS_TWO_SYLLABUS.forEach(task => {
  if (task.part > 1) {
    assert(task.prerequisiteId !== null, `Task ${task.id} has a prerequisite`);
  }
});
PLUS_ONE_SYLLABUS.forEach(task => {
  if (task.part > 1) {
    assert(task.prerequisiteId !== null, `Task ${task.id} has a prerequisite`);
  }
});

console.log('\n--- 2. REGRESSION TEST: BUG REPRODUCTION & FIX ---');
// Tasks for CS stream
const csTasks = PLUS_TWO_SYLLABUS.filter(t => ['Physics', 'Chemistry', 'Mathematics', 'Computer Science'].includes(t.subject));
const testPlanCS = buildIntelligentPlan(
  '2027-03-01',
  csTasks,
  '2026-09-21',
  [],
  'cs'
);

assert(testPlanCS !== null && testPlanCS.planDays && testPlanCS.planDays.length > 0, 'Plan generated successfully');
const validationCS = validatePlan(testPlanCS.planDays, csTasks, { stream: 'cs' });
assert(validationCS.isValid, `Standard plan passes validation (issues: ${validationCS.issues.join('; ')})`);
assert(validationCS.scorecard.orderingViolations === 0, `Zero prerequisite violations in generated plan`);
assert(validationCS.scorecard.duplicateTasks === 0, `Zero duplicate tasks in generated plan`);

// Check chapter continuity
let maxInterleavingGap = 0;
const chapterDayMap = {};
testPlanCS.planDays.forEach(day => {
  day.tasks.forEach(task => {
    if (!task.isRevision) {
      const key = `${task.subject}__${task.chapterName}`;
      if (!chapterDayMap[key]) chapterDayMap[key] = [];
      chapterDayMap[key].push(day.dayNumber);
    }
  });
});
for (const key in chapterDayMap) {
  const days = chapterDayMap[key];
  if (days.length > 1) {
    const span = Math.max(...days) - Math.min(...days);
    if (span > maxInterleavingGap) maxInterleavingGap = span;
  }
}
assert(maxInterleavingGap <= 20, `Chapter parts are scheduled closely (max span was ${maxInterleavingGap} days)`);

console.log('\n--- 3. MATRIX SCENARIOS A through Y ---');
const bioTasks = PLUS_TWO_SYLLABUS.filter(t => ['Physics', 'Chemistry', 'Mathematics', 'Botany', 'Zoology'].includes(t.subject));

const scenarios = [
  { id: 'A', stream: 'cs', tasks: csTasks, imp: [], start: '2026-09-21', end: '2027-03-01' },
  { id: 'B', stream: 'cs', tasks: csTasks, imp: [], start: '2026-09-21', end: '2027-02-15' },
  { id: 'C', stream: 'cs', tasks: csTasks, imp: [], start: '2026-09-21', end: '2026-12-31' },
  { id: 'D', stream: 'bio', tasks: bioTasks, imp: [], start: '2026-09-21', end: '2027-03-01' },
  { id: 'E', stream: 'bio', tasks: bioTasks, imp: [], start: '2026-09-21', end: '2027-01-31' },
  { id: 'F', stream: 'cs', tasks: [...csTasks, ...PLUS_ONE_SYLLABUS.filter(t => t.subject === 'Physics')], imp: [{ subject: 'Physics', examDate: '2026-10-15' }], start: '2026-09-21', end: '2027-03-01' },
  { id: 'G', stream: 'cs', tasks: [...csTasks, ...PLUS_ONE_SYLLABUS.filter(t => ['Physics', 'Chemistry'].includes(t.subject))], imp: [{ subject: 'Physics', examDate: '2026-10-15' }, { subject: 'Chemistry', examDate: '2026-10-18' }], start: '2026-09-21', end: '2027-03-01' },
  { id: 'H', stream: 'cs', tasks: [...csTasks, ...PLUS_ONE_SYLLABUS.filter(t => ['Physics', 'Chemistry', 'Mathematics'].includes(t.subject))], imp: [{ subject: 'Physics', examDate: '2026-10-15' }, { subject: 'Chemistry', examDate: '2026-10-18' }, { subject: 'Mathematics', examDate: '2026-10-22' }], start: '2026-09-21', end: '2027-03-01' },
  { id: 'I', stream: 'bio', tasks: [...bioTasks, ...PLUS_ONE_SYLLABUS.filter(t => ['Botany', 'Zoology'].includes(t.subject))], imp: [{ subject: 'Botany', examDate: '2026-10-14' }, { subject: 'Zoology', examDate: '2026-10-17' }], start: '2026-09-21', end: '2027-03-01' },
  { id: 'J', stream: 'bio', tasks: [...bioTasks, ...PLUS_ONE_SYLLABUS.filter(t => ['Physics', 'Botany'].includes(t.subject))], imp: [{ subject: 'Physics', examDate: '2026-10-15' }, { subject: 'Botany', examDate: '2026-10-20' }], start: '2026-09-21', end: '2027-03-01' },
  { id: 'K', stream: 'cs', tasks: csTasks, imp: [], start: '2026-10-01', end: '2027-01-15' },
  { id: 'L', stream: 'bio', tasks: bioTasks, imp: [], start: '2026-10-01', end: '2027-01-15' },
  { id: 'M', stream: 'cs', tasks: [...csTasks, ...PLUS_ONE_SYLLABUS.filter(t => t.subject === 'Physics')], imp: [{ subject: 'Physics', examDate: '2026-10-25' }], start: '2026-10-01', end: '2026-12-31' },
  { id: 'N', stream: 'bio', tasks: [...bioTasks, ...PLUS_ONE_SYLLABUS.filter(t => t.subject === 'Chemistry')], imp: [{ subject: 'Chemistry', examDate: '2026-10-28' }], start: '2026-09-25', end: '2027-02-28' },
  { id: 'O', stream: 'cs', tasks: [...csTasks, ...PLUS_ONE_SYLLABUS.filter(t => t.subject === 'Computer Science')], imp: [{ subject: 'Computer Science', examDate: '2026-10-30' }], start: '2026-09-21', end: '2027-03-15' },
  { id: 'P', stream: 'bio', tasks: bioTasks, imp: [], start: '2026-11-01', end: '2027-03-01' },
  { id: 'Q', stream: 'cs', tasks: csTasks, imp: [], start: '2026-09-21', end: '2026-11-30' },
  { id: 'R', stream: 'bio', tasks: [...bioTasks, ...PLUS_ONE_SYLLABUS.filter(t => t.subject === 'Physics')], imp: [{ subject: 'Physics', examDate: '2026-10-10' }], start: '2026-09-21', end: '2026-11-30' },
  { id: 'S', stream: 'cs', tasks: csTasks, imp: [], start: '2026-09-21', end: '2027-05-01' },
  { id: 'T', stream: 'bio', tasks: bioTasks, imp: [], start: '2026-09-21', end: '2027-05-01' },
  { id: 'U', stream: 'cs', tasks: [...csTasks, ...PLUS_ONE_SYLLABUS.filter(t => ['Physics', 'Computer Science'].includes(t.subject))], imp: [{ subject: 'Physics', examDate: '2026-11-05' }, { subject: 'Computer Science', examDate: '2026-11-10' }], start: '2026-10-15', end: '2027-03-01' },
  { id: 'V', stream: 'bio', tasks: [...bioTasks, ...PLUS_ONE_SYLLABUS.filter(t => t.subject === 'Botany')], imp: [{ subject: 'Botany', examDate: '2026-11-05' }], start: '2026-10-15', end: '2027-03-01' },
  { id: 'W', stream: 'cs', tasks: [...csTasks, ...PLUS_ONE_SYLLABUS.filter(t => t.subject === 'Mathematics')], imp: [{ subject: 'Mathematics', examDate: '2026-10-25' }], start: '2026-09-21', end: '2027-02-15' },
  { id: 'X', stream: 'bio', tasks: [...bioTasks, ...PLUS_ONE_SYLLABUS.filter(t => ['Mathematics', 'Physics'].includes(t.subject))], imp: [{ subject: 'Mathematics', examDate: '2026-10-25' }, { subject: 'Physics', examDate: '2026-10-28' }], start: '2026-09-21', end: '2027-02-15' },
  { id: 'Y', stream: 'cs', tasks: csTasks, imp: [], start: '2026-12-01', end: '2027-03-01' }
];

scenarios.forEach(sc => {
  const result = buildIntelligentPlan(
    sc.end,
    sc.tasks,
    sc.start,
    sc.imp,
    sc.stream
  );

  assert(result !== null && result.planDays && result.planDays.length > 0, `Scenario ${sc.id} produced plan`);
  const val = validatePlan(result.planDays, sc.tasks, { stream: sc.stream });
  assert(val.isValid, `Scenario ${sc.id} is valid: ${val.issues.join(', ')}`);
  assert(val.scorecard.orderingViolations === 0, `Scenario ${sc.id} 0 ordering violations`);
  assert(val.scorecard.duplicateTasks === 0, `Scenario ${sc.id} 0 duplicate tasks`);

  // Stream check
  const forbiddenSub = sc.stream === 'cs' ? ['Botany', 'Zoology'] : ['Computer Science'];
  let hasForbidden = false;
  result.planDays.forEach(d => {
    d.tasks.forEach(t => {
      if (forbiddenSub.includes(t.subject)) hasForbidden = true;
    });
  });
  assert(!hasForbidden, `Scenario ${sc.id} strict stream isolation`);
});

console.log('\n--- 4. RANDOMIZED FUZZ TESTING (500 ITERATIONS) ---');
const csImpList = [[], ['Physics'], ['Chemistry'], ['Mathematics'], ['Computer Science'], ['Physics', 'Chemistry'], ['Physics', 'Mathematics'], ['Physics', 'Chemistry', 'Mathematics']];
const bioImpList = [[], ['Physics'], ['Chemistry'], ['Mathematics'], ['Botany'], ['Zoology'], ['Botany', 'Zoology'], ['Physics', 'Chemistry', 'Botany', 'Zoology']];

let fuzzSuccesses = 0;
for (let i = 0; i < 500; i++) {
  const stream = (i % 2 === 0) ? 'cs' : 'bio';
  const baseTasks = stream === 'cs' ? csTasks : bioTasks;
  const impPool = stream === 'cs' ? csImpList : bioImpList;
  const chosenImpSubs = impPool[i % impPool.length];

  // Duration between 40 and 200 days
  const duration = 40 + (i % 160);
  const startObj = new Date(2026, 8, 21 + (i % 30));
  const endObj = new Date(startObj.getTime() + duration * 86400000);

  const startStr = getLocalDateStr(startObj);
  const endStr = getLocalDateStr(endObj);

  let extraImpTasks = [];
  let impConfig = [];
  if (chosenImpSubs.length > 0) {
    extraImpTasks = PLUS_ONE_SYLLABUS.filter(t => chosenImpSubs.includes(t.subject));
    const examOffset = Math.min(25, Math.floor(duration / 2));
    const examDate = getLocalDateStr(new Date(startObj.getTime() + examOffset * 86400000));
    impConfig = chosenImpSubs.map(s => ({ subject: s, examDate }));
  }

  const allTasks = [...baseTasks, ...extraImpTasks];

  const fuzzResult = buildIntelligentPlan(
    endStr,
    allTasks,
    startStr,
    impConfig,
    stream
  );

  if (fuzzResult && fuzzResult.planDays) {
    const val = validatePlan(fuzzResult.planDays, allTasks, { stream });
    if (val.isValid && val.scorecard.orderingViolations === 0 && val.scorecard.duplicateTasks === 0) {
      fuzzSuccesses++;
    } else {
      console.error(`Fuzz ${i} failed:`, val.issues);
    }
  } else {
    console.error(`Fuzz ${i} failed to generate plan`);
  }
}
assert(fuzzSuccesses === 500, `500/500 fuzz test iterations passed (success: ${fuzzSuccesses})`);

console.log('\n--- 5. MIGRATION & IDEMPOTENCY ---');
const legacyState = {
  version: 2,
  stream: 'cs',
  startDate: '2026-09-21',
  deadlineDate: '2027-03-01',
  completedChaptersOnInit: [],
  improvementConfig: [],
  plan: [
    {
      dayNumber: 1,
      date: '2026-09-21',
      tasks: [
        { id: '+2_Physics_1_P1', subject: 'Physics', chapterName: 'Electric Charges and Fields', part: 'Part 1', completed: true },
        { id: '+2_Chemistry_4_P2', subject: 'Chemistry', chapterName: 'd- & f-Block Elements', part: 'Part 2', completed: true }
      ]
    },
    {
      dayNumber: 2,
      date: '2026-09-22',
      tasks: [
        { id: '+2_Mathematics_1_P1', subject: 'Mathematics', chapterName: 'Relations and Functions', part: 'Part 1', completed: false }
      ]
    }
  ]
};

const migrated = migrateLegacyUserPlan(legacyState);
assert(migrated.engineVersion === 6, 'Migrated state has engineVersion 6');
assert(migrated.plan.length > 0, 'Migrated state has new generated study plan');
assert(migrated.diagnostics !== null, 'Migrated state has diagnostics');

const valMigrated = validatePlan(migrated.plan, csTasks, { stream: 'cs' });
assert(valMigrated.isValid, `Migrated plan passes validation (${valMigrated.issues.join(', ')})`);

// Check that already completed tasks remain marked completed
let foundCompletedP1 = false;
migrated.plan.forEach(day => {
  day.tasks.forEach(t => {
    if (t.id === '+2_Physics_1_P1' && t.completed) foundCompletedP1 = true;
  });
});
assert(foundCompletedP1, 'Completed tasks from legacy plan preserved after migration');

console.log('\n--- 6. PERSONALIZATION ENGINE AUDIT & INVARIANTS ---');

// Test 6.1: Subject Priority / Weighting
const testSubWeights = {
  'Physics': 1.5,
  'Mathematics': 0.7
};
const pTasks = PLUS_TWO_SYLLABUS.filter(t => t.subject === 'Physics' || t.subject === 'Mathematics');
const weightedPlan = buildIntelligentPlan('2026-11-30', pTasks, '2026-09-21', [], 'cs', {
  personalization: {
    subjectWeights: testSubWeights,
    weeklyRhythm: 'balanced'
  }
});
assert(weightedPlan !== null, 'Weighted plan generated successfully');
assert(weightedPlan.isValid, `Weighted plan is valid: ${weightedPlan.validationIssues.join(', ')}`);

const physicsTasks = [];
weightedPlan.planDays.forEach(d => {
  d.tasks.forEach(t => {
    if (t.subject === 'Physics') physicsTasks.push(t);
  });
});
assert(physicsTasks.filter(t => !t.isRevision).every(t => t.isFocusSubject === true), 'Physics syllabus tasks tagged as isFocusSubject = true');

// In the first 10 days, verify Physics has at least as many or more tasks than Mathematics
const earlyPhysics = weightedPlan.planDays.slice(0, 10).flatMap(d => d.tasks).filter(t => t.subject === 'Physics').length;
const earlyMaths = weightedPlan.planDays.slice(0, 10).flatMap(d => d.tasks).filter(t => t.subject === 'Mathematics').length;
assert(earlyPhysics >= earlyMaths, `Focus subject Physics (${earlyPhysics}) prioritized over Strong subject Maths (${earlyMaths}) in early days`);

// Test 6.2: Designated Sunday Rest Day
const sundayRestPlan = buildIntelligentPlan('2026-11-30', pTasks, '2026-09-21', [], 'cs', {
  personalization: {
    weeklyRhythm: 'rest_day',
    restDayOfWeek: 0 // Sunday
  }
});
assert(sundayRestPlan !== null, 'Sunday rest plan generated successfully');
assert(sundayRestPlan.isValid, `Sunday rest plan passes validation: ${sundayRestPlan.validationIssues.join(', ')}`);

let sundayWorkTasks = 0;
let sundayCount = 0;
sundayRestPlan.planDays.slice(0, sundayRestPlan.syllabusDaysCount).forEach(day => {
  if (day.dayOfWeek === 0) {
    sundayCount++;
    assert(day.isRestDay === true, `Day ${day.dayNumber} (${day.date}) marked as isRestDay`);
    if (day.tasks.length > 0) sundayWorkTasks += day.tasks.length;
  }
});
assert(sundayCount > 0, `Found ${sundayCount} Sundays in syllabus study period`);
assert(sundayWorkTasks === 0, `Sunday has 0 scheduled regular tasks (found ${sundayWorkTasks})`);
assert(sundayRestPlan.scorecard.coverageRate === 100, 'Coverage rate remains 100% even with Sunday rest day');

// Test 6.3: Designated Friday Rest Day
const fridayRestPlan = buildIntelligentPlan('2026-11-30', pTasks, '2026-09-21', [], 'cs', {
  personalization: {
    weeklyRhythm: 'rest_day',
    restDayOfWeek: 5 // Friday
  }
});
assert(fridayRestPlan !== null, 'Friday rest plan generated successfully');
assert(fridayRestPlan.isValid, `Friday rest plan passes validation: ${fridayRestPlan.validationIssues.join(', ')}`);
let fridayWorkTasks = 0;
fridayRestPlan.planDays.slice(0, fridayRestPlan.syllabusDaysCount).forEach(day => {
  if (day.dayOfWeek === 5) {
    assert(day.isRestDay === true, `Day ${day.dayNumber} (${day.date}) marked as isRestDay`);
    if (day.tasks.length > 0) fridayWorkTasks += day.tasks.length;
  }
});
assert(fridayWorkTasks === 0, `Friday has 0 scheduled regular tasks (found ${fridayWorkTasks})`);

// Test 6.4: Weekend Booster Rhythm
const weekendBoosterPlan = buildIntelligentPlan('2026-11-30', pTasks, '2026-09-21', [], 'cs', {
  personalization: {
    weeklyRhythm: 'weekend_booster'
  }
});
assert(weekendBoosterPlan !== null, 'Weekend booster plan generated successfully');
assert(weekendBoosterPlan.isValid, `Weekend booster plan passes validation: ${weekendBoosterPlan.validationIssues.join(', ')}`);

let totalWeekendTasks = 0;
let totalWeekendDays = 0;
let totalWeekdayTasks = 0;
let totalWeekdayDays = 0;

weekendBoosterPlan.planDays.slice(0, weekendBoosterPlan.syllabusDaysCount).forEach(day => {
  const isWeekend = (day.dayOfWeek === 0 || day.dayOfWeek === 6);
  if (isWeekend) {
    totalWeekendDays++;
    totalWeekendTasks += day.tasks.length;
  } else {
    totalWeekdayDays++;
    totalWeekdayTasks += day.tasks.length;
  }
});
const avgWeekend = totalWeekendTasks / (totalWeekendDays || 1);
const avgWeekday = totalWeekdayTasks / (totalWeekdayDays || 1);
assert(avgWeekend > avgWeekday, `Weekend average tasks (${avgWeekend.toFixed(2)}) > Weekday average (${avgWeekday.toFixed(2)}) in Weekend Booster mode`);

// Test 6.5: Full Personalization Fuzzing Matrix (50 iterations)
const rhythms = ['balanced', 'weekend_booster', 'rest_day'];
for (let f = 0; f < 50; f++) {
  const fStream = f % 2 === 0 ? 'bio' : 'cs';
  const fSubs = fStream === 'bio' ? ['Physics', 'Chemistry', 'Mathematics', 'Botany', 'Zoology'] : ['Physics', 'Chemistry', 'Mathematics', 'Computer Science'];
  const fWeights = {};
  fSubs.forEach(s => {
    const r = Math.random();
    fWeights[s] = r < 0.33 ? 1.5 : (r < 0.66 ? 0.7 : 1.0);
  });
  const fRhythm = rhythms[f % rhythms.length];
  const fRestDay = (fRhythm === 'rest_day') ? (f % 2 === 0 ? 0 : 5) : null;
  const fTerm = (f % 3) + 1;
  const fTasks = PLUS_TWO_SYLLABUS.filter(t => fSubs.includes(t.subject) && t.term <= fTerm);
  const fDays = 20 + (f * 2);
  let fEnd = new Date('2026-09-21');
  fEnd.setDate(fEnd.getDate() + fDays);
  const fEndStr = fEnd.toISOString().split('T')[0];

  const fPlan = buildIntelligentPlan(fEndStr, fTasks, '2026-09-21', [], fStream, {
    personalization: {
      subjectWeights: fWeights,
      weeklyRhythm: fRhythm,
      restDayOfWeek: fRestDay,
      dailyHours: 3.5
    }
  });

  assert(fPlan !== null && fPlan.isValid, `Fuzz #${f + 1} (${fStream}, Term ${fTerm}, ${fRhythm}) valid with 100% coverage`);
}

console.log('\n--- 7. LABELING, BADGING & CHAPTER NUMBERING INVARIANTS ---');

// Test 7.1: Chapter Numbering
const p2TaskSample = PLUS_TWO_SYLLABUS.find(t => t.chapNumber === 1 && t.subject === 'Physics');
assert(
  getTaskChapterTitle(p2TaskSample) === 'Chapter 1: Electric Charges and Fields',
  'Test 7.1: Plus Two Chapter 1 formatted as "Chapter 1: Electric Charges and Fields"'
);

const p1TaskSample = PLUS_ONE_SYLLABUS.find(t => t.chapNumber === 3 && t.subject === 'Physics');
assert(
  getTaskChapterTitle(p1TaskSample) === 'Chapter 3: Motion in a Plane',
  'Test 7.1: Plus One Chapter 3 formatted as "Chapter 3: Motion in a Plane"'
);

// Test 7.2: Part X/Y and Full Chapter Formatting
const part1Task = { part: 1, totalParts: 2, topicTitle: 'Part 1/2: Core Concepts & Theory' };
assert(
  formatTaskTopicTitle(part1Task) === 'Part 1/2: Core Concepts & Theory',
  'Test 7.2: Part 1/2 topic title format'
);

const part2Task = { part: 2, totalParts: 2, topicTitle: 'Part 2/2 (Full Chapter): Exercise Problems & PYQs' };
assert(
  formatTaskTopicTitle(part2Task) === 'Part 2/2 (Full Chapter): Exercise Problems & PYQs',
  'Test 7.2: Part 2/2 (Full Chapter) topic title format'
);

// Backward-compatibility: legacy strings with "of"
const legacyPart1 = { part: 1, totalParts: 3, topicTitle: 'Part 1 of 3: Core Concepts & Theory' };
assert(
  formatTaskTopicTitle(legacyPart1) === 'Part 1/3: Core Concepts & Theory',
  'Test 7.2: Legacy "Part 1 of 3" migrated to "Part 1/3"'
);

const legacyPart3 = { part: 3, totalParts: 3, topicTitle: 'Part 3 of 3: Exercise Problems & PYQs' };
assert(
  formatTaskTopicTitle(legacyPart3) === 'Part 3/3 (Full Chapter): Exercise Problems & PYQs',
  'Test 7.2: Legacy "Part 3 of 3" migrated to "Part 3/3 (Full Chapter)"'
);

// Single part chapter
const singlePartTask = { part: 1, totalParts: 1, topicTitle: 'Full Chapter Concepts & Key Problems' };
assert(
  formatTaskTopicTitle(singlePartTask).includes('Full Chapter'),
  'Test 7.2: Single-part chapter includes "Full Chapter"'
);

// Test 7.3: Grade Badging (+2 Blue vs +1 Amber)
const p2Badge = renderTaskGradeBadge({ grade: '+2', term: 1 });
assert(p2Badge.includes('+2') && p2Badge.includes('bg-blue-100'), 'Test 7.3: +2 task has +2 label and blue badge');

const p1Badge = renderTaskGradeBadge({ grade: '+1' });
assert(p1Badge.includes('+1 Imp') && p1Badge.includes('bg-amber-100'), 'Test 7.3: +1 improvement task has +1 Imp label and amber badge');

// Test 7.4: Part Badge (X/Y and Full Chapter)
const nonFinalPartBadge = renderTaskPartBadge({ part: 1, totalParts: 2 });
assert(nonFinalPartBadge.includes('Part 1/2'), 'Test 7.4: Non-final part has "Part 1/2" badge');

const finalPartBadge = renderTaskPartBadge({ part: 2, totalParts: 2 });
assert(finalPartBadge.includes('Full Chapter (2/2)') && finalPartBadge.includes('bg-emerald-100'), 'Test 7.4: Final part has "Full Chapter (2/2)" badge with emerald styling');

// Test 7.4b: Same-Day Full Chapter Badge (Tight Timetable)
const fullDayPartBadge = renderTaskPartBadge({ part: 1, totalParts: 2, isFullOnDay: true });
assert(fullDayPartBadge.includes('Full') && !fullDayPartBadge.includes('Part 1/2'), 'Test 7.4b: isFullOnDay renders "Full" badge instead of "Part 1/2"');

// Test 7.4c: Same-Day Full Topic Title (Tight Timetable)
const fullDayTopic = formatTaskTopicTitle({ part: 1, totalParts: 2, isFullOnDay: true, topicTitle: 'Core Concepts & Theory' });
assert(fullDayTopic === 'Full: Core Concepts & Theory', 'Test 7.4c: isFullOnDay formats topic title with "Full:" prefix');

// --- 8. THEME ENGINE & CONTRAST INVARIANTS ---
console.log('\n--- 8. THEME ENGINE & CONTRAST INVARIANTS ---');

// Test 8.1: Dark Mode Activation
setThemePreference('dark');
assert(getThemePreference() === 'dark', 'Test 8.1: Theme preference stored as dark');
assert(isDarkModeActive() === true, 'Test 8.1: isDarkModeActive returns true for dark mode');
assert(context.document.documentElement.classList.contains('dark'), 'Test 8.1: documentElement has "dark" class');

// Test 8.2: Light Mode Activation (Full theme switch)
setThemePreference('light');
assert(getThemePreference() === 'light', 'Test 8.2: Theme preference stored as light');
assert(isDarkModeActive() === false, 'Test 8.2: isDarkModeActive returns false for light mode');
assert(!context.document.documentElement.classList.contains('dark'), 'Test 8.2: documentElement removes "dark" class in light mode');

// Test 8.3: System Mode
setThemePreference('system');
assert(getThemePreference() === 'system', 'Test 8.3: Theme preference stored as system');

// Test 8.4: Static Inspection of index.html CSS & Tailwind Configuration
assert(
  html.includes('/src/style.css'),
  'Test 8.4: Compiled Tailwind CSS stylesheet linked in index.html'
);

assert(
  css.includes('html:not(.dark)'),
  'Test 8.4: html:not(.dark) high-contrast light mode CSS rules exist'
);

assert(
  css.includes('html:not(.dark) .today-task-card') && css.includes('html.dark .today-task-card'),
  'Test 8.4: Both light and dark mode have explicit card styling'
);

assert(
  css.includes('html:not(.dark) .task-text-content') && css.includes('html.dark .task-text-content'),
  'Test 8.4: Both light and dark mode have explicit task text styling'
);

assert(
  css.includes('html:not(.dark) .text-slate-800') && css.includes('html.dark .text-slate-800'),
  'Test 8.4: text-slate-800 has explicit contrast overrides for both themes'
);
console.log(`TOTAL CHECKS: ${totalChecks}`);
console.log(`PASSED: ${passedChecks}`);
console.log(`FAILED: ${failedChecks}`);
console.log('======================================');

if (failedChecks > 0) {
  process.exit(1);
} else {
  console.log('ALL ENGINE TESTS PASSED WITH ZERO ERRORS!');
  process.exit(0);
}
})().catch(err => {
  console.error('Fatal engine test error:', err);
  process.exit(1);
});
