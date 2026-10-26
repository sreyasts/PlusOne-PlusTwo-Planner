import { describe, it, expect } from 'vitest';
import { formatIcsDate, escapeIcsText, generateIcsCalendar } from '../src/utils/calendar.js';

describe('RFC 5545 iCalendar (.ics) Generator', () => {
  it('formats calendar dates and times accurately', () => {
    expect(formatIcsDate('2026-10-02')).toBe('20261002');
    expect(formatIcsDate('2026-10-02', '18:30')).toBe('20261002T183000');
    expect(formatIcsDate(new Date(2026, 9, 2), '09:00')).toBe('20261002T090000');
  });

  it('escapes special characters for RFC 5545 compliance', () => {
    expect(escapeIcsText('Physics, Chemistry; Math')).toBe('Physics\\, Chemistry\\; Math');
    expect(escapeIcsText('Line 1\nLine 2')).toBe('Line 1\\nLine 2');
    expect(escapeIcsText('Backslash \\ test')).toBe('Backslash \\\\ test');
    expect(escapeIcsText('')).toBe('');
    expect(escapeIcsText(null)).toBe('');
  });

  it('generates a valid RFC 5545 calendar with events, alarms, and metadata', () => {
    const mockPlan = [
      {
        dayNumber: 1,
        date: '2026-10-05',
        tasks: [
          {
            id: 'task-1',
            subject: 'Physics',
            chapterTitle: 'Electric Charges and Fields',
            part: 'Part 1',
            grade: '+2',
            estimatedMinutes: 60
          },
          {
            id: 'task-2',
            subject: 'Chemistry',
            chapterTitle: 'Solutions',
            part: 'Part 1',
            grade: '+2',
            estimatedMinutes: 45
          }
        ]
      },
      {
        dayNumber: 2,
        date: '2026-10-06',
        isRestDay: true,
        tasks: []
      }
    ];

    const ics = generateIcsCalendar(mockPlan, { stream: 'Science' });

    expect(ics).toContain('BEGIN:VCALENDAR');
    expect(ics).toContain('VERSION:2.0');
    expect(ics).toContain('PRODID:-//HSS Planner//DHSE Kerala Study Engine//EN');
    expect(ics).toContain('X-WR-CALNAME:HSS Planner Study Schedule (Science)');
    expect(ics).toContain('X-WR-TIMEZONE:Asia/Kolkata');

    // Task 1
    expect(ics).toContain('SUMMARY:Study: Physics - Electric Charges and Fields (Part 1) [+2]');
    expect(ics).toContain('DTSTART:20261005T180000');
    expect(ics).toContain('DTEND:20261005T190000');
    expect(ics).toContain('BEGIN:VALARM');
    expect(ics).toContain('TRIGGER:-PT15M');

    // Task 2
    expect(ics).toContain('SUMMARY:Study: Chemistry - Solutions (Part 1) [+2]');
    expect(ics).toContain('DTSTART:20261005T193000');

    // Rest Day
    expect(ics).toContain('SUMMARY:HSS Planner: Day 2 - Rest & Recharging');

    expect(ics).toContain('END:VCALENDAR');
  });

  it('handles empty plans gracefully', () => {
    const emptyIcs = generateIcsCalendar([]);
    expect(emptyIcs).toContain('BEGIN:VCALENDAR');
    expect(emptyIcs).toContain('END:VCALENDAR');
  });
});
