/**
 * High-Craft Vector Illustration System for +1 & +2 Planner
 * Pure inline SVGs — zero external assets, zero layout shifts, dark/light mode adaptive.
 * Crafted using modern geometry and domain-specific educational iconography.
 */

export const APP_LOGO_SVG = `
<svg class="w-full h-full" viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg" aria-label="+1 &amp; +2 Planner Emblem">
  <defs>
    <linearGradient id="logoGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#2563EB"/>
      <stop offset="50%" stop-color="#4F46E5"/>
      <stop offset="100%" stop-color="#0284C7"/>
    </linearGradient>
    <linearGradient id="capGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#FFFFFF"/>
      <stop offset="100%" stop-color="#E2E8F0"/>
    </linearGradient>
  </defs>
  <!-- Outer Rounded Shield -->
  <rect x="2" y="2" width="60" height="60" rx="18" fill="url(#logoGrad)" />
  <rect x="3" y="3" width="58" height="58" rx="17" stroke="rgba(255,255,255,0.25)" stroke-width="1.5" />
  
  <!-- Subtle Internal Geometry (Subtle Grid) -->
  <path d="M12 44L32 54L52 44" stroke="rgba(255,255,255,0.2)" stroke-width="2" stroke-linecap="round"/>
  
  <!-- Graduation Cap -->
  <path d="M32 14L10 24L32 34L54 24L32 14Z" fill="url(#capGrad)" />
  <path d="M18 29.5V40C18 43.5 24.2 46.5 32 46.5C39.8 46.5 46 43.5 46 40V29.5" stroke="#FFFFFF" stroke-width="3" stroke-linecap="round"/>
  
  <!-- Tassel -->
  <path d="M49 26V37.5L52 39.5" stroke="#FDE047" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>
  <circle cx="52" cy="41" r="2" fill="#FDE047" />
  
  <!-- Core Text Badge (+1 / +2 Indicator) -->
  <rect x="22" y="47" width="20" height="9" rx="4.5" fill="#1E293B" stroke="rgba(255,255,255,0.4)" stroke-width="1" />
  <text x="32" y="54" text-anchor="middle" fill="#38BDF8" font-family="system-ui, sans-serif" font-size="6.5" font-weight="900" letter-spacing="0.5">+1 • +2</text>
</svg>
`;

