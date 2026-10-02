/**
 * Mission PlusTwo - RFC 5545 iCalendar (.ics) Generator & Synchronizer
 * Enables students to export their complete Kerala Plus Two & Improvement
 * study schedule into Google Calendar, Apple Calendar, and Outlook.
 */

/**
 * Format a JavaScript Date or YYYY-MM-DD string into an iCalendar date string.
 * @param {Date|string} date
 * @param {string} [timeStr] e.g. "18:00"
 * @returns {string} e.g. "20261002T180000" or "20261002"
 */
export function formatIcsDate(date, timeStr) {
  let d;
  if (typeof date === 'string') {
    const parts = date.split('-');
    if (parts.length === 3) {
      d = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
    } else {
      d = new Date(date);
    }
  } else {
    d = date instanceof Date ? date : new Date();
  }

  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');

  if (timeStr) {
    const [hh, mm] = timeStr.split(':');
    const hours = String(hh || '09').padStart(2, '0');
    const mins = String(mm || '00').padStart(2, '0');
    return `${y}${m}${day}T${hours}${mins}00`;
  }
  return `${y}${m}${day}`;
}

/**
 * Escape text for RFC 5545 iCalendar compliance.
 * @param {string} text
 * @returns {string}
 */
export function escapeIcsText(text) {
  if (!text) return '';
  return String(text)
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n');
}

/**
 * Generate a complete RFC 5545 VCALENDAR string from a study plan.
 * @param {Array} plan Array of day plan objects
 * @param {Object} [options] Custom options (stream, title, reminderMinutes)
 * @returns {string} iCalendar string (.ics)
 */
export function generateIcsCalendar(plan, options = {}) {
  const stream = options.stream || 'Plus Two';
  const calName = options.title || `Mission PlusTwo Study Schedule (${stream})`;
  const nowIcs = formatIcsDate(new Date(), '12:00') + 'Z';

  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Mission PlusTwo//DHSE Kerala Study Engine//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${escapeIcsText(calName)}`,
    'X-WR-TIMEZONE:Asia/Kolkata'
  ];

  if (!Array.isArray(plan) || plan.length === 0) {
    lines.push('END:VCALENDAR');
    return lines.join('\r\n');
  }

  plan.forEach((day, dayIndex) => {
    const dayDate = day.date || new Date(Date.now() + dayIndex * 86400000).toISOString().split('T')[0];
    const tasks = day.tasks || [];

    if (tasks.length === 0) {
      if (day.isRestDay) {
        const uid = `rest-day-${day.dayNumber || dayIndex + 1}-${dayDate}@mission-plustwo.web.app`;
        const dtStart = formatIcsDate(dayDate, '09:00');
        const dtEnd = formatIcsDate(dayDate, '10:00');
        lines.push(
          'BEGIN:VEVENT',
          `UID:${uid}`,
          `DTSTAMP:${nowIcs}`,
          `DTSTART:${dtStart}`,
          `DTEND:${dtEnd}`,
          `SUMMARY:Mission PlusTwo: Day ${day.dayNumber || dayIndex + 1} - Rest & Recharging`,
          'DESCRIPTION:Dedicated rest buffer to avoid burnout and consolidate memory.',
          'STATUS:CONFIRMED',
          'END:VEVENT'
        );
      }
      return;
    }

    // Default study slots: slot 1 starts at 18:00 (6 PM), slot 2 at 19:30 (7:30 PM), slot 3 at 21:00 (9 PM)
    const slotTimes = ['18:00', '19:30', '21:00', '06:30'];

    tasks.forEach((task, taskIdx) => {
      const slotTime = slotTimes[taskIdx % slotTimes.length];
      const [sh, sm] = slotTime.split(':').map(Number);
      const durationMins = task.estimatedMinutes || 60;
      const endTotalMins = sh * 60 + sm + durationMins;
      const eh = String(Math.floor(endTotalMins / 60) % 24).padStart(2, '0');
      const em = String(endTotalMins % 60).padStart(2, '0');
      const endTimeStr = `${eh}:${em}`;

      const dtStart = formatIcsDate(dayDate, slotTime);
      const dtEnd = formatIcsDate(dayDate, endTimeStr);
      const uid = `task-${task.id || `${dayIndex}-${taskIdx}`}-${dayDate}@mission-plustwo.web.app`;

      const subject = task.subject || 'DHSE Study';
      const chapter = task.chapterTitle || task.chapterName || task.title || 'Revision Session';
      const part = task.part ? ` (${task.part})` : '';
      const grade = task.grade ? ` [${task.grade}]` : '';

      const summary = `Study: ${subject} - ${chapter}${part}${grade}`;
      const description = `Kerala Higher Secondary (${stream})\\nSubject: ${subject}\\nChapter: ${chapter}\\nEstimated Study: ${durationMins} mins\\n\\nOpen Study Timer & Resources: https://mission-plustwo.web.app/`;

      lines.push(
        'BEGIN:VEVENT',
        `UID:${uid}`,
        `DTSTAMP:${nowIcs}`,
        `DTSTART:${dtStart}`,
        `DTEND:${dtEnd}`,
        `SUMMARY:${escapeIcsText(summary)}`,
        `DESCRIPTION:${description}`,
        'STATUS:CONFIRMED',
        'BEGIN:VALARM',
        'TRIGGER:-PT15M',
        'ACTION:DISPLAY',
        `DESCRIPTION:Reminder: Mission PlusTwo session for ${escapeIcsText(subject)} begins in 15 minutes!`,
        'END:VALARM',
        'END:VEVENT'
      );
    });
  });

  lines.push('END:VCALENDAR');
  return lines.join('\r\n');
}

/**
 * Trigger download of the generated .ics file in browser environments.
 * @param {Array} plan
 * @param {string} [stream]
 */
export function downloadIcsCalendar(plan, stream = 'science') {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;

  const icsContent = generateIcsCalendar(plan, { stream });
  const blob = new Blob([icsContent], { type: 'text/calendar;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', `mission-plustwo-calendar-${stream.toLowerCase().replace(/\s+/g, '-')}.ics`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
