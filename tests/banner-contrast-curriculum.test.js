import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import {
  renderDashboardRestoreBanner,
  dismissDashboardRestoreBanner
} from '../src/app.js';
import { PLUS_ONE_SYLLABUS } from '../src/data/syllabus-plus-one.js';
import { PLUS_TWO_SYLLABUS } from '../src/data/syllabus-plus-two.js';

function createMockStorage() {
  const store = new Map();
  return {
    getItem: (key) => (store.has(key) ? store.get(key) : null),
    setItem: (key, val) => store.set(key, String(val)),
    removeItem: (key) => store.delete(key),
    clear: () => store.clear(),
    has: (key) => store.has(key)
  };
}

describe('Banner Lifecycle, Contrast & Universal Curriculum Verification', () => {
  let originalLocalStorage;
  let originalSessionStorage;
  let originalDocument;

  beforeEach(() => {
    originalLocalStorage = global.localStorage;
    originalSessionStorage = global.sessionStorage;
    originalDocument = global.document;

    global.localStorage = createMockStorage();
    global.sessionStorage = createMockStorage();
    global.document = {
      getElementById: (id) => ({
        id,
        remove: () => {}
      })
    };
  });

  afterEach(() => {
    global.localStorage = originalLocalStorage;
    global.sessionStorage = originalSessionStorage;
    global.document = originalDocument;
  });

  describe('1. Restore Banner Lifecycle', () => {
    it('shows the restore pop-up for the first time after making a new schedule/reset', () => {
      const snapshot = {
        state: { plan: [{ date: '2026-11-04', tasks: [{ id: 1, name: 'Task 1' }] }] },
        resetAt: '2026-11-04T20:32:00.000Z',
        formattedDate: 'Nov 4, 2026',
        formattedTime: '08:32 PM',
        stream: 'cs',
        completedCount: 3
      };
      global.localStorage.setItem('mpt_pre_reset_snapshot', JSON.stringify(snapshot));

      // 1st render: Should show full restore pop-up with "Restore Timetable"
      const firstHtml = renderDashboardRestoreBanner();
      expect(firstHtml).toContain('dashboard-restore-banner');
      expect(firstHtml).toContain('Yesterday\'s Reset Timetable Available');
      expect(firstHtml).toContain('Restore Timetable');
      expect(firstHtml).toContain('restorePreResetSnapshot()');

      // Seen flag should have been marked in localStorage
      expect(global.localStorage.getItem('mpt_restore_banner_seen_2026-11-04T20:32:00.000Z')).toBe('true');

      // 2nd render (subsequent visits): Transitions to Settings button bar
      const secondHtml = renderDashboardRestoreBanner();
      expect(secondHtml).toContain('dashboard-restore-banner');
      expect(secondHtml).toContain('Settings');
      expect(secondHtml).toContain('openSettingsModal()');
      expect(secondHtml).not.toContain('Yesterday\'s Reset Timetable Available');
    });

    it('persists dismissal across sessions when user clicks dismiss', () => {
      const snapshot = {
        state: { plan: [{ date: '2026-11-04', tasks: [{ id: 1 }] }] },
        resetAt: '2026-11-04T20:32:00.000Z',
        stream: 'bio'
      };
      global.localStorage.setItem('mpt_pre_reset_snapshot', JSON.stringify(snapshot));

      const firstHtml = renderDashboardRestoreBanner();
      expect(firstHtml).not.toBe('');

      // User dismisses banner
      dismissDashboardRestoreBanner();

      expect(global.localStorage.getItem('mpt_restore_banner_dismissed_2026-11-04T20:32:00.000Z')).toBe('true');
      expect(global.sessionStorage.getItem('mpt_dismissed_restore_banner')).toBe('true');

      // Subsequent renders must be empty
      expect(renderDashboardRestoreBanner()).toBe('');

      // Even if sessionStorage is cleared (simulating new browser session), localStorage blocks it
      global.sessionStorage.clear();
      expect(renderDashboardRestoreBanner()).toBe('');
    });

    it('shows a fresh reset banner when a brand new reset snapshot is created', () => {
      const oldSnapshot = {
        state: { plan: [{ date: '2026-11-04', tasks: [{ id: 1 }] }] },
        resetAt: '2026-11-04T20:32:00.000Z'
      };
      global.localStorage.setItem('mpt_pre_reset_snapshot', JSON.stringify(oldSnapshot));
      dismissDashboardRestoreBanner();
      expect(renderDashboardRestoreBanner()).toBe('');

      // New reset occurs!
      const newSnapshot = {
        state: { plan: [{ date: '2026-11-06', tasks: [{ id: 2 }] }] },
        resetAt: '2026-11-06T10:00:00.000Z'
      };
      global.localStorage.setItem('mpt_pre_reset_snapshot', JSON.stringify(newSnapshot));
      global.sessionStorage.clear();

      // Fresh snapshot shows reset pop-up for the first time
      const freshHtml = renderDashboardRestoreBanner();
      expect(freshHtml).toContain('Restore Timetable');
    });
  });

  describe('2. Modal Readability & Theme Contrast Invariants', () => {
    it('verifies index.html #regenerate-modal has high-contrast dark and light classes', () => {
      const indexHtml = fs.readFileSync(path.resolve('index.html'), 'utf8');
      expect(indexHtml).toContain('id="regenerate-modal"');
      expect(indexHtml).toContain('dark:bg-[#0e1526]');
      expect(indexHtml).toContain('text-slate-900 dark:text-white');
      expect(indexHtml).toContain('text-slate-600 dark:text-slate-300');
      expect(indexHtml).toContain('dark:text-amber-200');
      expect(indexHtml).toContain('dark:text-blue-200');
      expect(indexHtml).toContain('dark:text-emerald-200');
      expect(indexHtml).toContain('dark:text-rose-200');
    });

    it('verifies style.css contains explicit dark mode override rules for #regenerate-modal', () => {
      const css = fs.readFileSync(path.resolve('src/style.css'), 'utf8');
      expect(css).toContain('html.dark #regenerate-modal');
      expect(css).toContain('html.dark #regenerate-modal select');
      expect(css).toContain('color: #fef08a !important;');
      expect(css).toContain('color: #bfdbfe !important;');
      expect(css).toContain('color: #a7f3d0 !important;');
      expect(css).toContain('color: #fecdd3 !important;');
    });
  });

  describe('3. Comprehensive Plus One & Plus Two Curriculum Coverage', () => {
    const requiredSubjects = [
      'Physics',
      'Chemistry',
      'Mathematics',
      'Computer Science',
      'Botany',
      'Zoology',
      'Accountancy',
      'Business Studies',
      'Economics',
      'Computer Applications',
      'History',
      'Political Science',
      'Sociology'
    ];

    it('confirms both Plus One and Plus Two syllabus datasets include all 13 subjects across Science, Commerce, and Humanities', () => {
      const p1Subjects = new Set(PLUS_ONE_SYLLABUS.map(c => c.subject));
      const p2Subjects = new Set(PLUS_TWO_SYLLABUS.map(c => c.subject));

      for (const sub of requiredSubjects) {
        expect(p1Subjects.has(sub)).toBe(true);
        expect(p2Subjects.has(sub)).toBe(true);
      }
    });

    it('verifies auxiliary pages exist and provide Plus One and Plus Two coverage', () => {
      expect(fs.existsSync(path.resolve('pages/syllabus-plus-two.html'))).toBe(true);
      expect(fs.existsSync(path.resolve('pages/syllabus-plus-one.html'))).toBe(true);
      expect(fs.existsSync(path.resolve('pages/exam-countdown.html'))).toBe(true);
      expect(fs.existsSync(path.resolve('pages/study-hours-calculator.html'))).toBe(true);
      expect(fs.existsSync(path.resolve('pages/backlog-recovery-planner.html'))).toBe(true);

      const p1Html = fs.readFileSync(path.resolve('pages/syllabus-plus-one.html'), 'utf8');
      const p2Html = fs.readFileSync(path.resolve('pages/syllabus-plus-two.html'), 'utf8');
      expect(p1Html).toContain('Plus One (+1 / Class 11)');
      expect(p2Html).toContain('Plus Two (+2 / Class 12)');

      const countdownHtml = fs.readFileSync(path.resolve('pages/exam-countdown.html'), 'utf8');
      expect(countdownHtml).toContain('grade-btn');
      expect(countdownHtml).toContain('data-grade="+1"');
      expect(countdownHtml).toContain('data-grade="+2"');
      expect(countdownHtml).toContain('data-stream="science_cs"');
      expect(countdownHtml).toContain('data-stream="science_bio"');
      expect(countdownHtml).toContain('data-stream="commerce"');
      expect(countdownHtml).toContain('data-stream="humanities"');

      const calcHtml = fs.readFileSync(path.resolve('pages/study-hours-calculator.html'), 'utf8');
      expect(calcHtml).toContain('setCalcPresetGrade');
      expect(calcHtml).toContain('setCalcPresetStream');
    });
  });
});
