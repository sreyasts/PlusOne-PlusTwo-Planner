import { test, expect } from '@playwright/test';

test.use({ timezoneId: 'Asia/Kolkata' });

for (const width of [390, 1280]) {
  test(`guest plan, task completion and persistence at ${width}px`, async ({ page }) => {
    const testTime = new Date();
    testTime.setHours(12, 0, 0, 0);
    await page.clock.install({ time: testTime });
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/');
    await expect(page.locator('#setup-step-1')).toBeVisible();
    await expect(page.locator('#mobile-nav')).toBeHidden();
    await expect(page.locator('#nav-desktop-tabs')).toBeHidden();

    await page.locator('#stream-card-bio').press('Enter');
    await expect(page.locator('#stream-card-bio')).toHaveAttribute('aria-pressed', 'true');
    await page.getByRole('button', { name: 'Next', exact: true }).click();
    const deadline = new Date();
    deadline.setDate(deadline.getDate() + 120);
    const date = `${deadline.getFullYear()}-${String(deadline.getMonth() + 1).padStart(2, '0')}-${String(deadline.getDate()).padStart(2, '0')}`;
    await page.locator('#deadline-date').fill(date);
    await page.getByRole('button', { name: 'Next', exact: true }).click();
    await page.getByRole('button', { name: 'Next', exact: true }).click();
    await expect(page.locator('#hours-chip-2')).toBeVisible();
    await expect(page.locator('#setup-advanced-accordion')).not.toHaveAttribute('open');
    await page.locator('#hours-chip-2').click();
    await page.getByRole('button', { name: '🚀 Start Day 1', exact: true }).click();
    await expect(page.locator('#today-overview')).toBeVisible({ timeout: 20000 });
    await expect(page.locator('#setup-wizard-card')).toHaveCount(0);
    await expect(page.locator('.study-tools')).not.toHaveAttribute('open');

    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('plusTwoMissionState_v2')));
    expect(saved.stream).toBe('bio');
    expect(saved.personalization.dailyHours).toBe(2);
    // The generated calendar can begin with a rest day. Open an actual study
    // date rather than relying on the old automatic jump to unfinished work.
    const firstStudyDay = saved.plan.find(day => day.tasks.length);
    expect(firstStudyDay).toBeTruthy();
    await page.clock.setSystemTime(new Date(`${firstStudyDay.date}T12:00:00+05:30`));
    await page.reload();
    await expect(page.locator('#today-tasks')).toBeVisible();
    await page.getByRole('button', { name: 'Mark done', exact: true }).click();
    await expect.poll(() => page.evaluate(() => {
      const state = JSON.parse(localStorage.getItem('plusTwoMissionState_v2'));
      return state.plan.flatMap(day => day.tasks).filter(task => task.completed).length;
    })).toBe(1);
    await page.reload();
    await expect(page.locator('#today-overview')).toBeVisible();
    const restored = await page.evaluate(() => JSON.parse(localStorage.getItem('plusTwoMissionState_v2')));
    expect(restored.plan.flatMap(day => day.tasks).filter(task => task.completed)).toHaveLength(1);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.locator('.study-tools > summary').click();
    await expect(page.getByRole('button', { name: 'Print / PDF', exact: true })).toBeVisible();
    await page.screenshot({ path: test.info().outputPath(`study-${width}.png`), fullPage: true });

    await page.goto('/pages/stats.html');
    await expect(page.locator('#stat-device-has-plan')).toContainText('Generated');
    await expect(page.locator('#stat-device-stream')).toHaveText('BIO');
    await expect(page.locator('#stat-device-chapters')).toContainText('1 tasks completed');
    await expect(page.getByText('Owner / friend accounts; not adoption', { exact: true })).toBeVisible();
  });
}
