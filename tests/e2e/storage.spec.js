import { test, expect } from '@playwright/test';

test.use({ timezoneId: 'Asia/Kolkata', viewport: { width: 390, height: 900 } });

for (const completed of [false, true]) {
  for (const failedKey of ['plusTwoMissionState_v2', 'plusTwoPlanState']) {
    test(`${completed ? 'Undo' : 'Mark done'} preserves progress when ${failedKey} cannot be saved`, async ({ page }) => {
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.clock.install({ time: new Date('2026-10-20T12:00:00+05:30') });
      await page.goto('/');
      await page.locator('#setup-step-pill-4').click();
      await page.getByRole('button', { name: '🚀 Start Day 1', exact: true }).click();
      await expect(page.locator('#today-overview')).toBeVisible({ timeout: 20000 });
      const original = await page.evaluate(completed => {
        const state = JSON.parse(localStorage.getItem('plusTwoMissionState_v2'));
        const task = state.plan.flatMap(day => day.tasks)[0];
        state.plan = [{ date: '2026-10-20', dayNumber: 1, tasks: [
          { ...task, id: 'storage-probe', completed },
          { ...task, id: 'storage-other', completed: false },
        ] }];
        state.xp = 300;
        state.streakCount = 5;
        state.lastCompletedDate = '2026-10-19';
        const serialized = JSON.stringify(state);
        localStorage.setItem('plusTwoMissionState_v2', serialized);
        localStorage.setItem('plusTwoPlanState', serialized);
        return serialized;
      }, completed);
      await page.reload();
      const control = page.locator('[data-study-task="storage-probe"]');
      await expect(control).toHaveAttribute('aria-pressed', String(completed));
      await page.evaluate(failedKey => {
        const originalSet = Storage.prototype.setItem;
        let failed = false;
        window.restoreStorageForTest = () => { Storage.prototype.setItem = originalSet; };
        Storage.prototype.setItem = function (key, value) {
          if (!failed && key === failedKey) {
            failed = true;
            throw new DOMException('Device storage is full', 'QuotaExceededError');
          }
          return originalSet.call(this, key, value);
        };
      }, failedKey);
      await control.click();
      await expect(page.getByRole('dialog')).toContainText('Progress not saved');
      await expect(control).toHaveAttribute('aria-pressed', String(completed));
      expect(await page.evaluate(() => localStorage.getItem('plusTwoMissionState_v2'))).toBe(original);
      expect(await page.evaluate(() => localStorage.getItem('plusTwoPlanState'))).toBe(original);
      await page.evaluate(() => window.restoreStorageForTest());
      await page.getByRole('dialog').getByRole('button', { name: 'OK', exact: true }).click();
      await control.click();
      await expect(control).toHaveAttribute('aria-pressed', String(!completed));
      const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('plusTwoMissionState_v2')));
      expect(saved.xp).toBe(completed ? 200 : 400);
      expect(saved.streakCount).toBe(completed ? 5 : 6);
      await page.reload();
      await expect(control).toHaveAttribute('aria-pressed', String(!completed));
      expect(errors).toEqual([]);
    });
  }
}
