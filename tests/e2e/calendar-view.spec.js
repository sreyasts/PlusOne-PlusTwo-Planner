import { test, expect } from '@playwright/test';

test.use({ timezoneId: 'Asia/Kolkata' });

test('today, overdue work and tomorrow stay separate across a calendar-day change', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-10-16T12:00:00+05:30') });
  await page.goto('/');
  await page.locator('#setup-step-pill-4').click();
  await page.getByRole('button', { name: '🚀 Start Day 1', exact: true }).click();
  await expect(page.locator('#today-overview')).toBeVisible({ timeout: 20000 });
  const subjects = await page.evaluate(() => {
    const state = JSON.parse(localStorage.getItem('plusTwoMissionState_v2'));
    const tasks = [...new Map(state.plan.flatMap(day => day.tasks)
      .filter(task => !task.isRevision)
      .map(task => [task.subject, task])).values()].slice(0, 3);
    state.plan = tasks.map((task, index) => ({
      ...state.plan[index], dayNumber: index + 1,
      date: `2026-10-${15 + index}`,
      tasks: [{ ...task, id: `calendar-${index}`, completed: false }],
    }));
    state.deadlineDate = '2026-10-17';
    localStorage.setItem('plusTwoMissionState_v2', JSON.stringify(state));
    return tasks.map(task => task.subject);
  });
  await page.reload();
  await expect(page.locator('#today-tasks')).toContainText(subjects[1]);
  await expect(page.locator('#today-tasks')).not.toContainText(subjects[0]);
  await expect(page.locator('#today-tasks')).not.toContainText(subjects[2]);
  await expect(page.locator('.pending-notice')).toContainText('1 unfinished');
  await page.locator('#pending-work > summary').click();
  await expect(page.locator('#pending-work')).toContainText(subjects[0]);
  await page.locator('#tomorrow-preview > summary').click();
  await expect(page.locator('#tomorrow-preview')).toContainText(subjects[2]);

  await page.locator('#today-tasks').getByRole('button', { name: 'Mark done', exact: true }).click();
  await expect(page.locator('#today-overview')).toContainText('1 / 1');
  await expect(page.locator('#today-tasks')).not.toContainText(subjects[2]);
  await expect(page.locator('.pending-notice')).toContainText('1 unfinished');

  // Leave the page open across midnight: its timer must advance the timetable.
  await page.clock.setSystemTime(new Date('2026-10-16T23:59:59.500+05:30'));
  await page.reload();
  await page.clock.runFor(1500);
  await expect(page.locator('#today-tasks')).toContainText(subjects[2]);
  await expect(page.locator('.study-history')).toContainText('Yesterday: 1 / 1 completed');
  await page.locator('#pending-work > summary').click();
  await page.locator('[data-pending-task="calendar-0"]').click();
  await expect(page.locator('.pending-notice')).toHaveCount(0);
  await expect(page.locator('#today-overview')).toContainText('0 / 1');
  await page.reload();
  await expect(page.locator('.pending-notice')).toHaveCount(0);
  await expect(page.locator('#today-tasks')).toContainText(subjects[2]);
  await page.screenshot({ path: test.info().outputPath('calendar-today.png'), fullPage: true });
  // A one-second screen lock across midnight must also refresh immediately.
  await page.clock.setSystemTime(new Date('2026-10-17T23:59:59.500+05:30'));
  await page.reload();
  await page.clock.setSystemTime(new Date('2026-10-18T00:00:00.500+05:30'));
  await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
  await expect(page.locator('.study-date')).toHaveText('2026-10-18');
  await expect(page.locator('#today-tasks')).toContainText('No tasks scheduled today');
  await expect(page.locator('.pending-notice')).toContainText('1 unfinished');
});
