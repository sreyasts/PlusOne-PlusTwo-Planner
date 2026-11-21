import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import {
  detectMalayalamEnvironment,
  getCurrentLanguage,
  setLanguagePreference,
  STORAGE_KEY_LANG,
} from '../src/i18n/detector.js';
import { ML_STRINGS } from '../src/i18n/ml.js';

describe('i18n Language & Browser Translation Auto-Detector', () => {
  let mockStorage = {};
  let mockDocElement = {
    lang: 'en',
    classList: {
      _classes: new Set(),
      contains(c) { return this._classes.has(c); },
      add(c) { this._classes.add(c); },
      remove(c) { this._classes.delete(c); },
    }
  };

  const mockLocalStorage = {
    getItem(k) { return mockStorage[k] || null; },
    setItem(k, v) { mockStorage[k] = String(v); },
    removeItem(k) { delete mockStorage[k]; },
    clear() { mockStorage = {}; }
  };

  let mockLanguages = ['en-US', 'en'];

  beforeEach(() => {
    mockStorage = {};
    mockDocElement.lang = 'en';
    mockDocElement.classList._classes.clear();
    mockLanguages = ['en-US', 'en'];

    Object.defineProperty(globalThis, 'window', {
      value: { localStorage: mockLocalStorage },
      writable: true,
      configurable: true
    });

    Object.defineProperty(globalThis, 'localStorage', {
      value: mockLocalStorage,
      writable: true,
      configurable: true
    });

    Object.defineProperty(globalThis, 'document', {
      value: {
        documentElement: mockDocElement,
        querySelector: () => null,
        body: { innerText: '' }
      },
      writable: true,
      configurable: true
    });

    if (!globalThis.navigator || typeof globalThis.navigator !== 'object') {
      Object.defineProperty(globalThis, 'navigator', {
        value: {},
        writable: true,
        configurable: true
      });
    }

    Object.defineProperty(globalThis.navigator, 'languages', {
      value: mockLanguages,
      writable: true,
      configurable: true
    });
  });

  afterAll(() => {
    delete globalThis.window;
    delete globalThis.document;
    delete globalThis.localStorage;
  });

  it('defaults to English ("en") when no preferences or translations are present', () => {
    const lang = getCurrentLanguage();
    expect(lang).toBe('en');
  });

  it('detects Malayalam when user manually sets preference', () => {
    setLanguagePreference('ml');
    expect(getCurrentLanguage()).toBe('ml');

    setLanguagePreference('en');
    expect(getCurrentLanguage()).toBe('en');
  });

  it('detects Malayalam when browser documentElement.lang is set to Malayalam', () => {
    mockDocElement.lang = 'ml';
    expect(detectMalayalamEnvironment()).toBe(true);
    expect(getCurrentLanguage()).toBe('ml');
  });

  it('detects browser auto-translation to Malayalam via classes and lang attribute', () => {
    mockDocElement.lang = 'ml-IN';
    mockDocElement.classList.add('translated-ltr');
    expect(detectMalayalamEnvironment()).toBe(true);
    expect(getCurrentLanguage()).toBe('ml');
  });

  it('auto-detects Malayalam when navigator.languages contains Malayalam', () => {
    Object.defineProperty(globalThis.navigator, 'languages', {
      value: ['ml-IN', 'ml', 'en'],
      writable: true,
      configurable: true
    });
    expect(detectMalayalamEnvironment()).toBe(true);
    expect(getCurrentLanguage()).toBe('ml');
  });

  it('verifies ML_STRINGS dictionary contains necessary translation keys and metadata disclaimer', () => {
    expect(ML_STRINGS._meta.lang).toBe('ml');
    expect(ML_STRINGS._meta.disclaimer).toContain('മെഷീൻ വിവർത്തനം');
    expect(ML_STRINGS.nav.today).toBe('ഇന്ന്');
    expect(ML_STRINGS.nav.plan).toBe('പൂർണ്ണ ഷെഡ്യൂൾ');
    expect(ML_STRINGS.nav.syllabus).toBe('പാഠ്യപദ്ധതി');
  });

  it('validates comprehensive dictionary coverage across all app views and modals', () => {
    // Setup Wizard
    expect(ML_STRINGS.setup.title).toBe('നിങ്ങളുടെ പഠന പ്ലാൻ തയ്യാറാക്കുക');
    expect(ML_STRINGS.setup.streamLabel).toBe('1. സ്ട്രീം തിരഞ്ഞെടുക്കുക');
    expect(ML_STRINGS.setup.generateBtn).toBe('പഠന പ്ലാൻ തയ്യാറാക്കുക');
    expect(ML_STRINGS.setup.rhythmTitle).toBe('ആഴ്ചയിലെ പഠന രീതിയും വിശ്രമ ദിനവും');

    // Dashboard
    expect(ML_STRINGS.dashboard.todaysMission).toBe('ഇന്നത്തെ പഠന ലക്ഷ്യം');
    expect(ML_STRINGS.dashboard.missionDoneTitle).toContain('100% പൂർത്തിയായി');
    expect(ML_STRINGS.dashboard.restDayTitle).toContain('വിശ്രമ & റീചാർജ്');

    // Full Plan
    expect(ML_STRINGS.plan.title).toBe('പൂർണ്ണ പഠന ഷെഡ്യൂൾ');
    expect(ML_STRINGS.plan.todayBadge).toBe('ഇന്ന്');
    expect(ML_STRINGS.plan.revisionDay).toBe('റിവിഷൻ ദിനം');
    expect(ML_STRINGS.plan.restDay).toBe('വിശ്രമ ദിനം');

    // Syllabus
    expect(ML_STRINGS.syllabus.title).toBe('ഔദ്യോഗിക DHSE സിലബസ് & അധ്യായങ്ങൾ');
    expect(ML_STRINGS.syllabus.mastered).toBe('പഠിച്ചു കഴിഞ്ഞു');

    // Modals
    expect(ML_STRINGS.authModal.title).toBe('പഠന പ്ലാൻ സൂക്ഷിച്ചു വെക്കാം');
    expect(ML_STRINGS.authModal.googleBtn).toBe('Google വഴി തുടരുക');
    expect(ML_STRINGS.settingsModal.title).toBe('ക്രമീകരണങ്ങൾ (Settings)');
    expect(ML_STRINGS.settingsModal.doneBtn).toBe('പൂർത്തിയായി');
    expect(ML_STRINGS.regenerateModal.title).toBe('പ്ലാൻ പുനഃക്രമീകരിക്കുക');
    expect(ML_STRINGS.regenerateModal.rebalanceBtn).toBe('തിരഞ്ഞെടുത്ത ദിവസം മുതൽ പുതുക്കുക');
  });
});

