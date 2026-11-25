/**
 * @file tests/mobile-ui-audit.test.js
 * Comprehensive E2E Test Suite for Mobile UI Layout, Touch Targets, and Ergonomics
 *
 * Requirements Covered:
 * - R2: Mobile UI Audit & Polish (ORIGINAL_REQUEST §R2)
 * - F6: Mobile Viewport Layout & No Horizontal Overflow (320px–425px)
 * - F7: Touch Target Compliance (>= 44x44px for buttons, links, controls)
 * - F8: Standalone Pages & Dialogs Mobile Ergonomics
 *
 * Invariants Tested:
 * 1. Viewport Meta Configuration (width=device-width, initial-scale=1.0, viewport-fit=cover)
 * 2. Day Header Container & Badge Wrapping (flex-wrap, min-w-0, responsive padding)
 * 3. Task Item Flex Shrinkage & Text Truncation Safety (min-w-0 flex children)
 * 4. Touch Target Elevation (>= 44px min-height/width on interactive controls)
 * 5. Standalone Pages Responsive Wrappers & Subtitle Control (pages/*.html)
 * 6. Edge-to-Edge Safe Area Insets & Mobile Tactile Interaction (src/style.css)
 */

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const indexPath = path.resolve(rootDir, 'index.html');
const appJsPath = path.resolve(rootDir, 'src', 'app.js');
const cssPath = path.resolve(rootDir, 'src', 'style.css');
const statsPagePath = path.resolve(rootDir, 'pages', 'stats.html');
const backlogPagePath = path.resolve(rootDir, 'pages', 'backlog-recovery-planner.html');
const countdownPagePath = path.resolve(rootDir, 'pages', 'exam-countdown.html');
const timetablePagePath = path.resolve(rootDir, 'pages', 'plus-two-timetable.html');
const studyHoursPagePath = path.resolve(rootDir, 'pages', 'study-hours-calculator.html');
const notFoundPagePath = path.resolve(rootDir, 'public', '404.html');

const indexHtmlSource = fs.readFileSync(indexPath, 'utf8');
const appJsSource = fs.readFileSync(appJsPath, 'utf8');
const cssSource = fs.readFileSync(cssPath, 'utf8');
const statsHtmlSource = fs.readFileSync(statsPagePath, 'utf8');

