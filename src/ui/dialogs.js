/**
 * Accessible In-App Modal & Toast Dialog System
 * Malabar Study Ledger — Editorial Warm Paper & Ink Aesthetic
 * Clean inline SVGs, zero font icon flicker, fully accessible with keyboard navigation.
 */

let activeModalContainer = null;
let toastTimeout = null;

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

function resolveDialogIcon(icon, defaultType = 'info') {
  if (typeof icon === 'string' && icon.trim().startsWith('<svg')) {
    return icon;
  }
  // If a FontAwesome class string was provided or default keywords
  if (icon?.includes('check') || defaultType === 'success') {
    return `
      <svg class="w-6 h-6 text-[#1B5E43] dark:text-[#52B788]" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <circle cx="12" cy="12" r="10"/>
        <polyline points="9 12 11 14 15 10"/>
      </svg>
    `;
  }
  if (icon?.includes('triangle') || icon?.includes('exclamation') || icon?.includes('amber') || defaultType === 'warning') {
    return `
      <svg class="w-6 h-6 text-[#9C6418] dark:text-[#DFAC54]" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/>
        <line x1="12" y1="9" x2="12" y2="13"/>
        <line x1="12" y1="17" x2="12.01" y2="17"/>
      </svg>
    `;
  }
  if (icon?.includes('rose') || icon?.includes('destructive') || defaultType === 'destructive') {
    return `
      <svg class="w-6 h-6 text-[#B8432E] dark:text-[#E57A65]" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <circle cx="12" cy="12" r="10"/>
        <line x1="15" y1="9" x2="9" y2="15"/>
        <line x1="9" y1="9" x2="15" y2="15"/>
      </svg>
    `;
  }
  return `
    <svg class="w-6 h-6 text-[#2F486D] dark:text-[#8BA7CE]" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="10"/>
      <line x1="12" y1="16" x2="12" y2="12"/>
      <line x1="12" y1="8" x2="12.01" y2="8"/>
    </svg>
  `;
}

/**
 * Editorial non-blocking Toast notification
 */
export function showAppToast(message, icon = 'fa-circle-check text-emerald-400', durationMs = 3200) {
  if (typeof document === 'undefined') return;

  const banner = document.getElementById('toast-banner');
  const content = document.getElementById('toast-content');

  if (!banner || !content) return;

  if (toastTimeout) clearTimeout(toastTimeout);

  const iconSvg = resolveDialogIcon(icon, 'success');

  content.innerHTML = `
    <span class="shrink-0 flex items-center justify-center">${iconSvg}</span>
    <span class="flex-1 font-semibold text-xs sm:text-sm text-[#EFECE4]">${message}</span>
  `;

  banner.classList.remove('translate-y-24', '-translate-y-6', 'opacity-0', 'pointer-events-none');
  banner.classList.add('translate-y-0', 'opacity-100');

  toastTimeout = setTimeout(() => {
    banner.classList.remove('translate-y-0', 'opacity-100');
    banner.classList.add('-translate-y-6', 'opacity-0', 'pointer-events-none');
  }, durationMs);
}

/**
 * Accessible In-App Alert (Replaces browser alert())
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
    modalEl.className = 'fixed inset-0 bg-[#141513]/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fade-in';
    modalEl.setAttribute('role', 'dialog');
    modalEl.setAttribute('aria-modal', 'true');

    const iconHtml = resolveDialogIcon(icon, 'info');

    modalEl.innerHTML = `
      <div class="bg-[#FBF9F4] dark:bg-[#1B1D1A] rounded-3xl p-6 max-w-sm w-full border border-[#D9D2C3] dark:border-[#31342E] shadow-2xl text-center transform transition-all animate-scale-in">
        <div class="w-12 h-12 rounded-2xl bg-[#EDE8DC] dark:bg-[#222521] border border-[#D9D2C3] dark:border-[#31342E] flex items-center justify-center mx-auto mb-3 shadow-xs">
          ${iconHtml}
        </div>
        <h3 class="font-serif text-lg font-bold text-[#181B18] dark:text-[#EFECE4] mb-2 tracking-tight">${title}</h3>
        <p class="text-xs text-[#474B45] dark:text-[#C4C0B6] mb-5 leading-relaxed">${message}</p>
        <button type="button" id="${modalId}-confirm" class="w-full min-h-[44px] py-2.5 px-4 bg-[#1B5E43] hover:bg-[#144833] text-white font-bold text-xs rounded-xl shadow-xs transition active:scale-95 cursor-pointer">
          ${confirmText}
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
    modalEl.className = 'fixed inset-0 bg-[#141513]/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fade-in';
    modalEl.setAttribute('role', 'alertdialog');
    modalEl.setAttribute('aria-modal', 'true');

    const confirmBtnStyle = isDestructive
      ? 'bg-[#B8432E] hover:bg-[#963523] text-white'
      : 'bg-[#1B5E43] hover:bg-[#144833] text-white';

    const iconHtml = resolveDialogIcon(icon, isDestructive ? 'destructive' : 'warning');

    modalEl.innerHTML = `
      <div class="bg-[#FBF9F4] dark:bg-[#1B1D1A] rounded-3xl p-6 max-w-sm w-full border border-[#D9D2C3] dark:border-[#31342E] shadow-2xl text-center transform transition-all animate-scale-in">
        <div class="w-12 h-12 rounded-2xl bg-[#EDE8DC] dark:bg-[#222521] border border-[#D9D2C3] dark:border-[#31342E] flex items-center justify-center mx-auto mb-3 shadow-xs">
          ${iconHtml}
        </div>
        <h3 class="font-serif text-lg font-bold text-[#181B18] dark:text-[#EFECE4] mb-2 tracking-tight">${title}</h3>
        <p class="text-xs text-[#474B45] dark:text-[#C4C0B6] mb-5 leading-relaxed">${message}</p>
        <div class="flex items-center gap-2">
          <button type="button" id="${modalId}-cancel" class="flex-1 min-h-[44px] py-2.5 px-4 bg-[#EDE8DC] dark:bg-[#222521] hover:bg-[#D9D2C3] dark:hover:bg-[#31342E] text-[#181B18] dark:text-[#EFECE4] border border-[#D9D2C3] dark:border-[#31342E] font-semibold text-xs rounded-xl transition active:scale-95 cursor-pointer">
            ${cancelText}
          </button>
          <button type="button" id="${modalId}-confirm" class="flex-1 min-h-[44px] py-2.5 px-4 ${confirmBtnStyle} font-bold text-xs rounded-xl shadow-xs transition active:scale-95 cursor-pointer">
            ${confirmText}
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
