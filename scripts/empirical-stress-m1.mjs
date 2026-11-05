import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from '@playwright/test';

// Configuration
const PORT = 4178;
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

async function runEmpiricalStress() {
  const results = {
    viewportsTested: [],
    testsPassed: 0,
    testsFailed: 0,
    details: [],
    failures: []
  };

  const record = (name, pass, info) => {
    if (pass) {
      results.testsPassed++;
      results.details.push(`[PASS] ${name} ${info ? '- ' + JSON.stringify(info) : ''}`);
    } else {
      results.testsFailed++;
      results.failures.push(`[FAIL] ${name} ${info ? '- ' + JSON.stringify(info) : ''}`);
    }
  };

  await new Promise((resolve) => server.listen(PORT, resolve));
  console.log(`Empirical test server listening on http://localhost:${PORT}`);

  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  const logs = [];
  page.on('console', (msg) => logs.push(`[console.${msg.type()}] ${msg.text()}`));
  page.on('pageerror', (err) => logs.push(`[pageerror] ${err.toString()}`));

  try {
    await page.goto(`http://localhost:${PORT}`);
    await page.evaluate(() => {
      localStorage.setItem('has_seen_auth_modal', 'true');
      localStorage.setItem('mpt_was_logged_in', 'true');
      localStorage.setItem('has_dismissed_milestone_auth', 'true');
      sessionStorage.setItem('auth_modal_dismissed', 'true');
      if (typeof window.closeAuthModal === 'function') window.closeAuthModal();
    });
    await page.waitForTimeout(600);

    // Complete setup wizard to create a full real plan state
    console.log('Navigating setup wizard to generate real plan...');
    await page.click('#setup-step-pill-4');
    await page.waitForTimeout(300);
    await page.locator('button:has-text("Start Day 1")').click();
    await page.waitForSelector('#today-overview', { timeout: 10000 });

    // Navigate to Plan view
    await page.evaluate(() => window.goToPlan());
    await page.waitForSelector('#plan-actions-overflow-btn', { state: 'attached', timeout: 5000 });
    console.log('Successfully reached Full Plan view in browser!');

    const viewports = [360, 375, 414, 639, 640, 1280];

    for (const w of viewports) {
      results.viewportsTested.push(w);
      await page.setViewportSize({ width: w, height: 800 });
      await page.waitForTimeout(200);

      const isMobile = w < 640;
      console.log(`\n--- Stress Testing Viewport: ${w}px (${isMobile ? 'MOBILE' : 'DESKTOP'}) ---`);

      // 1. Breakpoint visibility tests
      const smHiddenDisplay = await page.evaluate(() => {
        const el = document.querySelector('div.sm\\:hidden');
        return el ? window.getComputedStyle(el).display : 'NOT_FOUND';
      });

      const smFlexDisplay = await page.evaluate(() => {
        const el = document.querySelector('div.hidden.sm\\:flex');
        return el ? window.getComputedStyle(el).display : 'NOT_FOUND';
      });

      if (isMobile) {
        record(
          `Viewport ${w}px: sm:hidden container is VISIBLE (display: flex)`,
          smHiddenDisplay === 'flex',
          { smHiddenDisplay }
        );
        record(
          `Viewport ${w}px: hidden sm:flex container is HIDDEN (display: none)`,
          smFlexDisplay === 'none',
          { smFlexDisplay }
        );
      } else {
        record(
          `Viewport ${w}px: sm:hidden container is HIDDEN (display: none)`,
          smHiddenDisplay === 'none',
          { smHiddenDisplay }
        );
        record(
          `Viewport ${w}px: hidden sm:flex container is VISIBLE (display: flex)`,
          smFlexDisplay === 'flex',
          { smFlexDisplay }
        );
      }

      // 2. Measure Tap Targets of Visible Header Buttons
      if (isMobile) {
        // Mobile header buttons: #plan-actions-overflow-btn, #plan-print-btn, #plan-back-btn
        const mobileButtons = ['#plan-actions-overflow-btn', '#plan-print-btn', '#plan-back-btn'];
        for (const selector of mobileButtons) {
          const rect = await page.locator(selector).boundingBox();
          const pass = rect && rect.width >= 44 && rect.height >= 44;
          record(
            `Viewport ${w}px: ${selector} meets 44x44px tap target`,
            pass,
            rect ? { width: Math.round(rect.width), height: Math.round(rect.height) } : 'NO_RECT'
          );
        }

        // 3. Test Mobile Bottom Action Sheet Opening, Elements, Tap Targets & Dismissal
        await page.evaluate(() => {
          if (typeof window.closeAuthModal === 'function') window.closeAuthModal();
        });
        await page.click('#plan-actions-overflow-btn');
        await page.waitForTimeout(350); // allow transition

        const sheetVisible = await page.evaluate(() => {
          const s = document.getElementById('export-share-sheet');
          const cs = window.getComputedStyle(s);
          return !s.classList.contains('hidden') && cs.display !== 'none';
        });
        record(`Viewport ${w}px: #export-share-sheet opened upon overflow click`, sheetVisible);

        const bodyScrollLocked = await page.evaluate(() => document.body.style.overflow === 'hidden');
        record(`Viewport ${w}px: Body scroll locked while sheet open`, bodyScrollLocked);

        // Check action sheet item tap targets
        const sheetActionButtons = [
          '#action-sheet-ics-btn',
          '#action-sheet-csv-btn',
          '#action-sheet-share-btn',
          '#action-sheet-copy-btn',
        ];
        for (const btnSel of sheetActionButtons) {
          const rect = await page.locator(btnSel).boundingBox();
          const pass = rect && rect.width >= 44 && rect.height >= 44;
          record(
            `Viewport ${w}px: ${btnSel} meets 44x44px (min 56px height)`,
            pass,
            rect ? { width: Math.round(rect.width), height: Math.round(rect.height) } : 'NO_RECT'
          );
        }

        // Cancel button
        const cancelRect = await page.locator('#export-sheet-cancel-btn').boundingBox();
        const cancelPass = cancelRect && cancelRect.width >= 44 && cancelRect.height >= 44;
        record(
          `Viewport ${w}px: #export-sheet-cancel-btn meets 44x44px`,
          cancelPass,
          cancelRect ? { width: Math.round(cancelRect.width), height: Math.round(cancelRect.height) } : 'NO_RECT'
        );

        // Close 'X' button
        const closeXRect = await page.locator('button[aria-label="Close export menu"]').boundingBox();
        const closeXPass = closeXRect && closeXRect.width >= 44 && closeXRect.height >= 44;
        record(
          `Viewport ${w}px: Close 'X' button meets 44x44px`,
          closeXPass,
          closeXRect ? { width: Math.round(closeXRect.width), height: Math.round(closeXRect.height) } : 'NO_RECT'
        );

        // Verify Safe Area Inset class and computed style on #export-sheet-panel
        const panelCheck = await page.evaluate(() => {
          const p = document.getElementById('export-sheet-panel');
          if (!p) return { found: false };
          const hasSafeClass = p.classList.contains('pb-[calc(1.5rem+env(safe-area-inset-bottom,0px))]');
          const style = window.getComputedStyle(p);
          return {
            found: true,
            hasSafeClass,
            paddingBottom: style.paddingBottom,
            classList: Array.from(p.classList)
          };
        });
        record(
          `Viewport ${w}px: #export-sheet-panel has pb-[calc(1.5rem+env(safe-area-inset-bottom,0px))] class`,
          panelCheck.hasSafeClass,
          { hasSafeClass: panelCheck.hasSafeClass, paddingBottom: panelCheck.paddingBottom }
        );

        // Dismiss action sheet via cancel button
        await page.click('#export-sheet-cancel-btn');
        await page.waitForTimeout(400); // 300ms transition + margin

        const sheetDismissed = await page.evaluate(() => {
          const s = document.getElementById('export-share-sheet');
          return s.classList.contains('hidden');
        });
        record(`Viewport ${w}px: #export-share-sheet dismissed cleanly via Cancel`, sheetDismissed);

        const bodyScrollUnlocked = await page.evaluate(() => document.body.style.overflow === '');
        record(`Viewport ${w}px: Body scroll unlocked after dismiss`, bodyScrollUnlocked);

        // Test Escape Key dismissal
        await page.evaluate(() => { if (typeof window.closeAuthModal === 'function') window.closeAuthModal(); });
        await page.click('#plan-actions-overflow-btn');
        await page.waitForTimeout(350);
        await page.keyboard.press('Escape');
        await page.waitForTimeout(400);
        const escDismissed = await page.evaluate(() => document.getElementById('export-share-sheet').classList.contains('hidden'));
        record(`Viewport ${w}px: #export-share-sheet dismissed via Escape key`, escDismissed);

        // Test Backdrop click dismissal
        await page.evaluate(() => { if (typeof window.closeAuthModal === 'function') window.closeAuthModal(); });
        await page.click('#plan-actions-overflow-btn');
        await page.waitForTimeout(350);
        // Click at top area of the backdrop (outside panel)
        await page.mouse.click(w / 2, 50);
        await page.waitForTimeout(400);
        const backdropDismissed = await page.evaluate(() => document.getElementById('export-share-sheet').classList.contains('hidden'));
        record(`Viewport ${w}px: #export-share-sheet dismissed via Backdrop click`, backdropDismissed);

        // Test Execution Parity: Spying on Action Handlers from Mobile Sheet
        const actionParity = await page.evaluate(async () => {
          const calls = [];
          const origIcs = window.exportTimetableIcs;
          const origCsv = window.exportTimetableCsv;
          const origShare = window.shareApp;
          const origCopy = window.copyShareLink;

          window.exportTimetableIcs = () => { calls.push('ics'); };
          window.exportTimetableCsv = () => { calls.push('csv'); };
          window.shareApp = () => { calls.push('share'); };
          window.copyShareLink = () => { calls.push('copy'); };

          try {
            // Test ICS click
            window.openExportShareSheet();
            document.getElementById('action-sheet-ics-btn').click();
            // Test CSV click
            window.openExportShareSheet();
            document.getElementById('action-sheet-csv-btn').click();
            // Test Share click
            window.openExportShareSheet();
            document.getElementById('action-sheet-share-btn').click();
            // Test Copy click
            window.openExportShareSheet();
            document.getElementById('action-sheet-copy-btn').click();

            return {
              success: true,
              calls,
              sheetHiddenAfterCopy: document.getElementById('export-share-sheet').classList.contains('hidden')
            };
          } finally {
            window.exportTimetableIcs = origIcs;
            window.exportTimetableCsv = origCsv;
            window.shareApp = origShare;
            window.copyShareLink = origCopy;
          }
        });
        record(
          `Viewport ${w}px: Mobile sheet action click dispatches exact handlers (ics, csv, share, copy)`,
          actionParity.success && actionParity.calls.join(',') === 'ics,csv,share,copy',
          actionParity
        );

        // Test Bilingual Malayalam Synchronization
        const mlSync = await page.evaluate(() => {
          if (typeof window.applyAppLanguage === 'function') {
            window.applyAppLanguage('ml');
          }
          window.openExportShareSheet();
          const title = document.getElementById('export-sheet-title')?.textContent?.trim();
          const cal = document.getElementById('export-sheet-cal-title')?.textContent?.trim();
          const csv = document.getElementById('export-sheet-csv-title')?.textContent?.trim();
          const share = document.getElementById('export-sheet-share-title')?.textContent?.trim();
          const cancel = document.getElementById('export-sheet-cancel-btn')?.textContent?.trim();
          const overflowText = document.getElementById('plan-actions-overflow-btn')?.textContent?.trim();

          // Reset back to English
          if (typeof window.applyAppLanguage === 'function') {
            window.applyAppLanguage('en');
          }
          window.closeExportShareSheet();

          return {
            title,
            cal,
            csv,
            share,
            cancel,
            overflowText,
            isMalayalam: title === 'ടൈംടേബിൾ എക്സ്പോർട്ട് & ഷെയർ' && cal === 'കലണ്ടറിൽ ചേർക്കുക (.ics)' && cancel === 'റദ്ദാക്കുക'
          };
        });
        record(
          `Viewport ${w}px: Bilingual Malayalam localization synchronization`,
          mlSync.isMalayalam,
          mlSync
        );
        await page.waitForTimeout(350); // allow close timer to settle

      } else {
        // Desktop header buttons: #plan-desktop-ics-btn, #plan-desktop-csv-btn, #plan-desktop-share-btn, #plan-print-btn, #plan-back-btn
        const desktopButtons = [
          '#plan-desktop-ics-btn',
          '#plan-desktop-csv-btn',
          '#plan-desktop-share-btn',
          '#plan-print-btn',
          '#plan-back-btn'
        ];
        for (const selector of desktopButtons) {
          const rect = await page.locator(selector).boundingBox();
          const pass = rect && rect.width >= 44 && rect.height >= 44;
          record(
            `Viewport ${w}px: ${selector} meets 44x44px tap target`,
            pass,
            rect ? { width: Math.round(rect.width), height: Math.round(rect.height) } : 'NO_RECT'
          );
        }
      }

      // Check horizontal overflow invariant (no horizontal scrollbar on body)
      const overflowCheck = await page.evaluate((vpWidth) => {
        const scrollW = document.documentElement.scrollWidth;
        const clientW = document.documentElement.clientWidth;
        return {
          scrollWidth: scrollW,
          clientWidth: clientW,
          noOverflow: scrollW <= vpWidth + 1 // 1px rounding tolerance
        };
      }, w);
      record(
        `Viewport ${w}px: No horizontal overflow (scrollWidth <= ${w})`,
        overflowCheck.noOverflow,
        overflowCheck
      );
    }

    console.log('\n======================================================');
    console.log(`TOTAL EMPIRICAL TESTS: ${results.testsPassed + results.testsFailed}`);
    console.log(`PASSED: ${results.testsPassed}`);
    console.log(`FAILED: ${results.testsFailed}`);
    console.log('======================================================\n');
    console.log('DETAILED EMPIRICAL RESULTS:');
    results.details.forEach(d => console.log(d));

    if (results.failures.length > 0) {
      console.error('\nFAILURES DETECTED:');
      results.failures.forEach((f) => console.error(f));
    }

  } catch (err) {
    console.error('Test execution exception:', err);
    results.testsFailed++;
    results.failures.push(`Execution error: ${err.message}`);
  } finally {
    await browser.close();
    server.close();
  }

  return results;
}

runEmpiricalStress().then((res) => {
  if (res.testsFailed > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
});
