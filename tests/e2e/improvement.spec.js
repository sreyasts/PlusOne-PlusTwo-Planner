import { test, expect } from '@playwright/test';
import fs from 'node:fs/promises';

test.use({ timezoneId: 'Asia/Kolkata' });

for (const width of [390, 1280]) {
  test(`+1 subject selection, completion, backup and regeneration at ${width}px`, async ({ page }) => {
    test.setTimeout(60000);
    await page.clock.install({ time: new Date('2026-10-21T12:00:00+05:30') });
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/');
    await page.locator('#stream-card-imp').press('Enter');
    await page.locator('#setup-step-pill-4').click();
    await page.getByRole('button', { name: '🚀 Start Day 1', exact: true }).click();
    await expect(page.getByRole('dialog')).toContainText('Select at least one');
    await page.getByRole('dialog').getByRole('button', { name: 'OK', exact: true }).click();
    await expect(page.locator('#setup-step-2')).toBeVisible();
    await page.locator('#deadline-date').fill('2026-12-21');
    await page.getByRole('checkbox', { name: 'Physics (+1)', exact: true }).check();
    await page.getByLabel('Exam date — Physics', { exact: true }).fill('2026-10-20');
    await page.locator('#setup-step-pill-4').click();
    await page.getByRole('button', { name: '🚀 Start Day 1', exact: true }).click();
    await expect(page.getByRole('dialog')).toContainText('after the plan start');
    await page.getByRole('dialog').getByRole('button', { name: 'OK', exact: true }).click();
    await page.getByLabel('Exam date — Physics', { exact: true }).fill('2026-12-20');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: test.info().outputPath(`improvement-setup-${width}.png`), fullPage: true });
    await page.locator('#setup-step-pill-4').click();
    await page.getByRole('button', { name: '🚀 Start Day 1', exact: true }).click();
    await expect(page.locator('#today-overview')).toBeVisible({ timeout: 20000 });
    const generated = await page.evaluate(() => JSON.parse(localStorage.getItem('plusTwoMissionState_v2')));
    expect(generated.stream).toBe('imp_only');
    expect(generated.improvementConfig).toEqual([{ subject: 'Physics', examDate: '2026-12-20' }]);
    const studyTasks = generated.plan.flatMap(day => day.tasks).filter(task => !task.isRevision && !task.isExamEveTask);
    expect(studyTasks.length).toBeGreaterThan(0);
    expect(studyTasks.every(task => task.grade === '+1' && task.subject === 'Physics')).toBe(true);
    const firstStudyDay = generated.plan.find(day => day.tasks.length);
    await page.clock.setSystemTime(new Date(`${firstStudyDay.date}T12:00:00+05:30`));
    await page.reload();
    await page.locator('[data-study-task][aria-pressed="false"]').first().click();
    await page.reload();
    await expect(page.locator('[data-study-task][aria-pressed="true"]')).toHaveCount(1);
    await page.evaluate(() => openSettingsModal());
    const downloadEvent = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Export Backup', exact: true }).click();
    const backup = JSON.parse(await fs.readFile(await (await downloadEvent).path(), 'utf8'));
    expect(backup.stream).toBe('imp_only');
    expect(backup.plan.flatMap(day => day.tasks).filter(task => task.completed)).toHaveLength(1);
    await page.locator('#settings-import-input').setInputFiles({
      name: 'improvement-backup.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(backup)),
    });
    await expect(page.getByRole('alertdialog')).toContainText('Restore study backup?');
    await page.getByRole('alertdialog').getByRole('button', { name: 'Restore backup', exact: true }).click();
    await expect(page.locator('#settings-modal')).toBeHidden();
    const restored = await page.evaluate(() => JSON.parse(localStorage.getItem('plusTwoMissionState_v2')));
    expect(restored.plan).toEqual(backup.plan);
    expect(restored.improvementConfig).toEqual(backup.improvementConfig);
    await page.getByRole('button', { name: 'Adjust plan', exact: true }).click();
    await page.locator('#completed-day-select').selectOption('0');
    await page.locator('#regenerate-confirm-btn').click();
    await expect(page.locator('#plan-generation-overlay')).toBeHidden({ timeout: 20000 });
    const rebuilt = await page.evaluate(() => JSON.parse(localStorage.getItem('plusTwoMissionState_v2')));
    expect(rebuilt.improvementConfig).toEqual(backup.improvementConfig);
    expect(rebuilt.plan.flatMap(day => day.tasks).filter(task => !task.isRevision && !task.isExamEveTask)
      .every(task => task.grade === '+1' && task.subject === 'Physics')).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: test.info().outputPath(`improvement-${width}.png`), fullPage: true });
  });
}
