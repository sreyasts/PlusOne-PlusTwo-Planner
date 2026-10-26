import { describe, it, expect, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import vm from 'vm';

describe('Authentication & Cross-Domain Unification Invariants', () => {
  const appJsPath = path.resolve(__dirname, '../src/app.js');
  const swJsPath = path.resolve(__dirname, '../sw.js');
  const publicSwJsPath = path.resolve(__dirname, '../public/sw.js');
  const indexPath = path.resolve(__dirname, '../index.html');

  it('declares authModalTimer at module scope in src/app.js', () => {
    const appJsContent = fs.readFileSync(appJsPath, 'utf8');
    expect(appJsContent).toMatch(/let\s+authModalTimer\s*=\s*null;/);
    expect(appJsContent).toContain('clearTimeout(authModalTimer)');
  });

  it('schedules simple sign-in modal 8 seconds after plan generation for non-signed-in users', () => {
    const appJsContent = fs.readFileSync(appJsPath, 'utf8');
    expect(appJsContent).toContain('authModalTimer = setTimeout');
    expect(appJsContent).toContain('8000');
    expect(appJsContent).toContain('openAuthModal()');
    expect(appJsContent).toContain('schedulePostPlanAuthModal');
  });

  it('renders a simple and uncluttered sign-in screen in index.html', () => {
    const indexContent = fs.readFileSync(indexPath, 'utf8');
    expect(indexContent).toContain('id="auth-modal"');
    expect(indexContent).toContain('id="auth-modal-google-btn"');
    expect(indexContent).toContain('id="auth-consent-checkbox"');
    expect(indexContent).toContain('id="auth-modal-guest-btn"');
    // Ensure bulky chips are removed for simplicity
    expect(indexContent).not.toContain('class="auth-chip"');
  });

  it('declares all local UI state variables in signInWithGoogle prior to try/catch', () => {
    const appJsContent = fs.readFileSync(appJsPath, 'utf8');
    const signInIdx = appJsContent.indexOf('async function signInWithGoogle(');
    expect(signInIdx).toBeGreaterThan(0);

    const signInBlock = appJsContent.slice(signInIdx, signInIdx + 1500);
    expect(signInBlock).toMatch(/const\s+modalBtn\s*=\s*document\.getElementById/);
    expect(signInBlock).toMatch(/const\s+headerBtn\s*=\s*document\.getElementById/);
    expect(signInBlock).toMatch(/const\s+originalModalBtnHTML/);
    expect(signInBlock).toMatch(/const\s+originalHeaderBtnHTML/);
  });

  it('does not force prompt: select_account so device Google accounts authenticate smoothly', () => {
    const appJsContent = fs.readFileSync(appJsPath, 'utf8');
    const signInIdx = appJsContent.indexOf('async function signInWithGoogle(');
    const signInBlock = appJsContent.slice(signInIdx, signInIdx + 1500);
    // Should NOT force select_account prompt
    expect(signInBlock).not.toContain("prompt: 'select_account'");
    expect(signInBlock).not.toContain('prompt: "select_account"');
  });

  it('tracks mpt_was_logged_in and cleans up completely on explicit signOutUser()', () => {
    const appJsContent = fs.readFileSync(appJsPath, 'utf8');
    const signOutIdx = appJsContent.indexOf('async function signOutUser(');
    expect(signOutIdx).toBeGreaterThan(0);

    const signOutBlock = appJsContent.slice(signOutIdx, signOutIdx + 1500);
    expect(signOutBlock).toContain("localStorage.removeItem('mpt_was_logged_in')");
    expect(signOutBlock).toContain("sessionStorage.removeItem('mpt_auto_auth_requested')");
  });

  it('includes Canonical Domain Bridge in index.html for seamless cross-domain unification', () => {
    const indexContent = fs.readFileSync(indexPath, 'utf8');
    expect(indexContent).toContain('id="canonical-domain-bridge"');
    expect(indexContent).toContain("CANONICAL_HOST = 'hss-planner.web.app'");
    expect(indexContent).toContain('mpt_sync=');
    expect(indexContent).toContain('window.location.replace(');
  });

  it('contains processDomainBridgePayload in src/app.js to deserialize bridged cross-domain state', () => {
    const appJsContent = fs.readFileSync(appJsPath, 'utf8');
    expect(appJsContent).toContain('function processDomainBridgePayload()');
    expect(appJsContent).toContain('mpt_sync=');
    expect(appJsContent).toContain('window.history.replaceState');
  });

  it('keeps root sw.js and public/sw.js cache versions in lockstep', () => {
    const swContent = fs.readFileSync(swJsPath, 'utf8');
    const publicSwContent = fs.readFileSync(publicSwJsPath, 'utf8');

    const swCacheMatch = swContent.match(/const CACHE_NAME = '([^']+)';/);
    const publicSwCacheMatch = publicSwContent.match(/const CACHE_NAME = '([^']+)';/);

    expect(swCacheMatch).not.toBeNull();
    expect(publicSwCacheMatch).not.toBeNull();
    expect(swCacheMatch[1]).toBe(publicSwCacheMatch[1]);
    const { version } = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../package.json'), 'utf8'));
    expect(swCacheMatch[1]).toBe(`hss-planner-v${version}`);
  });

  it('ensures service worker deletes obsolete caches on activation', () => {
    const swContent = fs.readFileSync(swJsPath, 'utf8');
    expect(swContent).toContain('keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))');
    expect(swContent).toContain('self.clients.claim()');
  });

  describe('schedulePostPlanAuthModal behavior', () => {
    function setupSandbox(initialStorage = {}, user = null, appState = { plan: [{ dayNumber: 1, tasks: [] }] }) {
      const storage = { ...initialStorage };
      const localStorageMock = {
        getItem: vi.fn((k) => storage[k] ?? null),
        setItem: vi.fn((k, v) => { storage[k] = String(v); }),
        removeItem: vi.fn((k) => { delete storage[k]; }),
      };
      let openAuthModalCalled = false;
      const appJsContent = fs.readFileSync(appJsPath, 'utf8');

      const fnMatch = appJsContent.match(/function schedulePostPlanAuthModal\([\s\S]*?\n        \}/);
      if (!fnMatch) throw new Error('schedulePostPlanAuthModal function not found in app.js');

      const scriptCode = `
        let authModalTimer = null;
        let currentUser = sandboxUser;
        let appState = sandboxAppState;
        function openAuthModal() {
          openAuthModalCalled = true;
        }
        ${fnMatch[0]}
      `;

      const sandbox = {
        window: {},
        localStorage: localStorageMock,
        sessionStorage: localStorageMock,
        sandboxUser: user,
        sandboxAppState: appState,
        setTimeout: vi.fn((cb, delay) => {
          return { id: 123, cb, delay };
        }),
        clearTimeout: vi.fn(),
        openAuthModalCalled: false,
      };

      vm.createContext(sandbox);
      vm.runInContext(scriptCode, sandbox);

      return { sandbox, storage, localStorageMock };
    }

    it('schedules auth modal after 8000ms upon plan generation for non-logged-in user', () => {
      const { sandbox } = setupSandbox({});
      const timer = sandbox.schedulePostPlanAuthModal(8000);

      expect(timer).toBeDefined();
      expect(sandbox.setTimeout).toHaveBeenCalledWith(expect.any(Function), 8000);

      // Trigger the timer callback
      const timerCall = sandbox.setTimeout.mock.calls[0];
      const callback = timerCall[0];
      callback();

      expect(sandbox.openAuthModalCalled).toBe(true);
    });

    it('does not schedule auth modal if plan has not been generated yet', () => {
      const { sandbox } = setupSandbox({}, null, null);
      const timer = sandbox.schedulePostPlanAuthModal(8000);

      expect(timer).toBeUndefined();
      expect(sandbox.setTimeout).not.toHaveBeenCalled();
    });

    it('does not schedule auth modal if user is already logged in', () => {
      const { sandbox } = setupSandbox({}, { uid: 'user_123', email: 'test@example.com' });
      const timer = sandbox.schedulePostPlanAuthModal(8000);

      expect(timer).toBeUndefined();
      expect(sandbox.setTimeout).not.toHaveBeenCalled();
    });

    it('does not schedule auth modal if user was previously logged in', () => {
      const { sandbox } = setupSandbox({ mpt_was_logged_in: 'true' });
      const timer = sandbox.schedulePostPlanAuthModal(8000);

      expect(timer).toBeUndefined();
      expect(sandbox.setTimeout).not.toHaveBeenCalled();
    });

    it('does not schedule auth modal if user already saw or dismissed the auth modal', () => {
      const { sandbox } = setupSandbox({ has_seen_auth_modal: 'true' });
      const timer = sandbox.schedulePostPlanAuthModal(8000);

      expect(timer).toBeUndefined();
      expect(sandbox.setTimeout).not.toHaveBeenCalled();
    });
  });
});
