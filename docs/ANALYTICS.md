# Mission PlusTwo — Privacy-First Analytics Architecture

> Historical design notes. Event names below are not a verified current implementation contract; inspect `src/analytics/tracker.js`. See [current validation limits](VALIDATION-6.4.2.md).

## 1. Implementation and Limits

Mission PlusTwo is built for high school students preparing for the Kerala Higher Secondary Examinations (DHSE). Student data protection is an absolute ethical and legal mandate.

- Statutory compliance has not been independently reviewed; no DPDP, GDPR or ePrivacy compliance claim is made.
- The local tracker strips a limited set of known property keys. This does not prove that arbitrary properties, SDK metadata, cookies or transport data contain no personal information.
- Guest schedules persist in localStorage. Optional Google sign-in and Firestore sync also process account email, display name and plan data.
- **Ad & Signal Isolation**:
  - `allow_google_signals: false`
  - `allow_ad_personalization_signals: false`
  - `restricted_data_processing: true`

---

## 2. Event Taxonomy

All events use standard lower_snake_case naming and are tracked through `src/analytics/tracker.js`:

| Event Name | Trigger Point | Payload Properties | Purpose |
| :--- | :--- | :--- | :--- |
| `landing_view` | User opens application (`/`) | `isFirstVisit: boolean`, `referrer: string` | Top of acquisition funnel |
| `onboarding_started` | Student clicks "Start Planning" or enters wizard | `stream: 'bio' \| 'cs'`, `step: number` | Measures setup intent |
| `onboarding_completed` | Student finishes selecting subjects and target date | `stream: string`, `subjectCount: number`, `hasImprovement: boolean` | Conversion to plan creation |
| `plan_generated` | Scheduling engine successfully generates timetable | `runwayDays: number`, `totalStudyHours: number`, `hasBufferDays: boolean` | Primary product value event |
| `plan_viewed` | Daily dashboard view or calendar navigation | `viewMode: 'daily' \| 'calendar' \| 'syllabus'`, `dayIndex: number` | Measures engagement depth |
| `task_completed` | Student checks off a revision or chapter study slot | `stream: string`, `subject: string`, `isFirstTask: boolean` | Active study execution |
| `plan_shared` | Student shares their timetable link or image | `channel: 'whatsapp' \| 'telegram' \| 'copy_link' \| 'web_share'` | Viral / word-of-mouth loop |
| `plan_exported` | Student prints timetable or exports PDF/ICS | `format: 'print' \| 'pdf' \| 'ics'` | Offline utility conversion |
| `pwa_installed` | Student accepts browser PWA install prompt | `platform: string` | Desktop/homescreen retention |
| `return_visit` | User returns after > 24 hours | `daysSinceFirstVisit: number`, `streak: number` | Long-term retention signal |

---

## 3. Core Conversion & Retention Funnels

```mermaid
flowchart TD
    subgraph AcquisitionFunnel ["Acquisition & Value Realization"]
        A["landing_view"] -->|Start Wizard| B["onboarding_started"]
        B -->|Select Subjects & Date| C["onboarding_completed"]
        C -->|Engine Computes Plan| D["plan_generated"]
    end

    subgraph ExecutionFunnel ["Execution & Habit Formation"]
        D -->|View Today's Tasks| E["plan_viewed"]
        E -->|Check Off Task| F["task_completed"]
        F -->|Return Day 2+| G["return_visit (7d / 30d)"]
    end

    subgraph GrowthLoop ["Product-Led Referral Loop"]
        D -->|Share with Peer| H["plan_shared"]
        H -->|Peer Clicks Shared Link| A
        D -->|Print for Wall| I["plan_exported"]
    end
```

### Funnel Metrics Formulations
1. **Initial Conversion Rate**:
   \[
   \text{Setup Conversion} = \frac{\text{Count}(\text{plan\_generated})}{\text{Count}(\text{landing\_view})}
   \]
2. **First-Action Rate**:
   \[
   \text{First Task Rate} = \frac{\text{Count}(\text{task\_completed with isFirstTask=true})}{\text{Count}(\text{plan\_generated})}
   \]
3. **Product-Led Referral Velocity**:
   \[
   \text{Share Rate} = \frac{\text{Count}(\text{plan\_shared})}{\text{Count}(\text{plan\_generated})}
   \]
4. **Day-3 & Day-7 Retention**:
   \[
   \text{D3 Retention} = \frac{\text{Unique Users with return\_visit at } 48\text{--}144\text{ hours}}{\text{Unique Users with plan\_generated}}
   \]

---

## 4. Local On-Device Audit & Diagnostic Mode

To enable developers and privacy advocates to audit tracked events without third-party network access:
1. Every event increments an anonymous counter in local browser storage (`mpt_funnel_counts_v1`).
2. Developers can call `getFunnelStats()` in the browser DevTools console to inspect on-device counts.
3. Every event dispatches a `mpt:analytics` DOM `CustomEvent` locally, enabling real-time UI debugging.
4. When Firebase Analytics is loaded, events emit with `debug_mode: true` to enable live streaming in Firebase DebugView.
