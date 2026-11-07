import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import {
  openPendingWork,
  renderApp,
  getAppState,
  setAppState,
  setCurrentView
} from '../src/app.js';

describe('Pending Work Auto-Expand & Smooth Scroll Behavior', () => {
  let originalWindow;
  let originalDocument;
  let originalLocalStorage;

  beforeEach(() => {
    originalWindow = global.window;
    originalDocument = global.document;
    originalLocalStorage = global.localStorage;
    global.localStorage = {
      getItem: () => null,
      setItem: () => {},
      removeItem: () => {},
      clear: () => {}
    };
  });

  afterEach(() => {
    global.window = originalWindow;
    global.document = originalDocument;
    global.localStorage = originalLocalStorage;
    vi.restoreAllMocks();
  });

  it('openPendingWork expands details#pending-work and scrolls with sticky header offset', () => {
    let scrolledTo = null;
    let focusCalled = false;

    const mockSummary = {
      focus: vi.fn(() => { focusCalled = true; })
    };

    const mockClassList = new Set();
    const mockPendingEl = {
      id: 'pending-work',
      open: false,
      classList: {
        add: (cls) => mockClassList.add(cls),
        remove: (cls) => mockClassList.delete(cls),
        contains: (cls) => mockClassList.has(cls)
      },
      getBoundingClientRect: () => ({ top: 450, height: 200 }),
      querySelector: (sel) => (sel === 'summary' ? mockSummary : null),
      offsetWidth: 500
    };

    const mockHeader = {
      offsetHeight: 68
    };

    global.window = {
      pageYOffset: 100,
      scrollY: 100,
      scrollTo: vi.fn((opts) => { scrolledTo = opts; }),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn()
    };

    global.document = {
      getElementById: vi.fn((id) => (id === 'pending-work' ? mockPendingEl : null)),
      querySelector: vi.fn((sel) => (sel === 'header' ? mockHeader : null))
    };

    const mockEvent = {
      preventDefault: vi.fn(),
      stopPropagation: vi.fn()
    };

    openPendingWork(mockEvent);

    expect(mockEvent.preventDefault).toHaveBeenCalled();
    expect(mockEvent.stopPropagation).toHaveBeenCalled();
    expect(mockPendingEl.open).toBe(true);

    // Expected scroll Y = current pageYOffset (100) + top (450) - headerOffset (68) - 16 = 466
    expect(scrolledTo).toEqual({
      top: 466,
      behavior: 'smooth'
    });

    expect(mockClassList.has('pending-highlight-pulse')).toBe(true);
    expect(mockSummary.focus).toHaveBeenCalled();
  });

  it('renders View pending with openPendingWork(event) on both notice and anchor link', () => {
    const mockAppState = {
      studentName: 'Test Student',
      grade: '12',
      stream: 'cs',
      deadlineDate: '2026-11-20',
      completedTopics: {},
      plan: [
        {
          dayNumber: 1,
          date: '2026-11-01',
          tasks: [{ id: 'p-1', subject: 'Physics', chapNumber: 1, topic: 'Intro', completed: false }]
        },
        {
          dayNumber: 2,
          date: '2026-11-07',
          tasks: [{ id: 't-1', subject: 'Chemistry', chapNumber: 2, topic: 'Solutions', completed: false }]
        }
      ]
    };

    setAppState(mockAppState);
    setCurrentView('today');

    let renderedHTML = '';
    const mockContainer = {
      innerHTML: '',
      querySelectorAll: () => []
    };

    const mockBody = {
      classList: {
        toggle: vi.fn(),
        add: vi.fn(),
        remove: vi.fn()
      }
    };

    global.document = {
      body: mockBody,
      getElementById: (id) => (id === 'app-container' ? mockContainer : null),
      querySelectorAll: () => [],
      addEventListener: vi.fn(),
      removeEventListener: vi.fn()
    };

    global.window = {
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      location: { hash: '' }
    };

    renderApp();
    renderedHTML = mockContainer.innerHTML;

    // Must render pending notice with onclick="openPendingWork(event)"
    expect(renderedHTML).toContain('class="pending-notice"');
    expect(renderedHTML).toContain('onclick="openPendingWork(event)"');
    expect(renderedHTML).toContain('unfinished from previous days.');
    expect(renderedHTML).toContain('View pending');
    expect(renderedHTML).toContain('id="pending-work"');
  });

  it('verifies style.css contains scroll-margin-top and pendingSectionGlow keyframes', () => {
    const cssPath = path.resolve(__dirname, '../src/style.css');
    const css = fs.readFileSync(cssPath, 'utf8');

    expect(css).toContain('scroll-margin-top: 85px;');
    expect(css).toContain('@keyframes pendingSectionGlow');
    expect(css).toContain('.pending-highlight-pulse');
    expect(css).toContain('cursor: pointer;');
  });
});
