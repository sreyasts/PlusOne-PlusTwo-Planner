import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from '@playwright/test';

// Simple static server
const distDir = path.resolve('dist');
const mimeTypes = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
};

const server = http.createServer((req, res) => {
  let filePath = path.join(distDir, req.url.split('?')[0]);
  if (filePath.endsWith(path.sep) || !path.extname(filePath)) {
    filePath = path.join(distDir, 'index.html');
  }
  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404);
      res.end('Not found');
      return;
    }
    const ext = path.extname(filePath);
    res.writeHead(200, { 'Content-Type': mimeTypes[ext] || 'application/octet-stream' });
    res.end(data);
  });
});

server.listen(4174, async () => {
  console.log('Server listening on http://localhost:4174');
  try {
    const browser = await chromium.launch({ channel: 'msedge', headless: true });
    const page = await browser.newPage();
    const logs = [];
    page.on('console', msg => logs.push(`[${msg.type()}] ${msg.text()}`));
    page.on('pageerror', err => logs.push(`[error] ${err.toString()}`));

    await page.goto('http://localhost:4174');
    await page.waitForTimeout(1000);

    // Click step 4 pill
    await page.click('#setup-step-pill-4');
    await page.waitForTimeout(500);

    // Start Day 1
    await page.locator('button:has-text("Start Day 1")').click();
    await page.waitForSelector('#today-overview', { timeout: 10000 });
    console.log('Setup finished, today view loaded');

    // Go to Plan view
    await page.evaluate(() => window.goToPlan());
    await page.waitForTimeout(1000);

    const checkboxes = await page.locator('.task-checkbox').all();
    console.log('Found checkboxes in Plan view:', checkboxes.length);

    if (checkboxes.length > 0) {
      const firstCb = page.locator('.task-checkbox').first();
      const taskId = await firstCb.getAttribute('data-task-id');
      const checkedBefore = await firstCb.evaluate(el => el.classList.contains('checked'));
      console.log('Before click: taskId=', taskId, 'checked=', checkedBefore);

      await firstCb.click();
      await page.waitForTimeout(500);

      const checkedAfter = await firstCb.evaluate(el => el.classList.contains('checked'));
      console.log('After click: taskId=', taskId, 'checked=', checkedAfter);

      const stateTask = await page.evaluate(id => {
        const day = window.appState.plan.find(d => d.tasks.some(t => t.id === id));
        const t = day?.tasks.find(x => x.id === id);
        return { completed: t?.completed, totalDone: window.appState.plan.flatMap(d => d.tasks).filter(x => x.completed).length };
      }, taskId);
      console.log('appState stateTask:', stateTask);

      // Second task
      const secondContainer = page.locator('.task-item-container').nth(1);
      const secondTaskId = await secondContainer.locator('.task-checkbox').getAttribute('data-task-id');
      console.log('Clicking row text for second task:', secondTaskId);
      await secondContainer.locator('.flex-1').click();
      await page.waitForTimeout(500);
      const secondChecked = await secondContainer.locator('.task-checkbox').evaluate(el => el.classList.contains('checked'));
      console.log('Second task checked after text click:', secondChecked);

      // Now unclick first task
      await firstCb.click();
      await page.waitForTimeout(500);
      const checkedAfterUnclick = await firstCb.evaluate(el => el.classList.contains('checked'));
      console.log('After unclick: taskId=', taskId, 'checked=', checkedAfterUnclick);

      // Verify compactPlanToToday and restorePreviousPlan
      console.log('Testing fast-track compaction and undo restoration...');
      const compactResult = await page.evaluate(() => {
        // Mark Day 1 tasks done
        if (window.appState && window.appState.plan && window.appState.plan[0]) {
          window.appState.plan[0].tasks.forEach(t => t.completed = true);
        }
        const initialPlanDaysCount = window.appState.plan.length;
        const initialDay2Date = window.appState.plan[1]?.date;
        window.compactPlanToToday();
        const compactedDay2Date = window.appState.plan[1]?.date;
        const snapshotExists = !!localStorage.getItem('mpt_previous_plan_snapshot');
        
        // Now test restore
        const restoredOk = window.restorePreviousPlan();
        const restoredDay2Date = window.appState.plan[1]?.date;

        return {
          initialDay2Date,
          compactedDay2Date,
          snapshotExists,
          restoredOk,
          restoredDay2Date
        };
      });
      console.log('Compact & Restore Result:', compactResult);
    }

    console.log('Browser logs count:', logs.length);
    if (logs.some(l => l.includes('[error]'))) {
      console.log('Browser errors:', logs.filter(l => l.includes('[error]')));
    }
    await browser.close();
  } catch (err) {
    console.error('Error during test:', err);
  } finally {
    server.close();
  }
});
