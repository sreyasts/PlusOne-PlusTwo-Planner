# HSS Planner — Growth & Adoption Experiments Engine

This document tracks all product, acquisition, retention, and community experiments using an empirical scientific method:
**Hypothesis → Change → Expected Metric → Start Date → Result → Decision**.

---

## Experiment 1: Dedicated Search Intent Landing Pages vs. Single Static Home

- **Hypothesis**: High school students searching for specific queries like `"Kerala Plus Two timetable"`, `"Plus One improvement study plan"`, or `"Plus Two study planner"` have high intent but bounce if dropped onto a generic form. Providing dedicated, content-rich landing pages with direct interactive entry points will increase organic search impressions and improve setup conversion.
- **Change**: Build dedicated, crawlable pages with rich Schema.org FAQ structured data:
  - `/plus-two-timetable` (Direct countdown & schedule generator)
  - `/plus-one-improvement-planner` (Targeted improvement scheduler)
  - `/study-hours-calculator` (Self-study allocation calculator)
- **Expected Metric**: +100% crawl indexation in Google Search Console, \(\ge 30\%\) click-through rate into timetable generator.
- **Start Date**: 2026-09-23
- **Result**: Implemented pages in `pages/` and updated `sitemap.xml`.
- **Decision**: ACTIVE — Monitor Google Search Console impressions and landing-to-planner conversion funnel.

---

## Experiment 2: Zero-Friction First-Use Experience (No Mandatory Sign-In)

- **Hypothesis**: Forcing students to authenticate with Google before viewing their study timetable causes a \(\ge 50\%\) drop-off in setup completion. Providing immediate plan generation saved to local browser IndexedDB, with optional cloud sync offered only *after* value is realized, will maximize completion.
- **Change**: Ensure complete guest onboarding flow (`Stream → Subjects → Exam Date → Instant Day-1 Schedule`) without any auth walls.
- **Expected Metric**: Plan generation rate \(\ge 75\%\) of wizard starts.
- **Start Date**: 2026-09-21
- **Result**: Core guest flow operational with IndexedDB persistence; zero auth roadblocks.
- **Decision**: RETAINED — Maintain zero-friction guest mode as the default experience.

---

## Experiment 3: Frictionless WhatsApp & Peer Timetable Sharing

- **Hypothesis**: Kerala high school students study in peer study groups and communicate predominantly via WhatsApp and Telegram. Providing a 1-tap "Share Plan with Study Partner" button generating an anonymized summary with a deep-link back to the planner will create a natural viral loop.
- **Change**: Add native Web Share API integration with WhatsApp and Telegram fallbacks, generating clean text summaries of today's study targets and linking to `https://hss-planner.web.app/`.
- **Expected Metric**: Share event rate \(\ge 10\%\) among students who complete Day-1 tasks.
- **Start Date**: 2026-09-23
- **Result**: Share mechanism integrated into header and day-view completion cards.
- **Decision**: ACTIVE — Measure `plan_shared` event frequency.

---

## Experiment 4: Bilingual Malayalam Touchpoints for Local Student Trust

- **Hypothesis**: While the Kerala Higher Secondary curriculum uses English textbooks for Science streams, students discuss concepts, study schedules, and exam stress in Malayalam. Bilingual touchpoints (English + Malayalam guidance) will increase student comfort, trust, and retention.
- **Change**: Add Malayalam tooltips, chapter descriptors, and a toggleable Malayalam interface mode (`plustwo_lang`).
- **Expected Metric**: \(\ge 25\%\) adoption of Malayalam toggle; lower bounce rate among regional visitors.
- **Start Date**: 2026-09-23
- **Result**: Translation system structured in `src/i18n/` with community contribution workflow.
- **Decision**: ACTIVE — Expand translation dictionary with community help.
