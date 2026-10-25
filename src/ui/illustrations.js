/**
 * Clean Inline Vector Icons for Stream, Grade & Subject Boxes
 * Pure SVG — zero external webfont dependencies, zero layout shifts, 100% offline reliable.
 */

export const STREAM_ICONS = {
  cs: `
  <svg class="w-5 h-5 text-blue-600 dark:text-blue-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <rect width="18" height="12" x="3" y="4" rx="2"/>
    <line x1="2" x2="22" y1="20" y2="20"/>
    <polyline points="8 9 10 11 8 13"/>
    <line x1="12" x2="15" y1="13" y2="13"/>
  </svg>
  `,

  bio: `
  <svg class="w-5 h-5 text-emerald-600 dark:text-emerald-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M12 10a6 6 0 0 0-6-6H3v3a6 6 0 0 0 6 6h3"/>
    <path d="M12 22V10"/>
    <path d="M12 8a5 5 0 0 1 5-5h3v3a5 5 0 0 1-5 5h-3"/>
    <circle cx="18" cy="18" r="3" stroke-width="1.5"/>
    <circle cx="6" cy="18" r="2" stroke-width="1.5"/>
  </svg>
  `,

  commerce: `
  <svg class="w-5 h-5 text-purple-600 dark:text-purple-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <line x1="18" x2="18" y1="20" y2="10"/>
    <line x1="12" x2="12" y1="20" y2="4"/>
    <line x1="6" x2="6" y1="20" y2="14"/>
    <polyline points="4 9 12 3 20 7"/>
  </svg>
  `,

  humanities: `
  <svg class="w-5 h-5 text-rose-600 dark:text-rose-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <line x1="3" x2="21" y1="22" y2="22"/>
    <line x1="6" x2="6" y1="11" y2="18"/>
    <line x1="10" x2="10" y1="11" y2="18"/>
    <line x1="14" x2="14" y1="11" y2="18"/>
    <line x1="18" x2="18" y1="11" y2="18"/>
    <polygon points="12 2 20 7 4 7 12 2"/>
    <line x1="4" x2="20" y1="7" y2="7"/>
    <line x1="4" x2="20" y1="10" y2="10"/>
  </svg>
  `
};

export const GRADE_ICONS = {
  plusTwo: `
  <svg class="w-5 h-5 text-blue-600 dark:text-blue-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M22 10v6M2 10l10-5 10 5-10 5z"/>
    <path d="M6 12v5c3 3 9 3 12 0v-5"/>
  </svg>
  `,

  plusOne: `
  <svg class="w-5 h-5 text-amber-600 dark:text-amber-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/>
    <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>
  </svg>
  `
};

export const SUBJECT_ICONS = {
  Physics: `
  <svg class="w-5 h-5 text-indigo-600 dark:text-indigo-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
    <circle cx="12" cy="12" r="2"/>
    <ellipse cx="12" cy="12" rx="10" ry="4"/>
    <ellipse cx="12" cy="12" rx="10" ry="4" transform="rotate(60 12 12)"/>
    <ellipse cx="12" cy="12" rx="10" ry="4" transform="rotate(120 12 12)"/>
  </svg>
  `,

  Chemistry: `
  <svg class="w-5 h-5 text-amber-600 dark:text-amber-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
    <path d="M10 2v7.31L4.1 20.4a1 1 0 0 0 .86 1.6h14.08a1 1 0 0 0 .86-1.6L14 9.31V2"/>
    <line x1="8.5" y1="2" x2="15.5" y2="2"/>
    <line x1="7" y1="16" x2="17" y2="16"/>
  </svg>
  `,

  Mathematics: `
  <svg class="w-5 h-5 text-rose-600 dark:text-rose-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
    <rect width="16" height="20" x="4" y="2" rx="2"/>
    <line x1="8" x2="16" y1="6" y2="6"/>
    <line x1="16" x2="16" y1="14" y2="18"/>
    <path d="M16 10h.01M12 10h.01M8 10h.01M12 14h.01M8 14h.01M12 18h.01M8 18h.01"/>
  </svg>
  `,

  'Computer Science': `
  <svg class="w-5 h-5 text-cyan-600 dark:text-cyan-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
    <rect width="18" height="12" x="3" y="4" rx="2"/>
    <line x1="2" x2="22" y1="20" y2="20"/>
    <polyline points="10 9 8 11 10 13"/>
    <polyline points="14 9 16 11 14 13"/>
  </svg>
  `,

  Botany: `
  <svg class="w-5 h-5 text-emerald-600 dark:text-emerald-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
    <path d="M12 10a6 6 0 0 0-6-6H3v3a6 6 0 0 0 6 6h3"/>
    <path d="M12 22V10"/>
    <path d="M12 8a5 5 0 0 1 5-5h3v3a5 5 0 0 1-5 5h-3"/>
  </svg>
  `,

  Zoology: `
  <svg class="w-5 h-5 text-teal-600 dark:text-teal-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
    <path d="M2 15c6.667-6 13.333 0 20-6"/>
    <path d="M9 22c1.798-1.998 2.518-3.995 2.807-5.993"/>
    <path d="M15 2c-1.798 1.998-2.518 3.995-2.807 5.993"/>
  </svg>
  `,

  Accountancy: `
  <svg class="w-5 h-5 text-emerald-600 dark:text-emerald-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
    <rect width="16" height="20" x="4" y="2" rx="2"/>
    <line x1="8" x2="16" y1="7" y2="7"/>
    <line x1="8" x2="16" y1="11" y2="11"/>
    <line x1="8" x2="12" y1="15" y2="15"/>
  </svg>
  `,

  'Business Studies': `
  <svg class="w-5 h-5 text-blue-600 dark:text-blue-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
    <rect width="20" height="14" x="2" y="7" rx="2" ry="2"/>
    <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/>
  </svg>
  `,

  Economics: `
  <svg class="w-5 h-5 text-amber-600 dark:text-amber-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
    <line x1="18" x2="18" y1="20" y2="10"/>
    <line x1="12" x2="12" y1="20" y2="4"/>
    <line x1="6" x2="6" y1="20" y2="14"/>
  </svg>
  `
};

export function getSubjectBoxIcon(subject) {
  return SUBJECT_ICONS[subject] || `
  <svg class="w-5 h-5 text-blue-600 dark:text-blue-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
    <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>
  </svg>
  `;
}

// Backwards compatibility aliases
export const STREAM_ILLUSTRATIONS = STREAM_ICONS;
export const getSubjectBanner = getSubjectBoxIcon;

