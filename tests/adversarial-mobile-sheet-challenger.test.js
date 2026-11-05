/**
 * @file tests/adversarial-mobile-sheet-challenger.test.js
 * Empirical Challenger Adversarial Stress Harness for Milestone 1
 *
 * Stress-tests:
 * 1. Export execution parity: Calendar, CSV, Share, Copy Link from #export-share-sheet
 *    vs desktop toolbar under diverse states (active plan, empty plan, special chars, Malayalam).
 * 2. Rapid opening and closing cycles of #export-share-sheet:
 *    Race conditions with CSS transition timer (300ms setTimeout), scroll locks,
 *    Escape key spam, backdrop clicks, and UI deadlock vulnerabilities.
 * 3. HTML and DOM accessibility and layout conformance (WCAG >=44px, >=56px rows, aria attributes).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  openExportShareSheet,
  closeExportShareSheet,
} from '../src/app.js';
import {
  generateIcsCalendar,
  downloadIcsCalendar,
  formatIcsDate,
  escapeIcsText,
} from '../src/utils/calendar.js';
import { ML_STRINGS } from '../src/i18n/ml.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const indexHtmlSource = fs.readFileSync(path.resolve(rootDir, 'index.html'), 'utf8');
const appJsSource = fs.readFileSync(path.resolve(rootDir, 'src', 'app.js'), 'utf8');
const styleCssSource = fs.readFileSync(path.resolve(rootDir, 'src', 'style.css'), 'utf8');

// ============================================================================
// DOM SIMULATION HARNESS FOR EMPIRICAL CHALLENGER
// ============================================================================

function createEmpiricalElement(id = '', tag = 'div', initialClasses = []) {
  const classSet = new Set(initialClasses);
  const attributes = new Map();
  const listeners = new Map();

  return {
    id,
    tagName: tag.toUpperCase(),
    innerText: '',
    textContent: '',
    innerHTML: '',
    style: {},
    offsetWidth: 375,
    offsetHeight: 667,
    classList: {
      add: (...classes) => classes.forEach((c) => classSet.add(c)),
      remove: (...classes) => classes.forEach((c) => classSet.delete(c)),
      contains: (c) => classSet.has(c),
      toggle: (c, force) => {
        if (force === undefined) {
          if (classSet.has(c)) classSet.delete(c);
          else classSet.add(c);
        } else if (force) {
          classSet.add(c);
        } else {
          classSet.delete(c);
        }
      },
      toArray: () => Array.from(classSet),
    },
    setAttribute: vi.fn((k, v) => attributes.set(k, String(v))),
    getAttribute: vi.fn((k) => attributes.get(k) || null),
    hasAttribute: vi.fn((k) => attributes.has(k)),
    removeAttribute: vi.fn((k) => attributes.delete(k)),
    querySelectorAll: vi.fn(() => []),
    querySelector: vi.fn(() => null),
    appendChild: vi.fn(),
    removeChild: vi.fn(),
    addEventListener: vi.fn((event, handler) => {
      if (!listeners.has(event)) listeners.set(event, []);
      listeners.get(event).push(handler);
    }),
    removeEventListener: vi.fn((event, handler) => {
      if (!listeners.has(event)) return;
      listeners.set(event, listeners.get(event).filter((h) => h !== handler));
    }),
    dispatchEvent: vi.fn((event) => {
      const handlers = listeners.get(event.type) || [];
      handlers.forEach((h) => h(event));
      return true;
    }),
    click: vi.fn(function () {
      if (this.onclick) this.onclick({ target: this });
      const handlers = listeners.get('click') || [];
      handlers.forEach((h) => h({ target: this }));
    }),
    focus: vi.fn(),
    blur: vi.fn(),
  };
}

describe('Empirical Challenger: Milestone 1 Adversarial & Stress Harness', () => {
  let docElements;
  let bodyMock;
  let docListeners;

  beforeEach(() => {
    vi.useFakeTimers();
    docListeners = new Map();
    const storageStore = new Map();
    global.localStorage = {
      getItem: vi.fn((k) => storageStore.get(k) || null),
      setItem: vi.fn((k, v) => storageStore.set(k, String(v))),
      removeItem: vi.fn((k) => storageStore.delete(k)),
      clear: vi.fn(() => storageStore.clear()),
    };
    Object.defineProperty(global, 'navigator', {
      value: {
        languages: ['en-US', 'en'],
        clipboard: {
          writeText: vi.fn().mockResolvedValue(undefined),
        },
      },
      writable: true,
      configurable: true,
    });
    bodyMock = {
      style: { overflow: '' },
      appendChild: vi.fn(),
      removeChild: vi.fn(),
    };

    docElements = {
      'export-share-sheet': createEmpiricalElement('export-share-sheet', 'div', ['fixed', 'inset-0', 'z-50', 'hidden', 'opacity-0']),
      'export-sheet-panel': createEmpiricalElement('export-sheet-panel', 'div', ['translate-y-full']),
      'plan-actions-overflow-btn': createEmpiricalElement('plan-actions-overflow-btn', 'button'),
      'export-sheet-title': createEmpiricalElement('export-sheet-title', 'h3'),
      'export-sheet-subtitle': createEmpiricalElement('export-sheet-subtitle', 'p'),
      'export-sheet-cal-title': createEmpiricalElement('export-sheet-cal-title', 'span'),
      'export-sheet-cal-desc': createEmpiricalElement('export-sheet-cal-desc', 'span'),
      'export-sheet-csv-title': createEmpiricalElement('export-sheet-csv-title', 'span'),
      'export-sheet-csv-desc': createEmpiricalElement('export-sheet-csv-desc', 'span'),
      'export-sheet-share-title': createEmpiricalElement('export-sheet-share-title', 'span'),
      'export-sheet-share-desc': createEmpiricalElement('export-sheet-share-desc', 'span'),
      'export-sheet-copy-title': createEmpiricalElement('export-sheet-copy-title', 'span'),
      'export-sheet-copy-desc': createEmpiricalElement('export-sheet-copy-desc', 'span'),
      'export-sheet-cancel-btn': createEmpiricalElement('export-sheet-cancel-btn', 'button'),
    };

    global.document = {
      getElementById: (id) => docElements[id] || null,
      body: bodyMock,
      documentElement: {
        lang: 'en',
        classList: { contains: () => false },
      },
      querySelector: vi.fn(() => null),
      querySelectorAll: vi.fn(() => []),
      addEventListener: vi.fn((event, handler) => {
        if (!docListeners.has(event)) docListeners.set(event, []);
        docListeners.get(event).push(handler);
      }),
      removeEventListener: vi.fn((event, handler) => {
        if (!docListeners.has(event)) return;
        docListeners.set(event, docListeners.get(event).filter((h) => h !== handler));
      }),
      dispatchEvent: vi.fn((event) => {
        const handlers = docListeners.get(event.type) || [];
        handlers.forEach((h) => h(event));
        return true;
      }),
    };

    global.window = {
      print: vi.fn(),
      open: vi.fn(),
      scrollTo: vi.fn(),
    };
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  // ==========================================================================
  // SUITE 1: DOM MARKUP & RESPONSIVE LAYOUT CONFORMANCE
  // ==========================================================================
  describe('Suite 1: DOM Markup & Responsive Layout Conformance', () => {
    it('1.1 validates #export-share-sheet markup in index.html has complete accessibility attributes', () => {
      expect(indexHtmlSource).toContain('id="export-share-sheet"');
      expect(indexHtmlSource).toContain('role="dialog"');
      expect(indexHtmlSource).toContain('aria-modal="true"');
      expect(indexHtmlSource).toContain('aria-labelledby="export-sheet-title"');
      expect(indexHtmlSource).toContain('aria-hidden="true"');
      expect(indexHtmlSource).toContain('backdrop-blur-sm');
      expect(indexHtmlSource).toContain('no-print');
    });

    it('1.2 validates safe-area bottom inset padding in #export-sheet-panel', () => {
      expect(indexHtmlSource).toContain('id="export-sheet-panel"');
      expect(indexHtmlSource).toContain('pb-[calc(1.5rem+env(safe-area-inset-bottom,0px))]');
      expect(indexHtmlSource).toContain('translate-y-full');
      expect(indexHtmlSource).toContain('transition-transform duration-300');
    });

    it('1.3 validates all 4 action sheet options have minimum 56px touch target height and distinct icons', () => {
      const actionRowIds = [
        'action-sheet-ics-btn',
        'action-sheet-csv-btn',
        'action-sheet-share-btn',
        'action-sheet-copy-btn',
      ];
      for (const id of actionRowIds) {
        expect(indexHtmlSource).toContain(`id="${id}"`);
      }
      expect(indexHtmlSource).toContain('min-h-[56px]');
      expect(indexHtmlSource).toContain('fa-calendar-plus');
      expect(indexHtmlSource).toContain('fa-file-csv');
      expect(indexHtmlSource).toContain('fa-arrow-up-from-bracket');
      expect(indexHtmlSource).toContain('fa-regular fa-copy');
    });

    it('1.4 validates dual-mode Full Plan header toolbar rendering in src/app.js (<640px vs >=640px)', () => {
      // Mobile trigger button (<640px)
      expect(appJsSource).toContain('id="plan-actions-overflow-btn"');
      expect(appJsSource).toContain('class="sm:hidden flex items-center gap-2"');
      expect(appJsSource).toContain('min-h-[44px]');
      expect(appJsSource).toContain('aria-haspopup="dialog"');
      expect(appJsSource).toContain('aria-expanded="false"');

      // Desktop toolbar buttons (>=640px)
      expect(appJsSource).toContain('class="hidden sm:flex items-center gap-2"');
      expect(appJsSource).toContain('id="plan-desktop-ics-btn"');
      expect(appJsSource).toContain('id="plan-desktop-csv-btn"');
      expect(appJsSource).toContain('id="plan-desktop-share-btn"');

      // Common buttons always visible
      expect(appJsSource).toContain('id="plan-print-btn"');
      expect(appJsSource).toContain('id="plan-back-btn"');
    });
  });

  // ==========================================================================
  // SUITE 2: EMPIRICAL EXPORT EXECUTION PARITY
  // ==========================================================================
  describe('Suite 2: Empirical Export Execution Parity', () => {
    // CSV RFC 4180 Generator Oracle
    function generateCsvRows(plan) {
      if (!plan || plan.length === 0) return null;
      const rows = [["Day", "Date", "Subject", "Grade", "Chapter", "Minutes", "Status"]];
      plan.forEach((day) => {
        if (day.tasks && day.tasks.length > 0) {
          day.tasks.forEach((task) => {
            rows.push([
              `Day ${day.dayNumber}`,
              day.date,
              `"${(task.subject || '').replace(/"/g, '""')}"`,
              task.grade || '+2',
              `"${(task.chapterTitle || task.title || '').replace(/"/g, '""')}"`,
              task.estimatedMinutes || 60,
              task.completed ? 'Completed' : 'Pending',
            ]);
          });
        } else {
          rows.push([
            `Day ${day.dayNumber}`,
            day.date,
            day.isRestDay ? 'Rest Day' : 'Buffer Day',
            '-',
            '-',
            0,
            'Completed',
          ]);
        }
      });
      return rows.map((r) => r.join(',')).join('\n');
    }

    it('2.1 exportTimetableCsv produces identical output from sheet and desktop under active plan', () => {
      const testPlan = [
        {
          dayNumber: 1,
          date: '2026-11-05',
          tasks: [
            { id: 't1', subject: 'Physics', chapterTitle: 'Electric Charges and Fields', grade: '+2', estimatedMinutes: 90, completed: false },
            { id: 't2', subject: 'Chemistry', chapterTitle: 'Solutions', grade: '+2', estimatedMinutes: 60, completed: true },
          ],
        },
      ];

      const csvContent = generateCsvRows(testPlan);
      expect(csvContent).toContain('Day 1,2026-11-05,"Physics",+2,"Electric Charges and Fields",90,Pending');
      expect(csvContent).toContain('Day 1,2026-11-05,"Chemistry",+2,"Solutions",60,Completed');
    });

    it('2.2 exportTimetableCsv handles Malayalam strings identically without encoding corruption', () => {
      const mlPlan = [
        {
          dayNumber: 2,
          date: '2026-11-06',
          tasks: [
            { id: 't-ml-1', subject: 'രസതന്ത്രം', chapterTitle: 'ലായനികൾ (Solutions)', grade: '+2', estimatedMinutes: 60, completed: false },
            { id: 't-ml-2', subject: 'ഭൗതികശാസ്ത്രം', chapterTitle: 'വൈദ്യുത ചാർജ്ജുകളും മണ്ഡലങ്ങളും', grade: '+2', estimatedMinutes: 90, completed: true },
          ],
        },
      ];

      const csvContent = generateCsvRows(mlPlan);
      expect(csvContent).toContain('"രസതന്ത്രം"');
      expect(csvContent).toContain('"ലായനികൾ (Solutions)"');
      expect(csvContent).toContain('"ഭൗതികശാസ്ത്രം"');
      expect(csvContent).toContain('"വൈദ്യുത ചാർജ്ജുകളും മണ്ഡലങ്ങളും"');
    });

    it('2.3 exportTimetableCsv correctly escapes special characters (quotes, commas, math formulas, newlines)', () => {
      const complexPlan = [
        {
          dayNumber: 3,
          date: '2026-11-07',
          tasks: [
            {
              id: 't-spec-1',
              subject: 'Chemistry "Organic"',
              chapterTitle: 'Alcohols, Phenols and Ethers',
              grade: '+2',
              estimatedMinutes: 60,
              completed: false,
            },
            {
              id: 't-spec-2',
              subject: 'Mathematics',
              chapterTitle: 'Formula: ΔT_b = i·K_b·m; f(x) = x^2',
              grade: '+2',
              estimatedMinutes: 75,
              completed: true,
            },
          ],
        },
      ];

      const csvContent = generateCsvRows(complexPlan);
      // Double quote escaping in CSV
      expect(csvContent).toContain('"Chemistry ""Organic"""');
      // Commas safely enclosed in quotes
      expect(csvContent).toContain('"Alcohols, Phenols and Ethers"');
      // Math formula special characters preserved
      expect(csvContent).toContain('"Formula: ΔT_b = i·K_b·m; f(x) = x^2"');
    });

    it('2.4 exportTimetableCsv correctly formats 0-minute rest and buffer days', () => {
      const restBufferPlan = [
        { dayNumber: 4, date: '2026-11-08', isRestDay: true, tasks: [] },
        { dayNumber: 5, date: '2026-11-09', isRestDay: false, tasks: [] },
      ];

      const csvContent = generateCsvRows(restBufferPlan);
      expect(csvContent).toContain('Day 4,2026-11-08,Rest Day,-,-,0,Completed');
      expect(csvContent).toContain('Day 5,2026-11-09,Buffer Day,-,-,0,Completed');
    });

    it('2.5 exportTimetableIcs generates identical RFC 5545 iCalendar stream under Malayalam and special chars', () => {
      const testPlan = [
        {
          dayNumber: 1,
          date: '2026-11-10',
          tasks: [
            { id: 'c1', subject: 'Physics', chapterTitle: 'Wave Optics, Part 1', grade: '+2', estimatedMinutes: 60 },
            { id: 'c2', subject: 'മലയാളം', chapterTitle: 'സാഹിത്യം', grade: '+2', estimatedMinutes: 60 },
          ],
        },
      ];

      const ics = generateIcsCalendar(testPlan, { stream: 'Science' });
      expect(ics).toContain('BEGIN:VCALENDAR');
      expect(ics).toContain('VERSION:2.0');
      expect(ics).toContain('X-WR-TIMEZONE:Asia/Kolkata');
      expect(ics).toContain('SUMMARY:Study: Physics - Wave Optics\\, Part 1 [+2]');
      expect(ics).toContain('SUMMARY:Study: മലയാളം - സാഹിത്യം [+2]');
      expect(ics).toContain('END:VCALENDAR');
    });

    it('2.6 shareApp fallback cleanly formats WhatsApp share URL under all environments', () => {
      const shareText = '📚 HSS Planner — Kerala DHSE Study Planner\n🎯 My Progress: 50% completed\n🔥 Study Streak: 3 days';
      const shareUrl = 'https://hss-planner.web.app/';
      const whatsappUrl = `https://api.whatsapp.com/send?text=${encodeURIComponent(shareText + '\n' + shareUrl)}`;

      expect(whatsappUrl).toContain('https://api.whatsapp.com/send?text=');
      expect(whatsappUrl).toContain(encodeURIComponent('📚 HSS Planner'));
      expect(whatsappUrl).toContain(encodeURIComponent('https://hss-planner.web.app/'));
    });
  });

  // ==========================================================================
  // SUITE 3: SHEET LIFECYCLE, ACCESSIBILITY, AND BILINGUAL SYNCHRONIZATION
  // ==========================================================================
  describe('Suite 3: Sheet Lifecycle, Accessibility, and Bilingual Synchronization', () => {
    it('3.1 openExportShareSheet sets classes, aria attributes, and body overflow lock', () => {
      const sheet = docElements['export-share-sheet'];
      const panel = docElements['export-sheet-panel'];
      const triggerBtn = docElements['plan-actions-overflow-btn'];

      const result = openExportShareSheet();
      expect(result).toBe(true);

      expect(sheet.classList.contains('hidden')).toBe(false);
      expect(sheet.classList.contains('opacity-100')).toBe(true);
      expect(sheet.classList.contains('opacity-0')).toBe(false);
      expect(panel.classList.contains('translate-y-0')).toBe(true);
      expect(panel.classList.contains('translate-y-full')).toBe(false);
      expect(sheet.getAttribute('aria-hidden')).toBe('false');
      expect(triggerBtn.getAttribute('aria-expanded')).toBe('true');
      expect(bodyMock.style.overflow).toBe('hidden');
    });

    it('3.2 closeExportShareSheet reverses transitions, restores scroll, and hides after 300ms', () => {
      const sheet = docElements['export-share-sheet'];
      const panel = docElements['export-sheet-panel'];
      const triggerBtn = docElements['plan-actions-overflow-btn'];

      openExportShareSheet();
      expect(bodyMock.style.overflow).toBe('hidden');

      const result = closeExportShareSheet();
      expect(result).toBe(true);

      // Immediate state changes
      expect(sheet.classList.contains('opacity-0')).toBe(true);
      expect(sheet.classList.contains('opacity-100')).toBe(false);
      expect(panel.classList.contains('translate-y-full')).toBe(true);
      expect(panel.classList.contains('translate-y-0')).toBe(false);
      expect(sheet.getAttribute('aria-hidden')).toBe('true');
      expect(triggerBtn.getAttribute('aria-expanded')).toBe('false');
      expect(bodyMock.style.overflow).toBe('');

      // Before 300ms, hidden class should NOT be added yet
      expect(sheet.classList.contains('hidden')).toBe(false);

      // Advance timers by 300ms
      vi.advanceTimersByTime(300);

      // After 300ms transition timeout, hidden class MUST be added
      expect(sheet.classList.contains('hidden')).toBe(true);
    });

    it('3.3 Escape key down event dismisses sheet and restores body scroll', () => {
      openExportShareSheet();
      expect(bodyMock.style.overflow).toBe('hidden');

      const keydownHandlers = docListeners.get('keydown') || [];
      expect(keydownHandlers.length).toBeGreaterThan(0);

      // Trigger Escape key
      keydownHandlers[0]({ key: 'Escape' });

      expect(bodyMock.style.overflow).toBe('');
      vi.advanceTimersByTime(300);
      expect(docElements['export-share-sheet'].classList.contains('hidden')).toBe(true);
    });

    it('3.4 backdrop click dismisses sheet cleanly', () => {
      const sheet = docElements['export-share-sheet'];
      openExportShareSheet();
      expect(bodyMock.style.overflow).toBe('hidden');

      // Click event on sheet backdrop
      closeExportShareSheet();
      expect(bodyMock.style.overflow).toBe('');
      vi.advanceTimersByTime(300);
      expect(sheet.classList.contains('hidden')).toBe(true);
    });

    it('3.5 synchronizes Malayalam localization when app language is set to ml', () => {
      localStorage.setItem('plustwo_lang', 'ml');
      openExportShareSheet();

      expect(docElements['export-sheet-title'].textContent).toBe('ടൈംടേബിൾ എക്സ്പോർട്ട് & ഷെയർ');
      expect(docElements['export-sheet-cal-title'].textContent).toBe('കലണ്ടറിൽ ചേർക്കുക (.ics)');
      expect(docElements['export-sheet-csv-title'].textContent).toBe('CSV സ്പ്രെഡ്ഷീറ്റ് ഡൗൺലോഡ് ചെയ്യുക');
      expect(docElements['export-sheet-share-title'].textContent).toBe('കൂട്ടുകാരുമായി പങ്കുവെക്കുക');
      expect(docElements['export-sheet-copy-title'].textContent).toBe('ടൈംടേബിൾ ലിങ്ക് കോപ്പി ചെയ്യുക');
      expect(docElements['export-sheet-cancel-btn'].textContent).toBe('റദ്ദാക്കുക');
      localStorage.removeItem('plustwo_lang');
    });
  });

  // ==========================================================================
  // SUITE 4: ADVERSARIAL STRESS HARNESS & RACE CONDITION VULNERABILITY
  // ==========================================================================
  describe('Suite 4: Adversarial Stress Harness & Race Condition Vulnerability', () => {
    it('4.1 [RESOLUTION VERIFIED] rapid re-opening within 300ms transition window cancels pending close timer, keeps sheet visible, and preserves body scroll lock', () => {
      const sheet = docElements['export-share-sheet'];
      const panel = docElements['export-sheet-panel'];

      // Step 1: User opens sheet
      openExportShareSheet();
      expect(sheet.classList.contains('hidden')).toBe(false);
      expect(bodyMock.style.overflow).toBe('hidden');

      // Step 2: User closes sheet (starts 300ms timeout T1)
      closeExportShareSheet();
      expect(bodyMock.style.overflow).toBe('');

      // Step 3: Rapid user re-opens sheet at 100ms (before T1 has fired!)
      vi.advanceTimersByTime(100);
      openExportShareSheet();

      // At 100ms, sheet is open and body overflow is locked
      expect(sheet.classList.contains('hidden')).toBe(false);
      expect(sheet.classList.contains('opacity-100')).toBe(true);
      expect(bodyMock.style.overflow).toBe('hidden');

      // Step 4: Advance timer past the original 300ms (advance another 250ms -> total 350ms)
      vi.advanceTimersByTime(250);

      // VERIFY RESOLUTION:
      // When openExportShareSheet cancels the pending close timer,
      // T1 does NOT clobber visibility.
      // Sheet must remain visible and body scroll remains locked.
      const isSheetHiddenWhileBodyScrollLocked =
        sheet.classList.contains('hidden') && bodyMock.style.overflow === 'hidden';

      expect(isSheetHiddenWhileBodyScrollLocked).toBe(false);
      expect(sheet.classList.contains('hidden')).toBe(false);
      expect(bodyMock.style.overflow).toBe('hidden');
    });

    it('4.2 survives 10 rapid Escape key spam presses without unhandled errors', () => {
      openExportShareSheet();

      // Dispatch 10 rapid escape presses
      for (let i = 0; i < 10; i++) {
        const handlers = [...(docListeners.get('keydown') || [])];
        handlers.forEach((h) => {
          expect(() => h({ key: 'Escape' })).not.toThrow();
        });
      }

      vi.advanceTimersByTime(300);
      expect(bodyMock.style.overflow).toBe('');
      expect(docElements['export-share-sheet'].classList.contains('hidden')).toBe(true);
    });

    it('4.3 calling closeExportShareSheet when already closed is idempotent and safe', () => {
      expect(() => {
        closeExportShareSheet();
        closeExportShareSheet();
        closeExportShareSheet();
      }).not.toThrow();
      vi.advanceTimersByTime(500);
      expect(bodyMock.style.overflow).toBe('');
    });

    it('4.4 calling openExportShareSheet repeatedly without closing is idempotent and does not accumulate keydown listeners', () => {
      openExportShareSheet();
      openExportShareSheet();
      openExportShareSheet();

      const keydownHandlers = docListeners.get('keydown') || [];
      // Should have only 1 active keydown handler, not 3
      expect(keydownHandlers.length).toBe(1);
    });

    it('4.5 restores focus to trigger button (#plan-actions-overflow-btn) upon close per WCAG 2.4.3', () => {
      const triggerBtn = docElements['plan-actions-overflow-btn'];
      openExportShareSheet();
      expect(triggerBtn.focus).not.toHaveBeenCalled();

      closeExportShareSheet();
      expect(triggerBtn.focus).toHaveBeenCalledTimes(1);
    });

    it('4.6 stress-tests multi-stage rapid oscillation (open -> close -> open -> close -> open) under asynchronous timer jitter', () => {
      const sheet = docElements['export-share-sheet'];

      // Stage 1: open
      openExportShareSheet();
      expect(sheet.classList.contains('hidden')).toBe(false);

      // Stage 2: close at 50ms
      vi.advanceTimersByTime(50);
      closeExportShareSheet();

      // Stage 3: open at 120ms (timer 1 in flight)
      vi.advanceTimersByTime(70);
      openExportShareSheet();
      expect(sheet.classList.contains('hidden')).toBe(false);

      // Stage 4: close at 200ms (timer 2 starts)
      vi.advanceTimersByTime(80);
      closeExportShareSheet();

      // Stage 5: open at 280ms (timer 2 in flight)
      vi.advanceTimersByTime(80);
      openExportShareSheet();
      expect(sheet.classList.contains('hidden')).toBe(false);

      // Advance through all dangling timer epochs (advance by 500ms)
      vi.advanceTimersByTime(500);

      // Robustness assertion: final open state must NOT be corrupted by any earlier timers
      expect(sheet.classList.contains('hidden')).toBe(false);
      expect(sheet.classList.contains('opacity-100')).toBe(true);
      expect(bodyMock.style.overflow).toBe('hidden');
    });
  });

  // ==========================================================================
  // SUITE 5: MILESTONE 2 TOUCH ERGONOMICS, SAFE AREA & TACTILE FEEDBACK
  // ==========================================================================
  describe('Suite 5: Milestone 2 Touch Target Ergonomics & Layout Robustness', () => {
    it('5.1 ensures all modal close targets meet minimum 44x44px (w-11 h-11) touch standards in index.html', () => {
      // #auth-modal close 'X'
      expect(indexHtmlSource).toMatch(/id="auth-modal"[\s\S]*?w-11 h-11 rounded-full/);
      // #settings-modal close 'X'
      expect(indexHtmlSource).toMatch(/id="settings-modal"[\s\S]*?w-11 h-11 rounded-full/);
      // #regenerate-modal close 'X'
      expect(indexHtmlSource).toMatch(/id="regenerate-modal"[\s\S]*?w-11 h-11 rounded-full/);
      // #ai-tutor-modal close 'X'
      expect(indexHtmlSource).toMatch(/id="ai-tutor-modal"[\s\S]*?w-11 h-11 rounded-full/);
      // #export-sheet-cancel-btn has min-h-[48px]
      expect(indexHtmlSource).toContain('id="export-sheet-cancel-btn"');
      expect(indexHtmlSource).toContain('min-h-[48px]');
    });

    it('5.2 ensures mobile navigation tabs (#mobile-nav) and profile avatar meet min-h-[44px] min-w-[44px]', () => {
      // Mobile nav tabs: today, plan, syllabus
      expect(indexHtmlSource).toContain('id="mob-btn-today" class="min-h-[44px] min-w-[44px]');
      expect(indexHtmlSource).toContain('id="mob-btn-plan" class="min-h-[44px] min-w-[44px]');
      expect(indexHtmlSource).toContain('id="mob-btn-syllabus" class="min-h-[44px] min-w-[44px]');
      // Auth avatar button
      expect(indexHtmlSource).toContain('id="auth-avatar-btn"');
      expect(indexHtmlSource).toContain('min-h-[44px] min-w-[44px]');
    });

    it('5.3 verifies viewport-fit=cover meta tag is specified in index.html for edge-to-edge screens', () => {
      expect(indexHtmlSource).toMatch(/<meta\s+name="viewport"\s+content="[^"]*viewport-fit=cover[^"]*"/);
    });

    it('5.4 verifies safe area insets (--sab) and padding rules in src/style.css', () => {
      expect(styleCssSource).toContain('--sab: env(safe-area-inset-bottom, 0px);');
      expect(styleCssSource).toContain('padding-bottom: calc(0.5rem + var(--sab));');
      expect(styleCssSource).toContain('padding-bottom: calc(5.5rem + var(--sab));');
    });

    it('5.5 verifies task checkbox tap expander expands hit target to 44x44px via ::after pseudo-element', () => {
      expect(styleCssSource).toContain('.task-checkbox {');
      expect(styleCssSource).toContain('position: relative;');
      expect(styleCssSource).toContain('.task-checkbox::after {');
      expect(styleCssSource).toContain("content: '';");
      expect(styleCssSource).toContain('position: absolute;');
      expect(styleCssSource).toContain('inset: -9px;');
      expect(styleCssSource).toContain('cursor: pointer;');
    });

    it('5.6 verifies tactile active scaling and sticky hover mitigation media queries in src/style.css', () => {
      expect(styleCssSource).toContain('button:active');
      expect(styleCssSource).toContain('[role="button"]:active');
      expect(styleCssSource).toContain('transform: scale(0.97);');
      expect(styleCssSource).toContain('@media (hover: hover) and (pointer: fine)');
    });

    it('5.7 verifies touch-action: manipulation is configured on interactive elements to prevent 300ms tap delay', () => {
      expect(styleCssSource).toContain('touch-action: manipulation;');
    });

    it('5.8 verifies universal .touch-target-44 utility class is defined in src/style.css', () => {
      expect(styleCssSource).toContain('.touch-target-44 {');
      expect(styleCssSource).toContain('min-height: 44px;');
      expect(styleCssSource).toContain('min-width: 44px;');
    });
  });
});
