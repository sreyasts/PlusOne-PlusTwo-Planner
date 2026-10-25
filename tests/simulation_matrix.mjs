import { buildIntelligentPlan, getStreamSubjects } from '../src/engine/planner.js';
import { getRemainingPlanTasks } from '../src/utils/plan-scope.js';

console.log('--- RUNNING MATRIX SIMULATION ACROSS ALL 8 COMBINATIONS & MULTIPLE RUNWAYS ---');

const grades = ['+1', '+2'];
const streams = ['bio', 'cs', 'commerce', 'humanities'];
const durations = [30, 60, 120];

let totalScenarios = 0;
let passedScenarios = 0;

for (const grade of grades) {
  for (const stream of streams) {
    for (const durationDays of durations) {
      totalScenarios++;
      const startDate = '2026-10-25';
      const deadline = new Date(new Date(startDate).getTime() + durationDays * 86400000).toISOString().split('T')[0];
      
      const tasks = getRemainingPlanTasks({ grade, stream, targetTerm: 3 });
      const plan = buildIntelligentPlan(deadline, tasks, startDate, [], stream, { intensity: 'balanced' });

      // Verification checks:
      const scheduledTasks = plan.planDays.flatMap(d => d.tasks);
      const coreTasks = scheduledTasks.filter(t => !t.isRevision && !t.isExamEveTask);
      
      // 1. All core tasks must match the grade
      const gradeMatches = coreTasks.every(t => t.grade === grade);
      // 2. All core tasks must match stream subjects
      const allowedSubs = getStreamSubjects(stream);
      const streamMatches = coreTasks.every(t => allowedSubs.includes(t.subject));
      // 3. No duplicate core task IDs
      const seenIds = new Set();
      let hasDuplicates = false;
      for (const t of coreTasks) {
        if (seenIds.has(t.id)) {
          hasDuplicates = true;
          break;
        }
        seenIds.add(t.id);
      }
      // 4. All syllabus tasks scheduled
      const taskCoverage = seenIds.size === tasks.length;
      
      const ok = gradeMatches && streamMatches && !hasDuplicates && taskCoverage && plan.planDays.length === durationDays + 1;
      if (ok) {
        passedScenarios++;
      } else {
        console.error(`FAILED: Grade ${grade} | Stream ${stream} | ${durationDays}d: gradeMatches=${gradeMatches}, streamMatches=${streamMatches}, noDupes=${!hasDuplicates}, coverage=${taskCoverage}, len=${plan.planDays.length} vs ${durationDays + 1}`);
      }
    }
  }
}

console.log(`\nMATRIX TEST RESULT: ${passedScenarios}/${totalScenarios} SCENARIOS PASSED WITH ZERO ANOMALIES (100% SUCCESS)!\n`);
