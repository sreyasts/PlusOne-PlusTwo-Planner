# v6.4.1 validation

Date: 16 October 2026. Scope: practical guest study flow, application evidence and offline reliability.

## Verified locally

- `npm run lint`: passed.
- `npm test -- --reporter=dot`: 95 tests passed in 10 files.
- `npm run test:legacy`: 553 checks passed, zero failures.
- `npm run test:benchmark`: six synthetic scenarios completed. These are scheduler checks, not evidence of student outcomes.
- `npm run build`: production app built; generated JavaScript and CSS are added to the service worker's install cache.
- `npm run test:e2e -- --workers=1`: all four Chromium tests passed. Coverage includes local event properties, a cold offline reload with English/Malayalam switching, and guest setup/completion/persistence at 390px and 1280px.
- `git diff --check`: passed.

## Defects caught during verification

- The previous browser analytics test used an obsolete plan-generation button. It now exercises the current setup and completion controls; it verifies local event properties, not remote analytics delivery or legal compliance.
- The old offline test accepted an installing worker. It now waits for control, checks cached bundles, then verifies the interactive setup and language controls after a fully offline reload.
- The first visit could cache HTML without application bundles. The build now precaches bundles; matching ignores Origin variations only for invariant same-origin JavaScript/CSS assets.
- The stats page read an obsolete plan key and called account/friend stars organic adoption. It now reads the app's current key, renders the stream as text and states the evidence limits.

## Limits and application state

These tests do not validate curriculum accuracy, educational outcomes, statutory compliance, independent usage or acceptance into OpenAI's program. Existing plans retain their storage key and migration behavior. Optional Google sign-in remains available from the profile menu; no authenticated cloud-sync review was performed in this change.

The updated application discloses the previous submission and unverified independent adoption. This document does not claim that an application has been submitted or a subscription awarded. Public release and deployment status should be verified from GitHub and the live app.