export const STREAM_ILLUSTRATIONS = {
  cs: `
  <svg class="w-full h-16 rounded-xl overflow-hidden" viewBox="0 0 240 64" fill="none" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="csGrad" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#0F172A" stop-opacity="0.9"/>
        <stop offset="100%" stop-color="#1E3A8A" stop-opacity="0.8"/>
      </linearGradient>
    </defs>
    <rect width="240" height="64" rx="12" fill="url(#csGrad)" />
    <!-- Terminal Header Dots -->
    <circle cx="16" cy="14" r="3" fill="#EF4444" opacity="0.8"/>
    <circle cx="26" cy="14" r="3" fill="#F59E0B" opacity="0.8"/>
    <circle cx="36" cy="14" r="3" fill="#10B981" opacity="0.8"/>
    <!-- Code Lines -->
    <rect x="16" y="26" width="45" height="4" rx="2" fill="#38BDF8" opacity="0.9"/>
    <rect x="66" y="26" width="30" height="4" rx="2" fill="#818CF8" opacity="0.7"/>
    <rect x="24" y="36" width="60" height="4" rx="2" fill="#94A3B8" opacity="0.6"/>
    <rect x="24" y="46" width="40" height="4" rx="2" fill="#34D399" opacity="0.8"/>
    <!-- Circuit Graphic on right -->
    <path d="M160 32H180L190 20H210" stroke="#38BDF8" stroke-width="2" stroke-linecap="round" opacity="0.6"/>
    <path d="M180 32L190 44H215" stroke="#818CF8" stroke-width="2" stroke-linecap="round" opacity="0.6"/>
    <circle cx="210" cy="20" r="4" fill="#0284C7" stroke="#38BDF8" stroke-width="1.5"/>
    <circle cx="215" cy="44" r="4" fill="#4F46E5" stroke="#818CF8" stroke-width="1.5"/>
    <text x="175" y="55" fill="#60A5FA" font-family="monospace" font-size="10" font-weight="bold" opacity="0.85">&lt;dev/&gt;</text>
  </svg>
  `,

  bio: `
  <svg class="w-full h-16 rounded-xl overflow-hidden" viewBox="0 0 240 64" fill="none" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="bioGrad" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#064E3B" stop-opacity="0.9"/>
        <stop offset="100%" stop-color="#047857" stop-opacity="0.8"/>
      </linearGradient>
    </defs>
    <rect width="240" height="64" rx="12" fill="url(#bioGrad)" />
    <!-- Botanical Leaf -->
    <path d="M30 48C30 48 34 22 56 16C56 16 54 38 30 48Z" fill="#34D399" fill-opacity="0.6" stroke="#A7F3D0" stroke-width="1.5"/>
    <path d="M30 48C36 38 46 28 56 16" stroke="#ECFDF5" stroke-width="1.5" stroke-linecap="round"/>
    <!-- DNA Strand representation -->
    <path d="M140 18C155 18 165 46 180 46C195 46 205 18 220 18" stroke="#6EE7B7" stroke-width="2.5" stroke-linecap="round"/>
    <path d="M140 46C155 46 165 18 180 18C195 18 205 46 220 46" stroke="#34D399" stroke-width="2.5" stroke-linecap="round"/>
    <!-- DNA base pairs -->
    <line x1="150" y1="26" x2="150" y2="38" stroke="#A7F3D0" stroke-width="1.5"/>
    <line x1="180" y1="20" x2="180" y2="44" stroke="#A7F3D0" stroke-width="1.5"/>
    <line x1="210" y1="26" x2="210" y2="38" stroke="#A7F3D0" stroke-width="1.5"/>
    <text x="80" y="38" fill="#D1FAE5" font-family="system-ui, sans-serif" font-size="11" font-weight="800">BOTANY • ZOOLOGY</text>
  </svg>
  `,

  commerce: `
  <svg class="w-full h-16 rounded-xl overflow-hidden" viewBox="0 0 240 64" fill="none" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="commGrad" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#31104B" stop-opacity="0.9"/>
        <stop offset="100%" stop-color="#581C87" stop-opacity="0.8"/>
      </linearGradient>
    </defs>
    <rect width="240" height="64" rx="12" fill="url(#commGrad)" />
    <!-- Candlestick / Bar Chart -->
    <rect x="25" y="32" width="10" height="18" rx="2" fill="#C084FC" opacity="0.8"/>
    <line x1="30" y1="26" x2="30" y2="52" stroke="#E9D5FF" stroke-width="1.5"/>
    <rect x="45" y="22" width="10" height="28" rx="2" fill="#A855F7" opacity="0.9"/>
    <line x1="50" y1="16" x2="50" y2="54" stroke="#E9D5FF" stroke-width="1.5"/>
    <rect x="65" y="16" width="10" height="34" rx="2" fill="#34D399" opacity="0.9"/>
    <line x1="70" y1="12" x2="70" y2="54" stroke="#A7F3D0" stroke-width="1.5"/>
    <!-- Growth Line Graph -->
    <path d="M25 42L45 30L65 24L85 14" stroke="#FDE047" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
    <circle cx="85" cy="14" r="3.5" fill="#FDE047"/>
    <!-- Financial Ledger Badge on right -->
    <rect x="150" y="16" width="65" height="32" rx="6" fill="#1E1B4B" stroke="#A855F7" stroke-width="1.5"/>
    <text x="182" y="34" text-anchor="middle" fill="#E9D5FF" font-family="system-ui, sans-serif" font-size="10" font-weight="bold">₹ LEDGER</text>
  </svg>
  `,

  humanities: `
  <svg class="w-full h-16 rounded-xl overflow-hidden" viewBox="0 0 240 64" fill="none" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="humGrad" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#4C0519" stop-opacity="0.9"/>
        <stop offset="100%" stop-color="#881337" stop-opacity="0.8"/>
      </linearGradient>
    </defs>
    <rect width="240" height="64" rx="12" fill="url(#humGrad)" />
    <!-- Classical Greek/Roman Pillar Architecture -->
    <!-- Base -->
    <rect x="22" y="46" width="46" height="4" rx="1" fill="#FDA4AF"/>
    <!-- Top Pediment -->
    <path d="M20 20L45 10L70 20Z" fill="#FDA4AF"/>
    <rect x="22" y="20" width="46" height="3" fill="#FECDD3"/>
    <!-- 3 Columns -->
    <rect x="26" y="23" width="6" height="23" rx="1" fill="#FFF1F2"/>
    <rect x="42" y="23" width="6" height="23" rx="1" fill="#FFF1F2"/>
    <rect x="58" y="23" width="6" height="23" rx="1" fill="#FFF1F2"/>
    <!-- World Globe & History Scroll -->
    <circle cx="170" cy="32" r="16" stroke="#FDA4AF" stroke-width="1.5" fill="#881337" fill-opacity="0.5"/>
    <ellipse cx="170" cy="32" rx="7" ry="16" stroke="#FDA4AF" stroke-width="1.2"/>
    <line x1="154" y1="32" x2="186" y2="32" stroke="#FDA4AF" stroke-width="1.2"/>
    <text x="100" y="38" fill="#FFE4E6" font-family="system-ui, sans-serif" font-size="10" font-weight="bold">CIVICS • POLITY</text>
  </svg>
  `
};

