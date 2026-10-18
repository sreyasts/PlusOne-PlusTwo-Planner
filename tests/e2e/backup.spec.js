import { test, expect } from '@playwright/test';
import fs from 'node:fs/promises';

test.use({ timezoneId: 'Asia/Kolkata' });

test('restore validates before replacing progress, supports cancellation and round-trips a real plan', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-10-19T12:00:00+05:30') });
  await page.goto('/');
  await page.locator('#setup-step-pill-4').click();
  await page.getByRole('button', { name: '🚀 Start Day 1', exact: true }).click();
  await expect(page.locator('#today-overview')).toBeVisible({ timeout: 20000 });
  await page.evaluate(() => {
    const state = JSON.parse(localStorage.getItem('plusTwoMissionState_v2'));
    state.plan.flatMap(day => day.tasks)[0].completed = true;
    localStorage.setItem('plusTwoMissionState_v2', JSON.stringify(state));
  });
  await page.reload();
  const original = await page.evaluate(() => localStorage.getItem('plusTwoMissionState_v2'));
  await page.evaluate(() => openSettingsModal());
  const downloadEvent = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export Backup', exact: true }).click();
  const download = await downloadEvent;
  const backup = JSON.parse(await fs.readFile(await download.path(), 'utf8'));
  expect(backup.plan.flatMap(day => day.tasks).filter(task => task.completed)).toHaveLength(1);
  expect(backup).not.toHaveProperty('userEmail');

  const upload = value => page.locator('#settings-import-input').setInputFiles({
    name: 'study-backup.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(value)),
  });
  await upload({ plan: [{ date: '2026-10-18', tasks: [{}] }] });
  await expect(page.getByRole('dialog')).toContainText('Backup not restored');
  expect(await page.evaluate(() => localStorage.getItem('plusTwoMissionState_v2'))).toBe(original);
  await page.getByRole('dialog').getByRole('button', { name: 'OK', exact: true }).click();

  await upload(backup);
  await expect(page.getByRole('alertdialog')).toContainText('Restore study backup?');
  await page.screenshot({ path: test.info().outputPath('restore-confirmation.png') });
  await page.getByRole('button', { name: 'Keep current plan', exact: true }).click();
  expect(await page.evaluate(() => localStorage.getItem('plusTwoMissionState_v2'))).toBe(original);

  backup.plan.flatMap(day => day.tasks)[0].completed = false;
  await upload(backup);
  await page.getByRole('alertdialog').getByRole('button', { name: 'Restore backup', exact: true }).click();
  await expect(page.locator('#settings-modal')).toBeHidden();
  await page.reload();
  const restored = await page.evaluate(() => JSON.parse(localStorage.getItem('plusTwoMissionState_v2')));
  expect(restored.plan).toEqual(backup.plan);
  expect(restored.startDate).toBe(backup.startDate);
  expect(restored.stream).toBe(backup.stream);
  expect(await page.evaluate(() => localStorage.getItem('plusTwoMissionState_v2') === localStorage.getItem('plusTwoPlanState'))).toBe(true);
});
