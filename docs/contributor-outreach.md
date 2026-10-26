# Contributor Outreach & Good First Issues Catalog

This document provides ready-to-publish "Good First Issues" for open-source contributors and outreach message drafts for student developer and FOSS communities in Kerala.

---

## 1. Curated "Good First Issue" Definitions

These issues are structured so that new contributors (e.g. computer science undergraduates or self-taught developers) can make meaningful contributions within 1–2 hours.

### Issue 1: Complete Malayalam (മലയാളം) Localization for New Tools
- **Labels**: `good first issue`, `i18n`, `help wanted`
- **Scope**: Add Malayalam translations for strings introduced in `/exam-countdown` and `/backlog-recovery-planner`.
- **Files to Edit**: `src/i18n/ml.js` and `tests/i18n.test.js`.
- **Requirements**:
  1. Add translations for terms such as "Exam Countdown" (പരീക്ഷാ കൗണ്ട്ഡൗൺ), "Backlog Recovery" (പഠന ബാക്ക്‌ലോഗ് പരിഹാരം), "Revision Buffer" (റിവിഷൻ സമയം), and "Hours Remaining" (ശേഷിക്കുന്ന മണിക്കൂറുകൾ).
  2. Run `npm test tests/i18n.test.js` to verify 100% dictionary completeness.
- **Estimated Effort**: 30–45 minutes.

### Issue 2: OLED High-Contrast Mode for Late-Night Mobile Study (WCAG AAA)
- **Labels**: `good first issue`, `a11y`, `ui`
- **Scope**: Optimize contrast ratios on OLED dark mode for night-time study sessions.
- **Files to Edit**: `index.html` and Tailwind utility classes.
- **Requirements**:
  1. Verify contrast ratio of muted task text (`text-slate-400` vs `#0e1422` background) meets WCAG AAA standard (minimum 7:1 for normal text).
  2. Test in mobile viewport using Chrome DevTools Accessibility Audit.
- **Estimated Effort**: 45–60 minutes.

### Issue 3: Keyboard Shortcuts for Task Completion (`Space`, `J`, `K`)
- **Labels**: `good first issue`, `a11y`, `enhancement`
- **Scope**: Enable desktop power users to check off daily tasks using keyboard keys without a mouse.
- **Files to Edit**: `src/app.js` (add global keyboard event listener when modal is not open).
- **Requirements**:
  - `J` moves focus to next task; `K` moves focus to previous task.
  - `Space` toggles the focused task's completion checkbox and triggers the harmonic chime.
  - Ignored when user is typing inside an input or textarea.
- **Estimated Effort**: 60 minutes.

### Issue 4: ICSE / ISC Class 12 Curriculum Adapter
- **Labels**: `good first issue`, `architecture`, `curriculum`
- **Scope**: Implement an ISC (Council for the Indian School Certificate Examinations) Class 12 adapter subclassing `CurriculumAdapter.js`.
- **Files to Edit**: `src/adapters/ISCClass12Adapter.js` and `tests/curriculum_adapter.test.js`.
- **Requirements**:
  1. Implement `getSubjects()`, `getChaptersForSubject(subjectId)`, and `validateSyllabus()`.
  2. Add unit test verifying that ISC physics and chemistry syllabi load correctly into the planner.
- **Estimated Effort**: 90 minutes.

---

## 2. Community Outreach Drafts for Maintainer

*Note for Maintainer (Sreyas T S): Use these templates when posting in student developer forums, TinkerHub channels, or Kerala tech communities. Send personally from your own account.*

### Draft A: TinkerHub / Kerala Student Developer Communities
```text
Hey everyone! 👋

I'm Sreyas, a student developer from Kerala. I've been building HSS Planner (https://hss-planner.web.app/), a 100% free, open-source daily study planner tailored for Kerala Higher Secondary (+2) and +1 Improvement students.

The app uses a deterministic constraint scheduler (written in modern vanilla JS + Vite) that automatically weaves daily study portions, allocates revision buffers before exams, and works completely offline as a PWA.

We have active "Good First Issues" up on GitHub for anyone looking to contribute to open source:
👉 https://github.com/sreyasts/hss-planner/issues

Areas you can help with:
• Completing Malayalam translations (i18n)
• Mobile keyboard navigation shortcuts (a11y)
• Writing test adapters for other curriculums
• UI contrast and accessibility audits

Feel free to check out the repo, star if you find it helpful, and pick up an issue! Happy to mentor and review PRs within 48 hours.
```

### Draft B: Free Software Community of India (FSCI) / Kerala FOSS Groups
```text
Namaskaram!

HSS Planner is an offline-first, privacy-respecting educational web application built under the MIT License for Kerala Higher Secondary students.

Unlike commercial ed-tech platforms, it requires zero login, has zero ads, collects zero student PII, and complies with India's DPDP Act 2023. The codebase features 68 automated unit tests and 551 regression invariants.

Repository: https://github.com/sreyasts/hss-planner
Live App: https://hss-planner.web.app/

We welcome code contributions, syllabus audits against SCERT circulars, and feedback from educators and developers alike.
```
