/**
 * Accessible In-App Modal & Toast Dialog System
 * Replaces blocking browser alert() and confirm() calls with modern, accessible UI.
 */

let activeModalContainer = null;
let toastTimeout = null;

/**
 * Escapes HTML characters to prevent XSS.
 * @param {string|undefined|null} str
 * @returns {string}
 */
export function escapeHTML(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function ensureModalContainer() {
  if (typeof document === 'undefined') return null;
  if (!activeModalContainer) {
    activeModalContainer = document.getElementById('accessible-dialog-root');
    if (!activeModalContainer) {
      activeModalContainer = document.createElement('div');
      activeModalContainer.id = 'accessible-dialog-root';
      activeModalContainer.className = 'relative z-50';
      document.body.appendChild(activeModalContainer);
    }
  }
  return activeModalContainer;
}

/**
 * Modern non-blocking Toast notification
 */
export function showAppToast(message, icon = 'fa-circle-check text-emerald-400', durationMs = 3200) {
  if (typeof document === 'undefined') return;

  const banner = document.getElementById('toast-banner');
  const content = document.getElementById('toast-content');

  if (!banner || !content) return;

  if (toastTimeout) clearTimeout(toastTimeout);

  content.innerHTML = `
    <i class="fa-solid ${icon} text-base shrink-0"></i>
    <span class="flex-1 font-semibold">${escapeHTML(message)}</span>
  `;

  banner.classList.remove('translate-y-24', 'opacity-0', 'pointer-events-none');
  banner.classList.add('translate-y-0', 'opacity-100');

  toastTimeout = setTimeout(() => {
    banner.classList.remove('translate-y-0', 'opacity-100');
    banner.classList.add('translate-y-24', 'opacity-0', 'pointer-events-none');
  }, durationMs);
}

/**
 * Accessible In-App Alert (Replaces alert())
 * @param {Object} options
 * @param {string} options.title
 * @param {string} options.message
 * @param {string} [options.icon]
 * @param {string} [options.confirmText]
 * @returns {Promise<void>}
 */
export function showAppAlert({ title, message, icon = 'fa-circle-info text-blue-500', confirmText = 'OK' }) {
  return new Promise((resolve) => {
    const root = ensureModalContainer();
    if (!root) {
      resolve();
      return;
    }

    const modalId = 'dialog-' + Date.now();
    const modalEl = document.createElement('div');
    modalEl.id = modalId;
    modalEl.className = 'fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fade-in';
    modalEl.setAttribute('role', 'dialog');
    modalEl.setAttribute('aria-modal', 'true');

    modalEl.innerHTML = `
      <div class="bg-white dark:bg-[#0e1422] rounded-3xl p-6 max-w-sm w-full border border-slate-200 dark:border-slate-800 shadow-2xl text-center transform transition-all animate-scale-in">
        <div class="w-12 h-12 rounded-2xl bg-blue-50 dark:bg-blue-950/50 text-blue-600 dark:text-blue-400 flex items-center justify-center text-xl mx-auto mb-3">
          <i class="fa-solid ${icon}"></i>
        </div>
        <h3 class="text-base font-extrabold text-slate-900 dark:text-white mb-2">${escapeHTML(title)}</h3>
        <p class="text-xs text-slate-600 dark:text-slate-300 mb-5 leading-relaxed">${escapeHTML(message)}</p>
        <button type="button" id="${modalId}-confirm" class="w-full py-2.5 px-4 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-xl shadow-md transition active:scale-95">
          ${escapeHTML(confirmText)}
        </button>
      </div>
    `;

    root.appendChild(modalEl);

    const confirmBtn = document.getElementById(`${modalId}-confirm`);
    const cleanup = () => {
      modalEl.remove();
      document.removeEventListener('keydown', keyHandler);
      resolve();
    };

    const keyHandler = (e) => {
      if (e.key === 'Escape' || e.key === 'Enter') {
        cleanup();
      }
    };

    confirmBtn?.addEventListener('click', cleanup);
    document.addEventListener('keydown', keyHandler);
    confirmBtn?.focus();
  });
}

/**
 * Accessible In-App Confirmation (Replaces confirm())
 * @param {Object} options
 * @param {string} options.title
 * @param {string} options.message
 * @param {string} [options.icon]
 * @param {string} [options.confirmText]
 * @param {string} [options.cancelText]
 * @param {boolean} [options.isDestructive]
 * @returns {Promise<boolean>}
 */
export function showAppConfirm({
  title,
  message,
  icon = 'fa-triangle-exclamation text-amber-500',
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  isDestructive = false,
}) {
  return new Promise((resolve) => {
    const root = ensureModalContainer();
    if (!root) {
      resolve(false);
      return;
    }

    const modalId = 'dialog-' + Date.now();
    const modalEl = document.createElement('div');
    modalEl.id = modalId;
    modalEl.className = 'fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fade-in';
    modalEl.setAttribute('role', 'alertdialog');
    modalEl.setAttribute('aria-modal', 'true');

    const confirmBtnStyle = isDestructive
      ? 'bg-rose-600 hover:bg-rose-700 text-white'
      : 'bg-blue-600 hover:bg-blue-700 text-white';

    modalEl.innerHTML = `
      <div class="bg-white dark:bg-[#0e1422] rounded-3xl p-6 max-w-sm w-full border border-slate-200 dark:border-slate-800 shadow-2xl text-center transform transition-all animate-scale-in">
        <div class="w-12 h-12 rounded-2xl ${isDestructive ? 'bg-rose-50 dark:bg-rose-950/50 text-rose-600 dark:text-rose-400' : 'bg-amber-50 dark:bg-amber-950/50 text-amber-600 dark:text-amber-400'} flex items-center justify-center text-xl mx-auto mb-3">
          <i class="fa-solid ${icon}"></i>
        </div>
        <h3 class="text-base font-extrabold text-slate-900 dark:text-white mb-2">${escapeHTML(title)}</h3>
        <p class="text-xs text-slate-600 dark:text-slate-300 mb-5 leading-relaxed">${escapeHTML(message)}</p>
        <div class="flex items-center gap-2">
          <button type="button" id="${modalId}-cancel" class="flex-1 py-2.5 px-4 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-semibold text-xs rounded-xl transition active:scale-95">
            ${escapeHTML(cancelText)}
          </button>
          <button type="button" id="${modalId}-confirm" class="flex-1 py-2.5 px-4 ${confirmBtnStyle} font-bold text-xs rounded-xl shadow-md transition active:scale-95">
            ${escapeHTML(confirmText)}
          </button>
        </div>
      </div>
    `;

    root.appendChild(modalEl);

    const confirmBtn = document.getElementById(`${modalId}-confirm`);
    const cancelBtn = document.getElementById(`${modalId}-cancel`);

    const cleanup = (result) => {
      modalEl.remove();
      document.removeEventListener('keydown', keyHandler);
      resolve(result);
    };

    const keyHandler = (e) => {
      if (e.key === 'Escape') cleanup(false);
    };

    confirmBtn?.addEventListener('click', () => cleanup(true));
    cancelBtn?.addEventListener('click', () => cleanup(false));
    document.addEventListener('keydown', keyHandler);
    cancelBtn?.focus();
  });
}
