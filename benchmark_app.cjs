const fs = require('fs');

const code = fs.readFileSync('src/app.js', 'utf8');

// We want to mock out enough of app.js to run the inner loop and benchmark it.
// The nested loop is checking for completed chapters based on chapId.

// Let's create a mockup dataset
const PLUS_TWO_SYLLABUS = [];
for (let i = 0; i < 50; i++) {
  PLUS_TWO_SYLLABUS.push({ chapId: `ch${i}`, subject: 'CS', chapNumber: i, chapterName: `Chap ${i}`, term: 1 });
  PLUS_TWO_SYLLABUS.push({ chapId: `ch${i}`, subject: 'Math', chapNumber: i, chapterName: `Chap ${i}`, term: 1 });
}
const p2Chaps = PLUS_TWO_SYLLABUS.filter(t => t.subject === 'CS');
const uniqueP2 = [...new Map(p2Chaps.map(item => [item.chapId, item])).values()];

const appState = {
  plan: []
};

// 120 days, each day has 4 tasks
for (let d = 0; d < 120; d++) {
  const tasks = [];
  for (let t = 0; t < 4; t++) {
     tasks.push({ chapId: `ch${(d * 4 + t) % 50}`, completed: (d * 4 + t) % 2 === 0 });
  }
  appState.plan.push({ tasks });
}

function runOriginal() {
  let matched = 0;
  for (const ch of uniqueP2) {
    let isAllDone = false;
    if (appState && appState.plan) {
        const chapterTasksInPlan = [];
        appState.plan.forEach(d => {
             d.tasks.forEach(t => {
                if (t.chapId === ch.chapId) chapterTasksInPlan.push(t);
            });
        });
        if (chapterTasksInPlan.length > 0 && chapterTasksInPlan.every(t => t.completed)) {
            isAllDone = true;
        }
    }
    if (isAllDone) matched++;
  }
  return matched;
}

function runOptimized() {
    let matched = 0;
    // Map tasks by chapId
    const taskMap = new Map();
    if (appState && appState.plan) {
        appState.plan.forEach(d => {
            d.tasks.forEach(t => {
                if (!taskMap.has(t.chapId)) {
                    taskMap.set(t.chapId, []);
                }
                taskMap.get(t.chapId).push(t);
            });
        });
    }

    for (const ch of uniqueP2) {
        let isAllDone = false;
        if (appState && appState.plan) {
            const chapterTasksInPlan = taskMap.get(ch.chapId) || [];
            if (chapterTasksInPlan.length > 0 && chapterTasksInPlan.every(t => t.completed)) {
                isAllDone = true;
            }
        }
        if (isAllDone) matched++;
    }
    return matched;
}

console.log("Original match:", runOriginal());
console.log("Optimized match:", runOptimized());

const ITERS = 10000;

console.time('Original');
for(let i=0; i<ITERS; i++) runOriginal();
console.timeEnd('Original');

console.time('Optimized');
for(let i=0; i<ITERS; i++) runOptimized();
console.timeEnd('Optimized');
