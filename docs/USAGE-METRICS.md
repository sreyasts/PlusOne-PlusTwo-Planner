# HSS Planner — Privacy-First Usage Telemetry & Metrics Specification

This document describes telemetry design and metric definitions for **HSS Planner**. It is not a legal compliance assessment.

No independent DPDP/GDPR review has been established. The local tracker filters known property keys and may forward events through Firebase Analytics; provider metadata, cookie behavior and network delivery have not been audited. Local counters do not measure independent students or prove study habits.

---

## 1. Data Handling and Verification Limits

1. **Local Event Properties**:
   - The tracker strips known keys such as email, name and userId; this limited filter does not establish zero personal-data collection.
   - IP handling by hosting and analytics providers has not been independently verified.
2. **Analytics Configuration**:
   - Cookieless operation and absence of third-party identifiers have not been verified.
   - The source attempts to configure analytics flags; these alone do not prove provider behavior:
     ```javascript
     window['gtag_enable_tcf_support'] = false;
     window['ga-disable-analytics'] = false;
     ```
   - These flags do not establish consent behavior or legal compliance.
3. **Optional Cloud Authentication**:
   - Google Sign-In is optional. The cloud-save code writes account email, display name and study-plan fields to Firestore; application-level end-to-end encryption is not established.
   - Guest planning and progress tracking work locally and offline after caching. Authentication, cloud sync and external study links require a connection.

---

## 2. Event Taxonomy & Telemetry Stages

Telemetry events are defined in `src/analytics/tracker.js` and follow a strict sequential activation funnel:

```text
opened
  ↓
setup_started
  ↓
plan_created
  ↓
first_task_checked
  ↓
returned_day3
```

### Event Definitions

| Event Name | Trigger Condition | Educational / Growth Purpose |
| :--- | :--- | :--- |
| `opened` | Client loads the application in a browser window. | Measures initial top-of-funnel reach and web traffic. |
| `setup_started` | Student clicks "Start Setup" or modifies onboarding stream/term controls. | Evaluates onboarding conversion rate from visitor to active student. |
| `plan_created` | Planner generates a valid schedule and saves state. | Measures successful schedule generation across CS, Bio, and Improvement streams. |
| `first_task_checked` | A task is marked complete in this browser. | Local interaction signal; does not prove studying or an independent student. |
| `returned_day3` | This browser opens the app 3 or more days after its first recorded visit. | Return signal; does not prove study habit formation. |
| `plan_rebalanced` | Student triggers intelligent regeneration to catch up on missed days. | Measures engagement with the adaptive replanning engine. |
| `timetable_printed` | Student clicks "Print / Save PDF" to export physical schedule. | Measures real-world utility and offline study integration. |
| `pwa_installed` | Student accepts native PWA / WebAPK installation prompt. | Tracks transition to desktop/mobile homescreen standalone utility. |

---

## 3. Retention & Cohort Measurement Methodology

Retention is calculated using non-invasive client-side timestamps stored in `localStorage`:

1. **First Visit Timestamp (`mpt_first_visit_ts`)**: Recorded upon initial `opened` event.
2. **7-Day Study Habit**: Evaluated when a client records a task checkmark where:
   $$\Delta t = t_{\text{now}} - t_{\text{first}} \ge 7 \times 86400\,\text{seconds}$$
3. **Completion Ratio**:
   $$\text{Completion Rate} = \frac{\text{Completed Tasks}}{\text{Total Configured Tasks}} \times 100$$

---

## 4. Public Metrics Integrity Policy

In accordance with OSS maintainer standards:
- All reported metrics on public dashboards or program applications are pulled from primary sources (Firebase Analytics console, GitHub Traffic API, Firestore aggregations).
- Extrapolations or estimates must always be labeled explicitly as `(Estimated)` or `(Sampled)`.
- Fabricated vanity metrics (fake accounts, bot traffic, automated checkmarks) are strictly forbidden.
