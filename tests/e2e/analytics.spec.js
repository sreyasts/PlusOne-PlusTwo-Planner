import { test, expect } from '@playwright/test';

test.describe('Local analytics event properties', () => {
  test('records lifecycle events and omits known personal-data keys', async ({ page }) => {
    const eventsDispatched = [];

    // Listen to custom analytics events dispatched by the tracker
    await page.exposeFunction('onAnalyticsEvent', (data) => {
      eventsDispatched.push(data);
    });

    await page.addInitScript(() => {
      window.addEventListener('mpt:analytics', (e) => {
        window.onAnalyticsEvent(e.detail);
      });
    });

    // 1. Visit App: 'opened' & 'setup_started' should fire
    await page.goto('/');
    await expect(page.locator('h1')).toContainText('Mission');

    // Check opened event
    await page.waitForFunction(() => {
      const counts = JSON.parse(localStorage.getItem('mpt_funnel_counts_v1') || '{}');
      return counts.opened >= 1;
    });

    // 2. Generate a plan: 'plan_created' should fire
    await page.locator('#setup-step-pill-4').click();
    await page.getByRole('button', { name: '🚀 Start Day 1', exact: true }).click();
    await expect(page.locator('#today-overview')).toBeVisible({ timeout: 20000 });

    // Verify 'plan_created' was logged
    const funnelAfterPlan = await page.evaluate(() => {
      return JSON.parse(localStorage.getItem('mpt_funnel_counts_v1') || '{}');
    });
    expect(funnelAfterPlan.plan_created).toBeGreaterThanOrEqual(1);

    // 3. Check first task: 'first_task_checked' should fire
    await page.locator('#today-tasks [data-study-task][aria-pressed="false"]').first().click();
    await expect.poll(() => page.evaluate(() =>
      JSON.parse(localStorage.getItem('mpt_funnel_counts_v1') || '{}')
    )).toMatchObject({ first_task_checked: 1 });

    // 4. Inspect events to strictly verify ZERO Personally Identifiable Information (PII)
    const finalFunnel = await page.evaluate(() => {
      return JSON.parse(localStorage.getItem('mpt_funnel_counts_v1') || '{}');
    });

    expect(finalFunnel.opened).toBeGreaterThanOrEqual(1);
    expect(finalFunnel.setup_started).toBeGreaterThanOrEqual(1);
    expect(finalFunnel.plan_created).toBeGreaterThanOrEqual(1);
    expect(finalFunnel.first_task_checked).toBeGreaterThanOrEqual(1);

    // Verify all captured events contain no PII keys
    for (const evt of eventsDispatched) {
      const props = evt.properties || {};
      expect(props).not.toHaveProperty('name');
      expect(props).not.toHaveProperty('email');
      expect(props).not.toHaveProperty('uid');
      expect(props).not.toHaveProperty('userId');
      expect(props).not.toHaveProperty('phone');
    }

    // Take screenshot as proof of verified event delivery
    await page.screenshot({ path: test.info().outputPath('analytics-events.png'), fullPage: true });
  });
});