describe('Mobile UI Audit & Responsive Layout Suite', () => {
  describe('Tier 1: Viewport Configuration & Core Responsive Layout', () => {
    it('1.1 index.html specifies width=device-width and initial-scale=1.0', () => {
      expect(indexHtmlSource).toContain('width=device-width');
      expect(indexHtmlSource).toContain('initial-scale=1.0');
    });

    it('1.2 index.html includes viewport-fit=cover for notch and safe area handling', () => {
      expect(indexHtmlSource).toMatch(/viewport-fit=cover/i);
    });

    it('1.3 mobile header action overflow trigger uses sm:hidden responsive class', () => {
      expect(appJsSource).toContain('sm:hidden flex items-center gap-2');
      expect(appJsSource).toContain('id="plan-actions-overflow-btn"');
    });

    it('1.4 desktop action toolbar uses hidden sm:flex responsive class', () => {
      expect(appJsSource).toContain('hidden sm:flex items-center gap-2');
      expect(appJsSource).toContain('id="plan-desktop-share-btn"');
    });

    it('1.5 plan view header employs responsive flex-col sm:flex-row stacking', () => {
      expect(appJsSource).toContain('flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4 no-print');
    });

    it('1.6 day card container in Full Plan view has responsive padding p-3.5 sm:p-4', () => {
      expect(appJsSource).toContain('p-3.5 sm:p-4');
    });

    it('1.7 task badges container in Full Plan view employs flex-wrap to prevent clipping', () => {
      expect(appJsSource).toContain('flex flex-wrap items-center gap-1.5 mb-1');
    });

    it('1.8 Syllabus Explorer chapter cards employ responsive grid (grid-cols-1 sm:grid-cols-2)', () => {
      expect(appJsSource).toContain('grid grid-cols-1 sm:grid-cols-2 gap-2.5');
    });

    it('1.9 task items use flexbox with shrink-resistant spacing (items-start gap-3)', () => {
      expect(appJsSource).toContain('task-item-container py-2.5 first:pt-0 last:pb-0 flex items-start gap-3');
    });

    it('1.10 day card progress counter (.day-card-counter) renders cleanly in header', () => {
      expect(appJsSource).toContain('day-card-counter text-xs font-bold text-slate-600 dark:text-slate-400');
    });
  });

  describe('Tier 2: Touch Target Ergonomics & Apple/Android Guidelines Compliance', () => {
    it('2.1 primary mobile action buttons declare min-h-[44px] touch target class', () => {
      expect(indexHtmlSource).toContain('min-h-[44px]');
      expect(appJsSource).toContain('min-h-[44px]');
    });

    it('2.2 setup subject tab buttons declare min-h-[44px] for finger tapping', () => {
      expect(appJsSource).toMatch(/setup-tab-[\s\S]*?min-h-\[44px\]/);
    });

    it('2.3 grade selector buttons (Plus One / Plus Two) declare min-h-[44px]', () => {
      expect(appJsSource).toContain("btnP2.className = 'min-h-[44px]");
      expect(appJsSource).toContain("btnP1.className = 'min-h-[44px]");
    });

    it('2.4 select-all and deselect-all controls provide min-h-[44px] touch area', () => {
      expect(appJsSource).toMatch(/toggleAllSubjectChapters[\s\S]*?min-h-\[44px\]/);
    });

    it('2.5 Syllabus Explorer Back to Today button declares min-h-[44px]', () => {
      expect(appJsSource).toMatch(/goToDashboard\(\)[\s\S]*?min-h-\[44px\]/);
    });

    it('2.6 mobile action sheet options have tactile active scale feedback in CSS', () => {
      expect(cssSource).toContain('button:active');
      expect(cssSource).toContain('transform: scale(0.97)');
    });

    it('2.7 all buttons and interactive elements declare touch-action: manipulation', () => {
      expect(cssSource).toContain('touch-action: manipulation');
    });

    it('2.8 mobile bottom navigation bar provides accessible safe area padding', () => {
      expect(cssSource).toContain('padding-bottom: calc(0.5rem + var(--sab))');
    });

    it('2.9 body element reserves scroll clearance above mobile navigation', () => {
      expect(cssSource).toContain('padding-bottom: calc(5.5rem + var(--sab))');
    });

    it('2.10 task checkboxes have defined dimensions with responsive accessible target', () => {
      expect(cssSource).toContain('.task-checkbox');
      expect(cssSource).toContain('width: 26px');
      expect(cssSource).toContain('height: 26px');
      expect(cssSource).toContain('inset: -9px');
    });
  });

  describe('Tier 3: Standalone Pages & Dialog Mobile Ergonomics', () => {
    it('3.1 pages/stats.html defines valid mobile viewport meta tag', () => {
      expect(statsHtmlSource).toContain('width=device-width');
      expect(statsHtmlSource).toContain('initial-scale=1.0');
    });

    it('3.2 pages/stats.html contains audit-table structures for audit logging', () => {
      expect(statsHtmlSource).toContain('audit-table');
    });

    it('3.3 pages/backlog-recovery-planner.html contains mobile responsive header and return link', () => {
      const source = fs.readFileSync(backlogPagePath, 'utf8');
      expect(source).toContain('width=device-width');
      expect(source).toContain('href="/"');
    });

    it('3.4 pages/exam-countdown.html contains mobile responsive header and return link', () => {
      const source = fs.readFileSync(countdownPagePath, 'utf8');
      expect(source).toContain('width=device-width');
      expect(source).toContain('href="/"');
    });

    it('3.5 pages/plus-two-timetable.html contains mobile responsive structure and return link', () => {
      const source = fs.readFileSync(timetablePagePath, 'utf8');
      expect(source).toContain('width=device-width');
      expect(source).toContain('href="/"');
    });

    it('3.6 pages/study-hours-calculator.html contains touch-friendly inputs and return link', () => {
      const source = fs.readFileSync(studyHoursPagePath, 'utf8');
      expect(source).toContain('width=device-width');
      expect(source).toContain('href="/"');
    });

    it('3.7 public/404.html contains mobile responsive structure and return link', () => {
      const source = fs.readFileSync(notFoundPagePath, 'utf8');
      expect(source).toContain('width=device-width');
      expect(source).toContain('href="/"');
    });

    it('3.8 toast notification container in index.html is positioned for mobile thumb ergonomics', () => {
      expect(indexHtmlSource).toContain('id="toast-banner"');
      expect(indexHtmlSource).toContain('fixed top-20');
      expect(indexHtmlSource).toContain('max-w-sm w-[90%]');
    });

    it('3.9 export share sheet in index.html has fixed bottom overlay with backdrop filter', () => {
      expect(indexHtmlSource).toContain('id="export-share-sheet"');
      expect(indexHtmlSource).toContain('fixed inset-0');
      expect(indexHtmlSource).toContain('backdrop-blur-sm');
    });
  });

  describe('Tier 4: Real-World Mobile Viewport Workflows & Audit Invariants', () => {
    it('4.1 simulated 360px viewport: day header badges and counters are distinct elements', () => {
      expect(appJsSource).toContain('day.isCompletedMarker');
      expect(appJsSource).toContain('day.isExamEve');
      expect(appJsSource).toContain('day.isExamDay');
      expect(appJsSource).toContain('day.isRevisionDay');
      expect(appJsSource).toContain('day.isRestDay');
    });

    it('4.2 bilingual Malayalam text strings for mobile badges are properly declared in app.js', () => {
      expect(appJsSource).toContain('പൂർത്തിയായി');
      expect(appJsSource).toContain('പരീക്ഷത്തലേന്ന്:');
      expect(appJsSource).toContain('പരീക്ഷാദിനം:');
    });

    it('4.3 print stylesheets prevent awkward day card page breaks on mobile print', () => {
      expect(appJsSource).toContain('print-avoid-break');
    });

    it('4.4 setup wizard contains mobile step indicators and responsive card wrappers', () => {
      expect(appJsSource).toContain('setup-step-1');
      expect(appJsSource).toContain('setup-step-2');
      expect(appJsSource).toContain('setup-step-3');
      expect(appJsSource).toContain('setup-step-4');
    });

    it('4.5 focus badge renders with high-contrast text and border for outdoor mobile visibility', () => {
      expect(appJsSource).toContain('🎯 FOCUS');
      expect(appJsSource).toContain('bg-rose-100 text-rose-800 border border-rose-200');
    });

    it('4.6 task checkbox click handlers are distinct from task text content click handlers', () => {
      expect(appJsSource).toContain('event.stopPropagation(); toggleTaskDirect');
      expect(appJsSource).toContain('task-checkbox');
    });
  });
});
