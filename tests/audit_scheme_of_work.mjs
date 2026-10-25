import { PLUS_ONE_SYLLABUS } from '../src/data/syllabus-plus-one.js';
import { PLUS_TWO_SYLLABUS } from '../src/data/syllabus-plus-two.js';
import { getStreamSubjects } from '../src/engine/planner.js';

console.log('================================================================');
console.log('   KERALA SCERT 2025–26 SCHEME OF WORK COMPREHENSIVE AUDIT');
console.log('================================================================\n');

function auditSyllabus(syllabus, gradeLabel) {
  console.log(`--- ${gradeLabel} SYLLABUS AUDIT ---`);
  const subjects = {};
  for (const task of syllabus) {
    if (!subjects[task.subject]) {
      subjects[task.subject] = new Map();
    }
    if (!subjects[task.subject].has(task.chapId)) {
      subjects[task.subject].set(task.chapId, {
        name: task.chapterName,
        term: task.term || 1,
        tasksCount: 0
      });
    }
    subjects[task.subject].get(task.chapId).tasksCount++;
  }

  for (const [sub, chapMap] of Object.entries(subjects)) {
    const chapters = Array.from(chapMap.values());
    const t1 = chapters.filter(c => c.term === 1).length;
    const t2 = chapters.filter(c => c.term === 2).length;
    const t3 = chapters.filter(c => c.term === 3).length;
    const totalTasks = chapters.reduce((sum, c) => sum + c.tasksCount, 0);
    console.log(`  ${sub.padEnd(24)}: ${String(chapters.length).padStart(2)} chapters, ${String(totalTasks).padStart(3)} tasks [Term 1: ${t1}, Term 2: ${t2}, Term 3: ${t3}]`);
  }
  console.log(`Total ${gradeLabel} Tasks: ${syllabus.length}\n`);
  return subjects;
}

const p1 = auditSyllabus(PLUS_ONE_SYLLABUS, 'PLUS ONE (+1)');
const p2 = auditSyllabus(PLUS_TWO_SYLLABUS, 'PLUS TWO (+2)');

console.log('--- COMBINATION COVERAGE CHECK (8 PERMUTATIONS) ---');
const streams = ['bio', 'cs', 'commerce', 'humanities'];
const grades = ['+1', '+2'];

for (const grade of grades) {
  for (const stream of streams) {
    const streamSubs = getStreamSubjects(stream);
    const syl = grade === '+1' ? PLUS_ONE_SYLLABUS : PLUS_TWO_SYLLABUS;
    const covered = streamSubs.filter(s => syl.some(t => t.subject === s));
    const isComplete = covered.length === streamSubs.length;
    console.log(`  Grade ${grade} | Stream: ${stream.padEnd(10)} | Required: ${streamSubs.length} | Covered: ${covered.length} ${isComplete ? '✅ OK' : '❌ MISSING'}`);
  }
}
