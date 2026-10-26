# HSS Planner — Accessibility & Low-Bandwidth Standards

## 1. Context & Inclusivity Invariant

Many Kerala high school students access HSS Planner on:
- Budget Android smartphones (< 3GB RAM, 720p screens)
- Spotty 4G/3G mobile data connections in rural panchayats
- Shared family computers with varying browser capabilities
- Late evening study hours under dim lighting (requiring true dark mode)

Therefore, accessibility is not an optional polish; it is a core functional requirement.

---

## 2. Technical Standards (WCAG 2.1 AA)

### 2.1 Color Contrast & Readability
- **Normal Text**: Minimum contrast ratio of `4.5:1` against background.
- **Large Text & Headings**: Minimum contrast ratio of `3:1`.
- **Active Interactive Elements**: Minimum touch target size of `44x44px` for mobile tap targets.
- **Dark Mode**: High-contrast slate backgrounds (`#080c14` / `#0f172a`) with crisp text (`#f8fafc`), avoiding washed-out grays.

### 2.2 Semantic HTML & Screen Readers
- Use native interactive HTML elements (`<button>`, `<a>`, `<input>`, `<fieldset>`) rather than `div` onclick handlers whenever possible.
- When `div` interactive elements are used, explicitly provide:
  - `role="button"`
  - `tabindex="0"`
  - `aria-label` or `aria-labelledby`
  - Keyboard listeners for `Enter` and `Space` keys.
- Checkboxes in study timetables must use proper `<label for="...">` association so tapping text checks off the task.

### 2.3 Performance & Low-Bandwidth Resilience
- **Zero Runtime CDN Bloat**: All critical styling and logic must be bundled locally into `/assets/`. Never rely on external unbundled script tags for critical rendering path.
- **Initial HTML Payload**: Under `100 KB` uncompressed.
- **Offline First**: The service worker (`sw.js`) must cache all application shell assets, allowing full offline schedule viewing and task checkoffs after the first visit.

---

## 3. How to Audit Before Opening a PR

1. **Mobile Emulation**: In Chrome/Edge DevTools, toggle Device Toolbar, set viewport to `360x640` (Moto G4 / budget Android profile), and verify zero horizontal scrolling.
2. **Network Throttling**: Set network throttling to "Slow 3G" and verify the initial schedule loads without breaking layout.
3. **Keyboard Navigation**: Press `Tab` repeatedly to ensure focus rings are visible on every interactive control and that form inputs can be submitted using only keyboard navigation.