export const SUBJECT_BANNER_ILLUSTRATIONS = {
  Physics: `
  <div class="h-20 w-full rounded-2xl bg-gradient-to-r from-blue-900 via-indigo-950 to-slate-900 p-3 sm:p-4 text-white flex items-center justify-between border border-blue-800/50 shadow-sm relative overflow-hidden mb-3">
    <div class="relative z-10">
      <div class="flex items-center gap-2">
        <span class="text-xs font-black uppercase tracking-wider text-cyan-300">Class 12 Core Science</span>
        <span class="text-[10px] bg-blue-500/30 text-blue-200 border border-blue-400/40 px-2 py-0.5 rounded-full font-bold">Theory & Numericals</span>
      </div>
      <h3 class="text-lg sm:text-xl font-black text-white mt-0.5 tracking-tight">Physics</h3>
      <p class="text-xs text-blue-200/80">Electrostatics, Magnetism, Optics & Modern Physics</p>
    </div>
    <div class="w-16 h-16 sm:w-20 sm:h-20 text-cyan-400/80 shrink-0 relative z-10 flex items-center justify-center">
      <svg class="w-14 h-14" viewBox="0 0 64 64" fill="none" stroke="currentColor">
        <circle cx="32" cy="32" r="5" fill="#38BDF8"/>
        <ellipse cx="32" cy="32" rx="28" ry="11" stroke="#38BDF8" stroke-width="1.8" transform="rotate(0 32 32)"/>
        <ellipse cx="32" cy="32" rx="28" ry="11" stroke="#818CF8" stroke-width="1.8" transform="rotate(60 32 32)"/>
        <ellipse cx="32" cy="32" rx="28" ry="11" stroke="#C084FC" stroke-width="1.8" transform="rotate(120 32 32)"/>
      </svg>
    </div>
  </div>
  `,

  Chemistry: `
  <div class="h-20 w-full rounded-2xl bg-gradient-to-r from-amber-950 via-rose-950 to-slate-900 p-3 sm:p-4 text-white flex items-center justify-between border border-amber-800/50 shadow-sm relative overflow-hidden mb-3">
    <div class="relative z-10">
      <div class="flex items-center gap-2">
        <span class="text-xs font-black uppercase tracking-wider text-amber-300">Chemical Sciences</span>
        <span class="text-[10px] bg-amber-500/30 text-amber-200 border border-amber-400/40 px-2 py-0.5 rounded-full font-bold">Physical • Organic • Inorganic</span>
      </div>
      <h3 class="text-lg sm:text-xl font-black text-white mt-0.5 tracking-tight">Chemistry</h3>
      <p class="text-xs text-amber-200/80">Solutions, Electrochemistry, Kinetics & Carbon Mechanisms</p>
    </div>
    <div class="w-16 h-16 sm:w-20 sm:h-20 text-amber-400/80 shrink-0 relative z-10 flex items-center justify-center">
      <svg class="w-14 h-14" viewBox="0 0 64 64" fill="none" stroke="currentColor">
        <!-- Beaker / Flask with Bubbles -->
        <path d="M26 10H38M32 10V22L16 48C14 51 16 54 20 54H44C48 54 50 51 48 48L32 22" stroke="#F59E0B" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
        <line x1="22" y1="42" x2="42" y2="42" stroke="#FBBF24" stroke-width="2"/>
        <circle cx="28" cy="46" r="2.5" fill="#FBBF24"/>
        <circle cx="36" cy="48" r="2" fill="#FDE68A"/>
        <circle cx="32" cy="38" r="1.5" fill="#FBBF24"/>
      </svg>
    </div>
  </div>
  `,

  Mathematics: `
  <div class="h-20 w-full rounded-2xl bg-gradient-to-r from-rose-950 via-red-950 to-slate-900 p-3 sm:p-4 text-white flex items-center justify-between border border-rose-800/50 shadow-sm relative overflow-hidden mb-3">
    <div class="relative z-10">
      <div class="flex items-center gap-2">
        <span class="text-xs font-black uppercase tracking-wider text-rose-300">Pure & Applied Maths</span>
        <span class="text-[10px] bg-rose-500/30 text-rose-200 border border-rose-400/40 px-2 py-0.5 rounded-full font-bold">Calculus & Vectors</span>
      </div>
      <h3 class="text-lg sm:text-xl font-black text-white mt-0.5 tracking-tight">Mathematics</h3>
      <p class="text-xs text-rose-200/80">Calculus, Matrices, Probability & 3D Geometry</p>
    </div>
    <div class="w-16 h-16 sm:w-20 sm:h-20 text-rose-400/80 shrink-0 relative z-10 flex items-center justify-center">
      <svg class="w-14 h-14" viewBox="0 0 64 64" fill="none" stroke="currentColor">
        <!-- Integral Symbol & Axes -->
        <path d="M12 50H52M12 12V52" stroke="#FDA4AF" stroke-width="2" stroke-linecap="round"/>
        <path d="M18 46C24 46 28 32 34 32C40 32 44 18 50 18" stroke="#F43F5E" stroke-width="2.5" stroke-linecap="round"/>
        <!-- Math Integral ∫ -->
        <text x="36" y="28" fill="#FECDD3" font-family="serif" font-size="20" font-weight="bold">∫</text>
      </svg>
    </div>
  </div>
  `,

  'Computer Science': `
  <div class="h-20 w-full rounded-2xl bg-gradient-to-r from-cyan-950 via-blue-950 to-slate-900 p-3 sm:p-4 text-white flex items-center justify-between border border-cyan-800/50 shadow-sm relative overflow-hidden mb-3">
    <div class="relative z-10">
      <div class="flex items-center gap-2">
        <span class="text-xs font-black uppercase tracking-wider text-cyan-300">Computational Thinking</span>
        <span class="text-[10px] bg-cyan-500/30 text-cyan-200 border border-cyan-400/40 px-2 py-0.5 rounded-full font-bold">Python • SQL • Networking</span>
      </div>
      <h3 class="text-lg sm:text-xl font-black text-white mt-0.5 tracking-tight">Computer Science</h3>
      <p class="text-xs text-cyan-200/80">Data Structures, Database Management & Web Technologies</p>
    </div>
    <div class="w-16 h-16 sm:w-20 sm:h-20 text-cyan-400/80 shrink-0 relative z-10 flex items-center justify-center">
      <svg class="w-14 h-14" viewBox="0 0 64 64" fill="none" stroke="currentColor">
        <rect x="10" y="14" width="44" height="32" rx="4" stroke="#22D3EE" stroke-width="2"/>
        <line x1="10" y1="24" x2="54" y2="24" stroke="#22D3EE" stroke-width="1.5"/>
        <circle cx="16" cy="19" r="1.5" fill="#EF4444"/>
        <circle cx="22" cy="19" r="1.5" fill="#F59E0B"/>
        <circle cx="28" cy="19" r="1.5" fill="#10B981"/>
        <path d="M22 32L18 36L22 40M32 32L36 36L32 40" stroke="#67E8F9" stroke-width="2" stroke-linecap="round"/>
        <line x1="22" y1="52" x2="42" y2="52" stroke="#22D3EE" stroke-width="2"/>
      </svg>
    </div>
  </div>
  `,

  Botany: `
  <div class="h-20 w-full rounded-2xl bg-gradient-to-r from-emerald-950 via-teal-950 to-slate-900 p-3 sm:p-4 text-white flex items-center justify-between border border-emerald-800/50 shadow-sm relative overflow-hidden mb-3">
    <div class="relative z-10">
      <div class="flex items-center gap-2">
        <span class="text-xs font-black uppercase tracking-wider text-emerald-300">Biological Sciences</span>
        <span class="text-[10px] bg-emerald-500/30 text-emerald-200 border border-emerald-400/40 px-2 py-0.5 rounded-full font-bold">Plant Biology</span>
      </div>
      <h3 class="text-lg sm:text-xl font-black text-white mt-0.5 tracking-tight">Botany</h3>
      <p class="text-xs text-emerald-200/80">Plant Reproduction, Genetics, Biotechnology & Ecology</p>
    </div>
    <div class="w-16 h-16 sm:w-20 sm:h-20 text-emerald-400/80 shrink-0 relative z-10 flex items-center justify-center">
      <svg class="w-14 h-14" viewBox="0 0 64 64" fill="none" stroke="currentColor">
        <path d="M32 54V24" stroke="#34D399" stroke-width="2.5" stroke-linecap="round"/>
        <path d="M32 38C40 38 48 30 50 20C40 20 32 28 32 38Z" fill="#059669" stroke="#34D399" stroke-width="2"/>
        <path d="M32 44C24 44 16 36 14 26C24 26 32 34 32 44Z" fill="#10B981" stroke="#6EE7B7" stroke-width="2"/>
      </svg>
    </div>
  </div>
  `,

  Zoology: `
  <div class="h-20 w-full rounded-2xl bg-gradient-to-r from-teal-950 via-cyan-950 to-slate-900 p-3 sm:p-4 text-white flex items-center justify-between border border-teal-800/50 shadow-sm relative overflow-hidden mb-3">
    <div class="relative z-10">
      <div class="flex items-center gap-2">
        <span class="text-xs font-black uppercase tracking-wider text-teal-300">Animal & Human Biology</span>
        <span class="text-[10px] bg-teal-500/30 text-teal-200 border border-teal-400/40 px-2 py-0.5 rounded-full font-bold">Physiology & Health</span>
      </div>
      <h3 class="text-lg sm:text-xl font-black text-white mt-0.5 tracking-tight">Zoology</h3>
      <p class="text-xs text-teal-200/80">Human Reproduction, Immunity, Evolution & Human Health</p>
    </div>
    <div class="w-16 h-16 sm:w-20 sm:h-20 text-teal-400/80 shrink-0 relative z-10 flex items-center justify-center">
      <svg class="w-14 h-14" viewBox="0 0 64 64" fill="none" stroke="currentColor">
        <!-- DNA Helix -->
        <path d="M18 14C28 14 36 50 46 50" stroke="#2DD4BF" stroke-width="2.5" stroke-linecap="round"/>
        <path d="M18 50C28 50 36 14 46 14" stroke="#5EEAD4" stroke-width="2.5" stroke-linecap="round"/>
        <line x1="22" y1="20" x2="42" y2="44" stroke="#99F6E4" stroke-width="1.8"/>
        <line x1="22" y1="44" x2="42" y2="20" stroke="#99F6E4" stroke-width="1.8"/>
      </svg>
    </div>
  </div>
  `,

  Accountancy: `
  <div class="h-20 w-full rounded-2xl bg-gradient-to-r from-emerald-950 via-green-950 to-slate-900 p-3 sm:p-4 text-white flex items-center justify-between border border-emerald-800/50 shadow-sm relative overflow-hidden mb-3">
    <div class="relative z-10">
      <div class="flex items-center gap-2">
        <span class="text-xs font-black uppercase tracking-wider text-emerald-300">Commerce Core</span>
        <span class="text-[10px] bg-emerald-500/30 text-emerald-200 border border-emerald-400/40 px-2 py-0.5 rounded-full font-bold">Financial Statements</span>
      </div>
      <h3 class="text-lg sm:text-xl font-black text-white mt-0.5 tracking-tight">Accountancy</h3>
      <p class="text-xs text-emerald-200/80">Partnership, Share Capital, Financial Analysis & Cash Flow</p>
    </div>
    <div class="w-16 h-16 sm:w-20 sm:h-20 text-emerald-400/80 shrink-0 relative z-10 flex items-center justify-center">
      <svg class="w-14 h-14" viewBox="0 0 64 64" fill="none" stroke="currentColor">
        <rect x="14" y="10" width="36" height="44" rx="4" stroke="#34D399" stroke-width="2"/>
        <line x1="20" y1="20" x2="44" y2="20" stroke="#A7F3D0" stroke-width="2"/>
        <line x1="20" y1="28" x2="36" y2="28" stroke="#A7F3D0" stroke-width="1.5"/>
        <line x1="20" y1="36" x2="44" y2="36" stroke="#A7F3D0" stroke-width="1.5"/>
        <text x="36" y="47" fill="#FDE047" font-family="system-ui" font-size="10" font-weight="bold">₹</text>
      </svg>
    </div>
  </div>
  `,

  'Business Studies': `
  <div class="h-20 w-full rounded-2xl bg-gradient-to-r from-blue-950 via-slate-900 to-indigo-950 p-3 sm:p-4 text-white flex items-center justify-between border border-blue-800/50 shadow-sm relative overflow-hidden mb-3">
    <div class="relative z-10">
      <div class="flex items-center gap-2">
        <span class="text-xs font-black uppercase tracking-wider text-blue-300">Management & Strategy</span>
        <span class="text-[10px] bg-blue-500/30 text-blue-200 border border-blue-400/40 px-2 py-0.5 rounded-full font-bold">Planning & Marketing</span>
      </div>
      <h3 class="text-lg sm:text-xl font-black text-white mt-0.5 tracking-tight">Business Studies</h3>
      <p class="text-xs text-blue-200/80">Principles of Management, Business Environment & Consumer Protection</p>
    </div>
    <div class="w-16 h-16 sm:w-20 sm:h-20 text-blue-400/80 shrink-0 relative z-10 flex items-center justify-center">
      <svg class="w-14 h-14" viewBox="0 0 64 64" fill="none" stroke="currentColor">
        <rect x="14" y="24" width="36" height="28" rx="3" stroke="#60A5FA" stroke-width="2"/>
        <path d="M24 24V18C24 15.79 25.79 14 28 14H36C38.21 14 40 15.79 40 18V24" stroke="#93C5FD" stroke-width="2"/>
        <line x1="32" y1="36" x2="32" y2="40" stroke="#93C5FD" stroke-width="2"/>
      </svg>
    </div>
  </div>
  `,

  Economics: `
  <div class="h-20 w-full rounded-2xl bg-gradient-to-r from-amber-950 via-orange-950 to-slate-900 p-3 sm:p-4 text-white flex items-center justify-between border border-amber-800/50 shadow-sm relative overflow-hidden mb-3">
    <div class="relative z-10">
      <div class="flex items-center gap-2">
        <span class="text-xs font-black uppercase tracking-wider text-amber-300">Economic Sciences</span>
        <span class="text-[10px] bg-amber-500/30 text-amber-200 border border-amber-400/40 px-2 py-0.5 rounded-full font-bold">Micro & Macroeconomics</span>
      </div>
      <h3 class="text-lg sm:text-xl font-black text-white mt-0.5 tracking-tight">Economics</h3>
      <p class="text-xs text-amber-200/80">National Income, Money & Banking, Market Equilibrium</p>
    </div>
    <div class="w-16 h-16 sm:w-20 sm:h-20 text-amber-400/80 shrink-0 relative z-10 flex items-center justify-center">
      <svg class="w-14 h-14" viewBox="0 0 64 64" fill="none" stroke="currentColor">
        <line x1="12" y1="52" x2="52" y2="52" stroke="#FBBF24" stroke-width="2"/>
        <line x1="12" y1="12" x2="12" y2="52" stroke="#FBBF24" stroke-width="2"/>
        <path d="M16 44L28 32L40 38L52 18" stroke="#F59E0B" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
        <circle cx="52" cy="18" r="3.5" fill="#FBBF24"/>
      </svg>
    </div>
  </div>
  `
};

export function getSubjectBanner(subject) {
  return SUBJECT_BANNER_ILLUSTRATIONS[subject] || `
  <div class="h-20 w-full rounded-2xl bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 p-3 sm:p-4 text-white flex items-center justify-between border border-slate-700 shadow-sm relative overflow-hidden mb-3">
    <div>
      <span class="text-xs font-black uppercase tracking-wider text-blue-300">SCERT Kerala Curriculum</span>
      <h3 class="text-lg sm:text-xl font-black text-white mt-0.5 tracking-tight">${subject}</h3>
      <p class="text-xs text-slate-300">Prescribed Higher Secondary Syllabus</p>
    </div>
    <div class="w-14 h-14 text-blue-400 shrink-0 flex items-center justify-center">
      <svg class="w-10 h-10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>
    </div>
  </div>
  `;
}
