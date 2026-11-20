import { test, expect } from '@playwright/test';
import fs from 'node:fs/promises';
import { groupStudyBlocks } from '../../src/engine/chapter-blocks.js';

test.use({ timezoneId: 'Asia/Kolkata' });

for (const width of [390, 1280]) {
  test(`+1 subject selection, completion, backup and regeneration at ${width}px`, async ({ page }) => {
    test.setTimeout(60000);
    await page.clock.install({ time: new Date('2026-10-21T12:00:00+05:30') });
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/');

    // Select Plus One (+1)
    await page.locator('#grade-btn-p1').click();
    await page.locator('#stream-card-cs').click();

    // Verify no legacy improvement elements are present
    await expect(page.locator('#stream-card-imp')).toHaveCount(0);
    await expect(page.locator('#improvement-options')).toHaveCount(0);

    // Step 2: Set deadline
    await page.locator('#setup-step-pill-2').click();
    await page.locator('#deadline-date').fill('2026-12-21');

    // Step 4: Summary & Generate
    await page.locator('#setup-step-pill-4').click();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: test.info().outputPath(`plus-one-setup-${width}.png`), fullPage: true });

    await page.getByRole('button', { name: 'Start Day 1', exact: true }).click();
    await expect(page.locator('#today-overview')).toBeVisible({ timeout: 20000 });

    const generated = await page.evaluate(() => JSON.parse(localStorage.getItem('plusTwoMissionState_v2')));
    expect(generated.grade).toBe('+1');
    expect(generated.stream).toBe('cs');

    const studyTasks = generated.plan.flatMap(day => day.tasks).filter(task => !task.isRevision && !task.isExamEveTask);
    expect(studyTasks.length).toBeGreaterThan(0);
    expect(studyTasks.every(task => task.grade === '+1')).toBe(true);

    const firstStudyDay = generated.plan.find(day => day.tasks.length);
    const firstBlockIds = groupStudyBlocks(firstStudyDay.tasks)[0].map(task => task.id).sort();
    await page.clock.setSystemTime(new Date(`${firstStudyDay.date}T12:00:00+05:30`));
    await page.reload();
    await page.locator('[data-study-task][aria-pressed="false"]').first().click();
    await page.reload();
    await expect(page.locator('[data-study-task][aria-pressed="true"]')).toHaveCount(1);

    await page.evaluate(() => openSettingsModal());
    const downloadEvent = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Export Backup', exact: true }).click();
    const backup = JSON.parse(await fs.readFile(await (await downloadEvent).path(), 'utf8'));
    expect(backup.grade).toBe('+1');
    expect(backup.stream).toBe('cs');
    expect(backup.plan.flatMap(day => day.tasks).filter(task => task.completed).map(task => task.id).sort()).toEqual(firstBlockIds);

    await page.locator('#settings-import-input').setInputFiles({
      name: 'plus-one-backup.json',
      mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify(backup)),
    });
    await expect(page.getByRole('alertdialog')).toContainText('Restore study backup?');
    await page.getByRole('alertdialog').getByRole('button', { name: 'Restore backup', exact: true }).click();
    await expect(page.locator('#settings-modal')).toBeHidden();
    const restored = await page.evaluate(() => JSON.parse(localStorage.getItem('plusTwoMissionState_v2')));
    expect(restored.grade).toBe('+1');
    expect(restored.stream).toBe('cs');

    await page.evaluate(() => openRegenerateModal());
    await page.evaluate(() => continueAsGuest());
    await page.locator('#completed-day-select').selectOption('0');
    await page.getByLabel('Study hours per day').fill('2');
    await page.getByLabel('Target date').fill('2027-01-20');
    await page.locator('#regenerate-confirm-btn').click();
    await expect(page.locator('#today-overview')).toBeVisible({ timeout: 20000 });
    await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('plusTwoMissionState_v2')).deadlineDate)).toBe('2027-01-20');
    const rebuilt = await page.evaluate(() => JSON.parse(localStorage.getItem('plusTwoMissionState_v2')));
    expect(rebuilt.grade).toBe('+1');
    expect(rebuilt.stream).toBe('cs');
    expect(rebuilt.personalization.dailyHours).toBe(2);
    expect(rebuilt.plan.flatMap(day => day.tasks).filter(task => task.completed).map(task => task.id).sort()).toEqual(firstBlockIds);
    expect(rebuilt.plan.filter(day => !day.isCompletedMarker).every(day => day.totalMinutes <= 120 && groupStudyBlocks(day.tasks).length <= 3)).toBe(true);
    await page.screenshot({ path: test.info().outputPath(`plus-one-${width}.png`), fullPage: true });
  });
}
