# v6.4.1 validation

> Historical release report. The owner later requested immediate removal of the floating feature; v6.4.2 removes it. See [current validation](VALIDATION-6.4.2.md).

Date: 16 October 2026. Scope: practical guest study flow, application evidence and offline reliability.

## Verified locally

- `npm run lint`: passed.
- `npm test -- --reporter=dot`: 101 tests passed in 11 files.
- `npm run test:legacy`: 553 checks passed, zero failures.
- `npm run test:benchmark`: six synthetic scenarios completed. These are scheduler checks, not evidence of student outcomes.
- `npm run build`: production app built; generated JavaScript and CSS are added to the service worker's install cache.
- `npm run test:e2e -- --workers=1`: all five Chromium tests passed together after the calendar change. This covers local event properties, offline reload and language switching, mobile/desktop guest flows, today/overdue/tomorrow separation, completion without auto-advancing, date rollover and overdue completion persistence.
- `git diff --check`: passed.

## Defects caught during verification

- The previous browser analytics test used an obsolete plan-generation button. It now exercises the current setup and completion controls; it verifies local event properties, not remote analytics delivery or legal compliance.
- The old offline test accepted an installing worker. It now waits for control, checks cached bundles, then verifies the interactive setup and language controls after a fully offline reload.
- The first visit could cache HTML without application bundles. The build now precaches bundles; matching ignores Origin variations only for invariant same-origin JavaScript/CSS assets.
- The stats page read an obsolete plan key and called account/friend stars organic adoption. It now reads the app's current key, renders the stream as text and states the evidence limits.

## Limits and application state

These tests do not validate curriculum accuracy, educational outcomes, statutory compliance, independent usage or acceptance into OpenAI's program. Existing plans retain their storage key and migration behavior. Optional Google sign-in remains available from the profile menu; no authenticated cloud-sync review was performed in this change.

The updated application discloses the previous submission and unverified independent adoption. The owner explicitly asked to hold submission and to remove the floating focus feature only after submission. That feature remains available. This document does not claim that an application has been submitted or a subscription awarded. Public release and deployment status should be verified from GitHub and the live app.
