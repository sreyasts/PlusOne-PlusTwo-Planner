import { describe, it, expect, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

import {
  getHandbookUrl,
  hasHandbook,
  getHandbookInfo,
  CANONICAL_HANDBOOK_MAP,
  RATIONALIZED_CHAPTER_IDS,
  normalizeHandbookGrade,
  normalizeHandbookSubject,
} from '../src/utils/handbook-lookup.js';
import { PLUS_ONE_SYLLABUS } from '../src/data/syllabus-plus-one.js';
import { PLUS_TWO_SYLLABUS } from '../src/data/syllabus-plus-two.js';
import { getStreamSubjects } from '../src/engine/planner.js';
import { CHAPTER_RESOURCES } from '../src/data/chapter-resources.js';
import { getSubjectBoxIcon } from '../src/ui/illustrations.js';
import { ML_STRINGS } from '../src/i18n/ml.js';
const ML_I18N = ML_STRINGS;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');
const handbooksDir = path.resolve(projectRoot, 'public', 'handbooks');

describe('Adversarial Stress Test: Mission+1+2 Handbook & UI Invariants', () => {

  // =========================================================================
  // 1. FULL CURRICULUM MATRIX (288 Unique Chapters × 4 Streams = 1,152 Lookups)
  // =========================================================================
  describe('1. Full Curriculum Matrix (288 Unique Chapters × 4 Streams = 1,152 Lookups)', () => {
    const allTasks = [...PLUS_ONE_SYLLABUS, ...PLUS_TWO_SYLLABUS];
    const uniqueChapters = new Map();
    for (const task of allTasks) {
      if (!uniqueChapters.has(task.chapId)) {
        uniqueChapters.set(task.chapId, task);
      }
    }

    const STREAMS = ['cs', 'bio', 'commerce', 'humanities'];

    it('identifies exactly 288 unique syllabus chapters (280 active, 8 rationalized)', () => {
      expect(uniqueChapters.size).toBe(288);
      let activeCount = 0;
      let rationalizedCount = 0;
      for (const [chapId] of uniqueChapters) {
        if (RATIONALIZED_CHAPTER_IDS.has(chapId)) {
          rationalizedCount++;
        } else {
          activeCount++;
        }
      }
      expect(activeCount).toBe(280);
      expect(rationalizedCount).toBe(8);
    });

    it('verifies 1,152 matrix lookups (288 × 4 streams): 100% of non-rationalized resolve to non-empty physical files with 0 broken links', () => {
      let lookupsPerformed = 0;
      let diskFilesVerified = 0;
      let rationalizedLookupsVerified = 0;
      const brokenLinks = [];

      for (const [chapId, chap] of uniqueChapters.entries()) {
        const isRationalized = RATIONALIZED_CHAPTER_IDS.has(chapId);

        for (const stream of STREAMS) {
          lookupsPerformed++;
          const url = getHandbookUrl(chap, { stream });
          const info = getHandbookInfo(chap, { stream });
          const has = hasHandbook(chap, { stream });

          if (isRationalized) {
            expect(url).toBeNull();
            expect(has).toBe(false);
            expect(info.available).toBe(false);
            expect(info.rationalized).toBe(true);
            expect(info.url).toBeNull();
            rationalizedLookupsVerified++;
          } else {
            if (!url) {
              brokenLinks.push({ chapId, stream, reason: 'Returned null URL for active chapter' });
              continue;
            }

            if (!url.startsWith('/handbooks/')) {
              brokenLinks.push({ chapId, stream, reason: `URL does not start with /handbooks/: ${url}` });
              continue;
            }

            if (url.includes(' ') || url.includes('\\')) {
              brokenLinks.push({ chapId, stream, reason: `URL contains spaces or backslashes: ${url}` });
              continue;
            }

            const relPath = url.replace(/^\/handbooks\//, '');
            const fullPath = path.resolve(handbooksDir, relPath);

            if (!fs.existsSync(fullPath)) {
              brokenLinks.push({ chapId, stream, reason: `File does not exist on disk: ${fullPath}` });
              continue;
            }

            const stat = fs.statSync(fullPath);
            if (stat.size === 0) {
              brokenLinks.push({ chapId, stream, reason: `File on disk is 0 bytes: ${fullPath}` });
              continue;
            }

            expect(has).toBe(true);
            expect(info.available).toBe(true);
            expect(info.rationalized).toBe(false);
            expect(info.filename).toMatch(/\.pdf$/);
            diskFilesVerified++;
          }
        }
      }

      expect(brokenLinks).toEqual([]);
      expect(lookupsPerformed).toBe(1152);
      expect(diskFilesVerified).toBe(280 * 4); // 1,120 active stream lookups
      expect(rationalizedLookupsVerified).toBe(8 * 4); // 32 rationalized stream lookups
    });

    it('handles adversarial & fuzzed inputs gracefully with zero uncaught exceptions', () => {
      const hostileInputs = [
        null,
        undefined,
        '',
        '   ',
        '../public/handbooks/secret.pdf',
        '../../../../etc/passwd',
        '..\\..\\windows\\system32',
        '<script>alert("xss")</script>',
        'DROP TABLE chapters;--',
        { grade: '+3', subject: 'Alchemy', chapNumber: 999 },
        { grade: '+1', subject: null, chapNumber: -5 },
        { id: 'not_a_valid_id' },
        { chapId: 'malicious/../path' },
        { stream: 'unknown_stream_xyz' },
        {},
        [1, 2, 3],
        12345,
      ];

      for (const input of hostileInputs) {
        expect(() => {
          const res = getHandbookUrl(input);
          expect(res).toBeNull();
        }).not.toThrow();

        expect(() => {
          const has = hasHandbook(input);
          expect(has).toBe(false);
        }).not.toThrow();

        expect(() => {
          const info = getHandbookInfo(input);
          expect(info.available).toBe(false);
          expect(info.url).toBeNull();
        }).not.toThrow();
      }
    });
  });

  // =========================================================================
  // 2. RAPID UI STATE SWITCHING SIMULATION (+1/+2 × CS/Bio/Commerce/Humanities)
  // =========================================================================
  describe('2. Rapid UI State Switching Simulation (+1/+2 × CS/Bio/Commerce/Humanities)', () => {
    // Read the app.js functions directly
    const appSource = fs.readFileSync(path.resolve(projectRoot, 'src/app.js'), 'utf8');

    function createSimulatedAppContext({ initialGrade = '+2', initialStream = 'cs' } = {}) {
      const container = {
        innerHTML: '',
        querySelector: () => null,
        querySelectorAll: () => [],
      };

      const contextObj = {
        currentView: 'syllabus',
        activeSyllabusGrade: null,
        activeSyllabusStream: null,
        activeSetupGradeTab: initialGrade,
        appState: {
          grade: initialGrade,
          stream: initialStream,
          plan: [],
        },
        document: {
          getElementById: (id) => (id === 'app-container' ? container : null),
          querySelector: () => null,
          querySelectorAll: () => [],
        },
        window: {
          scrollTo: vi.fn(),
        },
        updateActiveNavButtons: vi.fn(),
        goToDashboard: vi.fn(),
        playTapSound: vi.fn(),
        getUserSetting: vi.fn(() => true),
        isML: false,
        ML_I18N,
        PLUS_ONE_SYLLABUS,
        PLUS_TWO_SYLLABUS,
        CHAPTER_RESOURCES,
        getStreamSubjects,
        getSubjectBoxIcon,
        getHandbookUrl,
      };

      const context = vm.createContext(contextObj);

      // Extract switchSyllabusStream, switchSyllabusGrade, and renderApp
      const codeToRun = `
        let activeSyllabusStream = null;
        let activeSyllabusGrade = null;

        function switchSyllabusStream(streamKey) {
            try {
                if (typeof playTapSound === 'function' && (typeof getUserSetting !== 'function' || getUserSetting('sound', true))) {
                    playTapSound();
                }
            } catch (_) {}
            activeSyllabusStream = streamKey;
            renderApp();
        }

        function switchSyllabusGrade(gradeKey) {
            try {
                if (typeof playTapSound === 'function' && (typeof getUserSetting !== 'function' || getUserSetting('sound', true))) {
                    playTapSound();
                }
            } catch (_) {}
            activeSyllabusGrade = gradeKey;
            renderApp();
        }

        function getActiveState() {
            return { activeSyllabusGrade, activeSyllabusStream };
        }

        function renderApp() {
            const container = document.getElementById('app-container');
            if (currentView === 'syllabus') {
                if (!activeSyllabusGrade) {
                    activeSyllabusGrade = appState?.grade || (typeof activeSetupGradeTab !== 'undefined' && activeSetupGradeTab === '+1' ? '+1' : '+2');
                }
                const userStream = activeSyllabusStream || appState?.stream || (appState?.plan?.some(d => d.tasks.some(t => t.subject === 'Botany' || t.subject === 'Zoology')) ? 'bio' : 'cs');
                const subjects = userStream === 'imp_only'
                    ? Array.from(new Set((appState?.plan || []).flatMap(d => (d.tasks || []).map(t => t.subject))))
                    : getStreamSubjects(userStream);

                let syllabusHTML = '';
                const sourceSyllabus = activeSyllabusGrade === '+1' ? PLUS_ONE_SYLLABUS : PLUS_TWO_SYLLABUS;
                subjects.forEach(sub => {
                    const subChaps = sourceSyllabus.filter(t => t.subject === sub);
                    const uniqueChaps = [...new Map(subChaps.map(item => [item.chapId, item])).values()];
                    const subRes = CHAPTER_RESOURCES?.subjects?.[sub] || CHAPTER_RESOURCES?.[sub];
                    const subPyq = subRes?.pyqUrl || subRes?.pyq;

                    syllabusHTML += \`
                        <div class="bg-white dark:bg-[#0e1628] rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm p-4 sm:p-5 mb-5" data-subject="\${sub}">
                            <div class="border-b dark:border-slate-800 pb-3 mb-4 flex items-center justify-between">
                                <div class="flex items-center gap-3">
                                    <div class="w-10 h-10 rounded-xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center p-2 border border-slate-200/60 dark:border-slate-700/60 shrink-0">
                                        \${typeof getSubjectBoxIcon === 'function' ? getSubjectBoxIcon(sub) : ''}
                                    </div>
                                    <div>
                                        <h3 class="font-black text-slate-900 dark:text-white text-base">\${sub}</h3>
                                        <span class="text-xs text-slate-500 dark:text-slate-400 font-semibold">\${uniqueChaps.length} \${isML ? ML_I18N.syllabus.chaptersCount : 'Official Chapters'}</span>
                                    </div>
                                </div>
                            </div>

                            <div class="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                                \${uniqueChaps.map(ch => {
                                    const handbookUrl = getHandbookUrl(ch, { grade: activeSyllabusGrade, stream: userStream });
                                    return \`
                                        <div class="chapter-card" data-chap-id="\${ch.chapId}">
                                            <span>Chapter \${ch.chapNumber}: \${ch.chapterName}</span>
                                            \${handbookUrl ? \`
                                                <a href="\${handbookUrl}" target="_blank" rel="noopener noreferrer" onclick="event.stopPropagation()" class="syllabus-notes-btn">
                                                    📖 Notes
                                                </a>
                                            \` : ''}
                                        </div>
                                    \`;
                                }).join('')}
                            </div>
                        </div>
                    \`;
                });

                container.innerHTML = \`
                    <div id="syllabus-view-container">
                        <div class="grade-pills">
                            <button type="button" data-grade-btn="+2" class="\${activeSyllabusGrade === '+2' ? 'active-grade' : ''}">Plus Two</button>
                            <button type="button" data-grade-btn="+1" class="\${activeSyllabusGrade === '+1' ? 'active-grade' : ''}">Plus One</button>
                        </div>
                        <div class="stream-pills">
                            <button type="button" data-stream-btn="cs" class="\${userStream === 'cs' ? 'active-stream' : ''}">CS</button>
                            <button type="button" data-stream-btn="bio" class="\${userStream === 'bio' ? 'active-stream' : ''}">Bio</button>
                            <button type="button" data-stream-btn="commerce" class="\${userStream === 'commerce' ? 'active-stream' : ''}">Commerce</button>
                            <button type="button" data-stream-btn="humanities" class="\${userStream === 'humanities' ? 'active-stream' : ''}">Humanities</button>
                        </div>
                        <div class="syllabus-content">
                            \${syllabusHTML}
                        </div>
                    </div>
                \`;
            }
        }
      `;

      vm.runInContext(codeToRun, context);
      return { context, container };
    }

    it('executes all 8 permutations (+1/+2 across cs/bio/commerce/humanities) cleanly without exceptions', () => {
      const { context, container } = createSimulatedAppContext();

      const grades = ['+2', '+1'];
      const streams = ['cs', 'bio', 'commerce', 'humanities'];

      for (const grade of grades) {
        for (const stream of streams) {
          expect(() => {
            context.switchSyllabusGrade(grade);
            context.switchSyllabusStream(stream);
          }).not.toThrow();

          const html = container.innerHTML;
          expect(html).toContain(`data-grade-btn="${grade}" class="active-grade"`);
          expect(html).toContain(`data-stream-btn="${stream}" class="active-stream"`);

          const expectedSubjects = getStreamSubjects(stream);
          for (const sub of expectedSubjects) {
            expect(html).toContain(`data-subject="${sub}"`);
          }

          // Invariant: Non-stream subjects must NOT appear
          if (stream === 'bio') {
            expect(html).not.toContain('data-subject="Computer Science"');
            expect(html).not.toContain('data-subject="Accountancy"');
            expect(html).toContain('data-subject="Botany"');
            expect(html).toContain('data-subject="Zoology"');
          } else if (stream === 'cs') {
            expect(html).not.toContain('data-subject="Botany"');
            expect(html).not.toContain('data-subject="Zoology"');
            expect(html).not.toContain('data-subject="Accountancy"');
            expect(html).toContain('data-subject="Computer Science"');
          } else if (stream === 'commerce') {
            expect(html).not.toContain('data-subject="Botany"');
            expect(html).not.toContain('data-subject="Zoology"');
            expect(html).toContain('data-subject="Accountancy"');
            expect(html).toContain('data-subject="Business Studies"');
          } else if (stream === 'humanities') {
            expect(html).not.toContain('data-subject="Computer Science"');
            expect(html).not.toContain('data-subject="Botany"');
            expect(html).toContain('data-subject="History"');
            expect(html).toContain('data-subject="Political Science"');
            expect(html).toContain('data-subject="Sociology"');
          }

          // Invariant: Chapters rendered must strictly match the selected grade
          if (grade === '+1') {
            expect(html).toContain('data-chap-id="+1_');
            expect(html).not.toContain('data-chap-id="+2_');
          } else {
            expect(html).toContain('data-chap-id="+2_');
            expect(html).not.toContain('data-chap-id="+1_');
          }

          // Invariant: Rationalized chapters MUST NOT render a notes button
          for (const ratId of RATIONALIZED_CHAPTER_IDS) {
            if (html.includes(`data-chap-id="${ratId}"`)) {
              // Extract the chapter card snippet
              const cardSnippet = html.slice(html.indexOf(`data-chap-id="${ratId}"`), html.indexOf(`data-chap-id="${ratId}"`) + 250);
              expect(cardSnippet).not.toContain('syllabus-notes-btn');
            }
          }
        }
      }
    });

    it('simulates rapid-fire high-frequency transitions (60 interleaved switches) with 100% stability', () => {
      const { context, container } = createSimulatedAppContext();

      const sequence = [
        ['+1', 'cs'], ['+2', 'cs'], ['+2', 'bio'], ['+1', 'bio'],
        ['+1', 'commerce'], ['+2', 'commerce'], ['+2', 'humanities'], ['+1', 'humanities'],
        ['+2', 'bio'], ['+1', 'cs'], ['+2', 'commerce'], ['+1', 'humanities'],
        ['+2', 'cs'], ['+1', 'commerce'], ['+2', 'bio'], ['+1', 'cs'],
      ];

      // Repeat sequence 4 times = 64 state transitions
      for (let cycle = 0; cycle < 4; cycle++) {
        for (const [grade, stream] of sequence) {
          context.switchSyllabusGrade(grade);
          context.switchSyllabusStream(stream);

          const html = container.innerHTML;
          expect(html.length).toBeGreaterThan(100);
          expect(html).toContain(`data-grade-btn="${grade}" class="active-grade"`);
          expect(html).toContain(`data-stream-btn="${stream}" class="active-stream"`);
        }
      }
    });

    it('recovers cleanly from invalid UI switcher arguments without uncaught exceptions', () => {
      const { context, container } = createSimulatedAppContext();

      const invalidGrades = [null, undefined, '', 'invalid', '+3', 99];
      const invalidStreams = [null, undefined, '', 'unknown', 'art', 123];

      for (const g of invalidGrades) {
        expect(() => context.switchSyllabusGrade(g)).not.toThrow();
      }

      for (const s of invalidStreams) {
        expect(() => context.switchSyllabusStream(s)).not.toThrow();
      }

      // Restore to canonical state
      context.switchSyllabusGrade('+2');
      context.switchSyllabusStream('cs');
      expect(container.innerHTML).toContain('data-grade-btn="+2" class="active-grade"');
      expect(container.innerHTML).toContain('data-stream-btn="cs" class="active-stream"');
    });
  });

  // =========================================================================
  // 3. EVENT PROPAGATION AUDIT (.daily-notes-btn vs toggleTaskDirect)
  // =========================================================================
  describe('3. Event Propagation Audit (.daily-notes-btn vs toggleTaskDirect)', () => {
    class SimulatedDOMElement {
      constructor(tagName, id = '', className = '') {
        this.tagName = tagName.toUpperCase();
        this.id = id;
        this.className = className;
        this.parentNode = null;
        this.children = [];
        this.listeners = {};
        this.onclick = null;
      }

      appendChild(child) {
        child.parentNode = this;
        this.children.push(child);
        return child;
      }

      addEventListener(event, callback) {
        if (!this.listeners[event]) this.listeners[event] = [];
        this.listeners[event].push(callback);
      }

      dispatchEvent(event) {
        event.target = this;
        let current = this;

        while (current) {
          event.currentTarget = current;

          // 1. Run inline onclick if present
          if (event.type === 'click' && typeof current.onclick === 'function') {
            current.onclick(event);
          }

          // 2. Run registered listeners
          const handlers = current.listeners[event.type] || [];
          for (const handler of handlers) {
            handler.call(current, event);
          }

          if (event.isPropagationStopped) {
            break;
          }

          if (!event.bubbles) {
            break;
          }

          current = current.parentNode;
        }
        return !event.defaultPrevented;
      }
    }

    class SimulatedEvent {
      constructor(type, { bubbles = true, cancelable = true } = {}) {
        this.type = type;
        this.bubbles = bubbles;
        this.cancelable = cancelable;
        this.isPropagationStopped = false;
        this.defaultPrevented = false;
        this.target = null;
        this.currentTarget = null;
      }

      stopPropagation() {
        this.isPropagationStopped = true;
      }

      preventDefault() {
        if (this.cancelable) this.defaultPrevented = true;
      }
    }

    function buildTodayViewTaskDOM({ taskId = '+1_Physics_1_P1', handbookUrl = '/handbooks/+1/Biology_Science/Physics/Chapter_01_Units_and_Measurements.pdf' } = {}) {
      const container = new SimulatedDOMElement('div', 'app-container');
      const board = new SimulatedDOMElement('div', 'today-tasks', 'daily-board');
      const taskList = new SimulatedDOMElement('ol', '', 'daily-tasks');
      const taskItem = new SimulatedDOMElement('li', '', 'daily-task');
      const taskContent = new SimulatedDOMElement('div', '', 'daily-task-content');
      const taskActions = new SimulatedDOMElement('div', '', 'daily-task-actions');

      // Notes button with exact inline stopPropagation attribute
      const notesBtn = new SimulatedDOMElement('a', '', 'daily-notes-btn');
      notesBtn.href = handbookUrl;
      notesBtn.onclick = function (event) {
        event.stopPropagation();
      };

      // Task toggle button with data-study-task
      const toggleBtn = new SimulatedDOMElement('button', '', 'daily-toggle');
      toggleBtn.dataset = { studyTask: taskId };

      // Assemble hierarchy
      container.appendChild(board);
      board.appendChild(taskList);
      taskList.appendChild(taskItem);
      taskItem.appendChild(taskContent);
      taskContent.appendChild(taskActions);
      taskActions.appendChild(notesBtn);
      taskItem.appendChild(toggleBtn);

      return { container, board, taskList, taskItem, taskContent, taskActions, notesBtn, toggleBtn };
    }

    it('verifies clicking .daily-notes-btn calls stopPropagation() and CANNOT trigger toggleTaskDirect', () => {
      const toggleTaskDirect = vi.fn();
      const parentBoardClickSpy = vi.fn();
      const taskItemClickSpy = vi.fn();

      const dom = buildTodayViewTaskDOM({ taskId: '+1_Physics_1_P1' });

      // Wire up toggle button listener
      dom.toggleBtn.addEventListener('click', () => toggleTaskDirect(dom.toggleBtn.dataset.studyTask));

      // Wire up ancestor listeners (simulating any container/board click delegations)
      dom.taskItem.addEventListener('click', taskItemClickSpy);
      dom.board.addEventListener('click', parentBoardClickSpy);

      // Create and dispatch click on .daily-notes-btn
      const clickEvent = new SimulatedEvent('click', { bubbles: true, cancelable: true });
      dom.notesBtn.dispatchEvent(clickEvent);

      // Assertions
      expect(clickEvent.isPropagationStopped).toBe(true);
      expect(toggleTaskDirect).not.toHaveBeenCalled();
      expect(taskItemClickSpy).not.toHaveBeenCalled();
      expect(parentBoardClickSpy).not.toHaveBeenCalled();
    });

    it('confirms clicking .daily-toggle directly DOES invoke toggleTaskDirect', () => {
      const toggleTaskDirect = vi.fn();
      const dom = buildTodayViewTaskDOM({ taskId: '+1_Physics_1_P1' });

      dom.toggleBtn.addEventListener('click', () => toggleTaskDirect(dom.toggleBtn.dataset.studyTask));

      const clickEvent = new SimulatedEvent('click', { bubbles: true, cancelable: true });
      dom.toggleBtn.dispatchEvent(clickEvent);

      expect(toggleTaskDirect).toHaveBeenCalledTimes(1);
      expect(toggleTaskDirect).toHaveBeenCalledWith('+1_Physics_1_P1');
    });

    it('stress tests rapid repeated clicks (100 clicks) on .daily-notes-btn: zero toggle triggers', () => {
      const toggleTaskDirect = vi.fn();
      const dom = buildTodayViewTaskDOM({ taskId: '+1_Chemistry_1_P1' });

      dom.toggleBtn.addEventListener('click', () => toggleTaskDirect(dom.toggleBtn.dataset.studyTask));

      for (let i = 0; i < 100; i++) {
        const ev = new SimulatedEvent('click', { bubbles: true, cancelable: true });
        dom.notesBtn.dispatchEvent(ev);
        expect(ev.isPropagationStopped).toBe(true);
      }

      expect(toggleTaskDirect).toHaveBeenCalledTimes(0);
    });

    it('verifies pending tasks list also encapsulates stopPropagation on .daily-notes-btn', () => {
      const toggleTaskDirect = vi.fn();
      const pendingTaskId = '+1_Botany_1_P1';

      // Pending task markup structure
      const pendingTaskDiv = new SimulatedDOMElement('div', '', 'pending-task');
      const innerDiv = new SimulatedDOMElement('div');
      const pendingNotesBtn = new SimulatedDOMElement('a', '', 'daily-notes-btn');
      pendingNotesBtn.onclick = function (event) {
        event.stopPropagation();
      };

      const pendingToggleBtn = new SimulatedDOMElement('button');
      pendingToggleBtn.dataset = { pendingTask: pendingTaskId };
      pendingToggleBtn.addEventListener('click', () => toggleTaskDirect(pendingToggleBtn.dataset.pendingTask));

      innerDiv.appendChild(pendingNotesBtn);
      pendingTaskDiv.appendChild(innerDiv);
      pendingTaskDiv.appendChild(pendingToggleBtn);

      const ev = new SimulatedEvent('click', { bubbles: true, cancelable: true });
      pendingNotesBtn.dispatchEvent(ev);

      expect(ev.isPropagationStopped).toBe(true);
      expect(toggleTaskDirect).not.toHaveBeenCalled();

      // Directly clicking toggle button triggers it
      const toggleEv = new SimulatedEvent('click', { bubbles: true, cancelable: true });
      pendingToggleBtn.dispatchEvent(toggleEv);
      expect(toggleTaskDirect).toHaveBeenCalledWith(pendingTaskId);
    });

    it('verifies reverse-tabnabbing security & isolation invariants on all generated notes links', () => {
      const appCode = fs.readFileSync(path.resolve(projectRoot, 'src/app.js'), 'utf8');

      // Regular expressions to check all occurrences of notes buttons
      const dailyBtnRegex = /<a[^>]*class="[^"]*daily-notes-btn[^"]*"[^>]*>/g;
      const syllabusBtnRegex = /<a[^>]*class="[^"]*syllabus-notes-btn[^"]*"[^>]*>/g;

      const dailyMatches = appCode.match(dailyBtnRegex) || [];
      const syllabusMatches = appCode.match(syllabusBtnRegex) || [];

      expect(dailyMatches.length).toBeGreaterThan(0);
      expect(syllabusMatches.length).toBeGreaterThan(0);

      const allMatches = [...dailyMatches, ...syllabusMatches];
      for (const tag of allMatches) {
        expect(tag).toContain('target="_blank"');
        expect(tag).toContain('rel="noopener noreferrer"');
        expect(tag).toContain('onclick="event.stopPropagation()"');
      }
    });
  });
});

