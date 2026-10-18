# v6.4.3 validation

Date: 18 October 2026. Scope: calendar rollover and portable study backups.

- ESLint: passed.
- Vitest: 124 tests passed in 12 files. Backup cases cover malformed dates/tasks, duplicate IDs, markup, oversized input, legacy defaults, account-field omission and storage rollback.
- Planner regression suite: 553 checks passed.
- Production build: passed; built bundles included in the offline cache.
- Chromium browser suite: six scenarios passed. The calendar scenario leaves a page open through local midnight, then simulates a brief screen lock spanning the following midnight. Today's assignments, completed history and pending work remain separate.
- Backup browser scenario: export an actual generated plan with progress, reject an invalid file without replacing the stored plan, cancel a valid restore, then restore and reload to verify dates, stream, tasks and both storage keys.
- Mobile/desktop guest completion, undo, tutor links, persistence and cold offline language switching retain regression coverage.

The new feedback guide describes voluntary student testing; it does not claim that students have already participated. These checks cover Chromium and local storage, not authenticated Firestore restore, every historical backup format, curriculum accuracy or educational outcomes. If storage remains completely unavailable, rollback cannot be guaranteed; the app reports a restore failure instead of claiming success.
