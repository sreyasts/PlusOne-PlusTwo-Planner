import { test, expect } from '@playwright/test';
import { buildIntelligentPlan } from '../../src/engine/planner.js';

test.use({ timezoneId: 'Asia/Kolkata', viewport: { width: 390, height: 844 } });

test('shows one row per chapter and saves the whole block across views and reloads', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-11-20T12:00:00+05:30') });
  const startDate = '2026-11-20';
  const deadlineDate = '2026-11-21';
  const tasks = Array.from({ length: 7 }, (_, index) => [1, 2].map(part => ({
    id: `test-chapter-${index + 1}-part-${part}`, chapId: `test-chapter-${index + 1}`,
    chapNumber: index + 1, chapterName: `Test Chapter ${index + 1}`, part, totalParts: 2,
    grade: '+2', subject: 'Physics', estimatedMinutes: 30, topicTitle: part === 1 ? 'Concepts' : 'Practice',
  }))).flat();
  const result = buildIntelligentPlan({ startDate, deadlineDate, dailyHours: 3, tasks });
  const state = {
    engineVersion: result.engineVersion, grade: '+2', stream: 'cs', startDate, deadlineDate,
    plan: result.planDays, diagnostics: result.diagnostics, personalization: { dailyHours: 3 },
  };
  await page.addInitScript(initial => {
    if (!localStorage.getItem('plusTwoMissionState_v2')) {
      localStorage.setItem('plusTwoMissionState_v2', JSON.stringify(initial));
    }
  }, state);
  await page.goto('/');

  const today = page.locator('#today-tasks');
  await expect(today.locator('.daily-task')).toHaveCount(3);
  await expect(today.locator('.daily-task').first()).toContainText('Full chapter: Concepts · Practice');
  await expect(today.locator('.daily-task').first()).toContainText('60 min');
  await expect(page.getByRole('status').filter({ hasText: '1 syllabus chapter' })).toBeVisible();
  await today.getByRole('button', { name: 'Mark done' }).first().click();
  await expect(page.locator('#today-overview')).toContainText('1 / 3');

  await page.reload();
  await expect(today.getByRole('button', { name: 'Undo' })).toHaveCount(1);
  await page.evaluate(() => window.goToPlan());
  const firstDay = page.locator('[data-day-number="1"]');
  await expect(firstDay.getByRole('checkbox')).toHaveCount(3);
  const completed = firstDay.locator('[role="checkbox"][aria-checked="true"]');
  await expect(completed).toHaveCount(1);
  await completed.press('Space');
  await expect(completed).toHaveCount(0);
  const doneParts = await page.evaluate(() => JSON.parse(localStorage.getItem('plusTwoMissionState_v2')).plan[0].tasks.filter(task => task.completed));
  expect(doneParts).toHaveLength(0);
});
